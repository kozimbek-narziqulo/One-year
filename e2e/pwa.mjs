// Проверка PWA в Chromium: манифест, значки, установимость, service worker, работа без сети, обновление версии.
// Запуск: node e2e/build.mjs && node e2e/pwa.mjs
import { cpSync, rmSync, readFileSync, appendFileSync, mkdirSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { launch, makeRunner, startServer } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const work = join(here, ".build-pwa");
rmSync(work, { recursive: true, force: true });
cpSync(join(here, ".build"), work, { recursive: true });
const { srv, url } = await startServer(work);
const origin = new URL(url).origin;
const browser = await launch();
const { check, summary } = makeRunner();
const NOW = new Date("2026-10-11T10:00:00");

/** «Выкладка» новой версии: sw.js собирается отдельно и подменяется одним переименованием (как при настоящей выкладке). */
function publishNewVersion(note) {
  appendFileSync(join(work, "app.js"), `\n/* ${note} */\n`);
  const tmp = join(here, ".build-pwa-tmp");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp);
  cpSync(join(work, "app.js"), join(tmp, "app.js"));
  cpSync(join(root, "public/sw.js"), join(tmp, "sw.js"));
  // список файлов берём из рабочей папки: собираем в ней копию sw.js под другим именем
  const probe = join(here, ".build-pwa-probe");
  rmSync(probe, { recursive: true, force: true });
  cpSync(work, probe, { recursive: true });
  cpSync(join(root, "public/sw.js"), join(probe, "sw.js"));
  execFileSync("node", [join(root, "scripts/build-sw.mjs"), probe], { stdio: "pipe" });
  renameSync(join(probe, "sw.js"), join(work, "sw.js.new"));
  renameSync(join(work, "sw.js.new"), join(work, "sw.js"));
  rmSync(tmp, { recursive: true, force: true });
  rmSync(probe, { recursive: true, force: true });
}

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
await page.clock.setFixedTime(NOW);
await page.goto(url);
await page.waitForSelector("[data-date]");

await check("PWA-1", "manifest.json: поля, цвета, значки существуют и совпадают по размеру", async () => {
  const res = await page.request.get(origin + "/manifest.json");
  assert.equal(res.status(), 200);
  const m = await res.json();
  for (const k of ["name", "short_name", "start_url", "scope", "display", "icons", "background_color", "theme_color", "lang", "id"]) assert.ok(m[k], `нет поля ${k}`);
  assert.equal(m.display, "standalone");
  assert.ok(m.start_url.startsWith(m.scope));
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i);
  assert.ok(m.short_name.length <= 12, "short_name должно влезать под значком");
  const purposes = new Set();
  for (const ic of m.icons) {
    const r = await page.request.get(origin + ic.src);
    assert.equal(r.status(), 200, ic.src);
    assert.equal(r.headers()["content-type"], "image/png");
    const b = await r.body();
    const [w, h] = [b.readUInt32BE(16), b.readUInt32BE(20)];
    assert.equal(`${w}x${h}`, ic.sizes, ic.src);
    purposes.add(ic.purpose);
  }
  assert.ok(purposes.has("any") && purposes.has("maskable"));
  assert.ok(m.icons.some((i) => i.sizes === "192x192") && m.icons.some((i) => i.sizes === "512x512"));
});
await check("PWA-2", "название в манифесте совпадает с lib/brand.ts", async () => {
  const brand = readFileSync(join(root, "lib/brand.ts"), "utf8").match(/APP_NAME = "([^"]+)"/)[1];
  const m = JSON.parse(readFileSync(join(root, "public/manifest.json"), "utf8"));
  assert.equal(m.name, brand);
  assert.equal(m.short_name, brand);
});
await check("PWA-3", "iPhone: apple-touch-icon 180x180, режим «как приложение», ссылка на манифест", async () => {
  assert.equal(await page.locator('link[rel="manifest"]').getAttribute("href"), "/manifest.json");
  const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  const b = await (await page.request.get(origin + href)).body();
  assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [180, 180]);
  assert.equal(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute("content"), "yes");
  assert.match(await page.locator('meta[name="viewport"]').getAttribute("content"), /viewport-fit=cover/);
});
await check("PWA-4", "Chromium считает страницу устанавливаемой (нет ошибок установимости)", async () => {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Page.enable");
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  // Тестовое окно Playwright работает как «инкогнито», там установка запрещена всегда: это единственная допустимая причина.
  const real = installabilityErrors.filter((e) => e.errorId !== "in-incognito");
  assert.deepEqual(real, [], JSON.stringify(installabilityErrors));
});
await check("PWA-5", "service worker активен и кэш содержит страницу, скрипт, стили, значки", async () => {
  const keys = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) throw new Error("SW не активен");
    const names = await caches.keys();
    const c = await caches.open(names[0]);
    return { names, urls: (await c.keys()).map((r) => new URL(r.url).pathname) };
  });
  assert.equal(keys.names.length, 1);
  for (const u of ["/", "/app.js", "/app.css", "/manifest.json", "/icon-192.png", "/apple-touch-icon.png"]) assert.ok(keys.urls.includes(u), `в кэше нет ${u}`);
});

await check("PWA-6", "без сети: страница открывается после перезагрузки, записи на месте, новая запись сохраняется", async () => {
  await page.reload(); // теперь страницу ведёт SW
  await page.waitForSelector("[data-date]");
  await page.locator("#cell-2026-10-10").click();
  await page.locator("dialog[open] textarea").fill("сделано в сети");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.locator("dialog[open]").waitFor({ state: "detached" });

  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector("[data-date]");
  assert.match(await page.locator("#cell-2026-10-10").getAttribute("aria-label"), /запись/);
  await page.locator("#cell-2026-10-11").click();
  await page.locator("dialog[open] textarea").fill("сделано без сети");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.locator("dialog[open]").waitFor({ state: "detached" });
  const e = await page.evaluate(() => JSON.parse(localStorage.getItem("garden:v1:entries")));
  assert.deepEqual(Object.keys(e).sort(), ["2026-10-10", "2026-10-11"]);
  // стили и скрипт пришли из кэша: сад выглядит как обычно
  assert.ok((await page.locator("#cell-2026-10-11").boundingBox()).width > 30);
});
await check("PWA-7", "без сети: переход по другому адресу того же сайта отдаёт приложение, а не ошибку браузера", async () => {
  await page.goto(origin + "/любая/страница/");
  await page.waitForSelector("[data-date]");
});
await check("PWA-8", "без сети: холодный запуск в новой вкладке (как открытие значка на экране)", async () => {
  const p2 = await ctx.newPage();
  await p2.clock.setFixedTime(NOW);
  await p2.goto(url);
  await p2.waitForSelector("[data-date]");
  assert.match(await p2.locator("#cell-2026-10-11").getAttribute("aria-label"), /запись/);
  await p2.close();
});
await check("PWA-9", "панель настроек: показывает «Работает без сети» и подсказку установки на iPhone", async () => {
  await page.goto(url);
  await page.waitForSelector("[data-date]");
  await page.getByRole("button", { name: "Копия и настройки" }).click();
  const dlg = page.locator("dialog[open]");
  await dlg.getByText("Работает без сети.").waitFor();
  assert.ok(await dlg.getByText(/«На экран “Домой”»/).isVisible());
  await page.keyboard.press("Escape");
  await page.locator("dialog[open]").waitFor({ state: "detached" });
});

await check("PWA-10", "новая версия: SW обновляется, старый кэш удаляется, записи не тронуты, страница перезагружается", async () => {
  await ctx.setOffline(false);
  await page.goto(url);
  await page.waitForSelector("[data-date]");
  const before = await page.evaluate(() => caches.keys());
  // «выкладываем» новую версию: другой скрипт и пересчитанный SW
  publishNewVersion("новая версия");
  const nav = page.waitForEvent("load", { timeout: 15000 }).catch(() => null);
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await nav; // controllerchange -> одна перезагрузка
  await page.waitForSelector("[data-date]");
  await page.waitForFunction(async (old) => { const k = await caches.keys(); return k.length === 1 && k[0] !== old[0]; }, before, { timeout: 15000 });
  const e = await page.evaluate(() => JSON.parse(localStorage.getItem("garden:v1:entries")));
  assert.equal(Object.keys(e).length, 2, "записи пережили обновление");
  const cachedJs = await page.evaluate(async () => (await (await caches.match("/app.js")).text()).includes("новая версия"));
  assert.ok(cachedJs, "в кэше уже новый скрипт");
});
await check("PWA-11", "окно записи открыто в момент обновления: страница не перезагружается и текст цел", async () => {
  await page.locator("#cell-2026-10-09").click();
  await page.locator("dialog[open] textarea").fill("пишу, пока приходит обновление");
  publishNewVersion("ещё версия");
  let reloaded = false;
  page.once("load", () => (reloaded = true));
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await page.waitForTimeout(2500);
  assert.equal(reloaded, false);
  assert.equal(await page.locator("dialog[open] textarea").inputValue(), "пишу, пока приходит обновление");
});
await check("PWA-12", "консоль без ошибок", async () => assert.deepEqual(errors.filter((e) => !/Failed to load resource/.test(e)), [], JSON.stringify(errors)));

const bad = summary();
await browser.close();
srv.close();
rmSync(work, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
