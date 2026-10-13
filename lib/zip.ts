// Минимальный ZIP без зависимостей: запись «без сжатия» и чтение (без сжатия и deflate).
//
// Зачем свой: фото уже сжаты в WebP/JPEG, повторное сжатие ничего не даёт, а библиотека весила бы
// больше, чем весь этот файл. Файл копии должен открываться любым архиватором телефона и компьютера.
//
// Что умеем: обычный ZIP (не ZIP64): до 65 535 файлов и до 4 ГБ. Лимиты копии ниже этих значений.
// Запись: файлы лежат в Blob-частях и в память целиком не читаются (кроме одного файла за раз для CRC).
// Чтение: берём только нужные файлы через Blob.slice, остальное не трогаем.

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

export const ZIP_MAX_ENTRIES = 65_000;

// ---------- CRC32 ----------

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array, seed = 0): number {
  let c = ~seed >>> 0;
  for (let i = 0; i < data.length; i++) c = (CRC_TABLE[(c ^ (data[i] as number)) & 0xff] as number) ^ (c >>> 8);
  return ~c >>> 0;
}

// ---------- запись ----------

export type ZipSource = string | Uint8Array<ArrayBuffer> | Blob;

export interface ZipInput {
  /** Путь внутри архива, через «/», только ASCII или UTF-8. */
  name: string;
  data: ZipSource;
}

const encoder = new TextEncoder();

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff,
    date: (((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff,
  };
}

const buf = (n: number): Uint8Array<ArrayBuffer> => new Uint8Array(new ArrayBuffer(n));

async function bytesOf(src: ZipSource): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof src === "string") return encoder.encode(src) as Uint8Array<ArrayBuffer>;
  if (src instanceof Uint8Array) return src;
  return new Uint8Array(await src.arrayBuffer());
}

/**
 * Собирает ZIP. onProgress(done, total) вызывается после каждого файла.
 * Файлы читаются по одному (для контрольной суммы) и сразу отпускаются: в памяти не копится всё сразу.
 */
export async function createZip(
  files: readonly ZipInput[],
  opts: { now?: Date; onProgress?: (done: number, total: number) => void } = {},
): Promise<Blob> {
  if (files.length > ZIP_MAX_ENTRIES) throw new ZipError("Слишком много файлов для одного архива.");
  const { time, date } = dosDateTime(opts.now ?? new Date());
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  const seen = new Set<string>();
  let offset = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i] as ZipInput;
    if (seen.has(f.name)) throw new ZipError(`Повторяющееся имя файла в архиве: ${f.name}`);
    seen.add(f.name);
    const name = encoder.encode(f.name);
    if (name.length === 0 || name.length > 0xffff) throw new ZipError("Недопустимое имя файла в архиве.");
    const bytes = await bytesOf(f.data);
    const size = bytes.length;
    if (size > 0xffffffff || offset > 0xfffffff0) throw new ZipError("Архив слишком большой.");
    const crc = crc32(bytes);

    const lh = buf(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // версия для распаковки
    lv.setUint16(6, 0x0800, true); // имена в UTF-8
    lv.setUint16(8, 0, true); // без сжатия
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    lh.set(name, 30);

    const ch = buf(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comment
    cv.setUint16(34, 0, true); // disk
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    central.push(ch);

    parts.push(lh);
    // Для Blob берём сам Blob (не копию): браузер не держит лишнего в памяти.
    parts.push(f.data instanceof Blob ? f.data : bytes);
    offset += lh.length + size;
    opts.onProgress?.(i + 1, files.length);
  }

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = buf(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, eocd], { type: "application/zip" });
}

// ---------- чтение ----------

export interface ZipEntry {
  name: string;
  method: number; // 0 — без сжатия, 8 — deflate
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  encrypted: boolean;
}

export interface ZipArchive {
  entries: ZipEntry[];
  /** Содержимое файла, проверенное по CRC32. maxBytes — потолок распакованного размера. */
  read(entry: ZipEntry, maxBytes: number): Promise<Uint8Array<ArrayBuffer>>;
}

const MAX_CENTRAL_BYTES = 16 * 1024 * 1024;

/** Первые байты похожи на ZIP (обычный или пустой архив). */
export async function looksLikeZip(blob: Blob): Promise<boolean> {
  if (blob.size < 4) return false;
  const h = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return h[0] === 0x50 && h[1] === 0x4b && ((h[2] === 3 && h[3] === 4) || (h[2] === 5 && h[3] === 6));
}

export async function openZip(blob: Blob): Promise<ZipArchive> {
  if (blob.size < 22) throw new ZipError("Это не ZIP-архив: файл слишком короткий.");
  const tailSize = Math.min(blob.size, 22 + 0xffff);
  const tailStart = blob.size - tailSize;
  const tail = new Uint8Array(await blob.slice(tailStart).arrayBuffer());
  const tv = new DataView(tail.buffer);

  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) !== 0x06054b50) continue;
    // Комментарий в конце должен ровно дойти до конца файла, иначе это случайное совпадение.
    if (i + 22 + tv.getUint16(i + 20, true) === tail.length) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError("Это не ZIP-архив или он повреждён: не найден конец файла.");

  const disk = tv.getUint16(eocd + 4, true);
  const cdDisk = tv.getUint16(eocd + 6, true);
  const count = tv.getUint16(eocd + 10, true);
  const cdSize = tv.getUint32(eocd + 12, true);
  const cdOffset = tv.getUint32(eocd + 16, true);
  if (disk !== 0 || cdDisk !== 0) throw new ZipError("Архив из нескольких частей не поддерживается.");
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new ZipError("Слишком большой архив (ZIP64) не поддерживается.");
  if (cdSize > MAX_CENTRAL_BYTES || cdOffset + cdSize > blob.size) throw new ZipError("Архив повреждён: оглавление за пределами файла.");

  const cd = new Uint8Array(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const cv = new DataView(cd.buffer);
  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > cd.length || cv.getUint32(p, true) !== 0x02014b50) throw new ZipError("Архив повреждён: оглавление нечитаемо.");
    const flags = cv.getUint16(p + 8, true);
    const nameLen = cv.getUint16(p + 28, true);
    const extraLen = cv.getUint16(p + 30, true);
    const commentLen = cv.getUint16(p + 32, true);
    const next = p + 46 + nameLen + extraLen + commentLen;
    if (next > cd.length) throw new ZipError("Архив повреждён: оглавление обрезано.");
    const name = decoder.decode(cd.subarray(p + 46, p + 46 + nameLen));
    const entry: ZipEntry = {
      name,
      method: cv.getUint16(p + 10, true),
      crc: cv.getUint32(p + 16, true),
      compressedSize: cv.getUint32(p + 20, true),
      uncompressedSize: cv.getUint32(p + 24, true),
      localOffset: cv.getUint32(p + 42, true),
      encrypted: (flags & 1) !== 0,
    };
    p = next;
    if (name.endsWith("/")) continue; // папка
    if (entry.localOffset >= cdOffset) throw new ZipError("Архив повреждён: файл за пределами данных.");
    entries.push(entry);
  }

  async function read(entry: ZipEntry, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
    if (entry.encrypted) throw new ZipError("Архив с паролем не поддерживается.");
    if (entry.method !== 0 && entry.method !== 8) throw new ZipError("Способ сжатия в архиве не поддерживается.");
    if (entry.uncompressedSize > maxBytes) throw new ZipError(`Файл «${entry.name}» слишком большой.`);
    // Размеры в локальном заголовке могут быть нулевыми (флаг 3), поэтому доверяем только оглавлению;
    // из локального берём длину имени и «extra», чтобы найти начало данных.
    const lh = new Uint8Array(await blob.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer());
    const lv = new DataView(lh.buffer);
    if (lh.length < 30 || lv.getUint32(0, true) !== 0x04034b50) throw new ZipError("Архив повреждён: заголовок файла нечитаем.");
    const start = entry.localOffset + 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
    const end = start + entry.compressedSize;
    if (end > cdOffset) throw new ZipError("Архив повреждён: данные файла обрезаны.");

    const raw = blob.slice(start, end);
    let out: Uint8Array<ArrayBuffer>;
    if (entry.method === 0) {
      if (entry.compressedSize !== entry.uncompressedSize) throw new ZipError("Архив повреждён: размеры не совпадают.");
      out = new Uint8Array(await raw.arrayBuffer());
    } else {
      out = await inflateRaw(raw, entry.uncompressedSize, entry.name);
    }
    if (out.length !== entry.uncompressedSize) throw new ZipError(`Файл «${entry.name}» повреждён: размер не совпадает.`);
    if (crc32(out) !== entry.crc) throw new ZipError(`Файл «${entry.name}» повреждён: контрольная сумма не совпадает.`);
    return out;
  }

  return { entries, read };
}

/** Распаковка deflate с жёстким потолком: архив-«бомба» не раздует память. */
async function inflateRaw(raw: Blob, expected: number, name: string): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof DecompressionStream === "undefined") throw new ZipError("Этот браузер не умеет распаковывать сжатые архивы. Обновите браузер.");
  const stream = raw.stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > expected) throw new ZipError(`Файл «${name}» повреждён: распаковался больше заявленного.`);
      chunks.push(value);
    }
  } catch (e) {
    void reader.cancel().catch(() => undefined);
    if (e instanceof ZipError) throw e;
    throw new ZipError(`Файл «${name}» повреждён и не распаковывается.`);
  }
  const out = buf(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
