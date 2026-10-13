import test from "node:test";
import assert from "node:assert/strict";
import { todayKey } from "../lib/date.ts";
import { newPhotoId } from "../lib/photos.ts";
import { KEYS, createRepo } from "../lib/repo.ts";
import { memoryStorage } from "../lib/storage.ts";
import { GardenError, type PhotoRef } from "../lib/types.ts";

const NOW = new Date(2026, 9, 11, 12, 0, 0);
const TODAY = todayKey(NOW);

/** Корректная ссылка на фото; n делает id уникальным. */
function ref(n: number): PhotoRef {
  const id = newPhotoId(NOW.getTime() + n, () => new Uint8Array(8).fill(n + 1));
  return { id, width: 1280, height: 960, bytes: 100_000, mime: "image/webp" };
}

function fresh(initial: Record<string, string> = {}) {
  const storage = memoryStorage(initial);
  return { storage, repo: createRepo(storage, { now: () => NOW }) };
}

const code = (c: string) => (e: unknown) => e instanceof GardenError && e.code === c;

test("запись без фото хранится ровно так же, как до появления фото", () => {
  const { storage, repo } = fresh();
  const e = repo.saveEntry({ date: TODAY, body: "привет", mood: 3 });
  assert.deepEqual(e, { date: TODAY, body: "привет", mood: 3, createdAt: NOW.getTime(), updatedAt: NOW.getTime() });
  assert.equal("photos" in e, false);
  assert.equal(storage.dump()[KEYS.entries]?.includes("photos"), false);
});

test("старые данные без поля photos читаются как раньше", () => {
  const old = { [TODAY]: { date: TODAY, body: "старая", mood: null, createdAt: 1, updatedAt: 2 } };
  const { repo } = fresh({ [KEYS.entries]: JSON.stringify(old) });
  assert.equal(repo.getState().loadProblem, false);
  assert.deepEqual(repo.getEntry(TODAY), old[TODAY]);
});

test("ссылки на фото переживают перезапуск", () => {
  const { storage, repo } = fresh();
  const photos = [ref(1), ref(2)];
  repo.saveEntry({ date: TODAY, body: "с фото", mood: null, photos });
  const again = createRepo(storage, { now: () => NOW });
  assert.deepEqual(again.getEntry(TODAY)?.photos, photos);
});

test("без поля photos фото записи остаются, пустой список их убирает", () => {
  const { repo } = fresh();
  const photos = [ref(1)];
  repo.saveEntry({ date: TODAY, body: "раз", mood: null, photos });
  repo.saveEntry({ date: TODAY, body: "два", mood: null });
  assert.deepEqual(repo.getEntry(TODAY)?.photos, photos);
  const cleared = repo.saveEntry({ date: TODAY, body: "три", mood: null, photos: [] });
  assert.equal("photos" in cleared, false);
});

test("запись из одних фото допустима, совсем пустая нет", () => {
  const { repo } = fresh();
  const e = repo.saveEntry({ date: TODAY, body: "", mood: null, photos: [ref(1)] });
  assert.equal(e.photos?.length, 1);
  const other = fresh().repo;
  assert.throws(() => other.saveEntry({ date: TODAY, body: "  ", mood: null }), code("empty"));
  assert.throws(() => other.saveEntry({ date: TODAY, body: "", mood: null, photos: [] }), code("empty"));
});

test("больше пяти фото и битые ссылки отклоняются", () => {
  const { repo } = fresh();
  const six = [1, 2, 3, 4, 5, 6].map(ref);
  assert.throws(() => repo.saveEntry({ date: TODAY, body: "x", mood: null, photos: six }), code("invalid"));
  const bad = [{ id: "nope", width: 1, height: 1, bytes: 1, mime: "image/webp" }] as unknown as PhotoRef[];
  assert.throws(() => repo.saveEntry({ date: TODAY, body: "x", mood: null, photos: bad }), code("invalid"));
  const dup = [ref(1), ref(1)];
  assert.throws(() => repo.saveEntry({ date: TODAY, body: "x", mood: null, photos: dup }), code("invalid"));
  assert.equal(repo.getEntry(TODAY), null);
});

test("при загрузке битые ссылки на фото отбрасываются, остальное остаётся", () => {
  const good = ref(1);
  const raw = {
    [TODAY]: {
      date: TODAY,
      body: "x",
      mood: null,
      createdAt: 1,
      updatedAt: 1,
      photos: [good, { id: "bad" }, null, "str", { ...ref(2), mime: "image/gif" }],
    },
  };
  const { repo } = fresh({ [KEYS.entries]: JSON.stringify(raw) });
  assert.deepEqual(repo.getEntry(TODAY)?.photos, [good]);
  assert.equal(repo.getState().loadProblem, false);
});

test("удаление и возврат записи сохраняют фото", () => {
  const { repo } = fresh();
  const photos = [ref(1), ref(2)];
  repo.saveEntry({ date: TODAY, body: "x", mood: null, photos });
  const gone = repo.deleteEntry(TODAY);
  assert.equal(repo.getEntry(TODAY), null);
  assert.ok(gone);
  repo.restoreEntry(gone);
  assert.deepEqual(repo.getEntry(TODAY)?.photos, photos);
});
