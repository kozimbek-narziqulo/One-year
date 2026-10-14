import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { itemsOf, newPhotoItem, sameItems, saveEntryWithPhotos, type PhotoItem } from "../lib/entryPhotos.ts";
import { createPhotoStore, type PhotoRecord, type PhotoStore } from "../lib/photos.ts";
import { createRepo } from "../lib/repo.ts";
import { todayKey } from "../lib/date.ts";
import { memoryStorage } from "../lib/storage.ts";
import { GardenError } from "../lib/types.ts";

const NOW = new Date(2026, 9, 11, 12, 0, 0);
const TODAY = todayKey(NOW);

function setup() {
  const repo = createRepo(memoryStorage(), { now: () => NOW });
  const store = createPhotoStore(new IDBFactory());
  return { repo, store };
}

let seq = 0;
function newItem(size = 50): PhotoItem {
  seq++;
  const blob = new Blob([new Uint8Array(size)], { type: "image/webp" });
  return newPhotoItem({ blob, width: 1280, height: 960, mime: "image/webp" }, NOW.getTime() + seq);
}

test("сохранение пишет файлы и запись, файл читается по ссылке из записи", async () => {
  const { repo, store } = setup();
  const [a, b] = [newItem(111), newItem(222)];
  const entry = await saveEntryWithPhotos(repo, store, { date: TODAY, body: "день", mood: 4, items: [a, b] });
  assert.deepEqual(entry.photos?.map((p) => p.id), [a.ref.id, b.ref.id]);
  assert.equal((await store.get(a.ref.id))?.blob.size, 111);
  assert.equal((await store.get(b.ref.id))?.blob.size, 222);
  assert.deepEqual(repo.getEntry(TODAY)?.photos, entry.photos);
});

test("если запись не сохранилась, записанные файлы откатываются", async () => {
  const { repo, store } = setup();
  const tomorrow = todayKey(new Date(2026, 9, 12));
  await assert.rejects(
    saveEntryWithPhotos(repo, store, { date: tomorrow, body: "x", mood: null, items: [newItem(), newItem()] }),
    (e: unknown) => e instanceof GardenError && e.code === "future",
  );
  assert.deepEqual(await store.listIds(), []);
  assert.equal(repo.getEntry(tomorrow), null);
});

test("если второй файл не записался, первый откатывается и записи нет", async () => {
  const { repo, store: real } = setup();
  let puts = 0;
  const flaky: PhotoStore = {
    ...real,
    put: async (rec: PhotoRecord) => {
      if (++puts === 2) throw new GardenError("quota", "На телефоне кончилось место.");
      return real.put(rec);
    },
  };
  await assert.rejects(
    saveEntryWithPhotos(repo, flaky, { date: TODAY, body: "x", mood: null, items: [newItem(), newItem()] }),
    (e: unknown) => e instanceof GardenError && e.code === "quota",
  );
  assert.deepEqual(await real.listIds(), []);
  assert.equal(repo.getEntry(TODAY), null);
});

test("убранное из записи фото удаляется, оставшееся нет", async () => {
  const { repo, store } = setup();
  const [a, b] = [newItem(), newItem()];
  const first = await saveEntryWithPhotos(repo, store, { date: TODAY, body: "x", mood: null, items: [a, b] });
  const saved = itemsOf(first);
  await saveEntryWithPhotos(repo, store, { date: TODAY, body: "x", mood: null, items: [saved[1] as PhotoItem] });
  await new Promise((r) => setTimeout(r, 20)); // удаление идёт в фоне
  assert.deepEqual(await store.listIds(), [b.ref.id]);
});

test("уже сохранённые фото при повторном сохранении не перезаписываются", async () => {
  const { repo, store: real } = setup();
  const first = await saveEntryWithPhotos(repo, real, { date: TODAY, body: "x", mood: null, items: [newItem()] });
  let puts = 0;
  const spy: PhotoStore = { ...real, put: (r) => (puts++, real.put(r)) };
  await saveEntryWithPhotos(repo, spy, { date: TODAY, body: "правка", mood: null, items: itemsOf(first) });
  assert.equal(puts, 0);
  assert.equal(repo.getEntry(TODAY)?.body, "правка");
  assert.deepEqual(repo.getEntry(TODAY)?.photos, first.photos);
});

test("запись только из фото сохраняется", async () => {
  const { repo, store } = setup();
  const entry = await saveEntryWithPhotos(repo, store, { date: TODAY, body: "", mood: null, items: [newItem()] });
  assert.equal(entry.photos?.length, 1);
});

test("itemsOf и sameItems", () => {
  const a = newItem();
  assert.deepEqual(itemsOf(null), []);
  assert.equal(sameItems([a], [a]), true);
  assert.equal(sameItems([a], []), false);
  assert.equal(sameItems([a], [newItem()]), false);
});
