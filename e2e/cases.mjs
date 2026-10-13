// Краевые случаи из replica/test-plan.md. Запуск: node e2e/build.mjs && node e2e/cases.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { a11yScan, launch, makeRunner, seedEntries, shots, startServer } from "./helpers.mjs";

mkdirSync(shots, { recursive: true });
const { srv, url } = await startServer();
const browser = await launch();
const { check, summary } = makeRunner();

const T = (iso) => new Date(iso);

async function openApp({ now = "2026-10-11T10:00:00", tz, viewport = { width: 390, height: 844 }, seed, offline, colorScheme = "light", ctx: sharedCtx } = {}) {
  const ctx = sharedCtx ?? (await browser.newContext({ viewport, timezoneId: tz, colorScheme, acceptDownloads: true }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  if (now) await page.clock.setFixedTime(T(now));
  if (seed) {
    await page.addInitScript((s) => {
      if (!localStorage.getItem("seeded")) { localStorage.setItem("seeded", "1"); localStorage.setItem("garden:v1:entries", JSON.stringify(s)); }
    }, seed);
  }
  if (offline) await ctx.setOffline(true);
  await page.goto(url);
  await page.waitForSelector("[data-date]");
  return { ctx, page, errors };
}
const entries = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("garden:v1:entries") || "{}"));
const closeDlg = async (page) => { await page.keyboard.press("Escape"); await page.locator("dialog[open]").waitFor({ state: "detached" }); };
const active = (page) => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);

// ===== F02: посадка цветка, время и часовые пояса =====
await check("F02-E1", "часовой пояс UTC+14: «сегодня» по местной дате, не по UTC", async () => {
  const { ctx, page } = await openApp({ now: "2026-10-12T05:00:00Z", tz: "Pacific/Kiritimati" });
  assert.match(await page.locator("#cell-2026-10-12").getAttribute("aria-label"), /^Сегодня, 12 октября/);
  await ctx.close();
});
await check("F02-E2", "часовой пояс UTC−11: тот же момент, но сегодня 11 октября", async () => {
  const { ctx, page } = await openApp({ now: "2026-10-12T05:00:00Z", tz: "Pacific/Pago_Pago" });
  assert.match(await page.locator("#cell-2026-10-11").getAttribute("aria-label"), /^Сегодня, 11 октября/);
  assert.equal(await page.locator("#cell-2026-10-12").getAttribute("aria-disabled"), "true");
  await page.locator("#cell-2026-10-11").click();
  await page.locator("dialog[open] textarea").fill("поздний вечер");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.locator("dialog[open]").waitFor({ state: "detached" });
  assert.deepEqual(Object.keys(await entries(page)), ["2026-10-11"]);
  await ctx.close();
});
await check("F02-E3", "граница года: в Кирибати уже 1 января 2027, показан 2027", async () => {
  const { ctx, page } = await openApp({ now: "2026-12-31T23:30:00Z", tz: "Pacific/Kiritimati" });
  assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "2027");
  assert.match(await page.locator("#cell-2027-01-01").getAttribute("aria-label"), /^Сегодня, 1 января/);
  await ctx.close();
});
for (const [id, day] of [["F02-E4", "2026-03-29T12:00:00"], ["F02-E5", "2026-10-25T12:00:00"]]) {
  await check(id, `переход на летнее/зимнее время (${day.slice(0, 10)}): дни идут подряд без дыр и дублей`, async () => {
    const { ctx, page } = await openApp({ now: day, tz: "Europe/Berlin" });
    const keys = await page.locator("[data-date]").evaluateAll((els) => els.map((e) => e.dataset.date));
    assert.equal(keys.length, 365);
    let prev = null;
    for (const k of keys) {
      const [y, m, d] = k.split("-").map(Number);
      const t = Date.UTC(y, m - 1, d);
      if (prev !== null) assert.equal((t - prev) / 86400000, 1, `между днями перед ${k}`);
      prev = t;
    }
    assert.match(await page.locator(`#cell-${day.slice(0, 10)}`).getAttribute("aria-label"), /^Сегодня/);
    await ctx.close();
  });
}
await check("F02-E6", "високосный 2028: 366 клеток, 29 февраля и день 366 сохраняются и рисуются", async () => {
  const { ctx, page } = await openApp({ now: "2028-12-31T10:00:00" });
  assert.equal(await page.locator("[data-date]").count(), 366);
  for (const k of ["2028-02-29", "2028-12-31"]) {
    await page.locator(`#cell-${k}`).click();
    await page.locator("dialog[open] textarea").fill("день " + k);
    await page.getByRole("button", { name: "Сохранить" }).click();
    await page.locator("dialog[open]").waitFor({ state: "detached" });
    assert.ok(await page.locator(`#cell-${k} .petal`).count() > 0, k);
  }
  await ctx.close();
});
await check("F02-E7", "полночь при открытой вкладке: «сегодня» переезжает, будущий день открывается", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Madrid" });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date("2026-10-11T23:59:30+02:00") });
  await page.goto(url);
  await page.waitForSelector("[data-date]");
  assert.match(await page.locator("#cell-2026-10-11").getAttribute("aria-label"), /^Сегодня/);
  await page.clock.fastForward("00:01:00");
  await page.waitForFunction(() => /^Сегодня/.test(document.getElementById("cell-2026-10-12")?.getAttribute("aria-label") ?? ""));
  assert.match(await page.locator("#cell-2026-10-11").getAttribute("aria-label"), /^11 октября/);
  assert.equal(await page.locator("#cell-2026-10-12").getAttribute("aria-disabled"), null);
  await ctx.close();
});

// ===== F02/F03: ввод =====
await check("F02-E8", "двойной клик по «Сохранить»: одна запись и никакого клика «сквозь» окно", async () => {
  const { ctx, page, errors } = await openApp({ viewport: { width: 1280, height: 800 } });
  await page.locator("#cell-2026-10-11").click();
  const dlg = page.locator("dialog[open]");
  await dlg.locator("textarea").fill("раз");
  await dlg.getByRole("button", { name: "Сохранить" }).dblclick();
  await page.waitForTimeout(500);
  assert.equal(await page.locator("dialog[open]").count(), 0, "после двойного клика не должно открыться другое окно");
  assert.equal(Object.keys(await entries(page)).length, 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});
await check("F02-E9", "двойной клик по клетке открывает одно окно", async () => {
  const { ctx, page } = await openApp();
  await page.locator("#cell-2026-10-10").dblclick();
  assert.equal(await page.locator("dialog[open]").count(), 1);
  assert.match(await page.locator("dialog[open] h2").innerText(), /10 октября/);
  await ctx.close();
});
await check("F02-E10", "обновление страницы сразу после набора текста: текст не пропадает", async () => {
  const { ctx, page } = await openApp();
  await page.locator("#cell-2026-10-11").click();
  await page.locator("dialog[open] textarea").fill("важная мысль, не успел сохранить");
  await page.reload(); // раньше, чем сработает отложенное сохранение черновика
  await page.waitForSelector("[data-date]");
  await page.locator("#cell-2026-10-11").click();
  assert.equal(await page.locator("dialog[open] textarea").inputValue(), "важная мысль, не успел сохранить");
  await ctx.close();
});
await check("F02-E11", "эмодзи, акценты, иероглифы, RTL-метка: запись, копия, импорт идентичны", async () => {
  const { ctx, page } = await openApp();
  const text = "🌱 Café ñandú naïve 日本語 🏳️‍🌈 👨‍👩‍👧 ‮abc​\nвторая строка";
  await page.locator("#cell-2026-10-11").click();
  await page.locator("dialog[open] textarea").fill(text);
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.locator("dialog[open]").waitFor({ state: "detached" });
  await page.reload();
  await page.waitForSelector("[data-date]");
  assert.equal((await entries(page))["2026-10-11"].body, text);
  await page.getByRole("button", { name: "Копия и настройки" }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("dialog[open]").getByRole("button", { name: /Сохранить копию/ }).click()]);
  const f = join(shots, "emoji-backup.json");
  await dl.saveAs(f);
  await page.evaluate(() => localStorage.setItem("garden:v1:entries", "{}"));
  await page.reload();
  await page.waitForSelector("[data-date]");
  await page.getByRole("button", { name: "Копия и настройки" }).click();
  const d2 = page.locator("dialog[open]");
  await d2.locator('input[type="file"]').setInputFiles(f);
  await d2.getByRole("button", { name: "Загрузить", exact: true }).click();
  assert.equal((await entries(page))["2026-10-11"].body, text);
  await ctx.close();
});
await check("F02-E12", "запись больше квоты LocalStorage: понятная ошибка, текст на месте, дальше всё работает", async () => {
  const { ctx, page, errors } = await openApp();
  await page.locator("#cell-2026-10-11").click();
  const dlg = page.locator("dialog[open]");
  await dlg.locator("textarea").evaluate((el) => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    set.call(el, "слово ".repeat(1_000_000));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await dlg.getByRole("button", { name: "Сохранить" }).click();
  await dlg.getByRole("alert").waitFor();
  assert.match(await dlg.getByRole("alert").innerText(), /кончилось место/);
  assert.equal(Object.keys(await entries(page)).length, 0);
  await dlg.locator("textarea").fill("коротко");
  await dlg.getByRole("button", { name: "Сохранить" }).click();
  await page.locator("dialog[open]").waitFor({ state: "detached" });
  assert.equal((await entries(page))["2026-10-11"].body, "коротко");
  assert.deepEqual(errors.filter((e) => !/Failed to load|quota/i.test(e)), []);
  await ctx.close();
});
await check("F02-E13", "длинная запись (1 млн знаков) сохраняется и открывается заново", async () => {
  const { ctx, page } = await openApp();
  await page.locator("#cell-2026-10-11").click();
  await page.locator("dialog[open] textarea").evaluate((el) => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    set.call(el, "слово ".repeat(170_000));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.locator("dialog[open]").waitFor({ state: "detached" });
  await page.reload();
  await page.waitForSelector("[data-date]");
  await page.locator("#cell-2026-10-11").click();
  assert.equal((await page.locator("dialog[open] textarea").inputValue()).length, "слово ".repeat(170_000).trimEnd().length);
  await ctx.close();
});
await check("F02-E14", "запись только с настроением: растение вырастает, текст пустой, копия цела", async () => {
  const { ctx, page } = await openApp();
  await page.locator("#cell-2026-10-11").click();
  await page.locator("dialog[open]").getByRole("radio", { name: /5 из 5/ }).click();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.locator("dialog[open]").waitFor({ state: "detached" });
  assert.ok(await page.locator("#cell-2026-10-11 .petal").count() > 0);
  const e = (await entries(page))["2026-10-11"];
  assert.deepEqual([e.body, e.mood], ["", 5]);
  await ctx.close();
});
await check("F02-E15", "две вкладки: запись из одной видна в другой, правки разных дней не затирают друг друга", async () => {
  const a = await openApp();
  const b = await openApp({ ctx: a.ctx, now: "2026-10-11T10:00:00" });
  await a.page.locator("#cell-2026-10-10").click();
  await a.page.locator("dialog[open] textarea").fill("из вкладки A");
  await a.page.getByRole("button", { name: "Сохранить" }).click();
  await a.page.locator("dialog[open]").waitFor({ state: "detached" });
  await b.page.waitForFunction(() => /запись/.test(document.getElementById("cell-2026-10-10")?.getAttribute("aria-label") ?? ""), null, { timeout: 5000 });
  await b.page.locator("#cell-2026-10-09").click();
  await b.page.locator("dialog[open] textarea").fill("из вкладки B");
  await b.page.getByRole("button", { name: "Сохранить" }).click();
  await b.page.locator("dialog[open]").waitFor({ state: "detached" });
  const e = await entries(a.page);
  assert.deepEqual(Object.keys(e).sort(), ["2026-10-09", "2026-10-10"]);
  await a.page.waitForFunction(() => /запись/.test(document.getElementById("cell-2026-10-09")?.getAttribute("aria-label") ?? ""), null, { timeout: 5000 });
  await a.ctx.close();
});
await check("F02-E16", "без сети: запись, правка и копия работают (данные локальные)", async () => {
  const { ctx, page } = await openApp();
  await ctx.setOffline(true); // страница уже загружена, дальше сети нет
  await page.locator("#cell-2026-10-11").click();
  await page.locator("dialog[open] textarea").fill("в самолёте");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.locator("dialog[open]").waitFor({ state: "detached" });
  assert.equal(Object.keys(await entries(page)).length, 1);
  await ctx.close();
});
await check("F02-E17", "только клавиатура: от начала страницы до сохранённой записи", async () => {
  const { ctx, page } = await openApp();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement?.textContent?.trim() === "Записать этот день")) break;
  }
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Записать этот день");
  await page.keyboard.press("Enter");
  await page.locator("dialog[open]").waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), "TEXTAREA");
  await page.keyboard.type("набрано без мыши");
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement?.textContent?.trim() === "Сохранить")) break;
  }
  await page.keyboard.press("Enter");
  await page.locator("dialog[open]").waitFor({ state: "detached" });
  assert.equal((await entries(page))["2026-10-11"].body, "набрано без мыши");
  assert.equal(await active(page), "cell-2026-10-11");
  await ctx.close();
});
await check("F02-E18", "фокус не уходит из открытого окна (ловушка фокуса)", async () => {
  const { ctx, page } = await openApp();
  await page.locator("#cell-2026-10-11").click();
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => !!document.activeElement?.closest("dialog") || document.activeElement === document.body), `шаг ${i}`); // body = фокус ушёл в интерфейс браузера, не в страницу под окном
  }
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Shift+Tab");
    assert.ok(await page.evaluate(() => !!document.activeElement?.closest("dialog") || document.activeElement === document.body), `назад, шаг ${i}`);
  }
  await ctx.close();
});
await check("F02-E19", "клик по затемнению закрывает окно и сохраняет черновик; клик внутри не закрывает", async () => {
  const { ctx, page } = await openApp({ viewport: { width: 1280, height: 800 } });
  await page.locator("#cell-2026-10-11").click();
  const dlg = page.locator("dialog[open]");
  await dlg.locator("textarea").fill("черновик у края");
  await dlg.locator("h2").click();
  await dlg.getByText("Дата").click();
  assert.equal(await page.locator("dialog[open]").count(), 1);
  await page.mouse.click(10, 10);
  await page.locator("dialog[open]").waitFor({ state: "detached" });
  await page.waitForTimeout(100);
  assert.match(await page.evaluate(() => localStorage.getItem("garden:v1:draft:2026-10-11")), /черновик у края/);
  await ctx.close();
});
await check("F02-N1", "поле даты очищено: дата не теряется, ошибок нет", async () => {
  const { ctx, page, errors } = await openApp();
  await page.locator("#cell-2026-10-11").click();
  const input = page.locator("dialog[open]").getByLabel("Дата");
  await input.fill("");
  assert.equal(await input.inputValue(), "2026-10-11");
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ===== F03: просмотр, правка, удаление =====
await check("F03-E1", "удалена последняя запись дня: клетка снова семя, в копии записи нет", async () => {
  const { ctx, page } = await openApp({ seed: seedEntries([["2026-10-10", "одна", 3]]) });
  await page.locator("#cell-2026-10-10").click();
  await page.getByRole("button", { name: "Удалить запись" }).click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await page.locator("dialog[open]").waitFor({ state: "detached" });
  assert.equal(Object.keys(await entries(page)).length, 0);
  assert.equal(await active(page), "cell-2026-10-10");
  await ctx.close();
});
await check("F03-E2", "«Вернуть» после исчезновения тоста недоступно, а запись не вернулась сама", async () => {
  const { ctx, page } = await openApp({ seed: seedEntries([["2026-10-10", "одна", 3]]) });
  await page.locator("#cell-2026-10-10").click();
  await page.getByRole("button", { name: "Удалить запись" }).click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await page.locator("dialog[open]").waitFor({ state: "detached" });
  assert.ok(await page.getByRole("button", { name: "Вернуть" }).isVisible());
  await ctx.close();
});

// ===== F04: годы =====
await check("F04-E1", "запись из 1999 (импорт) достижима: переход по годам доходит до неё", async () => {
  const { ctx, page } = await openApp({ seed: seedEntries([["1999-05-05", "давно", 2]]) });
  for (let i = 0; i < 27; i++) await page.getByRole("button", { name: "Предыдущий год" }).click();
  assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "1999");
  assert.match(await page.locator("#cell-1999-05-05").getAttribute("aria-label"), /запись/);
  await ctx.close();
});
await check("F04-E2", "пустой прошлый год: 365 семян, окно открывается, сохранение уходит в нужный год", async () => {
  const { ctx, page } = await openApp();
  await page.getByRole("button", { name: "Предыдущий год" }).click();
  assert.equal(await page.locator("[data-date]").count(), 365);
  await page.locator("#cell-2025-12-31").click();
  assert.match(await page.locator("dialog[open] h2").innerText(), /31 декабря 2025/);
  await page.locator("dialog[open] textarea").fill("канун");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.locator("dialog[open]").waitFor({ state: "detached" });
  assert.ok(await page.locator("#cell-2025-12-31 .petal").count() > 0);
  await ctx.close();
});
await check("F04-E3", "сохранение даты из другого года внутри окна переключает сад на тот год", async () => {
  const { ctx, page } = await openApp();
  await page.locator("#cell-2026-10-11").click();
  const dlg = page.locator("dialog[open]");
  await dlg.getByLabel("Дата").fill("2024-02-29");
  await dlg.locator("textarea").fill("високосный день");
  await dlg.getByRole("button", { name: "Сохранить" }).click();
  await page.locator("dialog[open]").waitFor({ state: "detached" });
  assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "2024");
  assert.ok(await page.locator("#cell-2024-02-29 .petal").count() > 0);
  await ctx.close();
});

// ===== Копия: импорт и экспорт =====
const importFile = async (page, name, obj, { mode } = {}) => {
  const f = join(shots, name);
  writeFileSync(f, typeof obj === "string" ? obj : JSON.stringify(obj));
  const dlg = page.locator("dialog[open]");
  await dlg.locator('input[type="file"]').setInputFiles(f);
  return dlg;
};
await check("B01-E1", "тот же файл дважды: второй импорт ничего не меняет", async () => {
  const seed = seedEntries([["2026-10-09", "a", 1], ["2026-10-10", "b", null]]);
  const { ctx, page } = await openApp({ seed });
  await page.getByRole("button", { name: "Копия и настройки" }).click();
  const file = { app: "garden-journal", version: 1, entries: Object.values(seed) };
  let dlg = await importFile(page, "same.json", file);
  await dlg.getByText(/Без изменений: 2/).waitFor();
  await dlg.getByRole("button", { name: "Загрузить", exact: true }).click();
  assert.deepEqual(await entries(page), seed);
  dlg = await importFile(page, "same.json", file);
  await dlg.getByText(/Новых: 0\. Обновится: 0/).waitFor();
  await ctx.close();
});
await check("B01-E2", "запись из будущего в файле не попадает в сад (её нельзя было бы открыть и удалить)", async () => {
  const { ctx, page } = await openApp();
  await page.getByRole("button", { name: "Копия и настройки" }).click();
  const file = { app: "garden-journal", version: 1, entries: [
    { date: "2030-05-05", body: "из будущего", mood: 3, createdAt: 1, updatedAt: 1 },
    { date: "2026-10-12", body: "завтра", mood: 3, createdAt: 1, updatedAt: 1 },
    { date: "2026-10-10", body: "вчера", mood: 3, createdAt: 1, updatedAt: 1 },
  ] };
  const dlg = await importFile(page, "future.json", file);
  await dlg.getByText(/Файл «future.json»/).waitFor();
  await dlg.getByRole("button", { name: "Загрузить", exact: true }).click();
  assert.deepEqual(Object.keys(await entries(page)), ["2026-10-10"]);
  await ctx.close();
});
await check("B01-E3", "записи с битым настроением/датой пропускаются, остальные грузятся, пропуск показан", async () => {
  const { ctx, page } = await openApp();
  await page.getByRole("button", { name: "Копия и настройки" }).click();
  const file = { app: "garden-journal", version: 1, entries: [
    { date: "2026-10-10", body: "ок", mood: 3 },
    { date: "2026-10-09", body: "плохое настроение", mood: 9 },
    { date: "2026-02-30", body: "нет такой даты", mood: 1 },
    { date: "2026-10-08", body: 5, mood: 1 },
    null, "строка", 7,
  ] };
  const dlg = await importFile(page, "mixed.json", file);
  await dlg.getByText(/пропущено/).waitFor();
  await dlg.getByRole("button", { name: "Загрузить", exact: true }).click();
  assert.deepEqual(Object.keys(await entries(page)), ["2026-10-10"]);
  await ctx.close();
});
await check("B01-E4", "огромный файл и файл с 20 001 записью отклоняются без зависания", async () => {
  const { ctx, page } = await openApp();
  await page.getByRole("button", { name: "Копия и настройки" }).click();
  const many = { app: "garden-journal", version: 1, entries: Array.from({ length: 20001 }, (_, i) => ({ date: "2026-01-01", body: String(i), mood: 1 })) };
  let dlg = await importFile(page, "many.json", many);
  await dlg.getByRole("alert").filter({ hasText: /слишком много записей/ }).waitFor();
  dlg = await importFile(page, "huge.json", " ".repeat(11 * 1024 * 1024));
  await dlg.getByRole("alert").filter({ hasText: /слишком большой/ }).waitFor();
  await ctx.close();
});
await check("B01-E5", "режим «заменить» с пустым файлом записей стирает всё, но только после явного выбора и с предупреждением", async () => {
  const seed = seedEntries([["2026-10-09", "a", 1], ["2026-10-10", "b", null]]);
  const { ctx, page } = await openApp({ seed });
  await page.getByRole("button", { name: "Копия и настройки" }).click();
  const dlg = await importFile(page, "empty.json", { app: "garden-journal", version: 1, entries: [] });
  await dlg.getByText(/Файл «empty.json»/).waitFor();
  assert.equal(Object.keys(await entries(page)).length, 2, "до нажатия кнопки ничего не меняется");
  await dlg.getByLabel("Заменить всё содержимым файла").check();
  assert.ok(await dlg.getByRole("alert").filter({ hasText: /Исчезнет записей/ }).isVisible());
  await ctx.close();
});
await check("B01-E6", "экспорт отключён, пока записей нет", async () => {
  const { ctx, page } = await openApp();
  await page.getByRole("button", { name: "Копия и настройки" }).click();
  assert.ok(await page.locator("dialog[open]").getByRole("button", { name: /Сохранить копию/ }).isDisabled());
  await ctx.close();
});
await check("B01-E7", "после 14 изменений без копии показан баннер; «Позже» прячет, «Сохранить копию» ведёт в панель", async () => {
  const { ctx, page } = await openApp();
  for (let d = 1; d <= 14; d++) {
    await page.locator(`#cell-2026-09-${String(d).padStart(2, "0")}`).click();
    await page.locator("dialog[open] textarea").fill("запись " + d);
    await page.getByRole("button", { name: "Сохранить" }).click();
    await page.locator("dialog[open]").waitFor({ state: "detached" });
  }
  assert.ok(await page.getByText("Давно не было копии").isVisible());
  await page.getByRole("button", { name: "Позже" }).click();
  assert.equal(await page.getByText("Давно не было копии").count(), 0);
  await page.reload();
  await page.waitForSelector("[data-date]");
  assert.equal(await page.getByText("Давно не было копии").count(), 0, "отложено и после перезагрузки");
  await ctx.close();
});

// ===== Доступность (замена axe: его нельзя установить без npm) =====
for (const scheme of ["light", "dark"]) {
  await check(`A11Y-${scheme}`, `скан доступности: сад, окно записи, панель копий (${scheme})`, async () => {
    const seed = seedEntries([["2026-10-09", "a", 1], ["2026-10-10", "b", null]]);
    const { ctx, page } = await openApp({ seed, colorScheme: scheme });
    assert.deepEqual(await a11yScan(page), [], "сад");
    await page.locator("#cell-2026-10-10").click();
    assert.deepEqual(await a11yScan(page), [], "окно записи");
    await closeDlg(page);
    await page.getByRole("button", { name: "Копия и настройки" }).click();
    const f = join(shots, "a11y.json");
    writeFileSync(f, JSON.stringify({ app: "garden-journal", version: 1, entries: Object.values(seed) }));
    await page.locator("dialog[open]").locator('input[type="file"]').setInputFiles(f);
    await page.getByText(/Файл «a11y.json»/).waitFor();
    assert.deepEqual(await a11yScan(page), [], "панель копий с превью импорта");
    await ctx.close();
  });
}
await check("A11Y-zoom", "увеличение шрифта и масштаб 200%: нет горизонтальной прокрутки на 320 px", async () => {
  const { ctx, page } = await openApp({ viewport: { width: 320, height: 640 } });
  await page.addStyleTag({ content: "html{font-size:200%}" });
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert.equal(sw[0], sw[1]);
  await ctx.close();
});

const bad = summary();
await browser.close();
srv.close();
process.exit(bad ? 1 : 0);
