"use client";

import { useMemo, useState } from "react";
import { compareKeys, formatLong, formatShort, yearOf, type DateKey } from "../lib/date.ts";
import type { PhotoStore } from "../lib/photos.ts";
import type { EntryMap } from "../lib/repo.ts";
import { LIMITS, MOOD_VALUES, photosOf, type Entry } from "../lib/types.ts";
import { FeedPhoto } from "./FeedPhoto.tsx";
import { Button } from "./ui.tsx";

export interface MemoryFeedProps {
  entries: EntryMap;
  store: PhotoStore;
  onOpen: (date: DateKey) => void;
}

function EntryPhotos({ entry, store }: { entry: Entry; store: PhotoStore }) {
  const photos = photosOf(entry);
  const n = photos.length;
  if (n === 0) return null;
  const alt = (i: number) => `Фото к записи за ${formatShort(entry.date)}, ${i + 1} из ${n}`;
  if (n === 1) {
    return (
      <div className="mt-3">
        <FeedPhoto store={store} photo={photos[0] as (typeof photos)[number]} alt={alt(0)} fit="natural" />
      </div>
    );
  }
  // Две колонки; при нечётном числе первое фото занимает обе, чтобы не оставалось дыры.
  const wideFirst = n % 2 === 1;
  return (
    <ul className="mt-3 grid grid-cols-2 gap-1">
      {photos.map((p, i) => (
        <li key={p.id} className={wideFirst && i === 0 ? "col-span-2" : undefined}>
          <FeedPhoto store={store} photo={p} alt={alt(i)} fit={wideFirst && i === 0 ? "wide" : "square"} />
        </li>
      ))}
    </ul>
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
      <ol className="space-y-4">
        {shown.map((entry, i) => {
          const year = yearOf(entry.date);
          const newYear = i === 0 || yearOf((shown[i - 1] as Entry).date) !== year;
          return (
            <li key={entry.date}>
              {newYear && <h2 className="mb-2 mt-2 text-lg tabular-nums text-text-muted">{year}</h2>}
              <article className="rounded-md border border-border bg-surface p-4">
                <header className="flex items-baseline justify-between gap-2">
                  <h3 className="text-base first-letter:uppercase text-text">{formatLong(entry.date)}</h3>
                  <button
                    type="button"
                    onClick={() => onOpen(entry.date)}
                    aria-label={`Изменить запись за ${formatShort(entry.date)}`}
                    className="min-h-(--layout-tapMin) rounded-sm px-1 text-sm text-accent underline"
                  >
                    Изменить
                  </button>
                </header>
                {entry.mood !== null && (
                  <p className="text-sm text-text-muted">
                    Настроение: {entry.mood} из {MOOD_VALUES.length}
                  </p>
                )}
                {entry.body !== "" && <p className="mt-2 whitespace-pre-wrap break-words font-entry text-entry text-text">{entry.body}</p>}
                <EntryPhotos entry={entry} store={store} />
              </article>
            </li>
          );
        })}
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
