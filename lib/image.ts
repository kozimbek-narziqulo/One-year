// Сжатие фото перед сохранением. Исходник с телефона весит 3 до 10 МБ, а в IndexedDB он нужен
// только для просмотра на экране, поэтому уменьшаем до 1280 пикселей по длинной стороне и
// кодируем в WebP (или JPEG, если браузер не умеет кодировать WebP).
//
// Работа с браузером спрятана за ImageDeps: логика подбора качества проверяется в Node без canvas,
// а настоящее сжатие проверяется в браузере.

import { GardenError, LIMITS, type PhotoRef } from "./types.ts";

export interface OpenedImage {
  /** Размеры так, как фото видит человек, то есть с учётом поворота из EXIF. */
  width: number;
  height: number;
  render(width: number, height: number, mime: string, quality: number): Promise<Blob>;
  close(): void;
}

export interface ImageDeps {
  open(file: Blob): Promise<OpenedImage>;
}

export interface CompressedPhoto {
  blob: Blob;
  width: number;
  height: number;
  mime: PhotoRef["mime"];
}

/** Лесенка попыток: каждая следующая легче предыдущей. Останавливаемся на первой, что уложилась в цель. */
export const COMPRESS_STEPS: readonly { side: number; quality: number }[] = [
  { side: 1280, quality: 0.82 },
  { side: 1280, quality: 0.7 },
  { side: 1280, quality: 0.6 },
  { side: 1024, quality: 0.6 },
  { side: 800, quality: 0.55 },
];

/** Вписывает размеры в квадрат maxSide x maxSide. Маленькие фото не увеличивает. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const k = maxSide / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

async function renderAs(img: OpenedImage, width: number, height: number, mime: PhotoRef["mime"], quality: number): Promise<Blob | null> {
  const blob = await img.render(width, height, mime, quality);
  // Если браузер не умеет кодировать формат, canvas молча отдаёт PNG: такой файл нам не подходит.
  return blob.type === mime ? blob : null;
}

export async function compressImage(file: Blob, deps: ImageDeps = browserImageDeps()): Promise<CompressedPhoto> {
  if (file.type !== "" && !file.type.startsWith("image/")) throw new GardenError("invalid", "Это не фото.");
  if (file.size > LIMITS.photoInputMaxBytes) {
    throw new GardenError("invalid", `Файл слишком большой: больше ${Math.round(LIMITS.photoInputMaxBytes / 1024 / 1024)} МБ.`);
  }
  let img: OpenedImage;
  try {
    img = await deps.open(file);
  } catch {
    throw new GardenError("invalid", "Не удалось прочитать это фото. Попробуйте формат JPEG или PNG.");
  }
  try {
    if (!(img.width > 0 && img.height > 0)) throw new GardenError("invalid", "Не удалось прочитать это фото.");
    let mime: PhotoRef["mime"] = "image/webp";
    let last: CompressedPhoto | null = null;
    for (const step of COMPRESS_STEPS) {
      const { width, height } = fitWithin(img.width, img.height, step.side);
      let blob = await renderAs(img, width, height, mime, step.quality);
      if (blob === null && mime === "image/webp") {
        mime = "image/jpeg"; // дальше сразу JPEG, WebP больше не пробуем
        blob = await renderAs(img, width, height, mime, step.quality);
      }
      if (blob === null) throw new GardenError("unavailable", "Этот браузер не умеет сжимать фото.");
      last = { blob, width, height, mime };
      if (blob.size <= LIMITS.photoTargetBytes) break;
    }
    return last as CompressedPhoto;
  } catch (e) {
    if (e instanceof GardenError) throw e;
    throw new GardenError("unavailable", "Не удалось сжать фото.");
  } finally {
    img.close();
  }
}

/** Настоящая реализация на createImageBitmap и canvas. Вызывается только в браузере. */
export function browserImageDeps(): ImageDeps {
  return {
    async open(file) {
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {
        bitmap = await createImageBitmap(file); // браузер не знает этот параметр
      }
      return {
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
        render(width, height, mime, quality) {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return Promise.reject(new Error("no 2d context"));
          // Белый фон: у PNG с прозрачностью JPEG иначе получит чёрный.
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, width, height);
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(bitmap, 0, 0, width, height);
          return new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (b) => {
                // Освобождаем память canvas сразу: в Safari она иначе держится до сборки мусора.
                canvas.width = 0;
                canvas.height = 0;
                if (b) resolve(b);
                else reject(new Error("toBlob returned null"));
              },
              mime,
              quality,
            );
          });
        },
      };
    },
  };
}
