"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CalendarDays, Camera, ImagePlus, Trash2 } from "lucide-react";
import { compareKeys, formatLong, formatShort, isValidKey, type DateKey } from "../lib/date.ts";
import { GardenError, LIMITS, type Entry, type Mood } from "../lib/types.ts";
import type { Repo } from "../lib/repo.ts";
import { itemsOf, sameItems, saveEntryWithPhotos, type PhotoItem } from "../lib/entryPhotos.ts";
import type { PhotoStore } from "../lib/photos.ts";
import { MoodPicker } from "./MoodPicker.tsx";
import { PhotoGallery, usePhotoPicker } from "./PhotoStrip.tsx";
import { Button, IconButton, IconClose } from "./ui.tsx";

export interface EntryModalProps {
  repo: Repo;
  photoStore: PhotoStore;
  /** Дата, с которой открыли окно. Внутри её можно сменить. */
  initialDate: DateKey;
  today: DateKey;
  onClose: () => void;
  onSaved: (entry: Entry, wasNew: boolean) => void;
  onDeleted: (entry: Entry) => void;
}

interface Form {
  body: string;
  mood: Mood | null;
  photos: readonly PhotoItem[];
}

const EMPTY: Form = { body: "", mood: null, photos: [] };

function baseOf(entry: Entry | null): Form {
  return entry ? { body: entry.body, mood: entry.mood, photos: itemsOf(entry) } : EMPTY;
}

/** Сравнивает только текст и настроение: черновик хранит их, а фото в нём не живут (они в памяти до «Сохранить»). */
const same = (a: Form, b: Form) => a.body === b.body && a.mood === b.mood;

function saveErrorText(e: unknown): string {
  if (e instanceof GardenError) {
    if (e.code === "quota") return "Не удалось сохранить: на телефоне кончилось место. Текст остался на экране.";
    if (e.code === "unavailable") return "Не удалось записать в хранилище браузера. Текст остался на экране: скопируйте его, чтобы не потерять.";
    return e.message;
  }
  return "Не удалось сохранить. Текст остался на экране.";
}

/** Круглая иконка-кнопка нижней панели: без рамки и фона, только иконка. */
const TOOL_BTN =
  "grid min-h-(--layout-tapMin) min-w-(--layout-tapMin) place-items-center rounded-full text-text-muted transition-colors hover:text-text disabled:opacity-40 disabled:hover:text-text-muted";

export function EntryModal({ repo, photoStore, initialDate, today, onClose, onSaved, onDeleted }: EntryModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const bodyId = useId();

  const [date, setDate] = useState<DateKey>(initialDate);
  const [form, setForm] = useState<Form>(EMPTY);
  const [existing, setExisting] = useState<Entry | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const formRef = useRef(form);
  formRef.current = form;
  const dateRef = useRef(date);
  dateRef.current = date;
  const existingRef = useRef(existing);
  existingRef.current = existing;
  const closedBySave = useRef(false);

  const picker = usePhotoPicker({
    items: form.photos,
    onChange: (update) => setForm((f) => ({ ...f, photos: update(f.photos) })),
    onError: setError,
  });

  /** Загружает запись или черновик для даты. */
  const load = useCallback(
    (d: DateKey) => {
      const entry = repo.getEntry(d);
      const draft = repo.getDraft(d);
      const base = baseOf(entry);
      setExisting(entry);
      setError(null);
      setConfirmDelete(false);
      if (draft && !same({ body: draft.body, mood: draft.mood, photos: base.photos }, base)) {
        setForm({ body: draft.body, mood: draft.mood, photos: base.photos });
        setDraftRestored(true);
      } else {
        setForm(base);
        setDraftRestored(false);
      }
    },
    [repo],
  );

  /** Незавершённое не теряем: пишем в черновик. */
  const flushDraft = useCallback(() => {
    if (closedBySave.current) return;
    const d = dateRef.current;
    const f = formRef.current;
    if (same(f, baseOf(existingRef.current))) repo.clearDraft(d);
    // Только текст и настроение: в черновик не должны попасть фото (Blob в JSON превращается в {}).
    else repo.saveDraft(d, { body: f.body, mood: f.mood });
  }, [repo]);

  // Открытие: showModal даёт ловушку фокуса, inert для фона и закрытие по Esc.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    load(initialDate);
    if (!dlg.open) dlg.showModal();
    const hasEntry = repo.getEntry(initialDate) !== null;
    requestAnimationFrame(() => {
      if (hasEntry) dlg.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus();
      else textRef.current?.focus();
    });
    return () => {
      if (dlg.open) dlg.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Автосохранение черновика с задержкой.
  useEffect(() => {
    const t = window.setTimeout(flushDraft, LIMITS.draftSaveDebounceMs);
    return () => window.clearTimeout(t);
  }, [form, date, existing, flushDraft]);

  // Страницу могут закрыть, обновить или усыпить (вкладка в фоне на iOS) раньше, чем сработает задержка:
  // тогда черновик пишем сразу.
  useEffect(() => {
    const onHide = () => flushDraft();
    const onVis = () => {
      if (document.visibilityState === "hidden") flushDraft();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [flushDraft]);

  // Поле текста растёт по содержимому, до 12 строк (минимальная высота задана классом).
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 26;
    el.style.height = `${Math.min(el.scrollHeight, line * 12 + 24)}px`;
  }, [form.body]);

  function changeDate(next: string) {
    if (!isValidKey(next)) return;
    if (compareKeys(next, today) > 0) {
      setError("Завтра ещё не наступило.");
      return;
    }
    // Новые фото живут только в памяти этого окна: при смене даты они пропали бы молча.
    if (form.photos.some((p) => p.kind === "new")) {
      setError("Новые фото ещё не сохранены. Сохраните запись или уберите фото, потом меняйте дату.");
      return;
    }
    flushDraft();
    setDate(next);
    dateRef.current = next;
    load(next);
  }

  function openDatePicker() {
    const el = dateInputRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  }

  function handleClose() {
    flushDraft();
    onClose();
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const wasNew = existing === null;
      const entry = await saveEntryWithPhotos(repo, photoStore, { date, body: form.body, mood: form.mood, items: form.photos });
      closedBySave.current = true;
      onSaved(entry, wasNew);
    } catch (e) {
      setError(saveErrorText(e));
      setSaving(false);
    }
  }

  function remove() {
    try {
      const gone = repo.deleteEntry(date);
      repo.clearDraft(date);
      closedBySave.current = true;
      if (gone) onDeleted(gone);
      else onClose();
    } catch (e) {
      setError(saveErrorText(e));
    }
  }

  function discardDraft() {
    repo.clearDraft(date);
    // Сбрасываем текст и настроение; уже выбранные фото не трогаем.
    setForm((f) => ({ ...baseOf(existing), photos: f.photos }));
    setDraftRestored(false);
  }

  const canSave = form.body.trim() !== "" || form.mood !== null || form.photos.length > 0;
  const dirty = !same(form, baseOf(existing)) || !sameItems(form.photos, baseOf(existing).photos);
  const isPast = compareKeys(date, today) < 0;
  const canAddPhoto = !saving && photoStore.available && picker.room > 0;
  const hasPhotos = form.photos.length > 0;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
      className="entry-dialog fixed m-0 h-auto max-h-[92dvh] w-full max-w-none overflow-hidden border-0 bg-transparent p-0 text-text sm:m-auto sm:max-w-(--layout-modalMax)"
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          // Ничего не менялось: «Готово» просто закрывает окно.
          if (!dirty) {
            dialogRef.current?.close();
            return;
          }
          if (canSave) save();
        }}
        className="flex h-[92dvh] flex-col rounded-t-lg bg-surface-raised shadow-sheet sm:h-auto sm:max-h-[92dvh] sm:min-h-[30rem] sm:rounded-lg sm:shadow-md"
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-text-muted/30 sm:hidden" aria-hidden="true" />

        {/* Шапка: дата обычным текстом, выбор даты — по иконке; настоящий input прозрачный и лежит поверх */}
        <header className="flex shrink-0 items-start justify-between gap-2 px-5 pt-4">
          <div className="min-w-0">
            <div className="relative flex items-center gap-1">
              <h2 id={titleId} className="text-lg text-text first-letter:uppercase">
                {formatLong(date)}
              </h2>
              <button type="button" onClick={openDatePicker} aria-label="Сменить дату" className="-my-2 grid min-h-(--layout-tapMin) min-w-(--layout-tapMin) place-items-center rounded-full text-text-muted hover:text-text">
                <CalendarDays size={18} aria-hidden="true" />
              </button>
              <input
                ref={dateInputRef}
                type="date"
                value={date}
                max={today}
                onChange={(e) => changeDate(e.target.value)}
                tabIndex={-1}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
              />
            </div>
            {isPast && <p className="text-sm text-text-muted">прошлый день</p>}
          </div>
          <IconButton label="Закрыть" onClick={() => dialogRef.current?.close()}>
            <IconClose />
          </IconButton>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-4 pt-3">
          <MoodPicker value={form.mood} onChange={(mood) => setForm((f) => ({ ...f, mood }))} />

          {/* Фото сверху по центру, над текстом */}
          {(hasPhotos || picker.busy > 0) && (
            <div>
              <PhotoGallery
                store={photoStore}
                items={form.photos}
                busy={picker.busy}
                disabled={saving}
                onRemove={(id) => setForm((f) => ({ ...f, photos: f.photos.filter((p) => p.ref.id !== id) }))}
              />
              {hasPhotos && <p className="mt-3 text-center text-xs text-text-muted">Фото хранятся только на этом устройстве. Они входят в ZIP-копию.</p>}
            </div>
          )}

          <div>
            {draftRestored && (
              <p className="mb-2 flex items-center justify-between gap-2 text-sm text-text-muted">
                <span>Черновик восстановлен</span>
                <button type="button" onClick={discardDraft} className="rounded-sm px-1 text-accent underline">
                  Сбросить
                </button>
              </p>
            )}
            <label htmlFor={bodyId} className="sr-only">
              Запись дня
            </label>
            <textarea
              ref={textRef}
              id={bodyId}
              rows={5}
              value={form.body}
              placeholder="Что сегодня было?"
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              className="block min-h-[30dvh] w-full resize-none appearance-none border-0 bg-transparent p-0 font-entry text-entry text-text shadow-none outline-none ring-0 placeholder:text-text-muted focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none"
            />
          </div>

          {!photoStore.available && <p className="text-sm text-text-muted">В этом браузере нельзя сохранять фото. Тексты работают как обычно.</p>}

          {error && (
            <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
              {error}
            </p>
          )}

          {existing && confirmDelete && (
            <div role="group" aria-label="Подтверждение удаления" className="rounded-lg bg-surface p-4">
              <p className="mb-3 text-base">Удалить запись за {formatShort(date)}? Растение снова станет семенем.</p>
              <div className="flex gap-2">
                <Button variant="danger" onClick={remove}>
                  Удалить
                </Button>
                <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                  Не удалять
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Нижняя панель: слева иконки, справа «Готово» */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-2" style={{ paddingBottom: "max(var(--space-3), env(safe-area-inset-bottom))" }}>
          <div className="flex items-center">
            <button type="button" className={TOOL_BTN} aria-label="Добавить фото из галереи" onClick={picker.openGallery} disabled={!canAddPhoto}>
              <ImagePlus size={22} aria-hidden="true" />
            </button>
            <button type="button" className={TOOL_BTN} aria-label="Сделать фото" onClick={picker.openCamera} disabled={!canAddPhoto}>
              <Camera size={22} aria-hidden="true" />
            </button>
            {hasPhotos && (
              <span className="px-1 text-xs tabular-nums text-text-muted" aria-label={`Фото: ${form.photos.length} из ${picker.max}`}>
                {form.photos.length}/{picker.max}
              </span>
            )}
            {existing && !confirmDelete && (
              <button type="button" className={TOOL_BTN} aria-label="Удалить запись" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={22} aria-hidden="true" />
              </button>
            )}
          </div>
          <Button type="submit" variant="primary" className="px-6" disabled={saving || (dirty && !canSave)}>
            Готово
          </Button>
        </div>

        {picker.inputs}
        <p role="status" className="sr-only">
          {picker.busy > 0 ? "Обрабатываю фото…" : ""}
        </p>
      </form>
    </dialog>
  );
}
