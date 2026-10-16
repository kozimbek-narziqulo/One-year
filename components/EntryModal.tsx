"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { compareKeys, isValidKey, type DateKey } from "../lib/date.ts";
import { errorText, formatDayLong, formatDayShort, type Translate } from "../lib/i18n.ts";
import { GardenError, LIMITS, photosOf, type Entry, type Mood } from "../lib/types.ts";
import type { Repo } from "../lib/repo.ts";
import { itemsOf, saveEntryWithPhotos, type PhotoItem } from "../lib/entryPhotos.ts";
import type { PhotoStore } from "../lib/photos.ts";
import { CustomCamera } from "./CustomCamera.tsx";
import { FeedPhoto } from "./FeedPhoto.tsx";
import { useT } from "./I18nProvider.tsx";
import { MoodPicker } from "./MoodPicker.tsx";
import { MoodFlower } from "./MoodFlower.tsx";
import { usePhotoPicker } from "./PhotoStrip.tsx";
import { SketchCloseButton, SketchDefs, SketchDoneButton, SketchIconButton, randomShapeId, resolveShapeId } from "./SketchUI.tsx";
import { Button } from "./ui.tsx";

/** Фон окна — тот же тёмно-синий, что у всей системы. */
const BG = "#02001a";
/** Чуть светлее фона: шторка с цветком, плашка подтверждения, заглушки фото. */
const BG_RAISED = "#0a0730";

/** Приглушённая сине-фиолетовая гамма: линии, иконки, шрифт. */
const INK = "#6c67d6";
const INK_DEEP = "#4a46b4";
const INK_SOFT = "#b4b0f2";

/** Рукописный шрифт. Подключите настоящий через --font-hand, иначе сработают системные. */
const FORM_STYLE = {
  fontFamily: "var(--font-hand, 'Bradley Hand', 'Segoe Print', 'Comic Sans MS', cursive)",
  backgroundColor: BG,
  "--ink": INK,
  "--ink-deep": INK_DEEP,
  "--ink-soft": INK_SOFT,
} as CSSProperties;

export interface EntryModalProps {
  repo: Repo;
  /** Фото записи: добавляются и удаляются в редакторе, на диск попадают при сохранении. */
  photoStore: PhotoStore;
  /** Дата, с которой открыли окно. Внутри её можно сменить. */
  initialDate: DateKey;
  today: DateKey;
  onClose: () => void;
  onSaved: (entry: Entry, wasNew: boolean) => void;
  onDeleted: (entry: Entry) => void;
}

/** Текстовая часть формы, которую хранит черновик. Фото живут отдельно (см. items). */
interface Form {
  body: string;
  mood: Mood | null;
}

const EMPTY: Form = { body: "", mood: null };

function baseOf(entry: Entry | null): Form {
  return entry ? { body: entry.body, mood: entry.mood } : EMPTY;
}

const same = (a: Form, b: Form) => a.body === b.body && a.mood === b.mood;

function saveErrorText(t: Translate, e: unknown): string {
  if (e instanceof GardenError) {
    if (e.code === "quota") return t("entry.saveQuota");
    if (e.code === "unavailable") return t("entry.saveUnavailable");
    return errorText(t, e) ?? t("entry.saveFailed");
  }
  return t("entry.saveFailed");
}

/** Нарисованная от руки галочка: в той же манере, что крестик. */
function CheckButton({ disabled }: { disabled: boolean }) {
  const { t } = useT();
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-label={t("entry.done")}
      className="grid min-h-(--layout-tapMin) min-w-(--layout-tapMin) place-items-center rounded-full text-(color:--ink-soft) transition-transform duration-(--duration-fast) active:scale-90 disabled:opacity-40"
    >
      <svg viewBox="0 0 32 32" className="size-8" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable={false}>
        <path d="M6.5 17.2c2.1 1.6 4.3 3.9 6.1 6.3 3.4-6.4 7.6-11.6 13-15.8" />
      </svg>
    </button>
  );
}

/** Корзина в той же манере, что крестик и галочка. Удаляет запись сразу; вернуть можно кнопкой «Вернуть» в уведомлении. */
function TrashButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  const { t } = useT();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={t("common.delete")}
      className="grid min-h-(--layout-tapMin) min-w-(--layout-tapMin) place-items-center rounded-full text-(color:--ink-soft) transition-transform duration-(--duration-fast) active:scale-90 disabled:opacity-40"
    >
      <svg viewBox="0 0 32 32" className="size-7" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable={false}>
        <path d="M6 9.2c4.7-.6 15.3-.6 20 0M12.4 8.6c.2-2.3.9-3.4 3.6-3.4s3.4 1.1 3.6 3.4" />
        <path d="M8.6 9.6c.5 5.9.9 12 1.5 16.3.2 1.1.9 1.6 1.9 1.6h8c1 0 1.7-.5 1.9-1.6.6-4.3 1-10.4 1.5-16.3" />
        <path d="M13.2 14.2l.3 8.6M18.8 14.2l-.3 8.6" />
      </svg>
    </button>
  );
}

/** Файл новой (ещё не сохранённой) фотографии для превью. Если поле в PhotoItem называется иначе, поправьте список ключей. */
function previewSource(item: PhotoItem): Blob | null {
  const r = item as unknown as Record<string, unknown>;
  for (const key of ["file", "blob", "source", "original"]) {
    const v = r[key];
    if (v instanceof Blob) return v;
  }
  return null;
}

/** Превью фото, которое ещё не записано в хранилище. */
function NewThumb({ item, alt }: { item: PhotoItem; alt: string }) {
  const blob = previewSource(item);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={alt} className="size-full object-cover" /> : <div className="size-full" aria-hidden="true" />;
}

/**
 * Редактор записи: дата сверху, крестик и галочка по краям, поле для письма,
 * сразу под ним иконки «галерея» / «камера» со счётчиком и лента миниатюр с крестиками.
 * Фото записываются вместе с текстом: галочка, затем «Готово».
 */
export function EntryModal({ repo, photoStore, initialDate, today, onClose, onSaved, onDeleted }: EntryModalProps) {
  const { t, lang } = useT();
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
  /** Фото в редакторе: сохранённые и добавленные только что. Попадают в запись при сохранении. */
  const [items, setItems] = useState<readonly PhotoItem[]>([]);
  const [existing, setExisting] = useState<Entry | null>(null);
  /** Форма растения этого дня. Для новой записи выпадает случайно при открытии даты и уходит в хранилище вместе с записью. */
  const [shapeId, setShapeId] = useState(0);
  const [draftRestored, setDraftRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  /** write — пишем; mood — шторка с цветком и настроением, она видна только перед сохранением. */
  const [step, setStep] = useState<"write" | "mood">("write");
  const formRef = useRef(form);
  formRef.current = form;
  const dateRef = useRef(date);
  dateRef.current = date;
  const existingRef = useRef(existing);
  existingRef.current = existing;
  const closedBySave = useRef(false);
  /** Запись или черновик загружены в форму: можно ставить курсор в конец текста. */
  const [opened, setOpened] = useState(false);

  const picker = usePhotoPicker({
    items,
    onChange: (update) => {
      setError(null);
      setItems((prev) => update(prev));
    },
    onError: setError,
  });

  /** Загружает запись или черновик для даты. */
  const load = useCallback(
    (d: DateKey) => {
      const entry = repo.getEntry(d);
      const draft = repo.getDraft(d);
      const base = baseOf(entry);
      setExisting(entry);
      setItems(entry ? itemsOf(entry) : []);
      setShapeId(entry ? resolveShapeId(entry.shapeId, d) : randomShapeId());
      setError(null);
      setConfirmDelete(false);
      if (draft && !same({ body: draft.body, mood: draft.mood }, base)) {
        setForm({ body: draft.body, mood: draft.mood });
        setDraftRestored(true);
      } else {
        setForm(base);
        setDraftRestored(false);
      }
    },
    [repo],
  );

  /** Незавершённый текст не теряем: пишем в черновик. Фото в черновик не входят. */
  const flushDraft = useCallback(() => {
    if (closedBySave.current) return;
    const d = dateRef.current;
    const f = formRef.current;
    if (same(f, baseOf(existingRef.current))) repo.clearDraft(d);
    else repo.saveDraft(d, { body: f.body, mood: f.mood });
  }, [repo]);

  // Открытие: showModal даёт ловушку фокуса, inert для фона и закрытие по Esc.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    load(initialDate);
    if (!dlg.open) dlg.showModal();
    // Фокус сразу, в том же вызове, что и открытие по касанию: так на телефоне поднимается клавиатура.
    textRef.current?.focus();
    setOpened(true);
    return () => {
      if (dlg.open) dlg.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // На телефоне окно занимает видимую область над клавиатурой.
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

  // Пока открыта шторка с цветком, остальное недоступно для фокуса и скринридера.
  useEffect(() => {
    if (mainRef.current) mainRef.current.inert = step === "mood";
    if (step === "mood") requestAnimationFrame(() => sheetDoneRef.current?.focus());
    else if (opened) textRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Автосохранение черновика с задержкой.
  useEffect(() => {
    const timer = window.setTimeout(flushDraft, LIMITS.draftSaveDebounceMs);
    return () => window.clearTimeout(timer);
  }, [form, date, existing, flushDraft]);

  // Страницу могут закрыть или усыпить раньше, чем сработает задержка: тогда черновик пишем сразу.
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

  // Умный автофокус: курсор в самом конце текста, чтобы сразу продолжать писать.
  useEffect(() => {
    if (!opened) return;
    const el = textRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
    el.scrollIntoView({ block: "nearest" });
  }, [opened]);

  /** Сохранённые фото записи: из них берутся миниатюры тех фото, что уже лежат в хранилище. */
  const refById = useMemo(() => new Map((existing ? photosOf(existing) : []).map((p) => [p.id, p] as const)), [existing]);
  const baseItems = useMemo(() => (existing ? itemsOf(existing) : []), [existing]);
  const photosChanged = items.length !== baseItems.length || items.some((p, i) => p.kind === "new" || p.ref.id !== baseItems[i]?.ref.id);

  const hasPhotos = items.length > 0;
  const photoBusy = picker.busy > 0;
  const canAddPhoto = photoStore.available && !saving && !photoBusy && picker.room > 0;

  function removePhoto(id: string) {
    if (saving) return;
    setError(null);
    setItems((prev) => prev.filter((item) => item.ref.id !== id));
  }

  function changeDate(next: string) {
    if (!isValidKey(next)) return;
    if (compareKeys(next, today) > 0) {
      setError(t("error.future"));
      return;
    }
    flushDraft();
    setDate(next);
    dateRef.current = next;
    load(next);
    requestAnimationFrame(() => textRef.current?.focus());
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
    if (saving || photoBusy) return;
    setSaving(true);
    try {
      const wasNew = existing === null;
      const entry = await saveEntryWithPhotos(repo, photoStore, {
        date,
        body: form.body,
        mood: form.mood,
        shapeId,
        items,
      });
      closedBySave.current = true;
      onSaved(entry, wasNew);
    } catch (e) {
      setError(saveErrorText(t, e));
      setSaving(false);
      setStep("write");
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
      setError(saveErrorText(t, e));
    }
  }

  function discardDraft() {
    repo.clearDraft(date);
    setForm(baseOf(existing));
    setDraftRestored(false);
  }

  const hasText = form.body.trim() !== "";
  const canSave = hasText || form.mood !== null || hasPhotos;
  const dirty = !same(form, baseOf(existing)) || photosChanged;
  const dateLabel = date === today ? t("common.today") : formatDayShort(date, lang);
  const dateLong = formatDayLong(date, lang);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleClose}
      onCancel={(e) => {
        // Esc в камере закрывает камеру, в шторке с цветком возвращает к тексту: запись не закрывается.
        if (cameraOpen) {
          e.preventDefault();
          setCameraOpen(false);
        } else if (step === "mood") {
          e.preventDefault();
          setStep("write");
        }
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
      className="entry-dialog fixed inset-x-0 top-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-transparent p-0 text-text sm:inset-auto sm:m-auto sm:h-auto sm:max-h-[92dvh] sm:max-w-(--layout-modalMax) md:max-w-xl lg:max-w-2xl"
    >
      <form
        noValidate
        style={FORM_STYLE}
        onSubmit={(e) => {
          e.preventDefault();
          // Кнопки фото лежат внутри формы: если у какой-то нет type="button", её нажатие не должно сохранять запись.
          const submitter = (e.nativeEvent as SubmitEvent).submitter;
          if (submitter?.closest("[data-photo-tools]")) return;
          if (step === "mood") {
            void save();
            return;
          }
          // Ничего не менялось: галочка просто закрывает окно.
          if (!dirty) {
            dialogRef.current?.close();
            return;
          }
          // Текст стёрт целиком, а фото нет: предлагаем удалить запись (корзины в редакторе нет).
          if (existing && !hasText && !hasPhotos) {
            setConfirmDelete(true);
            return;
          }
          // Новая и пустая: сохранять нечего, просто закрываем.
          if (!canSave) {
            dialogRef.current?.close();
            return;
          }
          // Первая галочка открывает цветок с настроением, «Готово» в шторке сохраняет.
          setStep("mood");
        }}
        className="relative flex h-full flex-col sm:h-auto sm:max-h-[92dvh] sm:min-h-[32rem] sm:rounded-lg sm:shadow-md md:min-h-[36rem] md:rounded-3xl"
      >
        <SketchDefs />

        <div ref={mainRef} className="flex min-h-0 flex-1 flex-col">
          {/* Минималистичная верхняя панель: крестик, дата, галочка */}
          <header
            className="grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 px-3 md:px-5"
            style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
          >
            <div className="flex items-center">
              <SketchCloseButton label={t("common.close")} onClick={() => dialogRef.current?.close()} />
              {/* Пустое место размером с корзину: так дата остаётся ровно по центру */}
              {existing && <span aria-hidden="true" className="min-w-(--layout-tapMin)" />}
            </div>
            <div className="relative justify-self-center">
              <h2 id={titleId} className="sr-only">
                {dateLong}
              </h2>
              <button
                type="button"
                onClick={openDatePicker}
                aria-label={t("entry.changeDate", { date: dateLong })}
                className="min-h-(--layout-tapMin) px-3 text-2xl text-(color:--ink-soft)"
              >
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
            <div className="flex items-center">
              {existing && <TrashButton disabled={saving} onClick={remove} />}
              <CheckButton disabled={saving || photoBusy} />
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 pt-6 md:px-10 md:pt-8" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
            {draftRestored && (
              <p className="flex items-center justify-between gap-2 text-lg text-(color:--ink)">
                <span>{t("entry.draftRestored")}</span>
                <button type="button" onClick={discardDraft} className="rounded-sm px-1 text-(color:--ink-soft) underline">
                  {t("entry.draftDiscard")}
                </button>
              </p>
            )}

            <label htmlFor={bodyId} className="sr-only">
              {t("entry.bodyLabel")}
            </label>
            {/* Никаких рамок и обводок, в том числе при фокусе */}
            <textarea
              ref={textRef}
              id={bodyId}
              rows={3}
              value={form.body}
              placeholder={t("entry.placeholder")}
              spellCheck={true}
              autoCorrect="on"
              autoComplete="on"
              autoCapitalize="sentences"
              onChange={(e) => {
                setConfirmDelete(false);
                setForm((f) => ({ ...f, body: e.target.value }));
              }}
              style={{ outline: "none", boxShadow: "none", border: "none", WebkitTapHighlightColor: "transparent" }}
              className="block min-h-[30dvh] w-full resize-none appearance-none border-0 bg-transparent p-0 text-2xl leading-9 text-(color:--ink-soft) caret-(color:--ink) shadow-none outline-none ring-0 placeholder:text-(color:--ink)/70 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            />

            {/* Фото: иконки сразу под текстом, ниже лента миниатюр с крестиками */}
            {photoStore.available && (
              <div data-photo-tools className="space-y-3">
                <div className="flex items-center gap-3">
                  {picker.room > 0 && (
                    <>
                      <SketchIconButton icon="gallery" label={t("entry.addGallery")} onClick={picker.openGallery} disabled={!canAddPhoto} />
                      <SketchIconButton icon="camera" label={t("entry.addCamera")} onClick={() => setCameraOpen(true)} disabled={!canAddPhoto} />
                    </>
                  )}
                  {items.length > 0 && (
                    <span className="font-mono text-sm tabular-nums text-(color:--ink)" aria-label={t("entry.photoCount", { count: items.length, max: picker.max })}>
                      {items.length}/{picker.max}
                    </span>
                  )}
                  {photoBusy && <span className="font-mono text-sm text-(color:--ink)">{t("entry.processing")}</span>}
                  {/* Скрытые поля выбора файлов для галереи */}
                  {picker.inputs}
                </div>

                {items.length > 0 && (
                  <ul className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-1 pt-2 md:-mx-10 md:px-10" aria-label={t("entry.attached")}>
                    {items.map((item, i) => {
                      const ref = item.kind !== "new" ? refById.get(item.ref.id) : undefined;
                      const alt = t("entry.photoN", { index: i + 1, total: items.length });
                      return (
                        <li key={item.ref.id} className="relative shrink-0">
                          <div className="size-20 overflow-hidden rounded-xl [&>*]:h-full [&>*]:w-full" style={{ backgroundColor: BG_RAISED }}>
                            {ref ? <FeedPhoto store={photoStore} photo={ref} alt={alt} fit="square" /> : <NewThumb item={item} alt={alt} />}
                          </div>
                          {/* Обычный крестик в углу миниатюры */}
                          <button
                            type="button"
                            aria-label={t("entry.removePhoto", { index: i + 1 })}
                            disabled={saving}
                            onClick={() => removePhoto(item.ref.id)}
                            className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-black/70 text-lg leading-none text-white active:scale-90 disabled:opacity-40"
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-2xl bg-danger/10 p-3 text-lg text-danger">
                {error}
              </p>
            )}

            {existing && confirmDelete && (
              <div role="group" aria-label={t("entry.confirmAria")} className="rounded-2xl p-4" style={{ backgroundColor: BG_RAISED }}>
                <p className="mb-3 text-xl text-(color:--ink-soft)">{t("entry.confirmDelete", { date: formatDayShort(date, lang) })}</p>
                <div className="flex gap-2">
                  <Button variant="danger" onClick={remove}>
                    {t("common.delete")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setConfirmDelete(false);
                      textRef.current?.focus();
                    }}
                  >
                    {t("entry.keep")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Цветок и настроение: показываются только перед сохранением */}
        {step === "mood" && (
          <div
            className="absolute inset-0 z-10 flex flex-col justify-end bg-black/50 md:overflow-hidden md:rounded-3xl"
            onClick={(e) => {
              if (e.target === e.currentTarget) setStep("write");
            }}
          >
            <div
              role="group"
              aria-labelledby={sheetTitleId}
              className="rounded-t-3xl px-6 pt-3 shadow-sheet sm:rounded-b-lg md:px-10"
              style={{ backgroundColor: BG_RAISED, paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
            >
              <div className="mx-auto h-1 w-10 rounded-full bg-(--ink)/40" aria-hidden="true" />
              <p id={sheetTitleId} className="mx-auto mt-5 max-w-[16rem] text-center text-2xl leading-8 text-(color:--ink-soft)">
                {t("entry.moodTitle")}
              </p>
              <div className="grid h-60 place-items-center">
                <MoodFlower mood={form.mood} shapeId={shapeId} className="h-48 w-auto" />
              </div>
              <div className="flex flex-col items-center [&_[role=radio]]:size-14 [&_[role=radio]>span]:size-7 [&_[role=radiogroup]]:ml-0">
                <MoodPicker value={form.mood} onChange={(mood) => setForm((f) => ({ ...f, mood }))} />
              </div>
              <div className="mt-6 flex justify-center">
                <SketchDoneButton ref={sheetDoneRef} disabled={saving}>
                  {t("entry.done")}
                </SketchDoneButton>
              </div>
            </div>
          </div>
        )}
      </form>

      {/* Камера поверх редактора. Внутри dialog, а не в портале на body: окно открыто через showModal (top layer),
          и всё, что лежит вне него, оказалось бы под ним. Вне <form>, чтобы кнопки камеры не отправляли форму. */}
      {cameraOpen && (
        <div className="fixed inset-0 z-20" style={{ backgroundColor: BG }}>
          <CustomCamera
            onCapture={(file) => {
              void picker.addFiles([file]);
            }}
            onClose={() => setCameraOpen(false)}
          />
        </div>
      )}
    </dialog>
  );
}
