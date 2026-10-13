// Запускается после `next build` (npm-скрипт postbuild). Берёт готовую папку (по умолчанию out),
// собирает список всех файлов и подставляет его и хэш версии в sw.js.
// Использование: node scripts/build-sw.mjs [папка]
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const dir = process.argv[2] ?? "out";
if (!existsSync(dir)) {
  console.error(`build-sw: папки "${dir}" нет. Сначала соберите проект: npm run build`);
  process.exit(1);
}
const swPath = join(dir, "sw.js");
if (!existsSync(swPath)) {
  console.error(`build-sw: в "${dir}" нет sw.js (он лежит в public/ и должен попасть в сборку)`);
  process.exit(1);
}

const SKIP = new Set(["sw.js", "404.html", "_not-found.html"]);
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(dir);

const urls = new Set(["/"]);
const hash = createHash("sha256");
for (const f of files.sort()) {
  const rel = relative(dir, f).split(sep).join("/");
  if (SKIP.has(rel) || rel.endsWith(".map") || rel.startsWith("_next/static/development")) continue;
  urls.add(rel === "index.html" ? "/" : "/" + rel);
  hash.update(rel).update(readFileSync(f));
}
const version = hash.digest("hex").slice(0, 12);

let sw = readFileSync(swPath, "utf8");
if (!sw.includes("/*__VERSION__*/") || !sw.includes("/*__PRECACHE__*/")) {
  console.error("build-sw: в sw.js не нашлись метки /*__VERSION__*/ и /*__PRECACHE__*/ (возможно, уже обработан)");
  process.exit(1);
}
sw = sw.replace(/\/\*__VERSION__\*\/\s*"[^"]*"/, `"${version}"`).replace(/\/\*__PRECACHE__\*\/\s*\[[^\]]*\]/, JSON.stringify([...urls].sort()));
writeFileSync(swPath, sw);
console.log(`build-sw: версия ${version}, файлов в кэше: ${urls.size}`);
