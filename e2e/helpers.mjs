// Общее для e2e: статический сервер сборки, запуск Chromium, маленький раннер проверок.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const req = createRequire("/opt/npm-tools/node_modules/");
export const { chromium } = req("playwright");
export const shots = join(here, "shots");
const buildDir = join(here, ".build");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/manifest+json" };

export function startServer(dir = buildDir) {
  const srv = createServer((rq, rs) => {
    const p = rq.url.split("?")[0] === "/" ? "/index.html" : rq.url.split("?")[0];
    const f = join(dir, p);
    if (!f.startsWith(dir) || !existsSync(f)) { rs.writeHead(404); rs.end(); return; }
    rs.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
    rs.end(readFileSync(f));
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, url: `http://127.0.0.1:${srv.address().port}/index.html` })));
}

export const launch = () => chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

export function makeRunner() {
  const results = [];
  return {
    results,
    async check(id, name, fn) {
      try { await fn(); results.push(["ok", id]); console.log("ok   ", id, name); }
      catch (e) { results.push(["FAIL", id, String(e.message).split("\n")[0]]); console.log("FAIL ", id, name, "\n      ", String(e.message).split("\n").slice(0, 5).join("\n       ")); }
    },
    summary() {
      const failed = results.filter((r) => r[0] === "FAIL");
      console.log(`\n${results.length - failed.length}/${results.length} кейсов прошли`);
      return failed.length;
    },
  };
}

/** Проверка доступности без axe (его нельзя установить без npm): имена, роли, id, заголовки. */
export async function a11yScan(page) {
  return page.evaluate(() => {
    const issues = [];
    const name = (el) => {
      const lb = el.getAttribute("aria-labelledby");
      if (lb) return lb.split(/\s+/).map((i) => document.getElementById(i)?.textContent ?? "").join(" ").trim();
      return (el.getAttribute("aria-label") || (el.labels?.[0]?.textContent) || el.textContent || el.getAttribute("title") || "").trim();
    };
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    for (const el of document.querySelectorAll("button, input:not([type=hidden]), select, textarea, [role=radio], [role=gridcell][tabindex]")) {
      if (el.closest("[inert]")) continue;
      if (!name(el) && (visible(el) || el.classList.contains("sr-only"))) issues.push(`нет имени: <${el.tagName.toLowerCase()}${el.id ? " #" + el.id : ""}>`);
    }
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    for (const id of new Set(ids.filter((v, i) => ids.indexOf(v) !== i))) issues.push(`повторяется id: ${id}`);
    for (const el of document.querySelectorAll("[aria-labelledby]")) for (const i of el.getAttribute("aria-labelledby").split(/\s+/)) if (!document.getElementById(i)) issues.push(`aria-labelledby ведёт в пустоту: ${i}`);
    for (const row of document.querySelectorAll('[role=row]')) {
      for (const c of row.children) if (!["gridcell", "columnheader", "rowheader"].includes(c.getAttribute("role") ?? "")) issues.push("в role=row лежит не ячейка");
      const p = row.parentElement?.getAttribute("role");
      if (p !== "rowgroup" && p !== "grid") issues.push(`role=row внутри ${p}`);
    }
    for (const c of document.querySelectorAll("[role=gridcell]")) if (c.parentElement?.getAttribute("role") !== "row") issues.push("gridcell вне row");
    if (document.querySelectorAll("[role=grid] [tabindex='0']").length > 1) issues.push("в сетке больше одной клетки в Tab-порядке");
    if (document.documentElement.lang !== "ru" && document.documentElement.lang !== "") issues.push("lang не ru");
    const hs = [...document.querySelectorAll("h1,h2,h3")].map((h) => +h.tagName[1]);
    if (hs.length && hs[0] !== 1 && !document.querySelector("dialog[open]")) issues.push("страница начинается не с h1");
    for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) issues.push(`пропущен уровень заголовка: h${hs[i - 1]} -> h${hs[i]}`);
    if (document.querySelectorAll("h1").length > 1) issues.push("несколько h1");
    return [...new Set(issues)];
  });
}

export function seedEntries(spec) {
  const e = {};
  for (const [date, body, mood] of spec) e[date] = { date, body, mood, createdAt: 1000, updatedAt: 1000 };
  return e;
}
