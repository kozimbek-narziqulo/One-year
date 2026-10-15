"use client";

// Окно «Копия и настройки» в стиле iOS: статистика, язык, сохранение и загрузка ZIP.
// Все тексты берутся из lib/i18n.ts (ключи backup.*, import.*, panel.*, lang.*, settings.*).

import { useEffect, useId, useRef, useState } from "react";
import { applyImportWithPhotos, backupFilename, buildBackupZip, planImport, readBackupFile, type ImportMode, type ParsedBackup } from "../lib/backup.ts";
import { downloadBlob } from "../lib/download.ts";
import { errorText, formatDateFull, LANGUAGES, LANGUAGE_NAMES, type Language } from "../lib/i18n.ts";
import type { PhotoStore } from "../lib/photos.ts";
import { photosOf } from "../lib/types.ts";
import type { GardenState, Repo } from "../lib/repo.ts";
import { useT } from "./I18nProvider.tsx";
import { Button, IconButton, IconClose } from "./ui.tsx";

export interface BackupPanelProps {
  repo: Repo;
  /** Хранилище фото: из него фото попадают в копию, в него они возвращаются при загрузке. */
  photoStore: PhotoStore;
  state: GardenState;
  onClose: () => void;
  onMessage: (text: string) => void;
}

const sentence = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

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
  const lang = state.settings.language;
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
    setProgress(t("backup.building"));
    try {
      const r = await buildBackupZip(repo, photoStore, {
        onProgress: (done, total) => setProgress(t("backup.buildingPhotos", { done, total })),
      });
      downloadBlob(backupFilename(), r.blob);
      repo.markBackedUp();
      onMessage(t("backup.saved", { entries: r.entries, photos: r.photos }));
      if (r.photosMissing > 0) setExportNote(t("backup.photosMissing", { count: r.photosMissing }));
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
    setProgress(t("import.reading"));
    try {
      const data = await readBackupFile(file);
      setParsed({ name: file.name, data });
      setMode("merge");
    } catch (e) {
      setImportError(errorText(t, e) ?? t("import.readFailed"));
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
    setProgress(parsed.data.photoCount > 0 ? t("import.loadingPhotos") : t("import.loadingEntries"));
    try {
      const p = await applyImportWithPhotos(repo, photoStore, parsed.data, mode, false, (done, total) =>
        setProgress(t("import.loadingPhotosN", { done, total })),
      );
      onMessage(
        sentence(
          mode === "replace"
            ? t("import.doneReplace", { count: Object.keys(p.result).length })
            : t("import.doneMerge", { added: p.added, updated: p.updated }),
          p.photosWritten > 0 && t("import.donePhotos", { count: p.photosWritten }),
          p.photosFailed > 0 && t("import.donePhotosFailed", { count: p.photosFailed }),
        ),
      );
      setParsed(null);
    } catch (e) {
      setImportError(errorText(t, e) ?? t("import.failed"));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function changeLanguage(language: Language) {
    try {
      repo.updateSettings({ language });
    } catch {
      onMessage(t("settings.saveFailed"));
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
            {t("panel.title")}
          </h2>
          <IconButton label={t("common.close")} onClick={() => dialogRef.current?.close()}>
            <IconClose />
          </IconButton>
        </div>

        <div className="space-y-5 overflow-y-auto px-4 pb-6 pt-3">
          {!state.persistent && (
            <p role="alert" className={warn}>
              {t("panel.notPersistent")}
            </p>
          )}

          {/* Статистика */}
          <div className="space-y-2">
            <div className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
              <Row label={t("backup.statEntries")} value={count} />
              {photoTotal > 0 && <Row label={t("backup.statPhotos")} value={photoTotal} />}
              <Row label={t("backup.statLast")} value={state.meta.lastBackupAt ? formatDateFull(state.meta.lastBackupAt, lang) : t("backup.never")} />
            </div>
            {state.meta.changesSinceBackup > 0 && (
              <p className="px-2 text-sm text-text-muted">{t("backup.changes", { count: state.meta.changesSinceBackup })}</p>
            )}
          </div>

          {/* Язык */}
          <div className="overflow-hidden rounded-2xl bg-surface">
            <div className="flex min-h-(--layout-tapMin) items-center justify-between gap-3 px-4 text-base">
              <label htmlFor={langId}>{t("lang.title")}</label>
              <select
                id={langId}
                value={lang}
                onChange={(e) => changeLanguage(e.target.value as Language)}
                className="min-h-(--layout-tapMin) cursor-pointer bg-transparent text-right text-base text-text-muted"
              >
                {LANGUAGES.map((code) => (
                  <option key={code} value={code}>
                    {LANGUAGE_NAMES[code]}
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
              {t("import.choose")}
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
              <p className="px-2 text-sm">
                {sentence(
                  t("import.fileSummary", { name: parsed.name, entries: parsed.data.entries.length, photos: parsed.data.photoCount }),
                  parsed.data.skipped > 0 && t("import.skipped", { count: parsed.data.skipped }),
                )}
              </p>

              {parsed.data.photosMissing > 0 && (
                <p role="alert" className={warn}>
                  {t("import.photosMissing", { count: parsed.data.photosMissing })}
                </p>
              )}
              {parsed.data.photoCount > 0 && !photoStore.available && (
                <p role="alert" className={warn}>
                  {t("import.noPhotoStore")}
                </p>
              )}

              <fieldset className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
                <legend className="sr-only">{t("import.howTitle")}</legend>
                {(["merge", "replace"] as const).map((value) => (
                  <label key={value} className="flex min-h-(--layout-tapMin) items-center gap-3 px-4 text-base">
                    <input type="radio" name="backup-mode" checked={mode === value} onChange={() => setMode(value)} className="size-5 accent-accent" />
                    {value === "merge" ? t("import.merge") : t("import.replace")}
                  </label>
                ))}
              </fieldset>

              <p className="px-2 text-sm text-text-muted" aria-live="polite">
                {sentence(
                  t("import.plan", { added: plan.added, updated: plan.updated, unchanged: plan.unchanged }),
                  plan.photosAdded > 0 && t("import.planPhotos", { count: plan.photosAdded }),
                  plan.keptCurrent > 0 && t("import.planKept", { count: plan.keptCurrent }),
                )}
              </p>

              {mode === "replace" && (plan.removed > 0 || plan.photosRemoved > 0) && (
                <p role="alert" className={warn}>
                  {t("import.removeWarn", { entries: plan.removed })}
                  {plan.photosRemoved > 0 && t("import.removeWarnPhotos", { count: plan.photosRemoved })}
                  {t("import.removeWarnTail")}
                </p>
              )}

              <div className="flex flex-col gap-2 [&>button]:w-full">
                <Button variant="primary" onClick={() => void doImport()} disabled={busy}>
                  {t("import.load")}
                </Button>
                <Button variant="ghost" onClick={() => setParsed(null)} disabled={busy}>
                  {t("import.cancel")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
