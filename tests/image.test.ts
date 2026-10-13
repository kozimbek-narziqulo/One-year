import test from "node:test";
import assert from "node:assert/strict";
import { COMPRESS_STEPS, compressImage, fitWithin, type ImageDeps } from "../lib/image.ts";
import { GardenError, LIMITS } from "../lib/types.ts";

interface Opts {
  width?: number;
  height?: number;
  sizeOf?: (w: number, h: number, mime: string, q: number) => number;
  webp?: boolean; // false: браузер на запрос WebP отдаёт PNG
  failOpen?: boolean;
  failRender?: boolean;
}

function fake(o: Opts = {}) {
  const calls: { w: number; h: number; mime: string; q: number }[] = [];
  const state = { opened: 0, closed: 0 };
  const deps: ImageDeps = {
    async open() {
      state.opened++;
      if (o.failOpen) throw new Error("decode failed");
      return {
        width: o.width ?? 4000,
        height: o.height ?? 3000,
        close: () => void state.closed++,
        async render(w, h, mime, q) {
          if (o.failRender) throw new Error("canvas failed");
          calls.push({ w, h, mime, q });
          const type = mime === "image/webp" && o.webp === false ? "image/png" : mime;
          const size = Math.round((o.sizeOf ?? ((ww, hh, _m, qq) => ww * hh * qq * 0.2))(w, h, mime, q));
          return new Blob([new Uint8Array(size)], { type });
        },
      };
    },
  };
  return { deps, calls, state };
}

const photo = (type = "image/jpeg") => new Blob(["x"], { type });
const rejectsWith = (c: string) => (e: unknown) => e instanceof GardenError && e.code === c;

test("fitWithin вписывает по длинной стороне и не увеличивает", () => {
  assert.deepEqual(fitWithin(4000, 3000, 1280), { width: 1280, height: 960 });
  assert.deepEqual(fitWithin(3000, 4000, 1280), { width: 960, height: 1280 });
  assert.deepEqual(fitWithin(800, 600, 1280), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(1280, 1280, 1280), { width: 1280, height: 1280 });
  assert.deepEqual(fitWithin(1, 5000, 1280), { width: 1, height: 1280 });
});

test("лёгкое фото сжимается за одну попытку", async () => {
  const { deps, calls, state } = fake();
  const r = await compressImage(photo(), deps);
  assert.equal(calls.length, 1);
  assert.deepEqual([r.width, r.height, r.mime], [1280, 960, "image/webp"]);
  assert.ok(r.blob.size <= LIMITS.photoTargetBytes);
  assert.equal(state.closed, 1);
});

test("тяжёлое фото проходит лесенку до первой подходящей попытки", async () => {
  const { deps, calls } = fake({ sizeOf: (w, h, _m, q) => w * h * q * 0.5 });
  const r = await compressImage(photo(), deps);
  // 1280x960: q0.82, q0.7, q0.6 не помещаются в 300 КБ, 1024x768 q0.6 помещается.
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((c) => [c.w, c.h, c.q]), [
    [1280, 960, 0.82],
    [1280, 960, 0.7],
    [1280, 960, 0.6],
    [1024, 768, 0.6],
  ]);
  assert.deepEqual([r.width, r.height], [1024, 768]);
  assert.ok(r.blob.size <= LIMITS.photoTargetBytes);
});

test("если ничего не помещается, берётся самая лёгкая попытка", async () => {
  const { deps, calls } = fake({ sizeOf: () => LIMITS.photoTargetBytes + 100_000 });
  const r = await compressImage(photo(), deps);
  assert.equal(calls.length, COMPRESS_STEPS.length);
  assert.deepEqual([r.width, r.height], [800, 600]);
});

test("портретное фото получает портретные размеры", async () => {
  const { deps } = fake({ width: 3000, height: 4000 });
  const r = await compressImage(photo(), deps);
  assert.deepEqual([r.width, r.height], [960, 1280]);
});

test("если браузер не кодирует WebP, переходим на JPEG и больше WebP не пробуем", async () => {
  const { deps, calls } = fake({ webp: false, sizeOf: (w, h, _m, q) => w * h * q * 0.5 });
  const r = await compressImage(photo(), deps);
  assert.equal(r.mime, "image/jpeg");
  assert.equal(calls.filter((c) => c.mime === "image/webp").length, 1, "WebP проверяется один раз");
  assert.ok(calls.slice(1).every((c) => c.mime === "image/jpeg"));
  assert.equal(r.blob.type, "image/jpeg");
});

test("не фото и слишком большие файлы отклоняются до разбора", async () => {
  const { deps, state } = fake();
  await assert.rejects(compressImage(photo("text/plain"), deps), rejectsWith("invalid"));
  const huge = { type: "image/jpeg", size: LIMITS.photoInputMaxBytes + 1 } as unknown as Blob;
  await assert.rejects(compressImage(huge, deps), rejectsWith("invalid"));
  assert.equal(state.opened, 0);
});

test("файл без типа пробуем разобрать (некоторые телефоны не сообщают тип)", async () => {
  const { deps, state } = fake();
  await compressImage(photo(""), deps);
  assert.equal(state.opened, 1);
});

test("нечитаемое фото даёт понятную ошибку", async () => {
  const { deps, state } = fake({ failOpen: true });
  await assert.rejects(compressImage(photo(), deps), (e: unknown) => e instanceof GardenError && e.code === "invalid" && e.message.includes("JPEG"));
  assert.equal(state.closed, 0);
});

test("ошибка при сжатии освобождает изображение и не просачивается как есть", async () => {
  const { deps, state } = fake({ failRender: true });
  await assert.rejects(compressImage(photo(), deps), rejectsWith("unavailable"));
  assert.equal(state.closed, 1);
});
