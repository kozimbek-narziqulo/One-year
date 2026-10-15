// Хранилище записей на LocalStorage. Все экраны ходят только сюда.
//
// Фото сюда не попадают: в записи лежат только ссылки на них (Entry.photos), а сжатые файлы лежат
// в IndexedDB (photos.ts). Тексты остаются синхронными и атомарными, как раньше.
//
// Раскладка ключей:
//   garden:v1:entries      все записи одним JSON-объектом { "2026-10-11": Entry, ... }
//   garden:v1:settings     настройки внешнего вида
//   garden:v1:meta         служебное: когда была последняя копия и сколько изменений после неё
//   garden:v1:draft:<дата> черновик окна записи
//
// Записи лежат одним ключом: сохранение атомарно (записалось всё или ничего), экспорт и импорт
// тривиальны. 365 записей по несколько килобайт укладываются в лимит localStorage (около 5 МБ)
// с большим запасом.

import { isQuotaError, type StorageLike } from "./storage.ts";
import { compareKeys, isValidKey, todayKey, type DateKey } from "./date.ts";
import {
  DEFAULT_META,
  DEFAULT_SETTINGS,
  GardenError,
  isShapeId,
  LIMITS,
  photosOf,
  sanitizePhotoRefs,
  type Entry,
  type Meta,
  type Mood,
  type PhotoRef,
  type Settings,
} from "./types.ts";

export const KEYS = {
  entries: "garden:v1:entries",
  settings: "garden:v1:settings",
  meta: "garden:v1:meta",
  draft: (d: DateKey) => `garden:v1:draft:${d}`,
  rescue: (ts: number) => `garden:v1:rescue:${ts}`,
};

export type EntryMap = Readonly<Record<DateKey, Entry>>;

export interface GardenState {
  entries: EntryMap;
  settings: Settings;
  meta: Meta;
  /** false: записи живут только в памяти этой вкладки. */
  persistent: boolean;
  /** Часть сохранённых данных не удалось прочитать; сырой текст отложен в rescue-ключ. */
  loadProblem: boolean;
}

export interface Draft {
  body: string;
  mood: Mood | null;
  updatedAt: number;
}

export interface SaveInput {
  date: DateKey;
  body: string;
  mood: Mood | null;
  /** Не передано: фото записи остаются как были. Пустой список: фото убраны. */
  photos?: readonly PhotoRef[];
  /** Не передано: остаётся прежний рисунок записи (у новой записи его просто нет). */
  shapeId?: number;
}

export const isMood = (v: unknown): v is Mood => v === 1 || v === 2 || v === 3 || v === 4 || v === 5;

/** Приводит неизвестный объект к Entry или возвращает null. Используется и при загрузке, и при импорте. */
export function sanitizeEntry(raw: unknown, fallbackTime: number): Entry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isValidKey(r.date)) return null;
  if (typeof r.body !== "string") return null;
  const mood = r.mood === null || r.mood === undefined ? null : isMood(r.mood) ? r.mood : undefined;
  if (mood === undefined) return null;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
  const createdAt = num(r.createdAt, fallbackTime);
  const updatedAt = num(r.updatedAt, createdAt);
  const photos = sanitizePhotoRefs(r.photos);
  const entry: Entry = { date: r.date, body: r.body, mood, createdAt, updatedAt };
  // Без этого shapeId терялся бы при каждой загрузке, восстановлении и импорте: здесь пересобирается весь объект.
  return {
    ...entry,
    ...(photos.length > 0 ? { photos } : {}),
    ...(isShapeId(r.shapeId) ? { shapeId: r.shapeId } : {}),
  };
}

function sanitizeSettings(raw: unknown): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return s;
  const r = raw as Record<string, unknown>;
  if (r.moodPalette === "default" || r.moodPalette === "cvd") s.moodPalette = r.moodPalette;
  if (r.plantPalette === "default" || r.plantPalette === "autumn" || r.plantPalette === "ink") s.plantPalette = r.plantPalette;
  return s;
}

export const settingsFrom = sanitizeSettings;

function sanitizeMeta(raw: unknown): Meta {
  const m: Meta = { ...DEFAULT_META };
  if (!raw || typeof raw !== "object") return m;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  m.lastBackupAt = n(r.lastBackupAt);
  m.firstChangeAt = n(r.firstChangeAt);
  m.nudgeSnoozedUntil = n(r.nudgeSnoozedUntil);
  const c = n(r.changesSinceBackup);
  m.changesSinceBackup = c !== null && c >= 0 ? Math.floor(c) : 0;
  return m;
}

function writeOrThrow(storage: StorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch (e) {
    if (isQuotaError(e)) {
      throw new GardenError("quota", "На телефоне кончилось место.");
    }
    throw new GardenError("unavailable", "Не удалось записать в хранилище браузера.");
  }
}

export interface RepoOptions {
  now?: () => Date;
  persistent?: boolean;
}

export function createRepo(storage: StorageLike, options: RepoOptions = {}) {
  const now = options.now ?? (() => new Date());
  const persistent = options.persistent ?? true;
  const listeners = new Set<() => void>();
  let state: GardenState = load();

  function load(): GardenState {
    let loadProblem = false;
    const entries: Record<DateKey, Entry> = {};
    const rawEntries = safeGet(KEYS.entries);
    if (rawEntries) {
      try {
        const parsed: unknown = JSON.parse(rawEntries);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          const e = sanitizeEntry(v, now().getTime());
          if (e && e.date === k) entries[k] = e;
          else loadProblem = true;
        }
      } catch {
        loadProblem = true;
      }
      if (loadProblem) {
        // Ничего не перезаписываем молча: сырой текст остаётся рядом, его можно достать вручную.
        try {
          storage.setItem(KEYS.rescue(now().getTime()), rawEntries);
        } catch {
          /* нет места даже для копии: ничего не делаем */
        }
      }
    }
    return {
      entries,
      settings: sanitizeSettings(parseJson(safeGet(KEYS.settings))),
      meta: sanitizeMeta(parseJson(safeGet(KEYS.meta))),
      persistent,
      loadProblem,
    };
  }

  function safeGet(key: string): string | null {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  function parseJson(text: string | null): unknown {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function emit() {
    listeners.forEach((l) => l());
  }

  /** Служебные данные: если не записались, это не повод ронять сохранение записи. */
  function writeMetaBestEffort(meta: Meta) {
    state = { ...state, meta };
    try {
      storage.setItem(KEYS.meta, JSON.stringify(meta));
    } catch {
      /* ignore */
    }
  }

  function bumpMeta(changes: number) {
    const t = now().getTime();
    writeMetaBestEffort({
      ...state.meta,
      changesSinceBackup: state.meta.changesSinceBackup + changes,
      firstChangeAt: state.meta.firstChangeAt ?? t,
    });
  }

  /** Записывает новую карту записей. Сначала в хранилище, потом в состояние: при ошибке состояние не меняется. */
  function commitEntries(next: Record<DateKey, Entry>, changes: number) {
    writeOrThrow(storage, KEYS.entries, JSON.stringify(next));
    state = { ...state, entries: next, loadProblem: state.loadProblem };
    if (changes > 0) bumpMeta(changes);
    emit();
  }

  return {
    getState: (): GardenState => state,

    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },

    /** Перечитать хранилище (другая вкладка изменила данные). */
    reload() {
      state = load();
      emit();
    },

    getEntry: (date: DateKey): Entry | null => state.entries[date] ?? null,

    /** Записи по возрастанию даты. */
    listEntries(): Entry[] {
      return Object.values(state.entries).sort((a, b) => compareKeys(a.date, b.date));
    },

    saveEntry(input: SaveInput): Entry {
      if (!isValidKey(input.date)) throw new GardenError("invalid", "Некорректная дата.");
      if (compareKeys(input.date, todayKey(now())) > 0) throw new GardenError("future", "Завтра ещё не наступило.");
      if (input.mood !== null && !isMood(input.mood)) throw new GardenError("invalid", "Некорректное настроение.");
      const body = input.body.replace(/\r\n?/g, "\n").trimEnd();
      const prev = state.entries[input.date];
      let photos: PhotoRef[];
      if (input.photos === undefined) {
        photos = [...photosOf(prev)];
      } else {
        if (input.photos.length > LIMITS.maxPhotosPerEntry) {
          throw new GardenError("invalid", `Не больше ${LIMITS.maxPhotosPerEntry} фото на запись.`);
        }
        photos = sanitizePhotoRefs(input.photos);
        if (photos.length !== input.photos.length) throw new GardenError("invalid", "Некорректные фото.");
      }
      if (body.trim() === "" && input.mood === null && photos.length === 0) {
        throw new GardenError("empty", "Добавьте текст, фото или выберите настроение.");
      }
      if (input.shapeId !== undefined && !isShapeId(input.shapeId)) {
        throw new GardenError("invalid", "Некорректный рисунок растения.");
      }
      // Новый shapeId побеждает, иначе остаётся старый: правка записи не меняет её растение.
      const shapeId = input.shapeId ?? prev?.shapeId;
      const t = now().getTime();
      const entry: Entry = {
        date: input.date,
        body,
        mood: input.mood,
        createdAt: prev?.createdAt ?? t,
        updatedAt: t,
        ...(photos.length > 0 ? { photos } : {}),
        ...(shapeId !== undefined ? { shapeId } : {}),
      };
      commitEntries({ ...state.entries, [input.date]: entry }, 1);
      try {
        storage.removeItem(KEYS.draft(input.date));
      } catch {
        /* ignore */
      }
      return entry;
    },

    /** Возвращает удалённую запись, чтобы показать «Вернуть». */
    deleteEntry(date: DateKey): Entry | null {
      const prev = state.entries[date];
      if (!prev) return null;
      const next = { ...state.entries };
      delete next[date];
      commitEntries(next, 1);
      return prev;
    },

    /** Вернуть удалённую запись как была (с прежними createdAt/updatedAt). */
    restoreEntry(entry: Entry): void {
      const clean = sanitizeEntry(entry, now().getTime());
      if (!clean) throw new GardenError("invalid", "Некорректная запись.");
      commitEntries({ ...state.entries, [clean.date]: clean }, 1);
    },

    /** Подменить все записи (импорт). changes: сколько записей добавлено/изменено/удалено. */
    setAllEntries(next: Record<DateKey, Entry>, changes: number): void {
      commitEntries({ ...next }, changes);
    },

    updateSettings(patch: Partial<Settings>): Settings {
      const next = sanitizeSettings({ ...state.settings, ...patch });
      writeOrThrow(storage, KEYS.settings, JSON.stringify(next));
      state = { ...state, settings: next };
      emit();
      return next;
    },

    markBackedUp(): void {
      writeMetaBestEffort({ ...state.meta, lastBackupAt: now().getTime(), changesSinceBackup: 0, nudgeSnoozedUntil: null });
      emit();
    },

    snoozeBackupNudge(): void {
      const until = now().getTime() + LIMITS.backupSnoozeDays * 86_400_000;
      writeMetaBestEffort({ ...state.meta, nudgeSnoozedUntil: until });
      emit();
    },

    // Черновики: их нельзя терять, но и ронять из-за них ничего нельзя.
    getDraft(date: DateKey): Draft | null {
      const raw = parseJson(safeGet(KEYS.draft(date)));
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      if (typeof r.body !== "string") return null;
      const mood = r.mood === null || r.mood === undefined ? null : isMood(r.mood) ? r.mood : null;
      return { body: r.body, mood, updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0 };
    },
    saveDraft(date: DateKey, draft: { body: string; mood: Mood | null }): boolean {
      try {
        storage.setItem(KEYS.draft(date), JSON.stringify({ ...draft, updatedAt: now().getTime() }));
        return true;
      } catch {
        return false;
      }
    },
    clearDraft(date: DateKey): void {
      try {
        storage.removeItem(KEYS.draft(date));
      } catch {
        /* ignore */
      }
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;

/** Пора ли напомнить про копию файлом. */
export function shouldNudgeBackup(state: GardenState, nowMs: number): boolean {
  const { meta, entries } = state;
  if (Object.keys(entries).length === 0) return false;
  if (meta.nudgeSnoozedUntil !== null && nowMs < meta.nudgeSnoozedUntil) return false;
  if (meta.changesSinceBackup >= LIMITS.backupNudgeAfterChanges) return true;
  const dayMs = 86_400_000;
  if (meta.lastBackupAt !== null) {
    return meta.changesSinceBackup > 0 && nowMs - meta.lastBackupAt > LIMITS.backupNudgeAfterDays * dayMs;
  }
  return meta.firstChangeAt !== null && nowMs - meta.firstChangeAt > LIMITS.backupNudgeAfterDays * dayMs;
}
