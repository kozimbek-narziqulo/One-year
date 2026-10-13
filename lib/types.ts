import type { DateKey } from "./date.ts";

export type Mood = 1 | 2 | 3 | 4 | 5;
export const MOOD_VALUES: readonly Mood[] = [1, 2, 3, 4, 5];

/**
 * Ссылка на фото. Сам сжатый файл лежит в IndexedDB (photos.ts), а здесь только то, что нужно,
 * чтобы нарисовать место под фото до его загрузки.
 */
export interface PhotoRef {
  /** Ключ файла в IndexedDB. В id зашито время создания: по нему photos.ts чистит осиротевшие файлы. */
  id: string;
  width: number;
  height: number;
  /** Размер сжатого файла, байт. */
  bytes: number;
  mime: "image/webp" | "image/jpeg";
}

export interface Entry {
  date: DateKey; // первичный ключ: одна запись в день
  body: string;
  mood: Mood | null;
  createdAt: number; // мс с 1970
  updatedAt: number;
  /** Нет поля = нет фото: записи без фото хранятся ровно так же, как до появления фото. */
  photos?: PhotoRef[];
  /** Номер рисунка растения для этой записи. Нет поля = рисунок ещё не назначен (старые записи). Однажды назначенный не меняется. */
  shapeId?: number;
}

/** Что саду нужно знать о растении дня: рисунок и настроение (цвет). */
export interface PlantInfo {
  /** Нет значения = рисунок не назначен: выбирайте запасной. */
  shapeId?: number;
  mood: Mood | null;
}

/** Верхняя граница shapeId при чтении из хранилища и импорта: отсекает мусор, а не задаёт число рисунков. */
export const MAX_SHAPE_ID = 10_000;

/** Допустимый shapeId: целое число от 0 до MAX_SHAPE_ID. */
export const isShapeId = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_SHAPE_ID;

export type ThemeSetting = "system" | "light" | "dark";
export type MoodPalette = "default" | "cvd";
export type PlantPalette = "default" | "autumn" | "ink";
export type Density = "comfortable" | "compact";

export interface Settings {
  theme: ThemeSetting;
  moodPalette: MoodPalette;
  plantPalette: PlantPalette;
  density: Density;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  moodPalette: "default",
  plantPalette: "default",
  density: "comfortable",
};

export interface Meta {
  lastBackupAt: number | null;
  /** Сколько раз менялись записи после последней копии. */
  changesSinceBackup: number;
  /** Когда появилась первая запись или изменение: от этого считаем «давно не было копии». */
  firstChangeAt: number | null;
  /** Баннер про копию скрыт до этой отметки (мс). */
  nudgeSnoozedUntil: number | null;
}

export const DEFAULT_META: Meta = {
  lastBackupAt: null,
  changesSinceBackup: 0,
  firstChangeAt: null,
  nudgeSnoozedUntil: null,
};

export const LIMITS = {
  backupNudgeAfterChanges: 14,
  backupNudgeAfterDays: 30,
  backupSnoozeDays: 7,
  undoDeleteMs: 10_000,
  draftSaveDebounceMs: 400,
  importMaxBytes: 10 * 1024 * 1024,
  importMaxEntries: 20_000,
  /** Весь ZIP-архив копии. Больше телефон не соберёт и не прочитает без нехватки памяти. */
  backupMaxBytes: 1024 * 1024 * 1024,
  /** Один файл фото в архиве. Наши сжатые фото в разы меньше, запас на чужие архивы. */
  backupPhotoMaxBytes: 10 * 1024 * 1024,
  maxPhotosPerEntry: 5,
  /** Исходный файл больше этого не берём: его разбор может не поместиться в память телефона. */
  photoInputMaxBytes: 40 * 1024 * 1024,
  /** Во сколько байт стараемся уложить одно сжатое фото. */
  photoTargetBytes: 300 * 1024,
  /** Файл без записи удаляется не раньше, чем через столько: запас на отмену удаления и на гонку между вкладками. */
  photoOrphanMinAgeMs: 7 * 86_400_000,
  feedPageSize: 30,
} as const;

const NO_PHOTOS: readonly PhotoRef[] = Object.freeze([]);

/** Фото записи; для старых записей без поля это пустой список. */
export const photosOf = (e: Pick<Entry, "photos"> | null | undefined): readonly PhotoRef[] => e?.photos ?? NO_PHOTOS;

const PHOTO_ID = /^p_[0-9a-z]{6,12}_[0-9a-f]{8,32}$/;

/** Приводит неизвестное значение к списку PhotoRef: лишнее и битое отбрасывает, не больше maxPhotosPerEntry. */
export function sanitizePhotoRefs(raw: unknown): PhotoRef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: PhotoRef[] = [];
  for (const item of raw) {
    if (out.length >= LIMITS.maxPhotosPerEntry) break;
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = r.id;
    const width = r.width;
    const height = r.height;
    const mime = r.mime;
    if (typeof id !== "string" || !PHOTO_ID.test(id) || seen.has(id)) continue;
    const dim = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 20_000;
    if (!dim(width) || !dim(height)) continue;
    if (mime !== "image/webp" && mime !== "image/jpeg") continue;
    const bytes = typeof r.bytes === "number" && Number.isFinite(r.bytes) && r.bytes >= 0 ? Math.floor(r.bytes) : 0;
    seen.add(id);
    out.push({ id, width, height, bytes, mime });
  }
  return out;
}

export interface BackupFile {
  app: string;
  /** 1: только тексты (.json). 2: лежит в ZIP вместе с photos/<id>.webp|jpg. */
  version: 1 | 2;
  exportedAt: string; // ISO
  /** В версии 2 у записей есть photos: ссылки на файлы архива. В версии 1 фото нет. */
  entries: Entry[];
  settings?: Partial<Settings>;
}

export type ErrorCode = "future" | "empty" | "invalid" | "quota" | "unavailable";

export class GardenError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "GardenError";
    this.code = code;
  }
}
