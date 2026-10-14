// Service Worker дневника.
// Метки ниже заменяет scripts/build-sw.mjs после `next build`. Не переименовывайте их и не трогайте формат строк.
const VERSION = /*__VERSION__*/ "dev";
const PRECACHE = /*__PRECACHE__*/ [];

const CACHE_PREFIX = "garden-";
const CACHE_NAME = CACHE_PREFIX + VERSION;
const NAVIGATION_TIMEOUT_MS = 3000;

// INSTALL: skipWaiting вызывается сразу, чтобы новая версия не ждала закрытия старых вкладок.
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(precache());
});

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    PRECACHE.map(async (url) => {
      try {
        // cache: "reload" обходит HTTP-кэш браузера, иначе в предкэш может попасть старая копия файла.
        const res = await fetch(new Request(url, { cache: "reload" }));
        if (res.ok && !res.redirected) await cache.put(url, res);
      } catch (_) {
        // Не получилось скачать один файл: не роняем установку, он дозагрузится при первом обращении.
      }
    }),
  );
}

// ACTIVATE: удаляем кэши старых версий и забираем управление уже открытыми страницами.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Запасной канал: страница может попросить активироваться немедленно.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js") return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, NAVIGATION_TIMEOUT_MS, true));
  } else if (url.pathname.startsWith("/_next/static/")) {
    // Файлы с хэшем в имени никогда не меняются, поэтому берём из кэша.
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req, 0, false));
  }
});

function fetchWithTimeout(req, ms) {
  if (!ms) return fetch(req);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(req, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// Сначала сеть (чтобы видеть свежую версию), при ошибке или медленной сети берём из кэша.
async function networkFirst(req, timeoutMs, isNavigation) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetchWithTimeout(req, timeoutMs);
    if (res.ok && !res.redirected) cache.put(req, res.clone());
    return res;
  } catch (err) {
    let hit = await cache.match(req, { ignoreSearch: true });
    if (!hit && isNavigation) {
      const path = new URL(req.url).pathname.replace(/\/$/, "");
      // Для output: "export" страница /settings лежит как settings.html.
      hit = (path && (await cache.match(path + ".html"))) || (await cache.match("/"));
    }
    if (hit) return hit;
    throw err;
  }
}
