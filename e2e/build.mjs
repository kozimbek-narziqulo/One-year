// Сборка без Next.js для проверки в этой среде: esbuild (JS) + Tailwind compile API (CSS).
// В вашем проекте это делает `next build`; этот скрипт нужен только для скриншотов и e2e здесь.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, cpSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const out = join(here, ".build");
const tools = "/opt/npm-tools/node_modules";
const req = createRequire(tools + "/");
const esbuild = req("esbuild");
const tailwind = req("tailwindcss");
mkdirSync(out, { recursive: true });

// 1. JS
writeFileSync(join(out, "entry.tsx"), `import { createRoot } from "react-dom/client";
import { GardenApp } from "${root}/components/GardenApp.tsx";
import { PwaRegister } from "${root}/components/PwaRegister.tsx";
createRoot(document.getElementById("root")!).render(<><GardenApp /><PwaRegister /></>);
`);
await esbuild.build({
  entryPoints: [join(out, "entry.tsx")],
  bundle: true,
  outfile: join(out, "app.js"),
  format: "iife",
  jsx: "automatic",
  target: "es2020",
  nodePaths: [tools],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

// 2. CSS: кандидаты классов берём простым разбором исходников
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    if (["node_modules", ".build", ".next", "out", "e2e", "tests"].includes(n)) continue;
    const p = join(d, n);
    statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(n) && files.push(p);
  }
})(root);
const candidates = new Set();
for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/[^\s"'`<>{}=,;]+/g)) candidates.add(m[0]);

const src = readFileSync(join(root, "app/globals.css"), "utf8");
const compiler = await tailwind.compile(src, {
  base: join(root, "app"),
  async loadStylesheet(id, base) {
    if (id === "tailwindcss") return { path: "tailwindcss/index.css", base: tools + "/tailwindcss", content: readFileSync(tools + "/tailwindcss/index.css", "utf8") };
    const p = resolve(base, id);
    return { path: p, base: dirname(p), content: readFileSync(p, "utf8") };
  },
});
const css = compiler.build([...candidates]);
writeFileSync(join(out, "app.css"), css);

writeFileSync(
  join(out, "index.html"),
  `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Сад дней</title><link rel="icon" href="data:,"><link rel="manifest" href="/manifest.json"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><meta name="apple-mobile-web-app-capable" content="yes"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>`,
);
// 3. PWA: файлы из public/ и список кэша, как это делает postbuild в настоящей сборке
cpSync(join(root, "public"), out, { recursive: true });
execFileSync("node", [join(root, "scripts/build-sw.mjs"), out], { stdio: "inherit" });
console.log("built", out, "css bytes", css.length);
