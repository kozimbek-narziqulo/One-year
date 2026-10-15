import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import {
  applyImport,
  applyImportWithPhotos,
  backupFilename,
  BackupError,
  buildBackup,
  buildBackupZip,
  parseBackup,
  photoFileName,
  planImport,
  readBackupFile,
} from "../lib/backup.ts";
import { BACKUP_APP_ID } from "../lib/brand.ts";
import { itemsOf, newPhotoItem, saveEntryWithPhotos, type PhotoItem } from "../lib/entryPhotos.ts";
import { createPhotoStore, type PhotoRecord, type PhotoStore } from "../lib/photos.ts";
import { createRepo, type Repo } from "../lib/repo.ts";
import { memoryStorage } from "../lib/storage.ts";
import { todayKey } from "../lib/date.ts";
import { DEFAULT_SETTINGS, GardenError, type Entry, type PhotoRef } from "../lib/types.ts";
import { createZip, openZip, type ZipEntry } from "../lib/zip.ts";

const NOW = new Date(2026, 9, 11, 12, 0, 0);
const TODAY = todayKey(NOW);
const day = (n: number) => todayKey(new Date(2026, 9, 11 - n));

function setup() {
  const repo = createRepo(memoryStorage(), { now: () => NOW });
  const store = createPhotoStore(new IDBFactory());
  return { repo, store };
}

let seq = 0;
/** Фото-заглушка с настоящей «шапкой» WebP, чтобы пройти проверку формата. */
function webp(size = 64): Blob {
  seq++;
  const b = new Uint8Array(size).map((_, i) => (i * 7 + seq) & 0xff);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 0);
  return new Blob([b], { type: "image/webp" });
}
function item(size?: number): PhotoItem {
  return newPhotoItem({ blob: webp(size), width: 800, height: 600, mime: "image/webp" }, NOW.getTime() - 20 * 86_400_000 + ++seq);
}

async function put(repo: Repo, store: PhotoStore, date: string, body: string, items: PhotoItem[] = [], mood: 1 | 2 | 3 | 4 | 5 | null = null) {
  return saveEntryWithPhotos(repo, store, { date, body, mood, items });
}

const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

async function filled() {
  const { repo, store } = setup();
  await put(repo, store, day(0), "сегодня", [item(100), item(200)], 4);
  await put(repo, store, day(1), "вчера без фото", [], 2);
  await put(repo, store, day(2), "", [item(300)]);
  return { repo, store };
}

/** Пересобрать архив, поменяв набор файлов. */
async function rebuild(zip: Blob, edit: (files: Map<string, Uint8Array>) => void, prefix = ""): Promise<Blob> {
  const z = await openZip(zip);
  const files = new Map<string, Uint8Array>();
  for (const e of z.entries) files.set(e.name, await z.read(e, 1e8));
  edit(files);
  return createZip([...files].map(([name, data]) => ({ name: prefix + name, data: data as Uint8Array<ArrayBuffer> })));
}

const entriesOf = (repo: Repo) => repo.listEntries();
const noPhotoIds = (e: Entry[]) => e.map((x) => ({ ...x, photos: x.photos?.map((p) => p.id) }));

test("архив содержит backup.json, README и файлы фото", async () => {
  const { repo, store } = await filled();
  const r = await buildBackupZip(repo, store, { now: NOW });
  assert.equal(r.entries, 3);
  assert.equal(r.photos, 3);
  assert.equal(r.photosMissing, 0);
  const z = await openZip(r.blob);
  const names = z.entries.map((e) => e.name).sort();
  const refs = entriesOf(repo).flatMap((e) => e.photos ?? []);
  assert.deepEqual(names, ["README.txt", "backup.json", ...refs.map(photoFileName)].sort());
  const json = JSON.parse(new TextDecoder().decode(await z.read(z.entries.find((e) => e.name === "backup.json") as ZipEntry, 1e7)));
  assert.equal(json.app, BACKUP_APP_ID);
  assert.equal(json.version, 2);
  assert.equal(backupFilename(NOW), `${"garden"}-${TODAY}.zip`);
});

test("круг: экспорт, чистый телефон, импорт — записи и байты фото совпадают", async () => {
  const { repo, store } = await filled();
  const { blob } = await buildBackupZip(repo, store, { now: NOW });
  const orig = entriesOf(repo);

  const fresh = setup();
  const parsed = await readBackupFile(blob, NOW.getTime());
  assert.equal(parsed.format, "zip");
  assert.equal(parsed.photoCount, 3);
  assert.equal(parsed.photosMissing, 0);
  const progress: [number, number][] = [];
  const res = await applyImportWithPhotos(fresh.repo, fresh.store, parsed, "replace", true, (d, t) => progress.push([d, t]));
  assert.equal(res.added, 3);
  assert.equal(res.photosWritten, 3);
  assert.equal(res.photosFailed, 0);
  assert.deepEqual(progress.at(-1), [3, 3]);
  assert.deepEqual(entriesOf(fresh.repo), orig);
  for (const ref of orig.flatMap((e) => e.photos ?? [])) {
    const a = await store.get(ref.id);
    const b = await fresh.store.get(ref.id);
    assert.ok(a && b);
    assert.deepEqual(await bytesOf(b.blob), await bytesOf(a.blob));
    assert.equal(b.blob.type, ref.mime);
    assert.deepEqual([b.width, b.height], [ref.width, ref.height]);
  }
});

test("повторная загрузка той же копии: ничего нового и фото не пишутся заново", async () => {
  const { repo, store: real } = await filled();
  const { blob } = await buildBackupZip(repo, real, { now: NOW });
  let puts = 0;
  const spy: PhotoStore = { ...real, put: (r: PhotoRecord) => (puts++, real.put(r)) };
  const res = await applyImportWithPhotos(repo, spy, await readBackupFile(blob, NOW.getTime()), "merge", false);
  assert.equal(res.unchanged, 3);
  assert.equal(res.added + res.updated, 0);
  assert.equal(puts, 0);
  assert.equal(res.photosAdded, 0);
});

test("слияние: добавляются только недостающие записи и их фото", async () => {
  const src = await filled();
  const { blob } = await buildBackupZip(src.repo, src.store, { now: NOW });
  const dst = setup();
  await put(dst.repo, dst.store, day(5), "своя запись", [item()]);
  const own = dst.repo.getEntry(day(5)) as Entry;
  const res = await applyImportWithPhotos(dst.repo, dst.store, await readBackupFile(blob, NOW.getTime()), "merge", false);
  assert.equal(res.added, 3);
  assert.equal(res.photosWritten, 3);
  assert.equal(dst.repo.listEntries().length, 4);
  assert.deepEqual(dst.repo.getEntry(day(5)), own);
  assert.equal((await dst.store.listIds()).length, 4);
});

test("запись с тем же текстом, но другими фото считается изменённой и выигрывает более свежая", async () => {
  const ref: PhotoRef = { id: "p_aaaaaa_0123456789abcdef", width: 1, height: 1, bytes: 1, mime: "image/webp" };
  const cur: Entry = { date: day(0), body: "т", mood: null, createdAt: 1, updatedAt: 100, photos: [ref] };
  const other: Entry = { ...cur, updatedAt: 200, photos: [{ ...ref, id: "p_bbbbbb_0123456789abcdef" }] };
  const p1 = planImport({ [cur.date]: cur }, [other], "merge");
  assert.equal(p1.updated, 1);
  assert.deepEqual([p1.photosAdded, p1.photosRemoved], [1, 1]);
  const older = { ...other, updatedAt: 50 };
  const p2 = planImport({ [cur.date]: cur }, [older], "merge");
  assert.equal(p2.keptCurrent, 1);
  assert.equal(p2.result[cur.date], cur);
});

test("replace показывает, сколько записей и фото исчезнет", async () => {
  const { repo, store } = await filled();
  const only = setup();
  await put(only.repo, only.store, day(9), "единственная");
  const { blob } = await buildBackupZip(only.repo, only.store, { now: NOW });
  const plan = planImport(repo.getState().entries, (await readBackupFile(blob, NOW.getTime())).entries, "replace");
  assert.equal(plan.removed, 3);
  assert.equal(plan.photosRemoved, 3);
  void store;
});

test("фото, которого нет в браузере, в копию не попадает, об этом сообщается", async () => {
  const { repo, store } = await filled();
  const gone = (repo.getEntry(day(0)) as Entry).photos?.[0]?.id as string;
  await store.delete([gone]);
  const r = await buildBackupZip(repo, store, { now: NOW });
  assert.equal(r.photos, 2);
  assert.equal(r.photosMissing, 1);
  const parsed = await readBackupFile(r.blob, NOW.getTime());
  assert.equal(parsed.photosMissing, 0); // в самой копии ссылок в никуда нет
  const e0 = parsed.entries.find((e) => e.date === day(0)) as Entry;
  assert.deepEqual(e0.photos?.map((p) => p.id).includes(gone), false);
  assert.equal(e0.body, "сегодня");
});

test("хранилище фото недоступно: тексты уходят в копию, фото считаются потерянными", async () => {
  const { repo } = await filled();
  const none = createPhotoStore(undefined);
  const r = await buildBackupZip(repo, none, { now: NOW });
  assert.equal(r.photos, 0);
  assert.equal(r.photosMissing, 3);
  const parsed = await readBackupFile(r.blob, NOW.getTime());
  // запись только из фото осталась без содержимого и пропущена
  assert.equal(parsed.entries.length, 2);
});

test("архив без части файлов: записи загружаются без этих фото, запись только из фото пропускается", async () => {
  const { repo, store } = await filled();
  const { blob } = await buildBackupZip(repo, store, { now: NOW });
  const refs = entriesOf(repo).flatMap((e) => e.photos ?? []);
  const cut = await rebuild(blob, (f) => {
    f.delete(photoFileName(refs[0] as { id: string; mime: "image/webp" })); // из записи «сегодня»
    f.delete(photoFileName(refs[2] as { id: string; mime: "image/webp" })); // единственное в записи day(2)
  });
  const parsed = await readBackupFile(cut, NOW.getTime());
  assert.equal(parsed.photosMissing, 2);
  assert.equal(parsed.photoCount, 1);
  assert.equal(parsed.skipped, 1);
  assert.deepEqual(parsed.entries.map((e) => e.date).sort(), [day(0), day(1)].sort());
  const dst = setup();
  const res = await applyImportWithPhotos(dst.repo, dst.store, parsed, "replace", false);
  assert.equal(res.photosWritten, 1);
  assert.equal((await dst.store.listIds()).length, 1);
  assert.equal(dst.repo.getEntry(day(0))?.photos?.length, 1);
});

test("повреждённое фото в архиве: запись загружается без него, остальное на месте", async () => {
  const { repo, store } = await filled();
  const { blob } = await buildBackupZip(repo, store, { now: NOW });
  const z = await openZip(blob);
  const refs = entriesOf(repo).flatMap((e) => e.photos ?? []);
  const victim = z.entries.find((e) => e.name === photoFileName(refs[1] as { id: string; mime: "image/webp" })) as ZipEntry;
  const bytes = await bytesOf(blob);
  const at = victim.localOffset + 30 + victim.name.length + 40;
  bytes[at] = (bytes[at] ?? 0) ^ 0xff;
  const parsed = await readBackupFile(new Blob([bytes]), NOW.getTime());
  const dst = setup();
  const res = await applyImportWithPhotos(dst.repo, dst.store, parsed, "replace", false);
  assert.equal(res.photosFailed, 1);
  assert.equal(res.photosWritten, 2);
  assert.equal(dst.repo.getEntry(day(0))?.photos?.length, 1);
  assert.equal((await dst.store.listIds()).length, 2);
});

test("файл не того формата под видом фото считается повреждённым", async () => {
  const { repo, store } = await filled();
  const { blob } = await buildBackupZip(repo, store, { now: NOW });
  const refs = entriesOf(repo).flatMap((e) => e.photos ?? []);
  const fake = await rebuild(blob, (f) => f.set(photoFileName(refs[0] as { id: string; mime: "image/webp" }), new TextEncoder().encode("<svg onload=alert(1)>")));
  const dst = setup();
  const res = await applyImportWithPhotos(dst.repo, dst.store, await readBackupFile(fake, NOW.getTime()), "replace", false);
  assert.equal(res.photosFailed, 1);
  assert.equal((await dst.store.listIds()).length, 2);
});

test("кончилось место на втором фото: откат фото, записи не изменились", async () => {
  const { repo, store } = await filled();
  const { blob } = await buildBackupZip(repo, store, { now: NOW });
  const dst = setup();
  await put(dst.repo, dst.store, day(7), "была", [item()]);
  const before = dst.repo.listEntries();
  const beforeIds = await dst.store.listIds();
  let n = 0;
  const flaky: PhotoStore = {
    ...dst.store,
    put: async (r) => {
      if (++n === 2) throw new GardenError("quota", "нет места");
      return dst.store.put(r);
    },
  };
  await assert.rejects(
    applyImportWithPhotos(dst.repo, flaky, await readBackupFile(blob, NOW.getTime()), "replace", false),
    (e: unknown) => e instanceof GardenError && e.code === "quota",
  );
  assert.deepEqual(dst.repo.listEntries(), before);
  assert.deepEqual(await dst.store.listIds(), beforeIds);
});

test("не записались записи (LocalStorage полон): записанные фото откатываются", async () => {
  const { repo, store } = await filled();
  const { blob } = await buildBackupZip(repo, store, { now: NOW });
  const dst = setup();
  const failing: Repo = {
    ...dst.repo,
    setAllEntries: () => {
      throw new GardenError("quota", "нет места");
    },
  };
  await assert.rejects(applyImportWithPhotos(failing, dst.store, await readBackupFile(blob, NOW.getTime()), "replace", false), GardenError);
  assert.deepEqual(await dst.store.listIds(), []);
  assert.equal(dst.repo.listEntries().length, 0);
});

test("браузер без хранилища фото: записи загружаются без фото", async () => {
  const { repo, store } = await filled();
  const { blob } = await buildBackupZip(repo, store, { now: NOW });
  const dst = createRepo(memoryStorage(), { now: () => NOW });
  const res = await applyImportWithPhotos(dst, createPhotoStore(undefined), await readBackupFile(blob, NOW.getTime()), "replace", false);
  assert.equal(res.photosFailed, 3);
  assert.equal(res.photosWritten, 0);
  assert.deepEqual(dst.listEntries().map((e) => e.date).sort(), [day(0), day(1)].sort());
  assert.ok(dst.listEntries().every((e) => !e.photos));
});

test("настройки из копии загружаются по желанию", async () => {
  const { repo, store } = await filled();
  repo.updateSettings({ moodPalette: "cvd", plantPalette: "ink" });
  const { blob } = await buildBackupZip(repo, store, { now: NOW });
  const a = setup();
  await applyImportWithPhotos(a.repo, a.store, await readBackupFile(blob, NOW.getTime()), "replace", false);
  assert.equal(a.repo.getState().settings.moodPalette, DEFAULT_SETTINGS.moodPalette);
  assert.equal(a.repo.getState().settings.plantPalette, DEFAULT_SETTINGS.plantPalette);
  const b = setup();
  await applyImportWithPhotos(b.repo, b.store, await readBackupFile(blob, NOW.getTime()), "replace", true);
  assert.equal(b.repo.getState().settings.moodPalette, "cvd");
  assert.equal(b.repo.getState().settings.plantPalette, "ink");
});

test("архив, перепакованный в папку, с мусором macOS и со сжатием, читается", async () => {
  const { repo, store } = await filled();
  const { blob } = await buildBackupZip(repo, store, { now: NOW });
  const wrapped = await rebuild(
    blob,
    (f) => {
      f.set("__MACOSX/._backup.json", new TextEncoder().encode("мусор"));
      f.set("__MACOSX/backup.json", new TextEncoder().encode("не json"));
    },
    "Моя копия/",
  );
  // __MACOSX получил приставку папки; кладём настоящий «мусор» на корень
  const parsed = await readBackupFile(wrapped, NOW.getTime());
  assert.equal(parsed.photoCount, 3);
  assert.equal(parsed.entries.length, 3);
});

test("старая копия .json (version 1): читается, фото текущих записей этих дат не теряются", async () => {
  const { repo, store } = await filled();
  const old = JSON.stringify({ ...buildBackup(repo, NOW), entries: buildBackup(repo, NOW).entries.map((e) => ({ ...e, body: e.body + " (правка)", updatedAt: e.updatedAt + 1000 })) });
  const parsed = await readBackupFile(new Blob([old]), NOW.getTime());
  assert.equal(parsed.format, "json");
  assert.equal(parsed.photoCount, 0);
  const before = repo.getEntry(day(0))?.photos;
  const res = await applyImportWithPhotos(repo, store, parsed, "merge", false);
  assert.equal(res.updated, 3);
  assert.equal(repo.getEntry(day(0))?.body, "сегодня (правка)");
  assert.deepEqual(repo.getEntry(day(0))?.photos, before);
  assert.equal(repo.getEntry(day(2))?.photos?.length, 1);
  assert.equal((await store.listIds()).length, 3);
});

test("замена старой копией: тексты дат из файла получают прежние фото, остальные записи уходят", async () => {
  const { repo, store } = await filled();
  const json = JSON.stringify({ app: BACKUP_APP_ID, version: 1, exportedAt: NOW.toISOString(), entries: [{ date: day(0), body: "из файла", mood: 3, createdAt: 1, updatedAt: 2 }] });
  const parsed = parseBackup(json, NOW.getTime());
  const plan = planImport(repo.getState().entries, parsed.entries, "replace", { inheritPhotos: true });
  assert.equal(plan.removed, 2);
  assert.equal(plan.result[day(0)]?.photos?.length, 2);
  assert.equal(plan.photosRemoved, 1);
  void store;
});

test("buildBackup (version 1) не содержит ссылок на фото; parseBackup убирает их из чужого файла", async () => {
  const { repo } = await filled();
  const v1 = buildBackup(repo, NOW);
  assert.equal(v1.version, 1);
  assert.ok(v1.entries.every((e) => !("photos" in e)));
  const withRefs = JSON.stringify({ ...v1, version: 2, entries: repo.listEntries() });
  const parsed = parseBackup(withRefs, NOW.getTime());
  assert.equal(parsed.photosMissing, 3);
  assert.equal(parsed.entries.length, 2); // запись только из фото пропущена
  assert.ok(parsed.entries.every((e) => !e.photos));
});

test("applyImport (без фото) отказывается принимать архив с фото", async () => {
  const { repo, store } = await filled();
  const { blob } = await buildBackupZip(repo, store, { now: NOW });
  const parsed = await readBackupFile(blob, NOW.getTime());
  assert.throws(() => applyImport(setup().repo, parsed, "merge", false), BackupError);
  const plain = parseBackup(JSON.stringify(buildBackup(repo, NOW)), NOW.getTime());
  const dst = setup();
  assert.equal(applyImport(dst.repo, plain, "merge", false).added, 2);
});

test("чужие и испорченные файлы отвергаются понятной ошибкой", async () => {
  const bad = (b: Blob) => assert.rejects(readBackupFile(b, NOW.getTime()), BackupError);
  await bad(new Blob(["это просто текст"]));
  await bad(new Blob(["PK\x03\x04 но это не архив, а мусор достаточной длины"]));
  await bad(await createZip([{ name: "other.txt", data: "x" }])); // нет backup.json
  await bad(await createZip([{ name: "backup.json", data: JSON.stringify({ app: "other", version: 2, entries: [] }) }]));
  await bad(await createZip([{ name: "backup.json", data: JSON.stringify({ app: BACKUP_APP_ID, version: 3, entries: [] }) }]));
  await bad(await createZip([{ name: "backup.json", data: "{не json" }]));
});

test("поддельная запись в архиве не ломает загрузку: чужие поля и плохие id фото отбрасываются", async () => {
  const entry = { date: day(1), body: "x", mood: 1, createdAt: 1, updatedAt: 1, photos: [{ id: "../../etc/passwd", width: 1, height: 1, bytes: 1, mime: "image/webp" }, { id: "p_aaaaaa_0123456789abcdef", width: 1, height: 1, bytes: 1, mime: "text/html" }] };
  const zip = await createZip([{ name: "backup.json", data: JSON.stringify({ app: BACKUP_APP_ID, version: 2, entries: [entry] }) }]);
  const parsed = await readBackupFile(zip, NOW.getTime());
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0]?.photos, undefined);
});

test("фото в архиве, на которое записи не ссылаются, игнорируется", async () => {
  const { repo, store } = await filled();
  const { blob } = await buildBackupZip(repo, store, { now: NOW });
  const extra = await rebuild(blob, (f) => f.set("photos/p_zzzzzz_00000000deadbeef.webp", new Uint8Array(64)));
  const dst = setup();
  const res = await applyImportWithPhotos(dst.repo, dst.store, await readBackupFile(extra, NOW.getTime()), "replace", false);
  assert.equal(res.photosWritten, 3);
  assert.equal((await dst.store.listIds()).length, 3);
});

test("itemsOf после загрузки даёт те же фото, что в копии", async () => {
  const { repo, store } = await filled();
  const { blob } = await buildBackupZip(repo, store, { now: NOW });
  const dst = setup();
  await applyImportWithPhotos(dst.repo, dst.store, await readBackupFile(blob, NOW.getTime()), "replace", false);
  assert.deepEqual(itemsOf(dst.repo.getEntry(day(0))).map((i) => i.ref.id), itemsOf(repo.getEntry(day(0))).map((i) => i.ref.id));
  void noPhotoIds;
});
