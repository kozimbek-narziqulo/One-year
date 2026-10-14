"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { compareKeys, formatShort, type DateKey } from "../lib/date.ts";
import { itemsOf, saveEntryWithPhotos, type PhotoItem } from "../lib/entryPhotos.ts";
import type { PhotoStore } from "../lib/photos.ts";
import type { EntryMap, Repo } from "../lib/repo.ts";
import { GardenError, LIMITS, photosOf, type Entry } from "../lib/types.ts";
import { CustomCamera } from "./CustomCamera.tsx";
import { FeedPhoto } from "./FeedPhoto.tsx";
import { PhotoLightbox } from "./PhotoLightbox.tsx";
import { PhotoStack, type StackPhoto } from "./PhotoStack.tsx";
import { usePhotoPicker } from "./PhotoStrip.tsx";
import { SketchDefs, SketchIconButton, resolveShapeId } from "./SketchUI.tsx";
import { Button } from "./ui.tsx";

const APP_BG = "#02001a";

export interface MemoryFeedProps {
  entries: EntryMap;
  repo: Repo;
  store: PhotoStore;
  onOpen: (date: DateKey) => void;
}

function photoErrorText(e: unknown): string {
  if (e instanceof GardenError) {
    if (e.code === "quota") return "Не удалось сохранить фото: на телефоне кончилось место.";
    if (e.code === "unavailable") return "Не удалось записать фото в хранилище браузера.";
    return e.message;
  }
  return "Не удалось сохранить фото.";
}

/** Гасит касания и клики, чтобы они не доходили до записи (редактор) и до экрана (свайп «Сегодня» / «Сад»). */
const stop = {
  onClick: (e: React.SyntheticEvent) => e.stopPropagation(),
  onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
};

/**
 * Фото записи прямо в ленте: стопка 3:4 и кнопки «галерея» / «камера».
 * Каждое изменение (добавили, удалили) сразу сохраняется в запись, без редактора.
 */
function EntryPhotos({ entry, repo, store }: { entry: Entry; repo: Repo; store: PhotoStore }) {
  const saved = useMemo(() => itemsOf(entry), [entry]);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const refById = useMemo(() => new Map(photosOf(entry).map((p) => [p.id, p] as const)), [entry]);

  /** Изменения, которые ещё не записаны. null: показываем то, что уже лежит в записи. */
  const [pending, setPending] = useState<readonly PhotoItem[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const items = pending ?? saved;

  const picker = usePhotoPicker({
    items,
    onChange: (update) => {
      setError(null);
      setPending((p) => update(p ?? savedRef.current));
    },
    onError: setError,
  });

  // Как только фото обработаны, сохраняем запись целиком. Пока идёт сохранение, новые изменения ждут.
  useEffect(() => {
    if (pending === null || saving || picker.busy > 0) return;
    setSaving(true);
    const latest = repo.getEntry(entry.date) ?? entry;
    saveEntryWithPhotos(repo, store, {
      date: entry.date,
      body: latest.body,
      mood: latest.mood,
      shapeId: resolveShapeId(latest.shapeId, entry.date),
      items: pending,
    })
      .then(
        () => setPending(null),
        (e: unknown) => {
          setError(photoErrorText(e));
          setPending(null);
        },
      )
      .finally(() => setSaving(false));
  }, [pending, saving, picker.busy, repo, store, entry]);

  // В стопке только уже сохранённые фото: новые появятся сразу после записи (это доли секунды).
  const visible = useMemo(() => items.filter((p) => p.kind !== "new" && refById.has(p.ref.id)), [items, refById]);
  const n = visible.length;
  const stack = useMemo<StackPhoto[]>(
    () => visible.map((p, i) => ({ id: p.ref.id, alt: `Фото к записи за ${formatShort(entry.date)}${n > 1 ? `, ${i + 1} из ${n}` : ""}` })),
    [visible, entry.date, n],
  );

  const busy = saving || picker.busy > 0;
  const canAdd = store.available && !busy && picker.room > 0;
  const lightboxPhoto = lightboxId ? stack.find((p) => p.id === lightboxId) : undefined;

  function removePhoto(id: string) {
    if (busy) return;
    if (lightboxId === id) setLightboxId(null);
    setError(null);
    setPending((p) => (p ?? savedRef.current).filter((item) => item.ref.id !== id));
  }

  return (
    <>
      {/* Кнопки добавления фото под текстом. Касание здесь не открывает редактор. */}
      {store.available && (
        <div className="mt-3 flex items-center gap-3" {...stop}>
          <SketchDefs />
          {picker.room > 0 && (
            <>
              <SketchIconButton icon="gallery" label="Добавить фото из галереи" onClick={picker.openGallery} disabled={!canAdd} />
              <SketchIconButton icon="camera" label="Сделать фото" onClick={() => setCameraOpen(true)} disabled={!canAdd} />
            </>
          )}
          {n > 0 && (
            <span className="font-mono text-sm tabular-nums text-[#6c67d6]" aria-label={`Фото: ${n} из ${picker.max}`}>
              {n}/{picker.max}
            </span>
          )}
          {busy && <span className="font-mono text-sm text-[#6c67d6]">сохраняю…</span>}
          {/* Скрытые поля выбора файлов. Внутри обёртки со stopPropagation: их click не дойдёт до записи. */}
          {picker.inputs}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger" {...stop}>
          {error}
        </p>
      )}

      {n > 0 && (
        <PhotoStack
          className="mt-1"
          photos={stack}
          onPhotoOpen={setLightboxId}
          onPhotoRemove={busy ? undefined : removePhoto}
          renderPhoto={(photo) => {
            const ref = refById.get(photo.id);
            return ref ? <FeedPhoto store={store} photo={ref} alt={photo.alt ?? ""} fit="square" /> : null;
          }}
        />
      )}

      {lightboxPhoto && (
        <div className="contents" {...stop}>
          <PhotoLightbox store={store} photoId={lightboxPhoto.id} alt={lightboxPhoto.alt ?? ""} onClose={() => setLightboxId(null)} />
        </div>
      )}

      {/* Камера поверх всего экрана. Через портал: экраны «Сегодня» / «Сад» сдвигаются transform-ом,
          и fixed внутри них считался бы от сдвинутого блока, а не от экрана. */}
      {cameraOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100]" style={{ backgroundColor: APP_BG }} {...stop}>
            <CustomCamera
              onCapture={(file) => {
                void picker.addFiles([file]);
              }}
              onClose={() => setCameraOpen(false)}
            />
          </div>,
          document.body,
        )}

      <p role="status" className="sr-only">
        {busy ? "Сохраняю фото…" : ""}
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
                // Тап по тексту открывает чистый редактор текста.
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
                {`Изменить текст записи за ${formatShort(entry.date)}`}
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
