// Связка «запись + фото»: порядок записи в два хранилища и откат при ошибке.
//
// Фото из окна записи живут в памяти (PhotoItem kind "new"), пока человек не нажмёт «Сохранить».
// Поэтому отмена не оставляет мусора в IndexedDB, а при ошибке остаётся только откатить то,
// что успели записать за это сохранение.

import type { CompressedPhoto } from "./image.ts";
import { newPhotoId, photoCreatedAt, type PhotoStore } from "./photos.ts";
import type { Repo, SaveInput } from "./repo.ts";
import { photosOf, type Entry, type PhotoRef } from "./types.ts";

export type PhotoItem =
  | { kind: "saved"; ref: PhotoRef }
  | { kind: "new"; ref: PhotoRef; blob: Blob };

type NewItem = Extract<PhotoItem, { kind: "new" }>;

/** Фото уже сохранённой записи как список для окна записи. */
export function itemsOf(entry: Entry | null): PhotoItem[] {
  return photosOf(entry).map((ref) => ({ kind: "saved", ref }));
}

export function sameItems(a: readonly PhotoItem[], b: readonly PhotoItem[]): boolean {
  return a.length === b.length && a.every((x, i) => x.ref.id === b[i]?.ref.id);
}

/** Новое, ещё не сохранённое фото из результата сжатия. */
export function newPhotoItem(c: CompressedPhoto, nowMs: number = Date.now()): PhotoItem {
  const ref: PhotoRef = { id: newPhotoId(nowMs), width: c.width, height: c.height, bytes: c.blob.size, mime: c.mime };
  return { kind: "new", ref, blob: c.blob };
}

export interface SaveWithPhotosInput extends Omit<SaveInput, "photos"> {
  items: readonly PhotoItem[];
}

/**
 * 1. Новые файлы пишутся в IndexedDB.
 * 2. Запись с ссылками пишется в LocalStorage (repo.saveEntry).
 * 3. Файлы, которые убрали из записи, удаляются.
 * Если шаг 1 или 2 не удался, записанные на шаге 1 файлы удаляются, ошибка выбрасывается дальше.
 */
export async function saveEntryWithPhotos(repo: Repo, store: PhotoStore, input: SaveWithPhotosInput): Promise<Entry> {
  const fresh = input.items.filter((i): i is NewItem => i.kind === "new");
  const prev = repo.getEntry(input.date);
  const written: string[] = [];
  try {
    for (const item of fresh) {
      await store.put({
        id: item.ref.id,
        blob: item.blob,
        mime: item.ref.mime,
        width: item.ref.width,
        height: item.ref.height,
        createdAt: photoCreatedAt(item.ref.id) ?? Date.now(),
      });
      written.push(item.ref.id);
    }
    const entry = repo.saveEntry({
      date: input.date,
      body: input.body,
      mood: input.mood,
      photos: input.items.map((i) => i.ref),
    });
    const keep = new Set(photosOf(entry).map((p) => p.id));
    const dropped = photosOf(prev)
      .map((p) => p.id)
      .filter((id) => !keep.has(id));
    // Не удалось удалить: не страшно, файл подберёт уборка при запуске (PhotoStore.sweep).
    if (dropped.length > 0) void store.delete(dropped).catch(() => undefined);
    return entry;
  } catch (e) {
    if (written.length > 0) await store.delete(written).catch(() => undefined);
    throw e;
  }
}
