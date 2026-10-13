"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { compareKeys, formatLong, formatShort, isValidKey, type DateKey } from "../lib/date.ts";
import { GardenError, LIMITS, type Entry, type Mood } from "../lib/types.ts";
import type { Repo } from "../lib/repo.ts";
import { itemsOf, sameItems, saveEntryWithPhotos, type PhotoItem } from "../lib/entryPhotos.ts";
import type { PhotoStore } from "../lib/photos.ts";
import { MoodPicker } from "./MoodPicker.tsx";
import { MoodFlower } from "./MoodFlower.tsx";
import { PhotoGallery, usePhotoPicker } from "./PhotoStrip.tsx";
import { Button, IconButton, IconClose } from "./ui.tsx";

/** Тексты окна в одном месте: поменяйте на русский, если нужно. */
const T = {
  placeholder: "Start writing",
  done: "Done",
  today: "Сегодня",
  moodTitle: "How are you feeling today?",
} as const;

/** Сине-фиолетовый акцент окна (обводка иконок, кнопка Done, точка в квадрате). */
const INK = "#5a3df5";

/** Рукописный шрифт. Подключите настоящий через --font-hand (см. пояснение), иначе сработают системные. */
const FORM_STYLE = {
  fontFamily: "var(--font-hand, 'Bradley Hand', 'Segoe Print', 'Comic Sans MS', cursive)",
  "--ink": INK,
} as CSSProperties;

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

/** Квадратная кнопка-иконка нижней панели: прозрачная, обводка и иконка сине-фиолетовые. */
const SQUARE_BTN =
  "grid size-12 place-items-center rounded-xl border-[1.5px] border-(color:--ink) bg-transparent text-(color:--ink) transition-opacity disabled:opacity-35";

/** Залитая кнопка «Done». */
const DONE_BTN =
  "min-h-12 rounded-xl bg-(--ink) px-8 text-xl leading-none text-white transition-opacity active:opacity-80 disabled:opacity-40";

export function EntryModal({ repo, photoStore, initialDate, today, onClose, onSaved, onDeleted }: EntryModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const sheetDoneRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const sheetTitleId = useId();

  const [date, setDate] = useState<DateKey>(initialDate);
  const [form, setForm] = useState<Form>(EMPTY);
  const [existing, setExisting] = useState<Entry | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  /** write — пишем; mood — окно с цветком и настроением, оно видно только перед сохранением. */
  const [step, setStep] = useState<"write" | "mood">("write");
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
    requestAnimationFrame(() => textRef.current?.focus());
    return () => {
      if (dlg.open) dlg.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // На телефоне окно занимает видимую область над клавиатурой: панель с иконками и «Done» не прячется под ней.
  useEffect(() => {
    const dlg = dialogRef.current;
    const vv = window.visualViewport;
    if (!dlg || !vv) return;
    const wide = window.matchMedia("(min-width: 640px)");
    const apply = () => {
      if (wide.matches) {
        dlg.style.removeProperty("top");
        dlg.style.removeProperty("height");
        return;
      }
      dlg.style.top = `${vv.offsetTop}px`;
      dlg.style.height = `${vv.height}px`;
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    wide.addEventListener("change", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      wide.removeEventListener("change", apply);
    };
  }, []);

  // Пока открыто окно с цветком, остальное недоступно для фокуса и скринридера.
  useEffect(() => {
    if (mainRef.current) mainRef.current.inert = step === "mood";
    if (step === "mood") requestAnimationFrame(() => sheetDoneRef.current?.focus());
  }, [step]);

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

  // Поле текста растёт по содержимому; прокручивается вся область записи.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
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
      setStep("write"); // ошибка показывается на экране записи
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
  const canAddPhoto = !saving && photoStore.available && picker.room > 0;
  const hasPhotos = form.photos.length > 0;
  const dateLabel = date === today ? T.today : formatShort(date);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleClose}
      onCancel={(e) => {
        // Esc в окне с цветком возвращает к тексту, а не закрывает запись.
        if (step === "mood") {
          e.preventDefault();
          setStep("write");
        }
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
      className="entry-dialog fixed inset-x-0 top-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-transparent p-0 text-text sm:inset-auto sm:m-auto sm:h-auto sm:max-h-[92dvh] sm:max-w-(--layout-modalMax)"
    >
      <form
        noValidate
        style={FORM_STYLE}
        onSubmit={(e) => {
          e.preventDefault();
          // Ничего не менялось: «Done» просто закрывает окно.
          if (!dirty) {
            dialogRef.current?.close();
            return;
          }
          if (!canSave) return;
          // Первый «Done» открывает цветок с настроением, второй сохраняет.
          if (step === "write") setStep("mood");
          else save();
        }}
        className="relative flex h-full flex-col bg-surface-raised sm:h-auto sm:min-h-[32rem] sm:max-h-[92dvh] sm:rounded-lg sm:shadow-md"
      >
        <div ref={mainRef} className="flex min-h-0 flex-1 flex-col">
          {/* Верх: дата маленьким текстом и квадрат с точкой по центру */}
          <header className="relative shrink-0 px-5 text-center" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
            <h2 id={titleId} className="sr-only">
              {formatLong(date)}
            </h2>
            <div className="relative inline-block">
              <button type="button" onClick={openDatePicker} aria-label={`Сменить дату, сейчас ${formatLong(date)}`} className="min-h-(--layout-tapMin) px-3 text-lg text-text-muted">
                {dateLabel}
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
            <div aria-hidden="true" className="mx-auto mt-1 grid size-16 place-items-center rounded-2xl border border-(color:--ink)/35 bg-(--ink)/15">
              <span className="size-1.5 rounded-full bg-(--ink)" />
            </div>
            <div className="absolute right-2" style={{ top: "max(0.5rem, env(safe-area-inset-top))" }}>
              <IconButton label="Закрыть" onClick={() => dialogRef.current?.close()}>
                <IconClose />
              </IconButton>
            </div>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 pb-4 pt-6">
            {(hasPhotos || picker.busy > 0) && (
              <div>
                <PhotoGallery
                  store={photoStore}
                  items={form.photos}
                  busy={picker.busy}
                  disabled={saving}
                  onRemove={(id) => setForm((f) => ({ ...f, photos: f.photos.filter((p) => p.ref.id !== id) }))}
                />
                {hasPhotos && <p className="mt-3 text-center text-sm text-text-muted">Фото хранятся только на этом устройстве. Они входят в ZIP-копию.</p>}
              </div>
            )}

            <div>
              {draftRestored && (
                <p className="mb-2 flex items-center justify-between gap-2 text-base text-text-muted">
                  <span>Черновик восстановлен</span>
                  <button type="button" onClick={discardDraft} className="rounded-sm px-1 text-(color:--ink) underline">
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
                rows={3}
                value={form.body}
                placeholder={T.placeholder}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                className="block min-h-[40dvh] w-full resize-none appearance-none border-0 bg-transparent p-0 text-2xl leading-9 text-text shadow-none outline-none ring-0 placeholder:text-text-muted/50 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none"
              />
            </div>

            {!photoStore.available && <p className="text-base text-text-muted">В этом браузере нельзя сохранять фото. Тексты работают как обычно.</p>}

            {error && (
              <p role="alert" className="rounded-xl bg-danger/10 p-3 text-base text-danger">
                {error}
              </p>
            )}

            {existing && confirmDelete && (
              <div role="group" aria-label="Подтверждение удаления" className="rounded-xl bg-surface p-4">
                <p className="mb-3 text-lg">Удалить запись за {formatShort(date)}? Растение снова станет семенем.</p>
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

          {/* Нижняя панель над клавиатурой: две квадратные кнопки слева, Done справа */}
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-2" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
            <div className="flex items-center gap-3">
              <button type="button" className={SQUARE_BTN} aria-label="Добавить фото из галереи" onClick={picker.openGallery} disabled={!canAddPhoto}>
                <ImagePlus size={24} strokeWidth={1.6} aria-hidden="true" />
              </button>
              <button type="button" className={SQUARE_BTN} aria-label="Сделать фото" onClick={picker.openCamera} disabled={!canAddPhoto}>
                <Camera size={24} strokeWidth={1.6} aria-hidden="true" />
              </button>
              {hasPhotos && (
                <span className="text-base tabular-nums text-text-muted" aria-label={`Фото: ${form.photos.length} из ${picker.max}`}>
                  {form.photos.length}/{picker.max}
                </span>
              )}
              {existing && !confirmDelete && (
                <button
                  type="button"
                  aria-label="Удалить запись"
                  onClick={() => setConfirmDelete(true)}
                  className="grid min-h-(--layout-tapMin) min-w-(--layout-tapMin) place-items-center rounded-xl text-text-muted hover:text-text"
                >
                  <Trash2 size={22} strokeWidth={1.6} aria-hidden="true" />
                </button>
              )}
            </div>
            <button type="submit" className={DONE_BTN} disabled={saving || (dirty && !canSave)}>
              {T.done}
            </button>
          </div>
        </div>

        {/* Цветок и настроение: показываются только перед сохранением */}
        {step === "mood" && (
          <div
            className="absolute inset-0 z-10 flex flex-col justify-end bg-black/50"
            onClick={(e) => {
              if (e.target === e.currentTarget) setStep("write");
            }}
          >
            <div
              role="group"
              aria-labelledby={sheetTitleId}
              className="rounded-t-3xl bg-surface px-6 pt-3 shadow-sheet sm:rounded-b-lg"
              style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
            >
              <div className="mx-auto h-1 w-10 rounded-full bg-text-muted/30" aria-hidden="true" />
              <p id={sheetTitleId} className="mx-auto mt-5 max-w-[16rem] text-center text-2xl leading-8 text-(color:--ink)">
                {T.moodTitle}
              </p>
              <div className="grid h-60 place-items-center">
                <MoodFlower mood={form.mood} className="h-48 w-auto" />
              </div>
              <div className="flex flex-col items-center [&_[role=radio]]:size-14 [&_[role=radio]>span]:size-7 [&_[role=radiogroup]]:ml-0">
                <MoodPicker value={form.mood} onChange={(mood) => setForm((f) => ({ ...f, mood }))} />
              </div>
              <div className="mt-6 flex justify-center">
                <button ref={sheetDoneRef} type="submit" className={DONE_BTN} disabled={saving}>
                  {T.done}
                </button>
              </div>
            </div>
          </div>
        )}

        {picker.inputs}
        <p role="status" className="sr-only">
          {picker.busy > 0 ? "Обрабатываю фото…" : ""}
        </p>
      </form>
    </dialog>
  );
}
