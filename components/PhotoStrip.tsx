"use client";

import { useEffect, useId, useRef, useState } from "react";
import { newPhotoItem, type PhotoItem } from "../lib/entryPhotos.ts";
import { compressImage } from "../lib/image.ts";
import type { PhotoStore } from "../lib/photos.ts";
import { GardenError, LIMITS } from "../lib/types.ts";
import { Button } from "./ui.tsx";

export interface PhotoStripProps {
  store: PhotoStore;
  items: readonly PhotoItem[];
  /** Функция-обновление, а не готовый список: сжатие асинхронное, и список за это время мог измениться. */
  onChange: (update: (prev: readonly PhotoItem[]) => readonly PhotoItem[]) => void;
  onError: (message: string | null) => void;
  disabled?: boolean;
}

function PhotoThumb({ store, item, alt }: { store: PhotoStore; item: PhotoItem; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    setMissing(false);
    setUrl(null);
    if (item.kind === "new") {
      made = URL.createObjectURL(item.blob);
      setUrl(made);
    } else {
      store
        .get(item.ref.id)
        .then((rec) => {
          if (cancelled) return;
          if (!rec) {
            setMissing(true);
            return;
          }
          made = URL.createObjectURL(rec.blob);
          setUrl(made);
        })
        .catch(() => {
          if (!cancelled) setMissing(true);
        });
    }
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [store, item]);

  return (
    <div className="grid size-20 place-items-center overflow-hidden rounded-sm border border-border bg-surface">
      {url ? (
        <img src={url} alt={alt} draggable={false} className="size-full object-cover" />
      ) : (
        <span className="px-1 text-center text-xs text-text-muted">{missing ? "Нет файла" : ""}</span>
      )}
    </div>
  );
}

export function PhotoStrip({ store, items, onChange, onError, disabled }: PhotoStripProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const labelId = useId();
  const [busy, setBusy] = useState(0);
  const max = LIMITS.maxPhotosPerEntry;
  const room = max - items.length - busy;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // чтобы тот же файл можно было выбрать ещё раз
    if (files.length === 0) return;
    onError(null);
    const take = files.slice(0, Math.max(0, room));
    if (take.length < files.length) onError(`Можно добавить не больше ${max} фото на запись.`);
    setBusy((b) => b + take.length);
    let failure: string | null = null;
    // По одному: большие фото разбираются в памяти, и несколько сразу могут не поместиться на телефоне.
    for (const file of take) {
      try {
        if (!alive.current) break;
        const item = newPhotoItem(await compressImage(file));
        onChange((prev) => (prev.length >= max ? prev : [...prev, item]));
      } catch (err) {
        failure ??= err instanceof GardenError ? err.message : "Не удалось добавить фото.";
      } finally {
        setBusy((b) => b - 1);
      }
    }
    if (failure && alive.current) onError(failure);
  }

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span id={labelId} className="text-sm text-text-muted">
          Фото
        </span>
        <span className="text-sm tabular-nums text-text-muted">
          {items.length} из {max}
        </span>
      </div>

      {(items.length > 0 || busy > 0) && (
        <ul aria-labelledby={labelId} className="mb-2 flex flex-wrap gap-x-2">
          {items.map((item, i) => (
            <li key={item.ref.id} className="w-20">
              <PhotoThumb store={store} item={item} alt={`Фото ${i + 1} из ${items.length}`} />
              <button
                type="button"
                disabled={disabled}
                aria-label={`Убрать фото ${i + 1}`}
                onClick={() => onChange((prev) => prev.filter((p) => p.ref.id !== item.ref.id))}
                className="min-h-(--layout-tapMin) w-full rounded-sm text-sm text-danger underline"
              >
                Убрать
              </button>
            </li>
          ))}
          {Array.from({ length: busy }, (_, i) => (
            <li key={`busy-${i}`} aria-hidden="true" className="w-20">
              <div className="grid size-20 place-items-center rounded-sm border border-dashed border-border text-xs text-text-muted">…</div>
            </li>
          ))}
        </ul>
      )}

      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} tabIndex={-1} aria-hidden="true" />
      <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={disabled || !store.available || room <= 0}>
        Добавить фото
      </Button>
      <p role="status" className="sr-only">
        {busy > 0 ? "Обрабатываю фото…" : ""}
      </p>
      {store.available ? (
        <p className="mt-1 text-sm text-text-muted">Фото хранятся только на этом устройстве. Они входят в ZIP-копию: сохраните её в разделе «Копия и настройки».</p>
      ) : (
        <p className="mt-1 text-sm text-text-muted">В этом браузере нельзя сохранять фото. Тексты работают как обычно.</p>
      )}
    </div>
  );
}
