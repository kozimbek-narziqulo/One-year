import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, dayOfYear, formatLong, isValidKey, todayKey, weekdayMon0, yearGrid, daysInYear } from "../lib/date.ts";
import { createRepo, KEYS, shouldNudgeBackup } from "../lib/repo.ts";
import { memoryStorage } from "../lib/storage.ts";
import { applyImport, buildBackup, parseBackup, planImport, serializeBackup, BackupError, backupFilename } from "../lib/backup.ts";
import { GardenError, type Entry } from "../lib/types.ts";
import { plantBounds, plantGeometry, plantSpec, signature } from "../lib/plants.ts";

const at = (iso: string) => () => new Date(iso);

test("date: validation and arithmetic", () => {
  assert.equal(isValidKey("2026-02-29"), false);
  assert.equal(isValidKey("2028-02-29"), true);
  assert.equal(isValidKey("2026-13-01"), false);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(dayOfYear("2026-12-31"), 365);
  assert.equal(dayOfYear("2028-12-31"), 366);
  assert.equal(weekdayMon0("2026-10-11"), 6); // воскресенье
  assert.equal(formatLong("2026-10-11", new Date(2026, 5, 1)), "воскресенье, 11 октября");
});

test("date: todayKey uses local calendar day", () => {
  assert.equal(todayKey(new Date(2026, 0, 1, 0, 5)), "2026-01-01");
  assert.equal(todayKey(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
});

test("date: year grid covers every day exactly once, weeks start Monday", () => {
  for (const y of [2026, 2028]) {
    const keys = yearGrid(y).flatMap((m) => m.weeks.flat()).filter((k): k is string => k !== null);
    assert.equal(keys.length, daysInYear(y));
    assert.equal(new Set(keys).size, keys.length);
  }
  const jan = yearGrid(2026)[0]!;
  assert.equal(jan.weeks[0]![3], "2026-01-01"); // 1 января 2026 — четверг
  assert.ok(yearGrid(2026).every((m) => m.weeks.every((w) => w.length === 7)));
});

test("plants: 366 days give 366 distinct plants inside the 48x48 box", () => {
  const sigs = new Set<string>();
  for (let d = 1; d <= 366; d++) {
    const spec = plantSpec(d);
    sigs.add(signature(spec));
    const b = plantBounds(plantGeometry(spec));
    assert.ok(b.x0 >= 3 && b.y0 >= 3 && b.x1 <= 45 && b.y1 <= 45, `day ${d} out of box: ${JSON.stringify(b)}`);
  }
  assert.equal(sigs.size, 366);
  assert.throws(() => plantSpec(0));
  assert.throws(() => plantSpec(367));
});

test("repo: save, update keeps createdAt, one entry per day", () => {
  let t = new Date("2026-10-11T10:00:00");
  const repo = createRepo(memoryStorage(), { now: () => t });
  const a = repo.saveEntry({ date: "2026-10-11", body: "первая  \n", mood: 4 });
  assert.equal(a.body, "первая");
  t = new Date("2026-10-11T12:00:00");
  const b = repo.saveEntry({ date: "2026-10-11", body: "правка", mood: null });
  assert.equal(b.createdAt, a.createdAt);
  assert.ok(b.updatedAt > a.updatedAt);
  assert.equal(repo.listEntries().length, 1);
});

test("repo: rejects future, empty and invalid input", () => {
  const repo = createRepo(memoryStorage(), { now: at("2026-10-11T10:00:00") });
  const code = (fn: () => unknown) => {
    try { fn(); } catch (e) { return e instanceof GardenError ? e.code : "other"; }
    return "none";
  };
  assert.equal(code(() => repo.saveEntry({ date: "2026-10-12", body: "x", mood: 3 })), "future");
  assert.equal(code(() => repo.saveEntry({ date: "2026-10-11", body: "  \n", mood: null })), "empty");
  assert.equal(code(() => repo.saveEntry({ date: "11.10.2026", body: "x", mood: null })), "invalid");
  assert.equal(code(() => repo.saveEntry({ date: "2026-10-11", body: "x", mood: 9 as never })), "invalid");
  assert.equal(code(() => repo.saveEntry({ date: "2026-10-11", body: "", mood: 2 })), "none"); // настроение без текста допустимо
});

test("repo: data survives a reload and a failed write leaves state untouched", () => {
  const store = memoryStorage();
  const repo = createRepo(store, { now: at("2026-10-11T10:00:00") });
  repo.saveEntry({ date: "2026-10-10", body: "вчера", mood: 3 });
  const again = createRepo(store, { now: at("2026-10-11T10:00:00") });
  assert.equal(again.getEntry("2026-10-10")?.body, "вчера");

  const full = {
    ...store,
    setItem(k: string, v: string) {
      if (k === KEYS.entries) {
        const e = new Error("full");
        e.name = "QuotaExceededError";
        throw e;
      }
      store.setItem(k, v);
    },
  };
  const r2 = createRepo(full, { now: at("2026-10-11T10:00:00") });
  assert.throws(() => r2.saveEntry({ date: "2026-10-11", body: "не влезет", mood: 1 }), (e: unknown) => e instanceof GardenError && e.code === "quota");
  assert.equal(r2.getEntry("2026-10-11"), null);
  assert.equal(r2.listEntries().length, 1);
});

test("repo: delete returns the entry and restore brings it back unchanged", () => {
  const repo = createRepo(memoryStorage(), { now: at("2026-10-11T10:00:00") });
  const e = repo.saveEntry({ date: "2026-10-11", body: "тут", mood: 5 });
  const gone = repo.deleteEntry("2026-10-11");
  assert.deepEqual(gone, e);
  assert.equal(repo.getEntry("2026-10-11"), null);
  repo.restoreEntry(gone!);
  assert.deepEqual(repo.getEntry("2026-10-11"), e);
  assert.equal(repo.deleteEntry("2020-01-01"), null);
});

test("repo: corrupt storage is kept aside, not overwritten silently", () => {
  const store = memoryStorage({ [KEYS.entries]: "{oops" });
  const repo = createRepo(store, { now: at("2026-10-11T10:00:00") });
  assert.equal(repo.getState().loadProblem, true);
  const rescue = Object.entries(store.dump()).find(([k]) => k.startsWith("garden:v1:rescue:"));
  assert.equal(rescue?.[1], "{oops");
});

test("repo: drafts roundtrip and are cleared on save", () => {
  const repo = createRepo(memoryStorage(), { now: at("2026-10-11T10:00:00") });
  repo.saveDraft("2026-10-11", { body: "недописано", mood: 2 });
  assert.equal(repo.getDraft("2026-10-11")?.body, "недописано");
  repo.saveEntry({ date: "2026-10-11", body: "готово", mood: 2 });
  assert.equal(repo.getDraft("2026-10-11"), null);
});

test("backup: export then import into an empty app restores everything", () => {
  const src = createRepo(memoryStorage(), { now: at("2026-10-11T10:00:00") });
  src.saveEntry({ date: "2026-10-09", body: "раз", mood: 1 });
  src.saveEntry({ date: "2026-10-10", body: "два \"в кавычках\" и\nперенос", mood: null });
  src.updateSettings({ moodPalette: "cvd", plantPalette: "autumn" });
  const text = serializeBackup(buildBackup(src, new Date("2026-10-11T10:00:00")));

  const dst = createRepo(memoryStorage(), { now: at("2026-10-11T10:00:00") });
  const plan = applyImport(dst, parseBackup(text), "merge", true);
  assert.equal(plan.added, 2);
  assert.deepEqual(dst.listEntries(), src.listEntries());
  assert.equal(dst.getState().settings.moodPalette, "cvd");
  assert.equal(dst.getState().settings.plantPalette, "autumn");
});

test("backup: file name and bad files", () => {
  assert.equal(backupFilename(new Date(2026, 9, 11), "json"), "garden-backup-2026-10-11.json");
  const bad = (s: string) => assert.throws(() => parseBackup(s), BackupError);
  bad("not json");
  bad("[]");
  bad(JSON.stringify({ app: "other", version: 1, entries: [] }));
  bad(JSON.stringify({ app: "garden-journal", version: 2, entries: [] }));
  bad(JSON.stringify({ app: "garden-journal", version: 1 }));
  bad(JSON.stringify({ app: "garden-journal", version: 1, entries: [{ date: "nope", body: 1 }] }));
  const ok = parseBackup(JSON.stringify({ app: "garden-journal", version: 1, entries: [{ date: "2026-01-01", body: "a", mood: 3 }, { date: "bad" }] }));
  assert.equal(ok.entries.length, 1);
  assert.equal(ok.skipped, 1);
});

test("backup: merge keeps the newer edit, replace mirrors the file", () => {
  const mk = (date: string, body: string, updatedAt: number): Entry => ({ date, body, mood: null, createdAt: 1, updatedAt });
  const current = { "2026-01-01": mk("2026-01-01", "новее в приложении", 200), "2026-01-02": mk("2026-01-02", "только тут", 100), "2026-01-03": mk("2026-01-03", "старое", 100) };
  const incoming = [mk("2026-01-01", "из файла, старее", 100), mk("2026-01-03", "из файла, новее", 300), mk("2026-01-04", "новая", 100)];
  const m = planImport(current, incoming, "merge");
  assert.deepEqual([m.added, m.updated, m.keptCurrent, m.removed], [1, 1, 1, 0]);
  assert.equal(m.result["2026-01-01"]!.body, "новее в приложении");
  assert.equal(m.result["2026-01-02"]!.body, "только тут");
  const r = planImport(current, incoming, "replace");
  assert.equal(r.removed, 1);
  assert.equal(r.result["2026-01-01"]!.body, "из файла, старее");
  assert.equal(r.result["2026-01-02"], undefined);
});

test("backup: duplicate dates inside a file keep the newest", () => {
  const p = parseBackup(JSON.stringify({ app: "garden-journal", version: 1, entries: [
    { date: "2026-01-01", body: "старая", mood: null, createdAt: 1, updatedAt: 1 },
    { date: "2026-01-01", body: "свежая", mood: null, createdAt: 1, updatedAt: 5 },
  ] }));
  assert.equal(p.entries.length, 1);
  assert.equal(p.entries[0]!.body, "свежая");
});

test("nudge: appears after many changes or a month without a copy; export resets it", () => {
  const day = 86_400_000;
  const t0 = new Date("2026-09-01T10:00:00").getTime();
  let t = t0;
  const repo = createRepo(memoryStorage(), { now: () => new Date(t) });
  assert.equal(shouldNudgeBackup(repo.getState(), t), false); // пусто
  repo.saveEntry({ date: "2026-09-01", body: "a", mood: null });
  assert.equal(shouldNudgeBackup(repo.getState(), t), false);
  t = t0 + 31 * day;
  assert.equal(shouldNudgeBackup(repo.getState(), t), true);
  repo.markBackedUp();
  assert.equal(shouldNudgeBackup(repo.getState(), t), false);
  for (let i = 2; i <= 15; i++) repo.saveEntry({ date: `2026-09-${String(i).padStart(2, "0")}`, body: "x", mood: null });
  assert.equal(shouldNudgeBackup(repo.getState(), t), true);
  repo.snoozeBackupNudge();
  assert.equal(shouldNudgeBackup(repo.getState(), t), false);
});

test("backup: entries dated in the future are skipped and counted", () => {
  const now = new Date(2026, 9, 11, 12).getTime();
  const p = parseBackup(JSON.stringify({ app: "garden-journal", version: 1, entries: [
    { date: "2026-10-11", body: "сегодня", mood: null },
    { date: "2026-10-12", body: "завтра", mood: null },
    { date: "2030-01-01", body: "далеко", mood: null },
  ] }), now);
  assert.deepEqual(p.entries.map((e) => e.date), ["2026-10-11"]);
  assert.equal(p.skipped, 2);
  assert.equal(p.skippedFuture, 2);
});
