"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { newPhotoItem, type PhotoItem } from "../lib/entryPhotos.ts";
import { compressImage } from "../lib/image.ts";
import type { PhotoStore } from "../lib/photos.ts";
import { GardenError, LIMITS } from "../lib/types.ts";

type Update = (prev: readonly PhotoItem[]) => readonly PhotoItem[];

/* ───────────── Выбор файлов: логика та же, что была в PhotoStrip, но кнопки живут в нижней панели ───────────── */

export interface PhotoPickerOptions {
  items: readonly PhotoItem[];
  /** Функция-обновление, а не готовый список: сжатие асинхронное, и список за это время мог измениться. */
  onChange: (update: Update) => void;
  onError: (message: string | null) => void;
}

export interface PhotoPicker {
  /** Сколько фото сейчас сжимается. */
  busy: number;
  /** Сколько ещё можно добавить. */
  room: number;
  max: number;
  openGallery: () => void;
  /**
   * Добавляет готовые файлы тем же путём, что и выбор из галереи: лимит в 5 фото, сжатие по одному, счётчик busy.
   * Через него снимок из CustomCamera попадает в состояние редактора.
   */
  addFiles: (files: File[]) => Promise<void>;
  /** Скрытый <input type="file"> для галереи: вставьте один раз в разметку. */
  inputs: ReactNode;
}

/**
 * Типы для выбора из галереи. Без атрибута capture: так браузер предлагает медиатеку, а не камеру.
 * Внимание: в iOS наличие image/heic в списке отключает автоматическое превращение HEIC в JPEG, и файл приходит как есть.
 */
const GALLERY_ACCEPT = "image/jpeg, image/png, image/heic, image/webp";

export function usePhotoPicker({ items, onChange, onError }: PhotoPickerOptions): PhotoPicker {
  const galleryRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const [busy, setBusy] = useState(0);
  const max = LIMITS.maxPhotosPerEntry;
  const room = max - items.length - busy;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // чтобы тот же файл можно было выбрать ещё раз
    void addFiles(files);
  }

  async function addFiles(files: File[]) {
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

  const inputs = <input ref={galleryRef} type="file" accept={GALLERY_ACCEPT} multiple className="hidden" onChange={onPick} tabIndex={-1} aria-hidden="true" />;

  return {
    busy,
    room,
    max,
    openGallery: () => galleryRef.current?.click(),
    addFiles,
    inputs,
  };
}

/* ───────────── Показ фото: по центру, мягкие углы, без рамок ───────────── */

function PhotoThumb({ store, item, alt, className }: { store: PhotoStore; item: PhotoItem; alt: string; className: string }) {
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
    <div className={`grid place-items-center overflow-hidden rounded-lg bg-surface ${className}`}>
      {url ? (
        <img src={url} alt={alt} draggable={false} className="size-full object-cover" />
      ) : (
        <span className="px-1 text-center text-xs text-text-muted">{missing ? "Нет файла" : ""}</span>
      )}
    </div>
  );
}

export interface PhotoGalleryProps {
  store: PhotoStore;
  items: readonly PhotoItem[];
  /** Сколько фото ещё обрабатывается: для них рисуем заглушки. */
  busy: number;
  disabled?: boolean;
  onRemove: (id: string) => void;
}

export function PhotoGallery({ store, items, busy, disabled, onRemove }: PhotoGalleryProps) {
  const total = items.length + busy;
  if (total === 0) return null;
  const single = total === 1;
  const size = single ? "aspect-[4/5] w-56 max-w-full" : "size-32";

  return (
    <ul className="flex flex-wrap justify-center gap-3">
      {items.map((item, i) => (
        <li key={item.ref.id} className="relative">
          <PhotoThumb store={store} item={item} alt={`Фото ${i + 1} из ${items.length}`} className={size} />
          <button
            type="button"
            disabled={disabled}
            aria-label={`Убрать фото ${i + 1}`}
            onClick={() => onRemove(item.ref.id)}
            className="absolute right-1 top-1 grid size-10 place-items-center rounded-full text-white disabled:opacity-40"
          >
            <span className="grid size-7 place-items-center rounded-full bg-black/55">
              <X size={16} aria-hidden="true" />
            </span>
          </button>
        </li>
      ))}
      {Array.from({ length: busy }, (_, i) => (
        <li key={`busy-${i}`} aria-hidden="true">
          <div className={`grid place-items-center rounded-lg bg-surface text-text-muted ${size}`}>…</div>
        </li>
      ))}
    </ul>
  );
}
