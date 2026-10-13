"use client";

import { useEffect, useId, useRef, useState } from "react";
import { applyImportWithPhotos, backupFilename, BackupError, buildBackupZip, planImport, readBackupFile, type ImportMode, type ParsedBackup } from "../lib/backup.ts";
import { downloadBlob } from "../lib/download.ts";
import { formatShort } from "../lib/date.ts";
import type { PhotoStore } from "../lib/photos.ts";
import { GardenError, photosOf, type Density, type MoodPalette, type PlantPalette, type ThemeSetting } from "../lib/types.ts";
import type { GardenState, Repo } from "../lib/repo.ts";
import { Button, IconButton, IconClose } from "./ui.tsx";

export interface BackupPanelProps {
  repo: Repo;
  /** Хранилище фото: из него фото попадают в копию, в него они возвращаются при загрузке. */
  photoStore: PhotoStore;
  state: GardenState;
  onClose: () => void;
  onMessage: (text: string) => void;
}

const dateTime = (ms: number) => {
  const d = new Date(ms);
  return `${formatShort(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`)} ${d.getFullYear()}`;
};

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-base">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="min-h-(--layout-tapMin) rounded-sm border border-border-input bg-surface px-3 text-base text-text"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

export function BackupPanel({ repo, photoStore, state, onClose, onMessage }: BackupPanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [parsed, setParsed] = useState<{ name: string; data: ParsedBackup } | null>(null);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [withSettings, setWithSettings] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Что сейчас делаем («Собираю фото: 3 из 12»): архив большой, человеку нужно видеть, что оно идёт. */
  const [progress, setProgress] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (dlg && !dlg.open) dlg.showModal();
    return () => {
      if (dlg?.open) dlg.close();
    };
  }, []);

  const count = Object.keys(state.entries).length;
  const photoTotal = Object.values(state.entries).reduce((n, e) => n + photosOf(e).length, 0);

  // Установлено ли приложение на экран и готов ли офлайн-режим (service worker активен).
  const [standalone, setStandalone] = useState(false);
  const [offlineReady, setOfflineReady] = useState<boolean | null>(null);
  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    if (!("serviceWorker" in navigator)) {
      setOfflineReady(false);
      return;
    }
    void navigator.serviceWorker.getRegistration().then((r) => setOfflineReady(!!r?.active), () => setOfflineReady(false));
  }, []);

  async function exportNow() {
    if (busy) return;
    setBusy(true);
    setExportNote(null);
    setProgress("Собираю копию…");
    try {
      const r = await buildBackupZip(repo, photoStore, {
        onProgress: (done, total) => setProgress(`Собираю фото: ${done} из ${total}`),
      });
      downloadBlob(backupFilename(), r.blob);
      repo.markBackedUp();
      const what = r.photos > 0 ? `записей ${r.entries}, фото ${r.photos}` : `записей ${r.entries}`;
      onMessage(`Копия сохранена файлом (${what}). Положите его туда, где он переживёт этот телефон.`);
      if (r.photosMissing > 0) {
        setExportNote(`В копию не попало фото: ${r.photosMissing}. Записи на них ссылаются, а самих файлов в этом браузере нет, поэтому в копии они сохранены без этих фото.`);
      }
    } catch (e) {
      setExportNote(e instanceof BackupError ? e.message : "Не удалось собрать копию. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function onFile(file: File | undefined) {
    setImportError(null);
    setParsed(null);
    if (!file) return;
    setBusy(true);
    setProgress("Читаю файл…");
    try {
      const data = await readBackupFile(file);
      setParsed({ name: file.name, data });
      setWithSettings(false);
      setMode("merge");
    } catch (e) {
      setImportError(e instanceof BackupError ? e.message : "Не удалось прочитать файл.");
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = ""; // тот же файл можно выбрать повторно
    }
  }

  const plan = parsed ? planImport(state.entries, parsed.data.entries, mode) : null;

  async function doImport() {
    if (!parsed || busy) return;
    setBusy(true);
    setImportError(null);
    setProgress(parsed.data.photoCount > 0 ? "Загружаю фото…" : "Загружаю записи…");
    try {
      // Перед заменой пользователь мог не сохранить копию: напоминание есть в тексте предупреждения ниже.
      const p = await applyImportWithPhotos(repo, photoStore, parsed.data, mode, withSettings, (done, total) =>
        setProgress(`Загружаю фото: ${done} из ${total}`),
      );
      const photos = p.photosWritten > 0 ? `, фото ${p.photosWritten}` : "";
      const lost = p.photosFailed > 0 ? ` Не удалось прочитать фото: ${p.photosFailed}.` : "";
      onMessage(
        (mode === "replace"
          ? `Записи заменены: в саду ${Object.keys(p.result).length}${photos}.`
          : `Импортировано: новых ${p.added}, обновлено ${p.updated}${photos}.`) + lost,
      );
      setParsed(null);
    } catch (e) {
      setImportError(
        e instanceof GardenError && e.code === "quota"
          ? "Не удалось импортировать: на телефоне кончилось место. Записи не изменились."
          : "Не удалось импортировать. Записи не изменились.",
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const setSetting = (patch: Parameters<Repo["updateSettings"]>[0]) => {
    try {
      repo.updateSettings(patch);
    } catch {
      onMessage("Не удалось сохранить настройку: нет места или хранилище недоступно.");
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
      className="entry-dialog fixed m-0 h-auto max-h-[92dvh] w-full max-w-none overflow-hidden border-0 bg-transparent p-0 text-text sm:m-auto sm:max-w-(--layout-modalMax)"
    >
      <div className="flex max-h-[92dvh] flex-col rounded-t-lg border border-border bg-surface-raised shadow-sheet sm:rounded-lg sm:shadow-md">
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <h2 id={titleId} className="text-lg">
            Копия и настройки
          </h2>
          <IconButton label="Закрыть" onClick={() => dialogRef.current?.close()}>
            <IconClose />
          </IconButton>
        </div>

        <div className="space-y-6 overflow-y-auto px-4 pb-6 pt-2">
          {!state.persistent && (
            <p role="alert" className="rounded-sm border border-warning p-3 text-sm text-warning">
              Браузер не даёт сохранять данные сайта (например, приватный режим). Записи живут только до закрытия вкладки. Сохраните копию файлом.
            </p>
          )}

          <section aria-labelledby={`${titleId}-backup`} className="space-y-3">
            <h3 id={`${titleId}-backup`} className="text-base font-semibold">
              Копия записей
            </h3>
            <p className="text-sm text-text-muted">
              Записи и фото хранятся только в этом браузере. Нам негде их держать, поэтому файл копии единственная защита, если телефон потеряется или данные сайта очистятся. Копия это один ZIP-архив: записи и все фото в нём. Не распаковывайте его, приложение читает архив само.
            </p>
            <p className="text-sm">
              Записей: {count}
              {photoTotal > 0 && `, фото: ${photoTotal}`}.{" "}
              {state.meta.lastBackupAt ? `Последняя копия: ${dateTime(state.meta.lastBackupAt)}.` : "Копию ещё не сохраняли."}
              {state.meta.changesSinceBackup > 0 && ` Изменений после неё: ${state.meta.changesSinceBackup}.`}
            </p>
            <Button variant="primary" onClick={() => void exportNow()} disabled={count === 0 || busy}>
              Сохранить копию (ZIP с фото)
            </Button>
            {progress && (
              <p role="status" className="text-sm text-text-muted">
                {progress}
              </p>
            )}
            {exportNote && (
              <p role="alert" className="rounded-sm border border-warning p-3 text-sm text-warning">
                {exportNote}
              </p>
            )}
          </section>

          <section aria-labelledby={`${titleId}-import`} className="space-y-3">
            <h3 id={`${titleId}-import`} className="text-base font-semibold">
              Загрузить из копии
            </h3>
            <input
              ref={fileRef}
              type="file"
              accept=".zip,.json,application/zip,application/x-zip-compressed,application/json"
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
              id={`${titleId}-file`}
              aria-describedby={importError ? `${titleId}-imperr` : undefined}
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
              Выбрать файл копии
            </Button>

            {importError && (
              <p id={`${titleId}-imperr`} role="alert" className="rounded-sm border border-danger p-3 text-sm text-danger">
                {importError}
              </p>
            )}

            {parsed && plan && (
              <div className="space-y-3 rounded-sm border border-border p-3">
                <p className="text-sm">
                  Файл «{parsed.name}»: записей {parsed.data.entries.length}
                  {parsed.data.photoCount > 0 && `, фото ${parsed.data.photoCount}`}
                  {parsed.data.skipped > 0 && `, пропущено: ${parsed.data.skipped} (повреждённые, пустые или с датой из будущего)`}.
                </p>
                {parsed.data.format === "json" && (
                  <p className="text-sm text-text-muted">
                    Это копия без фото (старый формат или одиночный backup.json). У записей, которые уже есть в приложении, фото останутся.
                  </p>
                )}
                {parsed.data.photosMissing > 0 && (
                  <p role="alert" className="rounded-sm border border-warning p-3 text-sm text-warning">
                    В файле нет {parsed.data.photosMissing} фото, на которые ссылаются записи. Записи загрузятся без них.
                  </p>
                )}
                {parsed.data.photoCount > 0 && !photoStore.available && (
                  <p role="alert" className="rounded-sm border border-warning p-3 text-sm text-warning">
                    В этом браузере нельзя сохранять фото (например, приватный режим). Записи загрузятся без фото.
                  </p>
                )}
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-sm text-text-muted">Как загрузить</legend>
                  <label className="flex min-h-(--layout-tapMin) items-start gap-3">
                    <input type="radio" name="mode" checked={mode === "merge"} onChange={() => setMode("merge")} className="mt-1 size-5 accent-accent" />
                    <span>
                      <span className="block text-base">Добавить к текущим</span>
                      <span className="block text-sm text-text-muted">Если дата совпала, остаётся более свежая правка.</span>
                    </span>
                  </label>
                  <label className="flex min-h-(--layout-tapMin) items-start gap-3">
                    <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} className="mt-1 size-5 accent-accent" />
                    <span>
                      <span className="block text-base">Заменить всё содержимым файла</span>
                      <span className="block text-sm text-text-muted">Подходит для нового телефона.</span>
                    </span>
                  </label>
                </fieldset>
                <p className="text-sm" aria-live="polite">
                  Новых: {plan.added}. Обновится: {plan.updated}. Без изменений: {plan.unchanged}.
                  {plan.photosAdded > 0 && ` Фото добавится: ${plan.photosAdded}.`}
                  {plan.keptCurrent > 0 && ` Останутся ваши, как более свежие: ${plan.keptCurrent}.`}
                </p>
                {mode === "replace" && (plan.removed > 0 || plan.photosRemoved > 0) && (
                  <p role="alert" className="rounded-sm border border-warning p-3 text-sm text-warning">
                    Исчезнет записей, которых нет в файле: {plan.removed}
                    {plan.photosRemoved > 0 && `, фото: ${plan.photosRemoved}`}. Если сомневаетесь, сначала сохраните копию текущих.
                  </p>
                )}
                {parsed.data.settings && (
                  <label className="flex min-h-(--layout-tapMin) items-center gap-3 text-base">
                    <input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} className="size-5 accent-accent" />
                    Загрузить и настройки внешнего вида
                  </label>
                )}
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => void doImport()} disabled={busy}>
                    Загрузить
                  </Button>
                  <Button variant="ghost" onClick={() => setParsed(null)} disabled={busy}>
                    Не загружать
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section aria-labelledby={`${titleId}-install`} className="space-y-3">
            <h3 id={`${titleId}-install`} className="text-base font-semibold">
              Установка и работа без сети
            </h3>
            <p className="text-sm">
              {standalone ? "Приложение установлено на экран." : "Приложение ещё не установлено на экран."}{" "}
              {offlineReady === null
                ? ""
                : offlineReady
                  ? "Работает без сети."
                  : "Работа без сети пока не включена: откройте приложение один раз при подключении к интернету."}
            </p>
            {!standalone && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
                <li>iPhone: откройте сайт в Safari, нажмите «Поделиться», затем «На экран “Домой”».</li>
                <li>Android (Chrome): меню ⋮, затем «Установить приложение».</li>
                <li>
                  Записи в браузере и в установленном приложении хранятся отдельно. Если вы уже писали в браузере, сохраните копию выше и загрузите её в установленном приложении.
                </li>
              </ul>
            )}
          </section>

          <section aria-labelledby={`${titleId}-look`} className="space-y-3">
            <h3 id={`${titleId}-look`} className="text-base font-semibold">
              Внешний вид
            </h3>
            <Select<ThemeSetting>
              label="Тема"
              value={state.settings.theme}
              options={[["system", "Как в системе"], ["light", "Светлая"], ["dark", "Тёмная"]]}
              onChange={(theme) => setSetting({ theme })}
            />
            <Select<MoodPalette>
              label="Цвета настроений"
              value={state.settings.moodPalette}
              options={[["default", "Закат и рассвет"], ["cvd", "Синий и оранжевый"]]}
              onChange={(moodPalette) => setSetting({ moodPalette })}
            />
            <Select<PlantPalette>
              label="Листва"
              value={state.settings.plantPalette}
              options={[["default", "Луг"], ["autumn", "Осень"], ["ink", "Тушь"]]}
              onChange={(plantPalette) => setSetting({ plantPalette })}
            />
            <Select<Density>
              label="Размер клеток"
              value={state.settings.density}
              options={[["comfortable", "Обычный"], ["compact", "Мелкий"]]}
              onChange={(density) => setSetting({ density })}
            />
          </section>
        </div>
      </div>
    </dialog>
  );
}
