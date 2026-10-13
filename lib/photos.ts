// Хранилище сжатых фото в IndexedDB.
//
// Тексты, настроение и ссылки на фото (PhotoRef) лежат в LocalStorage (repo.ts). Сами файлы лежат
// здесь: LocalStorage хранит только строки и вмещает около 5 МБ.
//
// Раскладка: база "garden-photos", версия 1, одно хранилище "photos", ключ id.

import { isQuotaError } from "./storage.ts";
import { GardenError, LIMITS, type Entry, type PhotoRef } from "./types.ts";

const DB_NAME = "garden-photos";
const STORE = "photos";

export interface PhotoRecord {
  id: string;
  blob: Blob;
  mime: PhotoRef["mime"];
  width: number;
  height: number;
  createdAt: number;
}

export interface PhotoStore {
  /** false: в этом браузере нет IndexedDB. Тексты работают, фото добавить нельзя. */
  readonly available: boolean;
  put(rec: PhotoRecord): Promise<void>;
  get(id: string): Promise<PhotoRecord | null>;
  delete(ids: readonly string[]): Promise<void>;
  listIds(): Promise<string[]>;
  /**
   * Удаляет файлы, на которые не ссылается ни одна запись и которые старше LIMITS.photoOrphanMinAgeMs.
   * Возраст берётся из id, поэтому файлы не читаются. Возвращает, сколько удалено.
   */
  sweep(referenced: ReadonlySet<string>, nowMs?: number): Promise<number>;
  close(): void;
}

function defaultRandom(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

/** id вида p_<время в base36>_<16 hex>. Время в id нужно для уборки (см. sweep). */
export function newPhotoId(nowMs: number = Date.now(), random: (n: number) => Uint8Array = defaultRandom): string {
  const hex = Array.from(random(8), (b) => b.toString(16).padStart(2, "0")).join("");
  return `p_${nowMs.toString(36)}_${hex}`;
}

/** Время создания из id или null, если id не наш. */
export function photoCreatedAt(id: string): number | null {
  const m = /^p_([0-9a-z]{6,12})_[0-9a-f]{8,32}$/.exec(id);
  if (!m) return null;
  const t = parseInt(m[1] as string, 36);
  return Number.isFinite(t) ? t : null;
}

export function referencedPhotoIds(entries: Iterable<Entry>): Set<string> {
  const ids = new Set<string>();
  for (const e of entries) for (const p of e.photos ?? []) ids.add(p.id);
  return ids;
}

export function mapPhotoError(e: unknown): GardenError {
  if (e instanceof GardenError) return e;
  if (isQuotaError(e)) return new GardenError("quota", "На телефоне кончилось место.");
  return new GardenError("unavailable", "Не удалось обратиться к хранилищу фото в браузере.");
}

export function createPhotoStore(factory: IDBFactory | undefined, dbName: string = DB_NAME): PhotoStore {
  let conn: Promise<IDBDatabase> | null = null;

  function connect(): Promise<IDBDatabase> {
    if (!factory) return Promise.reject(new GardenError("unavailable", "В этом браузере нельзя сохранять фото."));
    if (conn) return conn;
    const attempt = new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        req = factory.open(dbName, 1);
      } catch (e) {
        reject(mapPhotoError(e));
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => {
        const db = req.result;
        // Другая вкладка обновляет базу или браузер закрыл соединение: в следующий раз откроем заново.
        db.onversionchange = () => {
          db.close();
          conn = null;
        };
        db.onclose = () => {
          conn = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(mapPhotoError(req.error));
    });
    conn = attempt;
    attempt.catch(() => {
      if (conn === attempt) conn = null;
    });
    return attempt;
  }

  async function read<T>(work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await connect();
    return new Promise<T>((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, "readonly");
        const req = work(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(mapPhotoError(req.error));
        tx.onabort = () => reject(mapPhotoError(tx.error));
      } catch (e) {
        reject(mapPhotoError(e));
      }
    });
  }

  /** Резолвится, когда транзакция завершена, а не когда запрос принят: так запись точно дошла до диска. */
  async function write(work: (s: IDBObjectStore) => void): Promise<void> {
    const db = await connect();
    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        work(tx.objectStore(STORE));
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(mapPhotoError(tx.error));
      } catch (e) {
        reject(mapPhotoError(e));
      }
    });
  }

  const store: PhotoStore = {
    available: factory !== undefined,

    put: (rec) => write((s) => void s.put(rec)),

    async get(id) {
      const rec = await read<PhotoRecord | undefined>((s) => s.get(id));
      return rec ?? null;
    },

    async delete(ids) {
      if (ids.length === 0) return;
      await write((s) => {
        for (const id of ids) s.delete(id);
      });
    },

    async listIds() {
      const keys = await read((s) => s.getAllKeys());
      return keys.filter((k): k is string => typeof k === "string");
    },

    async sweep(referenced, nowMs = Date.now()) {
      const ids = await store.listIds();
      const orphans = ids.filter((id) => {
        if (referenced.has(id)) return false;
        const created = photoCreatedAt(id);
        // Чужой или непонятный id не трогаем.
        return created !== null && nowMs - created > LIMITS.photoOrphanMinAgeMs;
      });
      await store.delete(orphans);
      return orphans.length;
    },

    close() {
      const c = conn;
      conn = null;
      c?.then((db) => db.close()).catch(() => undefined);
    },
  };
  return store;
}
