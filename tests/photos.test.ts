import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import {
  createPhotoStore,
  mapPhotoError,
  newPhotoId,
  photoCreatedAt,
  referencedPhotoIds,
  type PhotoRecord,
} from "../lib/photos.ts";
import { GardenError, LIMITS, type Entry } from "../lib/types.ts";

const T0 = Date.UTC(2026, 9, 1);
const DAY = 86_400_000;

function rec(id: string, size = 10): PhotoRecord {
  return { id, blob: new Blob([new Uint8Array(size)], { type: "image/webp" }), mime: "image/webp", width: 10, height: 20, createdAt: T0 };
}
const idAt = (ms: number, n = 1) => newPhotoId(ms, () => new Uint8Array(8).fill(n));
const fresh = () => createPhotoStore(new IDBFactory());

test("put и get возвращают тот же файл", async () => {
  const store = fresh();
  const id = idAt(T0);
  await store.put(rec(id, 1234));
  const got = await store.get(id);
  assert.ok(got);
  assert.equal(got.blob.size, 1234);
  assert.equal(got.blob.type, "image/webp");
  assert.equal(got.width, 10);
  assert.equal(await store.get(idAt(T0, 9)), null);
});

test("delete убирает файлы, пустой список ничего не делает", async () => {
  const store = fresh();
  const [a, b] = [idAt(T0, 1), idAt(T0, 2)];
  await store.put(rec(a));
  await store.put(rec(b));
  await store.delete([]);
  assert.deepEqual((await store.listIds()).sort(), [a, b].sort());
  await store.delete([a]);
  assert.deepEqual(await store.listIds(), [b]);
});

test("sweep удаляет только старые файлы без записи", async () => {
  const store = fresh();
  const now = T0 + 30 * DAY;
  const keptByEntry = idAt(T0, 1); // старый, но на него ссылается запись
  const oldOrphan = idAt(T0, 2); // старый и ничей: удаляется
  const youngOrphan = idAt(now - DAY, 3); // ничей, но свежий: может быть частью сохранения в процессе
  const foreign = "чужой-id"; // не наш формат: не трогаем
  for (const id of [keptByEntry, oldOrphan, youngOrphan, foreign]) await store.put(rec(id));
  const removed = await store.sweep(new Set([keptByEntry]), now);
  assert.equal(removed, 1);
  assert.deepEqual((await store.listIds()).sort(), [keptByEntry, youngOrphan, foreign].sort());
});

test("sweep не трогает файл ровно на границе возраста", async () => {
  const store = fresh();
  const id = idAt(T0);
  await store.put(rec(id));
  assert.equal(await store.sweep(new Set(), T0 + LIMITS.photoOrphanMinAgeMs), 0);
  assert.equal(await store.sweep(new Set(), T0 + LIMITS.photoOrphanMinAgeMs + 1), 1);
});

test("без IndexedDB хранилище честно говорит, что недоступно", async () => {
  const store = createPhotoStore(undefined);
  assert.equal(store.available, false);
  const unavailable = (e: unknown) => e instanceof GardenError && e.code === "unavailable";
  await assert.rejects(store.put(rec(idAt(T0))), unavailable);
  await assert.rejects(store.get(idAt(T0)), unavailable);
  await assert.rejects(store.listIds(), unavailable);
});

test("после close хранилище открывается заново", async () => {
  const store = fresh();
  const id = idAt(T0);
  await store.put(rec(id));
  store.close();
  assert.ok(await store.get(id));
});

test("id содержит время создания и не повторяется", () => {
  const id = idAt(T0 + 5);
  assert.equal(photoCreatedAt(id), T0 + 5);
  assert.equal(photoCreatedAt("nope"), null);
  assert.equal(photoCreatedAt("p_zzzzzz_xyz"), null);
  const many = new Set(Array.from({ length: 1000 }, () => newPhotoId()));
  assert.equal(many.size, 1000);
});

test("mapPhotoError различает нехватку места и остальное", () => {
  const quota = mapPhotoError(new DOMException("full", "QuotaExceededError"));
  assert.equal(quota.code, "quota");
  assert.equal(mapPhotoError(new Error("x")).code, "unavailable");
  assert.equal(mapPhotoError(null).code, "unavailable");
  const own = new GardenError("invalid", "x");
  assert.equal(mapPhotoError(own), own);
});

test("referencedPhotoIds собирает id со всех записей", () => {
  const e = (date: string, ids: string[]): Entry => ({
    date,
    body: "",
    mood: null,
    createdAt: 1,
    updatedAt: 1,
    ...(ids.length ? { photos: ids.map((id) => ({ id, width: 1, height: 1, bytes: 1, mime: "image/webp" as const })) } : {}),
  });
  const ids = referencedPhotoIds([e("2026-10-01", ["a", "b"]), e("2026-10-02", []), e("2026-10-03", ["c"])]);
  assert.deepEqual([...ids].sort(), ["a", "b", "c"]);
});
