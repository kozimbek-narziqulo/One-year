"use client";

// Окно «Копия и настройки» в стиле iOS: статистика, язык, сохранение и загрузка ZIP.
// Все тексты берутся из lib/i18n.ts (ключи backup.*, import.*, panel.*, lang.*, settings.*).

import { useEffect, useId, useRef, useState } from "react";
import { applyImportWithPhotos, backupFilename, buildBackupZip, planImport, readBackupFile, type ImportMode, type ParsedBackup } from "../lib/backup";
import { downloadBlob } from "../lib/download";
import { supabase } from "../lib/supabase"; // УБРАНО РАСШИРЕНИЕ .ts
import { errorText, formatDateFull, LANGUAGES, LANGUAGE_NAMES, type Language } from "../lib/i18n";
import type { PhotoStore } from "../lib/photos";
import { photosOf } from "../lib/types";
import type { GardenState, Repo } from "../lib/repo";
import { useT } from "./I18nProvider"; // УБРАНО РАСШИРЕНИЕ .tsx
import { Button, IconButton, IconClose } from "./ui"; // УБРАНО РАСШИРЕНИЕ .tsx

/** Часть сессии Supabase, которая нужна панели. Настоящая Session из supabase-js под этот тип подходит. */
export interface AccountSession {
  user?: { id?: string | undefined; email?: string | null | undefined } | null | undefined;
}

export interface BackupPanelProps {
  repo: Repo;
  /** Хранилище фото: из него фото попадают в копию, в него они возвращаются при загрузке. */
  photoStore: PhotoStore;
  state: GardenState;
  onClose: () => void;
  onMessage: (text: string) => void;
  /** Текущая сессия: из неё берётся email для блока «Аккаунт». */
  session?: AccountSession | null | undefined;
}

const sentence = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-h-(--layout-tapMin) items-center justify-between gap-3 px-4 text-base">
      <span>{label}</span>
      <span className="text-[#9a85ff]">{value}</span>
    </div>
  );
}

export function BackupPanel({ repo, photoStore, state, onClose, onMessage, session }: BackupPanelProps) {
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
  const [signingOut, setSigningOut] = useState(false);

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

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.
