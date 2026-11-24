// Резервная копия дневника. Это единственная защита от потери телефона или очистки данных
// браузера, поэтому разбор файла строгий, а замена записей требует явного выбора.
//
// Формат копии: ZIP-архив.
//   backup.json            записи, настройки; у записей photos — ссылки на файлы ниже (version 2)
//   photos/<id>.webp|jpg   сжатые фото как есть, без перекодирования
//   README.txt             пояснение для человека, при загрузке игнорируется
//
// Старые копии (.json, version 1, только тексты) по-прежнему загружаются.
// Порядок при загрузке: сначала фото в IndexedDB, потом записи в LocalStorage; при ошибке
// записанные фото удаляются, записи остаются как были.
//
// Ошибки: BackupError несёт только код (см. backupError.ts). Текст для человека
// получают через errorText(t, e) из i18n.ts.

import { BackupError } from "./backupError.ts";
import { BACKUP_APP_ID, BACKUP_PREFIX } from "./brand.ts";
import { compareKeys, todayKey, type DateKey } from "./date.ts";
import { referencedPhotoIds, type PhotoStore } from "./photos.ts";
import { sanitizeEntry, settingsFrom, type Repo } from "./repo.ts";
import { GardenError, LIMITS, photosOf, type BackupFile, type Entry, type PhotoRef, type Settings } from "./types.ts";
import { createZip, looksLikeZip, openZip, ZipError, type ZipArchive, type ZipEntry, type ZipInput } from "./zip.ts";

// Остальной код импортирует BackupError отсюда, поэтому реэкспортируем.
export { BackupError };
export type { BackupErrorCode } from "./backupError.ts";

export const BACKUP_JSON_NAME = "backup.json";

const README = `Копия дневника-сада.

backup.json — записи и настройки (обычный текст JSON).
photos/ — фото записей, обычные файлы WebP или JPEG: их можно открыть и просто посмотреть.

Чтобы вернуть всё в приложение, откройте «Копия и настройки» → «Выбрать файл копии» и выберите этот архив целиком.
Не распаковывайте его: приложение читает ZIP само.
`;

const extOf = (mime: PhotoRef["mime"]) => (mime === "image/webp" ? "webp" : "jpg");

/** Путь файла фото внутри архива. */
export const photoFileName = (ref: Pick<PhotoRef, "id" | "mime">) => `photos/${ref.id}.${extOf(ref.mime)}`;

export function backupFilename(now: Date = new Date(), ext: "zip" | "json" = "zip"): string {
  return `${BACKUP_PREFIX}-${todayKey(now)}.${ext}`;
}

// ---------- экспорт ----------

export interface ZipBackup {
  blob: Blob;
  entries: number;
  /** Сколько фото лежит в архиве. */
  photos: number;
  /** Сколько фото записей не нашлось в браузере: в копию они не попали. */
  photosMissing: number;
}

/**
 * Собирает ZIP со всеми записями и фото. Фото, которых нет в хранилище, из записей убираются
 * (в копии не должно быть ссылок в никуда), их число возвращается, чтобы сказать об этом человеку.
 */
export async function buildBackupZip(
  repo: Repo,
  store: PhotoStore,
  opts: { now?: Date; onProgress?: (done: number, total: number) => void } = {},
): Promise<ZipBackup> {
  const now = opts.now ?? new Date();
  const entries = repo.listEntries();
  const refs = new Map<string, PhotoRef>();
  for (const e of entries) for (const r of photosOf(e)) refs.set(r.id, r);

  const found = new Map<string, { ref: PhotoRef; blob: Blob }>();
  let missing = 0;
  let totalBytes = 0;
  let done = 0;
  for (const ref of refs.values()) {
    opts.onProgress?.(done++, refs.size);
    const rec = store.available ? await store.get(ref.id).catch(() => null) : null;
    if (!rec) {
      missing++;
      continue;
    }
    totalBytes += rec.blob.size;
    if (totalBytes > LIMITS.backupMaxBytes) throw new BackupError("tooManyPhotos");
    found.set(ref.id, {
      ref: { id: ref.id, width: rec.width, height: rec.height, bytes: rec.blob.size, mime: rec.mime },
      blob: rec.blob,
    });
  }

  const outEntries: Entry[] = [];
  for (const e of entries) {
    const kept = photosOf(e).flatMap((r) => {
      const f = found.get(r.id);
      return f ? [f.ref] : [];
    });
    const { photos: _drop, ...rest } = e;
    // Запись была только из фото, и ни одного не нашлось: пустой день в копию не кладём.
    if (kept.length === 0 && photosOf(e).length > 0 && rest.body.trim() === "" && rest.mood === null) continue;
    outEntries.push(kept.length > 0 ? { ...rest, photos: kept } : rest);
  }

  const file: BackupFile = {
    app: BACKUP_APP_ID,
    version: 2,
    exportedAt: now.toISOString(),
    entries: outEntries,
    settings: { ...repo.getState().settings },
  };
  const inputs: ZipInput[] = [
    { name: BACKUP_JSON_NAME, data: JSON.stringify(file, null, 2) },
    { name: "README.txt", data: README },
    ...[...found.values()].map((f): ZipInput => ({ name: photoFileName(f.ref), data: f.blob })),
  ];
  try {
    const blob = await createZip(inputs, { now });
    return { blob, entries: outEntries.length, photos: found.size, photosMissing: missing };
  } catch (e) {
    if (e instanceof ZipError) throw new BackupError("zipFailed", e.message);
    throw e;
  }
}

/** Только тексты, как в первой версии (version 1): без фото, ссылок на фото в файле нет. */
export function buildBackup(repo: Repo, now: Date = new Date()): BackupFile {
  const state = repo.getState();
  return {
    app: BACKUP_APP_ID,
    version: 1,
    exportedAt: now.toISOString(),
    entries: repo.listEntries().map((e) => {
      const { photos: _drop, ...rest } = e;
      return rest;
    }),
    settings: { ...state.settings },
  };
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 2);
}

// ---------- разбор ----------

/** Достаёт файл фото из копии. Бросает ошибку, если файл повреждён или это не то изображение. */
export interface PhotoSource {
  read(ref: PhotoRef): Promise<Blob>;
}

export interface ParsedBackup {
  entries: Entry[];
  settings: Partial<Settings> | null;
  exportedAt: string | null;
  /** Сколько записей из файла пропущено как некорректные. */
  skipped: number;
  /** Из них записей с датой из будущего: такую клетку нельзя открыть, поэтому в сад они не попадают. */
  skippedFuture: number;
  /** zip: архив с фото; json: только тексты (старая копия или backup.json из архива). */
  format: "zip" | "json";
  /** Сколько разных фото в копии есть и нужны записям. */
  photoCount: number;
  /** Сколько фото записи упоминают, а в файле их нет: из записей они убраны. */
  photosMissing: number;
  photoSource: PhotoSource | null;
}

type PhotoPresence = (ref: PhotoRef) => boolean;

function parseBackupData(text: string, nowMs: number, hasPhoto: PhotoPresence): Omit<ParsedBackup, "format" | "photoSource"> {
  if (text.length > LIMITS.importMaxBytes) throw new BackupError("fileTooLarge");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("notJson");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new BackupError("unexpected");
  const d = data as Record<string, unknown>;
  if (d.app !== BACKUP_APP_ID) throw new BackupError("otherApp");
  if (typeof d.version !== "number" || !Number.isInteger(d.version)) throw new BackupError("noVersion");
  if (d.version > 2) throw new BackupError("newerVersion");
  if (!Array.isArray(d.entries)) throw new BackupError("noEntries");
  if (d.entries.length > LIMITS.importMaxEntries) throw new BackupError("tooManyEntries");

  const byDate = new Map<DateKey, Entry>();
  const today = todayKey(new Date(nowMs));
  let skipped = 0;
  let skippedFuture = 0;
  for (const raw of d.entries) {
    const e = sanitizeEntry(raw, nowMs);
    if (!e) {
      skipped++;
      continue;
    }
    // A text-only legacy backup cannot restore a photo-only entry; do not import it as an empty day.
    if (photosOf(e).length === 0 && e.body.trim() === "" && e.mood === null) {
      skipped++;
      continue;
    }
    if (compareKeys(e.date, today) > 0) {
      skipped++;
      skippedFuture++;
      continue;
    }
    const dup = byDate.get(e.date);
    // Одна запись в день: при повторе в файле остаётся более свежая.
    if (!dup || e.updatedAt >= dup.updatedAt) byDate.set(e.date, e);
  }
  if (byDate.size === 0 && d.entries.length > 0) throw new BackupError("allInvalid");

  // Ссылки на фото, которых в файле нет, убираем: после загрузки в записях не должно быть ссылок в никуда.
  const entries: Entry[] = [];
  const present = new Set<string>();
  const absent = new Set<string>();
  for (const e of byDate.values()) {
    const all = photosOf(e);
    if (all.length === 0) {
      entries.push(e);
      continue;
    }
    const kept = all.filter((r) => {
      const ok = hasPhoto(r);
      (ok ? present : absent).add(r.id);
      return ok;
    });
    const { photos: _drop, ...rest } = e;
    const clean: Entry = kept.length > 0 ? { ...rest, photos: kept } : rest;
    if (kept.length === 0 && clean.body.trim() === "" && clean.mood === null) {
      skipped++; // запись была только из фото, а фото в файле нет
      continue;
    }
    entries.push(clean);
  }

  const settings = d.settings && typeof d.settings === "object" ? (settingsFrom(d.settings) as Partial<Settings>) : null;
  return {
    entries,
    settings,
    exportedAt: typeof d.exportedAt === "string" ? d.exportedAt : null,
    skipped,
    skippedFuture,
    photoCount: present.size,
    photosMissing: absent.size,
  };
}

/**
 * Разбор текстового файла копии (.json). Фото в таком файле нет: ссылки на них убираются.
 * Бросает BackupError с кодом.
 */
export function parseBackup(text: string, nowMs: number = Date.now()): ParsedBackup {
  return { ...parseBackupData(text, nowMs, () => false), format: "json", photoSource: null };
}

/** Любую ошибку чтения приводим к BackupError. Текст ZipError уходит в detail (для консоли), человеку показывается код zipFailed. */
const asBackupError = (e: unknown): BackupError =>
  e instanceof BackupError ? e : e instanceof ZipError ? new BackupError("zipFailed", e.message) : new BackupError("readFailed");

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const depthOf = (path: string) => path.split("/").length;
const PHOTO_FILE = /^(p_[0-9a-z]{6,12}_[0-9a-f]{8,32})\.(webp|jpe?g)$/i;

/** Совпадает ли начало файла с заявленным форматом. */
function matchesMime(b: Uint8Array, mime: PhotoRef["mime"]): boolean {
  if (mime === "image/jpeg") return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const tag = (o: number, s: string) => s.split("").every((c, i) => b[o + i] === c.charCodeAt(0));
  return b.length > 12 && tag(0, "RIFF") && tag(8, "WEBP");
}

function photoSourceOf(zip: ZipArchive, index: ReadonlyMap<string, ZipEntry>): PhotoSource {
  return {
    async read(ref) {
      const entry = index.get(ref.id);
      if (!entry) throw new BackupError("photoMissing");
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = await zip.read(entry, LIMITS.backupPhotoMaxBytes);
      } catch (e) {
        throw asBackupError(e);
      }
      if (!matchesMime(bytes, ref.mime)) throw new BackupError("photoCorrupt");
      return new Blob([bytes], { type: ref.mime });
    },
  };
}

async function parseZipBackup(file: Blob, nowMs: number): Promise<ParsedBackup> {
  if (file.size > LIMITS.backupMaxBytes) throw new BackupError("fileTooLarge");
  let zip: ZipArchive;
  try {
    zip = await openZip(file);
  } catch (e) {
    throw asBackupError(e);
  }
  // Папку внутри архива (если его перепаковали) и «мусор» macOS переживаем: ищем backup.json на любой глубине.
  const jsonEntry = zip.entries
    .filter((e) => baseName(e.name) === BACKUP_JSON_NAME && !e.name.startsWith("__MACOSX/"))
    .sort((a, b) => depthOf(a.name) - depthOf(b.name))[0];
  if (!jsonEntry) throw new BackupError("noBackupJson");

  let text: string;
  try {
    text = new TextDecoder("utf-8").decode(await zip.read(jsonEntry, LIMITS.importMaxBytes));
  } catch (e) {
    throw asBackupError(e);
  }

  const index = new Map<string, ZipEntry>();
  for (const e of zip.entries) {
    if (e.name.startsWith("__MACOSX/")) continue;
    const m = PHOTO_FILE.exec(baseName(e.name));
    if (!m || index.has(m[1] as string)) continue;
    if (e.uncompressedSize > LIMITS.backupPhotoMaxBytes) continue; // слишком большой файл считаем отсутствующим
    index.set(m[1] as string, e);
  }

  const parsed = parseBackupData(text, nowMs, (r) => index.has(r.id));
  return { ...parsed, format: "zip", photoSource: photoSourceOf(zip, index) };
}

/**
 * Разбор выбранного файла: ZIP-архив или старый .json. Формат определяется по содержимому,
 * а не по расширению. Бросает BackupError с кодом.
 */
export async function readBackupFile(file: Blob, nowMs: number = Date.now()): Promise<ParsedBackup> {
  if (await looksLikeZip(file)) return parseZipBackup(file, nowMs);
  if (file.size > LIMITS.importMaxBytes) throw new BackupError("fileTooLarge");
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new BackupError("readFailed");
  }
  return parseBackup(text, nowMs);
}

// ---------- план и применение ----------

export type ImportMode = "merge" | "replace";

export interface ImportPlan {
  result: Record<DateKey, Entry>;
  added: number;
  /** Записи из файла новее текущих: заменят их. */
  updated: number;
  /** Дата совпала, а в приложении запись новее: остаётся приложение. */
  keptCurrent: number;
  unchanged: number;
  /** Режим replace: сколько текущих записей исчезнет. */
  removed: number;
  /** Сколько фото появится в дневнике (которых там сейчас нет). */
  photosAdded: number;
  /** Сколько фото перестанут принадлежать какой-либо записи (режим replace или замена записи). */
  photosRemoved: number;
}

export interface PlanOptions {
  /**
   * Файл без фото (старая копия .json): у записей той же даты остаются текущие фото, а не пропадают.
   * В режиме replace фото записей, которых нет в файле, всё равно исчезают вместе с записями.
   */
  inheritPhotos?: boolean;
}

/**
 * merge: объединяем; при совпадении даты выигрывает более свежая правка (updatedAt).
 * replace: после импорта остаётся ровно то, что в файле.
 */
export function planImport(
  current: Readonly<Record<DateKey, Entry>>,
  incoming: Entry[],
  mode: ImportMode,
  opts: PlanOptions = {},
): ImportPlan {
  const result: Record<DateKey, Entry> = mode === "replace" ? {} : { ...current };
  let added = 0, updated = 0, keptCurrent = 0, unchanged = 0;
  const inc = new Map<DateKey, Entry>();
  for (const e of incoming) inc.set(e.date, e);

  for (const [date, e0] of inc) {
    const cur = current[date];
    const e = opts.inheritPhotos && cur && photosOf(cur).length > 0 ? { ...e0, photos: [...photosOf(cur)] } : e0;
    if (!cur) {
      added++;
      result[date] = e;
    } else if (sameContent(cur, e)) {
      unchanged++;
      result[date] = cur;
    } else if (e.updatedAt > cur.updatedAt || mode === "replace") {
      updated++;
      result[date] = e;
    } else {
      keptCurrent++;
      result[date] = cur;
    }
  }
  const removed = mode === "replace" ? Object.keys(current).filter((d) => !inc.has(d)).length : 0;
  const before = referencedPhotoIds(Object.values(current));
  const after = referencedPhotoIds(Object.values(result));
  let photosAdded = 0, photosRemoved = 0;
  for (const id of after) if (!before.has(id)) photosAdded++;
  for (const id of before) if (!after.has(id)) photosRemoved++;
  return { result, added, updated, keptCurrent, unchanged, removed, photosAdded, photosRemoved };
}

const samePhotoIds = (a: Entry, b: Entry) => {
  const x = photosOf(a);
  const y = photosOf(b);
  return x.length === y.length && x.every((p, i) => p.id === y[i]?.id);
};
const sameContent = (a: Entry, b: Entry) => a.body === b.body && a.mood === b.mood && samePhotoIds(a, b);

const planOptionsOf = (parsed: ParsedBackup): PlanOptions => ({ inheritPhotos: parsed.format === "json" });

/** Сначала записи, потом настройки: при нехватке места ничего не меняется наполовину. */
function commitPlan(repo: Repo, plan: ImportPlan, parsed: ParsedBackup, withSettings: boolean): void {
  const changes = plan.added + plan.updated + plan.removed;
  repo.setAllEntries(plan.result, changes);
  if (withSettings && parsed.settings) {
    try {
      repo.updateSettings(parsed.settings);
    } catch (e) {
      if (!(e instanceof GardenError)) throw e; // настройки не критичны; записи уже на месте
    }
  }
}

/**
 * Применяет копию без фото (старый .json). Для архива с фото нужен applyImportWithPhotos:
 * здесь фото записать некуда, и записи остались бы со ссылками в никуда.
 */
export function applyImport(repo: Repo, parsed: ParsedBackup, mode: ImportMode, withSettings: boolean): ImportPlan {
  if (parsed.photoCount > 0) throw new BackupError("photosRequired");
  const plan = planImport(repo.getState().entries, parsed.entries, mode, planOptionsOf(parsed));
  commitPlan(repo, plan, parsed, withSettings);
  return plan;
}

export interface ImportResult extends ImportPlan {
  photosWritten: number;
  /** Фото, которые не удалось прочитать из архива или записать (повреждены, нет хранилища): записи загружены без них. */
  photosFailed: number;
}

/**
 * Загрузка копии вместе с фото.
 * 1. Определяем, какие фото действительно нужны (только у записей, которые выиграли), пропуская те, что уже есть.
 * 2. Пишем их в IndexedDB. Не читается одно фото: пропускаем его и считаем. Кончилось место: откат и ошибка.
 * 3. Пишем записи. Не вышло: откат записанных фото, ошибка, записи остаются как были.
 * Фото старых записей, которые перестали быть нужны (режим replace), здесь не удаляются:
 * их подберёт уборка осиротевших файлов (PhotoStore.sweep) через несколько дней.
 */
export async function applyImportWithPhotos(
  repo: Repo,
  store: PhotoStore,
  parsed: ParsedBackup,
  mode: ImportMode,
  withSettings: boolean,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const opts = planOptionsOf(parsed);
  const current = repo.getState().entries;
  const source = parsed.photoSource;
  let plan = planImport(current, parsed.entries, mode, opts);
  if (!source || parsed.photoCount === 0) {
    commitPlan(repo, plan, parsed, withSettings);
    return { ...plan, photosWritten: 0, photosFailed: 0 };
  }

  const winners = new Set<Entry>(parsed.entries);
  const need = new Map<string, PhotoRef>();
  for (const e of Object.values(plan.result)) if (winners.has(e)) for (const r of photosOf(e)) need.set(r.id, r);

  const have = new Set<string>(store.available ? await store.listIds().catch(() => [] as string[]) : []);
  const todo = [...need.values()].filter((r) => !have.has(r.id));
  const written: string[] = [];
  const failed = new Set<string>();
  try {
    for (let i = 0; i < todo.length; i++) {
      const ref = todo[i] as PhotoRef;
      onProgress?.(i, todo.length);
      if (!store.available) {
        failed.add(ref.id);
        continue;
      }
      let blob: Blob;
      try {
        blob = await source.read(ref);
      } catch {
        failed.add(ref.id);
        continue;
      }
      await store.put({
        id: ref.id,
        blob,
        mime: ref.mime,
        width: ref.width,
        height: ref.height,
        createdAt: Date.now(),
      });
      written.push(ref.id);
    }
    onProgress?.(todo.length, todo.length);

    // Убираем из записей ссылки на фото, которых не будет в хранилище (не прочитались или не записаны).
    const available = new Set<string>([...have, ...written]);
    let changed = false;
    const cleaned: Entry[] = [];
    for (const e of parsed.entries) {
      const all = photosOf(e);
      const kept = all.filter((r) => available.has(r.id));
      if (kept.length === all.length) {
        cleaned.push(e);
        continue;
      }
      changed = true;
      const { photos: _drop, ...rest } = e;
      const clean: Entry = kept.length > 0 ? { ...rest, photos: kept } : rest;
      if (kept.length === 0 && clean.body.trim() === "" && clean.mood === null) continue; // была только из фото
      cleaned.push(clean);
    }
    if (changed) plan = planImport(current, cleaned, mode, opts);

    commitPlan(repo, plan, parsed, withSettings);
  } catch (e) {
    if (written.length > 0) await store.delete(written).catch(() => undefined);
    throw e;
  }
  // Записанные фото, которые после уточнения плана никому не нужны, убираем сразу (не ждём уборки).
  const used = referencedPhotoIds(Object.values(plan.result));
  const stray = written.filter((id) => !used.has(id));
  if (stray.length > 0) await store.delete(stray).catch(() => undefined);
  return { ...plan, photosWritten: written.length - stray.length, photosFailed: failed.size };
}
