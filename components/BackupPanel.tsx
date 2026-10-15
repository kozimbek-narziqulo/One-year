"use client";

// Окно «Копия и язык»: статистика, сохранение и загрузка ZIP, выбор языка.
//
// Ключи переводов, которые нужны этому окну (добавьте их в словари):
//   backup.title, backup.close, backup.language, backup.notPersistent, backup.settingFailed,
//   backup.entries, backup.photos, backup.lastBackup, backup.never, backup.changes,
//   backup.save, backup.preparing, backup.progressPhotos, backup.saved, backup.photosMissingExport,
//   backup.load, backup.reading, backup.loadingRecords, backup.loadingPhotos,
//   backup.skipped, backup.photosMissingFile, backup.noPhotoStore,
//   backup.mode, backup.modeMerge, backup.modeReplace,
//   backup.added, backup.updated, backup.unchanged, backup.willRemove,
//   backup.import, backup.cancel, backup.imported, backup.replaced, backup.photosFailed,
//   backup.failed

import { useEffect, useId, useRef, useState } from "react";
import { applyImportWithPhotos, backupFilename, buildBackupZip, planImport, readBackupFile, type ImportMode, type ParsedBackup } from "../lib/backup.ts";
import { downloadBlob } from "../lib/download.ts";
import { formatShort } from "../lib/date.ts";
import { errorText } from "../lib/i18n.ts";
import { useT } from "./I18nProvider.tsx";
import type { PhotoStore } from "../lib/photos.ts";
import { photosOf } from "../lib/types.ts";
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

type Language = GardenState["settings"]["language"];

/** Названия языков пишутся на самих языках и не переводятся. */
const LANGUAGES: [Language, string][] = [
  ["ru", "Русский"],
  ["en", "English"],
];

const dateTime = (ms: number) => {
  const d = new Date(ms);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${formatShort(key)} ${d.getFullYear()}`;
};

/** Склеивает непустые части через « · »: тексты собираются из переводимых слов и чисел. */
const join = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" · ");

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-h-(--layout-tapMin) items-center justify-between gap-3 px-4 text-base">
      <span>{label}</span>
      <span className="text-text-muted">{value}</span>
    </div>
  );
}

export function BackupPanel({ repo, photoStore, state, onClose, onMessage }: BackupPanelProps) {
  const { t } = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const langId = useId();
  const [parsed, setParsed] = useState<{ name: string; data: ParsedBackup } | null>(null);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (dlg && !dlg.open) dlg.showModal();
    return () => {
      if (dlg?.open) dlg.close();
    };
  }, []);

  const count = Object.keys(state.entries).length;
  const photoTotal = Object.values(state.entries).reduce((n, e) => n + photosOf(e).length, 0);
  const plan = parsed ? planImport(state.entries, parsed.data.entries, mode) : null;

  async function exportNow() {
    if (busy) return;
    setBusy(true);
    setExportNote(null);
    setProgress(t("backup.preparing"));
    try {
      const r = await buildBackupZip(repo, photoStore, {
        onProgress: (done, total) => setProgress(`${t("backup.progressPhotos")}: ${done}/${total}`),
      });
      downloadBlob(backupFilename(), r.blob);
      repo.markBackedUp();
      onMessage(join(t("backup.saved"), `${t("backup.entries")} ${r.entries}`, r.photos > 0 && `${t("backup.photos")} ${r.photos}`));
      if (r.photosMissing > 0) setExportNote(`${t("backup.photosMissingExport")}: ${r.photosMissing}`);
    } catch (e) {
      setExportNote(errorText(t, e) ?? t("backup.failed"));
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
    setProgress(t("backup.reading"));
    try {
      const data = await readBackupFile(file);
      setParsed({ name: file.name, data });
      setMode("merge");
    } catch (e) {
      setImportError(errorText(t, e) ?? t("backup.failed"));
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = ""; // тот же файл можно выбрать повторно
    }
  }

  async function doImport() {
    if (!parsed || busy) return;
    setBusy(true);
    setImportError(null);
    setProgress(parsed.data.photoCount > 0 ? t("backup.loadingPhotos") : t("backup.loadingRecords"));
    try {
      const p = await applyImportWithPhotos(repo, photoStore, parsed.data, mode, false, (done, total) =>
        setProgress(`${t("backup.loadingPhotos")}: ${done}/${total}`),
      );
      onMessage(
        join(
          mode === "replace"
            ? `${t("backup.replaced")}: ${Object.keys(p.result).length}`
            : `${t("backup.imported")}: ${t("backup.added")} ${p.added}, ${t("backup.updated")} ${p.updated}`,
          p.photosWritten > 0 && `${t("backup.photos")} ${p.photosWritten}`,
          p.photosFailed > 0 && `${t("backup.photosFailed")} ${p.photosFailed}`,
        ),
      );
      setParsed(null);
    } catch (e) {
      setImportError(errorText(t, e) ?? t("backup.failed"));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function changeLanguage(language: Language) {
    try {
      repo.updateSettings({ language });
    } catch {
      onMessage(t("backup.settingFailed"));
    }
  }

  const warn = "rounded-xl border border-warning px-4 py-3 text-sm text-warning";

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
      <div className="flex max-h-[92dvh] flex-col rounded-t-[28px] border border-border bg-surface-raised shadow-sheet sm:rounded-[28px] sm:shadow-md">
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border-input sm:hidden" />

        <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-1 pt-3">
          <h2 id={titleId} className="text-xl font-semibold">
            {t("backup.title")}
          </h2>
          <IconButton label={t("backup.close")} onClick={() => dialogRef.current?.close()}>
            <IconClose />
          </IconButton>
        </div>

        <div className="space-y-5 overflow-y-auto px-4 pb-6 pt-3">
          {!state.persistent && (
            <p role="alert" className={warn}>
              {t("backup.notPersistent")}
            </p>
          )}

          {/* Статистика */}
          <div className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
            <Row label={t("backup.entries")} value={count} />
            {photoTotal > 0 && <Row label={t("backup.photos")} value={photoTotal} />}
            <Row label={t("backup.lastBackup")} value={state.meta.lastBackupAt ? dateTime(state.meta.lastBackupAt) : t("backup.never")} />
            {state.meta.changesSinceBackup > 0 && <Row label={t("backup.changes")} value={state.meta.changesSinceBackup} />}
          </div>

          {/* Язык */}
          <div className="overflow-hidden rounded-2xl bg-surface">
            <div className="flex min-h-(--layout-tapMin) items-center justify-between gap-3 px-4 text-base">
              <label htmlFor={langId}>{t("backup.language")}</label>
              <select
                id={langId}
                value={state.settings.language}
                onChange={(e) => changeLanguage(e.target.value as Language)}
                className="min-h-(--layout-tapMin) cursor-pointer bg-transparent text-right text-base text-text-muted"
              >
                {LANGUAGES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Сохранить и загрузить */}
          <div className="flex flex-col gap-2 [&>button]:w-full">
            <Button variant="primary" onClick={() => void exportNow()} disabled={count === 0 || busy}>
              {t("backup.save")}
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
              {t("backup.load")}
            </Button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".zip,.json,application/zip,application/x-zip-compressed,application/json"
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />

          {progress && (
            <p role="status" className="text-center text-sm text-text-muted">
              {progress}
            </p>
          )}
          {exportNote && (
            <p role="alert" className={warn}>
              {exportNote}
            </p>
          )}
          {importError && (
            <p role="alert" className="rounded-xl border border-danger px-4 py-3 text-sm text-danger">
              {importError}
            </p>
          )}

          {/* Предпросмотр загрузки */}
          {parsed && plan && (
            <div className="space-y-3">
              <div className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
                <div className="truncate px-4 py-3 text-sm text-text-muted">{parsed.name}</div>
                <Row label={t("backup.entries")} value={parsed.data.entries.length} />
                {parsed.data.photoCount > 0 && <Row label={t("backup.photos")} value={parsed.data.photoCount} />}
                {parsed.data.skipped > 0 && <Row label={t("backup.skipped")} value={parsed.data.skipped} />}
              </div>

              {parsed.data.photosMissing > 0 && (
                <p role="alert" className={warn}>
                  {t("backup.photosMissingFile")}: {parsed.data.photosMissing}
                </p>
              )}
              {parsed.data.photoCount > 0 && !photoStore.available && (
                <p role="alert" className={warn}>
                  {t("backup.noPhotoStore")}
                </p>
              )}

              <fieldset className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
                <legend className="sr-only">{t("backup.mode")}</legend>
                {(
                  [
                    ["merge", t("backup.modeMerge")],
                    ["replace", t("backup.modeReplace")],
                  ] as [ImportMode, string][]
                ).map(([value, label]) => (
                  <label key={value} className="flex min-h-(--layout-tapMin) items-center gap-3 px-4 text-base">
                    <input type="radio" name="backup-mode" checked={mode === value} onChange={() => setMode(value)} className="size-5 accent-accent" />
                    {label}
                  </label>
                ))}
              </fieldset>

              <p className="px-1 text-sm text-text-muted" aria-live="polite">
                {join(
                  `${t("backup.added")} ${plan.added}`,
                  `${t("backup.updated")} ${plan.updated}`,
                  `${t("backup.unchanged")} ${plan.unchanged}`,
                )}
              </p>

              {mode === "replace" && (plan.removed > 0 || plan.photosRemoved > 0) && (
                <p role="alert" className={warn}>
                  {join(`${t("backup.willRemove")}: ${plan.removed}`, plan.photosRemoved > 0 && `${t("backup.photos")} ${plan.photosRemoved}`)}
                </p>
              )}

              <div className="flex flex-col gap-2 [&>button]:w-full">
                <Button variant="primary" onClick={() => void doImport()} disabled={busy}>
                  {t("backup.import")}
                </Button>
                <Button variant="ghost" onClick={() => setParsed(null)} disabled={busy}>
                  {t("backup.cancel")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
