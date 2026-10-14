"use client";

import { useMemo, useState } from "react";
import { compareKeys, formatShort, type DateKey } from "../lib/date.ts";
import type { PhotoStore } from "../lib/photos.ts";
import type { EntryMap } from "../lib/repo.ts";
import { LIMITS, photosOf, type Entry } from "../lib/types.ts";
import { FeedPhoto } from "./FeedPhoto.tsx";
import { PhotoStack, type StackPhoto } from "./PhotoStack.tsx";
import { Button } from "./ui.tsx";

export interface MemoryFeedProps {
  entries: EntryMap;
  store: PhotoStore;
  onOpen: (date: DateKey) => void;
}

function EntryPhotos({ entry, store }: { entry: Entry; store: PhotoStore }) {
  const photos = useMemo(() => photosOf(entry), [entry]);
  const n = photos.length;
  // Для стопки: id и подпись каждой фотографии. Саму картинку загружает FeedPhoto по ссылке из хранилища.
  const stack = useMemo<StackPhoto[]>(
    () => photos.map((p, i) => ({ id: p.id, alt: `Фото к записи за ${formatShort(entry.date)}, ${i + 1} из ${n}` })),
    [photos, entry.date, n],
  );
  const refById = useMemo(() => new Map(photos.map((p) => [p.id, p] as const)), [photos]);

  if (n === 0) return null;
  if (n === 1) {
    // Одно фото показываем целиком, без обрезки под рамку полароида.
    return (
      <div className="mt-3">
        <FeedPhoto store={store} photo={photos[0] as (typeof photos)[number]} alt={stack[0]?.alt ?? ""} fit="natural" />
      </div>
    );
  }
  // Несколько фото: стопка. Верхнее можно смахнуть, оно уйдёт в самый низ. Касание без смахивания
  // доходит до записи выше и открывает редактор.
  return (
    <PhotoStack
      className="mt-3"
      photos={stack}
      renderPhoto={(photo) => {
        const ref = refById.get(photo.id);
        return ref ? <FeedPhoto store={store} photo={ref} alt={photo.alt ?? ""} fit="square" /> : null;
      }}
    />
  );
}

export function MemoryFeed({ entries, store, onOpen }: MemoryFeedProps) {
  const [limit, setLimit] = useState<number>(LIMITS.feedPageSize);
  const list = useMemo(() => Object.values(entries).sort((a, b) => compareKeys(b.date, a.date)), [entries]);

  if (list.length === 0) {
    return <p className="rounded-md border border-border bg-surface p-4 text-base">В ленте пока пусто. Записи появятся здесь.</p>;
  }

  const shown = list.slice(0, limit);
  return (
    <div>
      <ol className="space-y-8">
        {shown.map((entry) => (
          <li key={entry.date}>
            {/* Запись лежит прямо на фоне приложения: только текст и фото, без даты, настроения, рамки и подложки.
                Вся область записи открывает редактор. */}
            <article
              onClick={() => {
                // Если человек выделял текст, это не касание «открыть».
                if (window.getSelection()?.toString()) return;
                onOpen(entry.date);
              }}
              className="cursor-pointer [-webkit-tap-highlight-color:transparent] transition-opacity duration-(--duration-fast) active:opacity-80"
            >
              {/* Невидимая кнопка только для клавиатуры и скринридера: на экране ничего не рисует */}
              <button type="button" className="sr-only">
                {`Изменить запись за ${formatShort(entry.date)}`}
              </button>
              {entry.body !== "" && <p className="whitespace-pre-wrap break-words font-entry text-entry text-text">{entry.body}</p>}
              <EntryPhotos entry={entry} store={store} />
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
