// Проверка в настоящем Chromium: Playwright против сборки из build.mjs.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const req = createRequire("/opt/npm-tools/node_modules/");
const { chromium } = req("playwright");
const shots = join(here, "shots");
mkdirSync(shots, { recursive: true });
import { startServer } from "./helpers.mjs";
const { srv, url: URL } = await startServer();
const NOW = new Date("2026-10-11T10:00:00");

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(["ok", name]);
    console.log("ok   ", name);
  } catch (e) {
    results.push(["FAIL", name, String(e.message).split("\n")[0]]);
    console.log("FAIL ", name, "\n      ", String(e.message).split("\n").slice(0, 4).join("\n       "));
  }
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

async function open(viewport, { seed, settings, colorScheme = "light", reducedMotion } = {}) {
  const ctx = await browser.newContext({ viewport, colorScheme, reducedMotion, acceptDownloads: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.clock.setFixedTime(NOW);
  if (seed || settings) {
    await page.addInitScript(([s, st]) => {
      if (localStorage.getItem("seeded")) return;
      localStorage.setItem("seeded", "1");
      if (s) localStorage.setItem("garden:v1:entries", JSON.stringify(s));
      if (st) localStorage.setItem("garden:v1:settings", JSON.stringify(st));
    }, [seed, settings]);
  }
  await page.goto(URL);
  await page.waitForSelector("[data-date]");
  return { ctx, page, errors };
}

function makeSeed() {
  const e = {};
  const bodies = ["Тихий день.", "Долго гулял у реки.", "Устал, но доволен.", "Дождь весь день.", "Позвонила сестра."];
  let t = Date.parse("2026-01-01T09:00:00");
  for (let d = 0; d < 284; d++) {
    if ((d * 7) % 11 < 4) continue; // дыры
    const date = new Date(2026, 0, 1 + d);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const mood = (d * 5) % 7 === 0 ? null : ((d * 3) % 5) + 1;
    e[key] = { date: key, body: bodies[d % 5], mood, createdAt: t + d, updatedAt: t + d };
  }
  return e;
}

// ---------- 390px: пустой сад и главный цикл ----------
{
  const { ctx, page, errors } = await open({ width: 390, height: 844 });
  const external = [];
  page.on("request", (r) => { if (!/^(http:\/\/127\.0\.0\.1:|data:|blob:)/.test(r.url())) external.push(r.url()); });

  await check("mobile: 365 клеток, сегодняшняя помечена, будущее не активно", async () => {
    assert.equal(await page.locator("[data-date]").count(), 365);
    const today = page.locator("#cell-2026-10-11");
    assert.match(await today.getAttribute("aria-label"), /^Сегодня, 11 октября, записи нет$/);
    assert.equal(await page.locator("#cell-2026-10-12").getAttribute("aria-disabled"), "true");
    assert.match(await page.locator("#cell-2026-10-12").getAttribute("aria-label"), /ещё не наступило/);
    assert.ok(await page.getByText("Пока здесь одни семена").isVisible());
  });
  await page.screenshot({ path: join(shots, "S02-empty-390.png") });

  await check("мобильная вёрстка: нет горизонтальной прокрутки, клетка не меньше 36px", async () => {
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    assert.equal(sw[0], sw[1]);
    const box = await page.locator("#cell-2026-10-11").boundingBox();
    assert.ok(box.width >= 36 && box.width <= 52, `width ${box.width}`);
  });

  await check("будущий день: тост вместо окна", async () => {
    await page.locator("#cell-2026-10-12").click({ force: true }); // Playwright считает aria-disabled недоступным, пользователь нет
    assert.ok(await page.getByText("Завтра ещё не наступило.").isVisible());
    assert.equal(await page.locator("dialog[open]").count(), 0);
  });

  await check("окно записи: открытие, Сохранить выключена без содержимого", async () => {
    await page.locator("#cell-2026-10-11").click();
    const dlg = page.locator("dialog[open]");
    await dlg.waitFor();
    assert.match(await dlg.getByRole("heading", { level: 2 }).innerText(), /воскресенье, 11 октября/i);
    assert.ok(await dlg.getByRole("button", { name: "Сохранить" }).isDisabled());
    assert.ok(await dlg.getByLabel("Запись дня").evaluate((el) => el === document.activeElement), "фокус должен быть в поле текста");
    const fs = await dlg.getByLabel("Запись дня").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    assert.ok(fs >= 16, "шрифт поля ≥ 16px");
  });

  await check("ввод текста и настроения, сохранение, растение в клетке", async () => {
    const dlg = page.locator("dialog[open]");
    await dlg.getByLabel("Запись дня").fill("Первый день в саду.\nПосадил семя.");
    await dlg.getByRole("radio", { name: /4 из 5, хорошо/ }).click();
    assert.equal(await dlg.getByRole("radio", { name: /4 из 5/ }).getAttribute("aria-checked"), "true");
    await page.screenshot({ path: join(shots, "S03-modal-390.png") });
    await dlg.getByRole("button", { name: "Сохранить" }).click();
    await page.locator("dialog[open]").waitFor({ state: "detached" });
    assert.ok(await page.getByText("Записано. Растение уже в саду.").isVisible());
    assert.match(await page.locator("#cell-2026-10-11").getAttribute("aria-label"), /запись, настроение: хорошо/);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("garden:v1:entries")));
    assert.equal(stored["2026-10-11"].body, "Первый день в саду.\nПосадил семя.");
    assert.equal(stored["2026-10-11"].mood, 4);
    assert.ok(await page.locator("#cell-2026-10-11 svg .petal").count() > 0, "цветок нарисован");
  });

  await check("после перезагрузки запись на месте", async () => {
    await page.reload();
    await page.waitForSelector("[data-date]");
    assert.match(await page.locator("#cell-2026-10-11").getAttribute("aria-label"), /запись, настроение: хорошо/);
  });

  await check("редактирование: окно показывает сохранённое, правка обновляет, createdAt не меняется", async () => {
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("garden:v1:entries"))["2026-10-11"]);
    await page.locator("#cell-2026-10-11").click();
    const dlg = page.locator("dialog[open]");
    assert.equal(await dlg.getByLabel("Запись дня").inputValue(), "Первый день в саду.\nПосадил семя.");
    assert.equal(await dlg.getByRole("radio", { name: /4 из 5/ }).getAttribute("aria-checked"), "true");
    await dlg.getByLabel("Запись дня").fill("Правка.");
    await dlg.getByRole("button", { name: "Сохранить" }).click();
    await page.locator("dialog[open]").waitFor({ state: "detached" });
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem("garden:v1:entries"))["2026-10-11"]);
    assert.equal(after.body, "Правка.");
    assert.equal(after.createdAt, before.createdAt);
    assert.equal(Object.keys(await page.evaluate(() => JSON.parse(localStorage.getItem("garden:v1:entries")))).length, 1);
  });

  await check("смена даты в окне: другая запись загружается, набранное уходит в черновик", async () => {
    await page.locator("#cell-2026-10-10").click();
    const dlg = page.locator("dialog[open]");
    await dlg.getByLabel("Запись дня").fill("Вчерашний черновик");
    await dlg.getByLabel("Дата").fill("2026-10-11");
    assert.equal(await dlg.getByLabel("Запись дня").inputValue(), "Правка.");
    await dlg.getByLabel("Дата").fill("2026-10-10");
    assert.equal(await dlg.getByLabel("Запись дня").inputValue(), "Вчерашний черновик");
    assert.ok(await dlg.getByText("Черновик восстановлен").isVisible());
    await dlg.getByLabel("Дата").fill("2026-10-12"); // будущее
    assert.ok(await dlg.getByRole("alert").getByText("Завтра ещё не наступило.").isVisible());
    await page.keyboard.press("Escape");
    await page.locator("dialog[open]").waitFor({ state: "detached" });
  });

  await check("Esc сохраняет черновик; при повторном открытии он восстановлен; фокус вернулся на клетку", async () => {
    assert.equal(await page.evaluate(() => document.activeElement?.id), "cell-2026-10-10");
    await page.waitForTimeout(100);
    const draft = await page.evaluate(() => localStorage.getItem("garden:v1:draft:2026-10-10"));
    assert.match(draft, /Вчерашний черновик/);
    await page.locator("#cell-2026-10-10").click();
    const dlg = page.locator("dialog[open]");
    assert.equal(await dlg.getByLabel("Запись дня").inputValue(), "Вчерашний черновик");
    await dlg.getByRole("button", { name: "Сбросить" }).click();
    assert.equal(await dlg.getByLabel("Запись дня").inputValue(), "");
    await page.keyboard.press("Escape");
    await page.locator("dialog[open]").waitFor({ state: "detached" });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => localStorage.getItem("garden:v1:draft:2026-10-10")), null);
  });

  await check("удаление с подтверждением и «Вернуть»", async () => {
    await page.locator("#cell-2026-10-11").click();
    const dlg = page.locator("dialog[open]");
    await dlg.getByRole("button", { name: "Удалить запись" }).click();
    assert.ok(await dlg.getByText("Удалить запись за 11 октября? Растение снова станет семенем.").isVisible());
    await dlg.getByRole("button", { name: "Удалить", exact: true }).click();
    await page.locator("dialog[open]").waitFor({ state: "detached" });
    assert.match(await page.locator("#cell-2026-10-11").getAttribute("aria-label"), /записи нет/);
    await page.getByRole("button", { name: "Вернуть" }).click();
    assert.match(await page.locator("#cell-2026-10-11").getAttribute("aria-label"), /запись/);
    const e = await page.evaluate(() => JSON.parse(localStorage.getItem("garden:v1:entries"))["2026-10-11"]);
    assert.equal(e.body, "Правка.");
  });

  await check("клавиатура: стрелки, Enter открывает окно, Esc закрывает", async () => {
    await page.locator("#cell-2026-10-11").focus();
    await page.keyboard.press("ArrowLeft");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "cell-2026-10-10");
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "cell-2026-10-17");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Home");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "cell-2026-10-01");
    await page.keyboard.press("PageUp");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "cell-2026-09-01");
    await page.keyboard.press("End");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "cell-2026-09-30");
    assert.equal(await page.locator('[data-date][tabindex="0"]').count(), 1);
    await page.keyboard.press("Enter");
    await page.locator("dialog[open]").waitFor();
    await page.keyboard.press("Escape");
    await page.locator("dialog[open]").waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => document.activeElement?.id), "cell-2026-09-30");
  });

  await check("настроение с клавиатуры: стрелки меняют выбор", async () => {
    await page.locator("#cell-2026-10-09").click();
    const dlg = page.locator("dialog[open]");
    await dlg.getByRole("radio", { name: /3 из 5/ }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await dlg.getByRole("radio", { name: /4 из 5/ }).getAttribute("aria-checked"), "true");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    assert.equal(await dlg.getByRole("radio", { name: /2 из 5/ }).getAttribute("aria-checked"), "true");
    await dlg.getByRole("radio", { name: /2 из 5/ }).click(); // повторный клик снимает
    assert.equal(await dlg.getByRole("radio", { name: /2 из 5/ }).getAttribute("aria-checked"), "false");
    await page.keyboard.press("Escape");
    await page.locator("dialog[open]").waitFor({ state: "detached" });
  });

  await check("пустая запись без текста и настроения не сохраняется", async () => {
    await page.locator("#cell-2026-10-08").click();
    const dlg = page.locator("dialog[open]");
    await dlg.getByLabel("Запись дня").fill("   ");
    assert.ok(await dlg.getByRole("button", { name: "Сохранить" }).isDisabled());
    await page.keyboard.press("Escape");
    await page.locator("dialog[open]").waitFor({ state: "detached" });
  });

  await check("мобильная: окно прижато к низу и не выше 92% экрана", async () => {
    await page.locator("#cell-2026-10-08").click();
    await page.waitForTimeout(400); // дождаться анимации выезда
    const box = await page.locator("dialog[open]").boundingBox();
    assert.ok(Math.abs(box.y + box.height - 844) < 2, `низ окна ${box.y + box.height}`);
    assert.ok(box.height <= 844 * 0.92 + 1);
    assert.equal(Math.round(box.width), 390);
    await page.keyboard.press("Escape");
    await page.locator("dialog[open]").waitFor({ state: "detached" });
  });

  await check("ни одного внешнего запроса за весь сценарий (кроме собственных файлов)", async () => assert.deepEqual(external, []));
  await check("консоль без ошибок (мобильный сценарий)", async () => assert.deepEqual(errors, [], JSON.stringify(errors)));
  await ctx.close();
}

// ---------- Копия: экспорт и импорт ----------
{
  const seed = makeSeed();
  const { ctx, page, errors } = await open({ width: 390, height: 844 }, { seed });
  const n = Object.keys(seed).length;

  await check("баннер «давно не было копии» при многих изменениях/без копии не показывается на импортированных данных без правок", async () => {
    // seed записан напрямую: изменений с последней копии нет и firstChangeAt нет -> баннера нет
    assert.equal(await page.getByText("Давно не было копии").count(), 0);
  });

  let exported;
  await check("экспорт: скачивается .json с именем по дате, содержимое полное", async () => {
    await page.getByRole("button", { name: "Копия и настройки" }).click();
    const dlg = page.locator("dialog[open]");
    const [dl] = await Promise.all([page.waitForEvent("download"), dlg.getByRole("button", { name: /Сохранить копию/ }).click()]);
    assert.equal(dl.suggestedFilename(), "garden-backup-2026-10-11.json");
    const path = join(shots, "backup.json");
    await dl.saveAs(path);
    exported = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(exported.app, "garden-journal");
    assert.equal(exported.version, 1);
    assert.equal(exported.entries.length, n);
    assert.deepEqual(Object.fromEntries(exported.entries.map((e) => [e.date, e])), seed);
    assert.ok(await page.getByText("Копия сохранена файлом").isVisible());
    const meta = await page.evaluate(() => JSON.parse(localStorage.getItem("garden:v1:meta")));
    assert.ok(meta.lastBackupAt > 0);
    assert.equal(meta.changesSinceBackup, 0);
  });

  await check("импорт «заменить» после очистки: все записи возвращаются", async () => {
    await page.evaluate(() => localStorage.setItem("garden:v1:entries", "{}"));
    await page.reload();
    await page.waitForSelector("[data-date]");
    assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("garden:v1:entries"))).length), 0);
    await page.getByRole("button", { name: "Копия и настройки" }).click();
    const dlg = page.locator("dialog[open]");
    await dlg.locator('input[type="file"]').setInputFiles(join(shots, "backup.json"));
    await dlg.getByText(/Файл «backup.json»/).waitFor();
    assert.ok(await dlg.getByText(new RegExp(`Новых: ${n}`)).isVisible());
    await dlg.getByLabel("Заменить всё содержимым файла").check();
    await dlg.getByRole("button", { name: "Загрузить", exact: true }).click();
    assert.ok(await page.getByText(/Записи заменены/).isVisible());
    const back = await page.evaluate(() => JSON.parse(localStorage.getItem("garden:v1:entries")));
    assert.deepEqual(back, seed);
  });

  await check("импорт «добавить»: свежая правка в приложении не затирается более старой из файла", async () => {
    const stale = structuredClone(exported);
    stale.entries[0].body = "из старого файла";
    stale.entries[0].updatedAt = 1;
    stale.entries.push({ date: "2025-12-31", body: "прошлый год", mood: 2, createdAt: 5, updatedAt: 5 });
    writeFileSync(join(shots, "stale.json"), JSON.stringify(stale));
    const dlg = page.locator("dialog[open]");
    await dlg.locator('input[type="file"]').setInputFiles(join(shots, "stale.json"));
    await dlg.getByText(/Файл «stale.json»/).waitFor();
    await dlg.getByLabel("Добавить к текущим").check();
    await dlg.getByRole("button", { name: "Загрузить", exact: true }).click();
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem("garden:v1:entries")));
    assert.equal(after[exported.entries[0].date].body, seed[exported.entries[0].date].body);
    assert.equal(after["2025-12-31"].body, "прошлый год");
  });

  await check("плохие файлы: понятная ошибка, данные не тронуты", async () => {
    const dlg = page.locator("dialog[open]");
    const before = await page.evaluate(() => localStorage.getItem("garden:v1:entries"));
    for (const [name, content, re] of [
      ["bad1.json", "это не json", /не файл копии/],
      ["bad2.json", JSON.stringify({ app: "other", version: 1, entries: [] }), /другого приложения/],
      ["bad3.json", JSON.stringify({ app: "garden-journal", version: 9, entries: [] }), /более новой версией/],
    ]) {
      writeFileSync(join(shots, name), content);
      await dlg.locator('input[type="file"]').setInputFiles(join(shots, name));
      await dlg.getByRole("alert").filter({ hasText: re }).waitFor();
    }
    assert.equal(await page.evaluate(() => localStorage.getItem("garden:v1:entries")), before);
  });
  await page.screenshot({ path: join(shots, "S10-backup-390.png") });

  await check("консоль без ошибок (копии)", async () => assert.deepEqual(errors, []));
  await ctx.close();
}

// ---------- 1440px: заполненный сад, темы, палитры ----------
{
  const seed = makeSeed();
  const { ctx, page, errors } = await open({ width: 1440, height: 900 }, { seed });
  await check("desktop: три месяца в ряд, сад не шире 1120px", async () => {
    const a = await page.locator("section h2").nth(0).boundingBox();
    const b = await page.locator("section h2").nth(1).boundingBox();
    const c = await page.locator("section h2").nth(2).boundingBox();
    assert.ok(Math.abs(a.y - b.y) < 2 && Math.abs(b.y - c.y) < 2, "первые три месяца в одном ряду");
    const m = await page.locator("main").boundingBox();
    assert.ok(m.width <= 1120 + 1, `main ${m.width}`);
  });
  await page.screenshot({ path: join(shots, "S02-garden-1440.png"), fullPage: true });

  await check("тёмная тема и палитра для дальтоников применяются из настроек", async () => {
    await page.getByRole("button", { name: "Копия и настройки" }).click();
    const dlg = page.locator("dialog[open]");
    await dlg.getByLabel("Тема").selectOption("dark");
    await dlg.getByLabel("Цвета настроений").selectOption("cvd");
    await dlg.getByLabel("Листва").selectOption("autumn");
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "dark");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bg, "rgb(26, 21, 23)");
    const mood1 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--mood-1").trim().toLowerCase());
    assert.equal(mood1, "#5b7fe0");
    await page.keyboard.press("Escape");
    await page.locator("dialog[open]").waitFor({ state: "detached" });
    await page.screenshot({ path: join(shots, "S02-garden-1440-dark-cvd.png"), fullPage: true });
    await page.reload();
    await page.waitForSelector("[data-date]");
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "dark");
  });

  await check("настройка «мелкий» размер клеток", async () => {
    await page.getByRole("button", { name: "Копия и настройки" }).click();
    await page.locator("dialog[open]").getByLabel("Размер клеток").selectOption("compact");
    await page.keyboard.press("Escape");
    await page.locator("dialog[open]").waitFor({ state: "detached" });
    assert.equal(await page.locator("#cell-2026-03-03 span.text-xs").count(), 0);
  });

  await check("навигация по годам: назад, и вперёд не дальше текущего", async () => {
    await page.getByRole("button", { name: "Предыдущий год" }).click();
    assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "2025");
    assert.equal(await page.locator("[data-date]").count(), 365);
    await page.getByRole("button", { name: "Следующий год" }).click();
    assert.ok(await page.getByRole("button", { name: "Следующий год" }).isDisabled());
    await page.getByRole("button", { name: "К сегодня" }).click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "cell-2026-10-11");
  });
  await check("консоль без ошибок (desktop)", async () => assert.deepEqual(errors, []));
  await ctx.close();
}

// ---------- Крайние случаи ----------
{
  const { ctx, page, errors } = await open({ width: 320, height: 640 }, { seed: { "2026-10-10": { date: "2026-10-10", body: "А".repeat(5000) + "\nконец", mood: 5, createdAt: 1, updatedAt: 1 } } });
  await check("320px: нет горизонтальной прокрутки; длинная запись открывается, поле растёт не выше 12 строк", async () => {
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    assert.equal(sw[0], sw[1]);
    await page.locator("#cell-2026-10-10").click();
    const ta = page.locator("dialog[open] textarea");
    const h = (await ta.boundingBox()).height;
    assert.ok(h <= 26 * 12 + 24 + 1, `высота ${h}`);
    const w = await page.evaluate(() => document.querySelector("dialog[open]").scrollWidth <= window.innerWidth);
    assert.ok(w);
    await page.screenshot({ path: join(shots, "S03-modal-320-long.png") });
  });
  await check("повреждённое хранилище: приложение живо, сырые данные отложены, предупреждение показано", async () => {
    await ctx.close();
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p2 = await c2.newPage();
    const errs = [];
    p2.on("pageerror", (e) => errs.push(e.message));
    await p2.clock.setFixedTime(NOW);
    await p2.addInitScript(() => { if (!localStorage.getItem("x")) { localStorage.setItem("x", "1"); localStorage.setItem("garden:v1:entries", "{broken"); } });
    await p2.goto(URL);
    await p2.waitForSelector("[data-date]");
    assert.ok(await p2.getByText(/Часть сохранённых записей не удалось прочитать/).isVisible());
    const keys = await p2.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("garden:v1:rescue:")));
    assert.equal(keys.length, 1);
    assert.deepEqual(errs, []);
    await c2.close();
  });
  await check("localStorage недоступен: приложение работает в памяти и предупреждает", async () => {
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p3 = await c3.newPage();
    const errs = [];
    p3.on("pageerror", (e) => errs.push(e.message));
    await p3.clock.setFixedTime(NOW);
    await p3.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { get() { throw new DOMException("denied", "SecurityError"); } });
    });
    await p3.goto(URL);
    await p3.waitForSelector("[data-date]");
    assert.ok(await p3.getByText(/Браузер не сохраняет данные сайта/).isVisible());
    await p3.locator("#cell-2026-10-11").click();
    await p3.locator("dialog[open] textarea").fill("в памяти");
    await p3.getByRole("button", { name: "Сохранить" }).click();
    await p3.locator("dialog[open]").waitFor({ state: "detached" });
    assert.match(await p3.locator("#cell-2026-10-11").getAttribute("aria-label"), /запись/);
    assert.deepEqual(errs, []);
    await c3.close();
  });
  await check("нехватка места: ошибка в окне, текст остаётся, запись не появляется", async () => {
    const c4 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p4 = await c4.newPage();
    await p4.clock.setFixedTime(NOW);
    await p4.addInitScript(() => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === "garden:v1:entries") { const e = new DOMException("full", "QuotaExceededError"); throw e; }
        return orig.call(this, k, v);
      };
    });
    await p4.goto(URL);
    await p4.waitForSelector("[data-date]");
    await p4.locator("#cell-2026-10-11").click();
    const dlg = p4.locator("dialog[open]");
    await dlg.locator("textarea").fill("не влезет");
    await dlg.getByRole("button", { name: "Сохранить" }).click();
    assert.ok(await dlg.getByRole("alert").getByText("Не удалось сохранить: на телефоне кончилось место. Текст остался на экране.").isVisible());
    assert.equal(await dlg.locator("textarea").inputValue(), "не влезет");
    assert.ok(await dlg.getByRole("button", { name: "Сохранить" }).isEnabled(), "можно повторить");
    await c4.close();
  });
}

// ---------- reduced motion ----------
{
  const { ctx, page } = await open({ width: 390, height: 844 }, { reducedMotion: "reduce" });
  await check("prefers-reduced-motion: растение появляется сразу выросшим", async () => {
    await page.locator("#cell-2026-10-11").click();
    await page.locator("dialog[open] textarea").fill("тест");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await page.locator("dialog[open]").waitFor({ state: "detached" });
    const t = await page.evaluate(() => {
      const el = document.querySelector("#cell-2026-10-11 .stem");
      return el ? getComputedStyle(el).strokeDashoffset : "none";
    });
    // у записи без настроения растение всё равно рисуется
    assert.ok(t === "0px" || t === "0" || t === "none", `strokeDashoffset ${t}`);
  });
  await ctx.close();
}

await browser.close();
srv.close();
const failed = results.filter((r) => r[0] === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} проверок прошли`);
process.exit(failed.length ? 1 : 0);
