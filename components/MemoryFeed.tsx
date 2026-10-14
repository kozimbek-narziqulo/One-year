"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { compareKeys, formatShort, type DateKey } from "../lib/date.ts";
import { itemsOf, saveEntryWithPhotos } from "../lib/entryPhotos.ts";
import type { PhotoStore } from "../lib/photos.ts";
import type { EntryMap, Repo } from "../lib/repo.ts";
import { GardenError, LIMITS, photosOf, type Entry } from "../lib/types.ts";
import { FeedPhoto } from "./FeedPhoto.tsx";
import { PhotoLightbox } from "./PhotoLightbox.tsx";
import { PhotoStack, type StackPhoto } from "./PhotoStack.tsx";
import { resolveShapeId } from "./SketchUI.tsx";
import { Button } from "./ui.tsx";

export interface MemoryFeedProps {
  entries: EntryMap;
  repo: Repo;
  store: PhotoStore;
  onOpen: (date: DateKey) => void;
}

/** Сколько надо держать палец на фото, чтобы появилось «Удалить». */
const LONG_PRESS_MS = 500;
/** Если палец сдвинулся дальше этого, это прокрутка или свайп, а не долгое нажатие. */
const MOVE_TOLERANCE_PX = 10;

function photoErrorText(e: unknown): string {
  if (e instanceof GardenError) {
    if (e.code === "quota") return "Не удалось сохранить изменения: на телефоне кончилось место.";
    if (e.code === "unavailable") return "Не удалось записать изменения в хранилище браузера.";
    return e.message;
  }
  return "Не удалось удалить фото.";
}

/** Гасит касания и клики, чтобы они не доходили до записи (редактор) и до экрана (свайп «Сегодня» / «Сад»). */
const stop = {
  onClick: (e: React.SyntheticEvent) => e.stopPropagation(),
  onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
};

/**
 * Обёртка одной фотографии с долгим нажатием.
 * Тап проходит выше и открывает лайтбокс. Удержание ~500 мс показывает поверх фото кнопку «Удалить».
 * Клик, которым закончилось удержание, гасится здесь, чтобы лайтбокс не открылся следом.
 */
function LongPressPhoto({
  armed,
  disabled,
  onArm,
  onDisarm,
  onDelete,
  children,
}: {
  armed: boolean;
  disabled: boolean;
  onArm: () => void;
  onDisarm: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  /** Удержание сработало: ближайший click нужно проглотить. */
  const fired = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const clear = () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
    start.current = null;
  };

  const begin = (x: number, y: number) => {
    if (disabled || armed) return;
    fired.current = false;
    start.current = { x, y };
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      fired.current = true;
      if ("vibrate" in navigator) navigator.vibrate?.(15);
      onArm();
    }, LONG_PRESS_MS);
  };

  const move = (x: number, y: number) => {
    const s = start.current;
    if (!s) return;
    if (Math.abs(x - s.x) > MOVE_TOLERANCE_PX || Math.abs(y - s.y) > MOVE_TOLERANCE_PX) clear();
  };

  useEffect(() => clear, []);

  // Пока кнопка «Удалить» показана, любое касание вне фото её прячет.
  useEffect(() => {
    if (!armed) return;
    const onDown = (e: Event) => {
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) return;
      onDisarm();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [armed, onDisarm]);

  return (
    <div
      ref={rootRef}
      className="relative size-full select-none [-webkit-touch-callout:none]"
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t) begin(t.clientX, t.clientY);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        if (t) move(t.clientX, t.clientY);
      }}
      onTouchEnd={clear}
      onTouchCancel={clear}
      // Мышь на компьютере: то же удержание. Касания сюда не попадают, у них свои обработчики выше.
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button === 0) begin(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.pointerType === "mouse") move(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (e.pointerType === "mouse") clear();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") clear();
      }}
      // iPhone показывает меню «Сохранить фото» при удержании: отключаем.
      onContextMenu={(e) => e.preventDefault()}
      // Захват клика: если удерживали или кнопка «Удалить» уже показана, лайтбокс не открываем.
      onClickCapture={(e) => {
        if (fired.current) {
          fired.current = false;
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        if (armed) {
          // Тап по самому фото при открытой кнопке просто прячет её.
          const onButton = e.target instanceof Element && e.target.closest("[data-delete-photo]");
          if (!onButton) {
            e.stopPropagation();
            e.preventDefault();
            onDisarm();
          }
        }
      }}
    >
      <div className={armed ? "size-full opacity-50 transition-opacity duration-(--duration-fast)" : "size-full transition-opacity duration-(--duration-fast)"}>{children}</div>
      {armed && (
        <button
          type="button"
          data-delete-photo
          aria-label="Удалить фото"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete();
          }}
          className="absolute left-1/2 top-1/2 flex min-h-(--layout-tapMin) -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-black/80 px-5 text-lg text-white active:scale-95"
        >
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true" focusable={false}>
            <path d="M5 5.2c3.3 3.2 6.6 6.3 10 9.6M14.8 5c-3.2 3.4-6.4 6.7-9.6 10" />
          </svg>
          Удалить
        </button>
      )}
    </div>
  );
}

/**
 * Фото записи в ленте: стопка 3:4, только просмотр.
 * Тап открывает полноэкранный просмотр, долгое нажатие показывает «Удалить».
 * Кнопок добавления и постоянных крестиков здесь нет: добавлять фото можно в редакторе.
 */
function EntryPhotos({ entry, repo, store }: { entry: Entry; repo: Repo; store: PhotoStore }) {
  const photos = useMemo(() => photosOf(entry), [entry]);
  const refById = useMemo(() => new Map(photos.map((p) => [p.id, p] as const)), [photos]);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = photos.length;
  const stack = useMemo<StackPhoto[]>(
    () => photos.map((p, i) => ({ id: p.id, alt: `Фото к записи за ${formatShort(entry.date)}${n > 1 ? `, ${i + 1} из ${n}` : ""}` })),
    [photos, entry.date, n],
  );
  const lightboxPhoto = lightboxId ? stack.find((p) => p.id === lightboxId) : undefined;

  // Если выделенное фото исчезло (удалили или запись обновилась), кнопку прячем.
  useEffect(() => {
    if (armedId && !refById.has(armedId)) setArmedId(null);
  }, [armedId, refById]);

  async function removePhoto(id: string) {
    if (saving) return;
    setSaving(true);
    setError(null);
    setArmedId(null);
    try {
      // Берём свежую запись из хранилища и переписываем её без этой фотографии.
      const latest = repo.getEntry(entry.date) ?? entry;
      await saveEntryWithPhotos(repo, store, {
        date: entry.date,
        body: latest.body,
        mood: latest.mood,
        shapeId: resolveShapeId(latest.shapeId, entry.date),
        items: itemsOf(latest).filter((item) => item.ref.id !== id),
      });
    } catch (e) {
      setError(photoErrorText(e));
    } finally {
      setSaving(false);
    }
  }

  if (n === 0) return null;

  return (
    <>
      <PhotoStack
        className="mt-3"
        photos={stack}
        onPhotoOpen={setLightboxId}
        renderPhoto={(photo) => {
          const ref = refById.get(photo.id);
          if (!ref) return null;
          return (
            <LongPressPhoto
              armed={armedId === photo.id}
              disabled={saving}
              onArm={() => setArmedId(photo.id)}
              onDisarm={() => setArmedId((cur) => (cur === photo.id ? null : cur))}
              onDelete={() => void removePhoto(photo.id)}
            >
              <FeedPhoto store={store} photo={ref} alt={photo.alt ?? ""} fit="square" />
            </LongPressPhoto>
          );
        }}
      />

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger" {...stop}>
          {error}
        </p>
      )}

      {lightboxPhoto && (
        <div className="contents" {...stop}>
          <PhotoLightbox store={store} photoId={lightboxPhoto.id} alt={lightboxPhoto.alt ?? ""} onClose={() => setLightboxId(null)} />
        </div>
      )}

      <p role="status" className="sr-only">
        {saving ? "Удаляю фото…" : ""}
      </p>
    </>
  );
}

export function MemoryFeed({ entries, repo, store, onOpen }: MemoryFeedProps) {
  const [limit, setLimit] = useState<number>(LIMITS.feedPageSize);
  const list = useMemo(() => Object.values(entries).sort((a, b) => compareKeys(b.date, a.date)), [entries]);

  if (list.length === 0) {
    return <p className="p-4 text-base">В ленте пока пусто. Записи появятся здесь.</p>;
  }

  const shown = list.slice(0, limit);
  return (
    <div>
      <ol className="space-y-10">
        {shown.map((entry) => (
          <li key={entry.date}>
            {/* Запись лежит прямо на фоне приложения: только текст и фото, без рамок, подложек и выделений. */}
            <article className="[-webkit-tap-highlight-color:transparent]">
              {entry.body !== "" ? (
                // Тап по тексту открывает редактор.
                <p
                  onClick={() => {
                    // Если человек выделял текст, это не касание «открыть».
                    if (window.getSelection()?.toString()) return;
                    onOpen(entry.date);
                  }}
                  className="cursor-text whitespace-pre-wrap break-words font-entry text-entry text-text transition-opacity duration-(--duration-fast) active:opacity-80"
                >
                  {entry.body}
                </p>
              ) : (
                <button type="button" onClick={() => onOpen(entry.date)} className="font-entry text-entry text-text-muted">
                  Написать пару слов…
                </button>
              )}
              {/* Невидимая кнопка только для клавиатуры и скринридера */}
              <button type="button" className="sr-only" onClick={() => onOpen(entry.date)}>
                {`Изменить запись за ${formatShort(entry.date)}`}
              </button>
              <EntryPhotos entry={entry} repo={repo} store={store} />
            </article>
          </li>
        ))}
      </ol>
      {list.length > shown.length && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => setLimit((l) => l + LIMITS.feedPageSize)}>
            Показать ещё
          </Button>
          <span className="text-sm tabular-nums text-text-muted">
            Показано {shown.length} из {list.length}
          </span>
        </div>
      )}
    </div>
  );
}
