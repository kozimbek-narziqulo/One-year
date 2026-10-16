/* Service worker: приложение открывается и работает без сети.
 *
 * Как это устроено:
 *  - при установке в кэш кладётся весь собранный сайт (список файлов подставляет scripts/build-sw.mjs
 *    после `next build`; без него работает запасной вариант: кэшируется то, что страница уже загрузила);
 *  - страница при открытии сначала берётся из сети (до 3 секунд), и только без сети отдаётся копия из кэша:
 *    так новая версия приходит сразу, а офлайн всё продолжает работать;
 *  - остальные файлы берутся из кэша (cache-first): имена файлов содержат хэш, старый файл не подменит новый;
 *  - новая версия сайта = новый хэш в VERSION = новый кэш; старые кэши удаляются при активации.
 *
 * Записи пользователя этот файл не трогает: они в LocalStorage, не в кэше.
 */
const VERSION = /*__VERSION__*/ "dev";
const PRECACHE = /*__PRECACHE__*/ ["/"];
const CACHE = `garden-${VERSION}`;
// Сколько ждать сеть при открытии страницы, прежде чем показать копию из кэша.
const NAV_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Сначала главное: страница. Остальное докладываем по одному, чтобы одна битая ссылка не сорвала установку.
      await cache.add(new Request("/", { cache: "reload" }));
      await Promise.all(
        PRECACHE.filter((u) => u !== "/").map((u) =>
          cache.add(new Request(u, { cache: "reload" })).catch(() => undefined),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("garden-") && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Страница просит применить новую версию сразу (на случай, если она ждёт в очереди).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") void self.skipWaiting();
});

// Страница присылает список того, что она реально загрузила (запасной путь, если postbuild не запускался).
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "CACHE_URLS" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const origin = self.location.origin;
      for (const u of data.urls) {
        try {
          const url = new URL(u, origin);
          if (url.origin !== origin || url.pathname === "/sw.js") continue;
          if (!(await cache.match(url.pathname + url.search))) await cache.add(url.pathname + url.search);
        } catch {
          /* пропускаем */
        }
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // чужие адреса не трогаем (их и нет)
  if (url.pathname === "/sw.js") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      // Переходы по адресам: сначала свежая страница из сети, без сети (или при медленной сети) копия из кэша.
      if (req.mode === "navigate") {
        const fromCache = async () => (await cache.match(url.pathname)) || (await cache.match("/"));
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), NAV_TIMEOUT_MS);
        try {
          const res = await fetch(req.url, { cache: "no-cache", redirect: "manual", signal: ctrl.signal });
          clearTimeout(timer);
          if (res.ok && res.type === "basic") cache.put(url.pathname, res.clone());
          return res;
        } catch {
          clearTimeout(timer);
          return (
            (await fromCache()) ||
            new Response("Нет сети, и страница ещё не сохранена.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } })
          );
        }
      }

      const hit = await cache.match(req, { ignoreSearch: url.pathname.startsWith("/_next/") });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === "basic") cache.put(req, res.clone());
        return res;
      } catch {
        return new Response("", { status: 504 });
      }
    })(),
  );
});
