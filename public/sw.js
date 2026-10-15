/* Service worker: приложение открывается и работает без сети.
 *
 * Как это устроено:
 *  - при установке в кэш кладётся весь собранный сайт (список файлов подставляет scripts/build-sw.mjs
 *    после `next build`; без него работает запасной вариант: кэшируется то, что страница уже загрузила);
 *  - дальше всё берётся из кэша (cache-first): сайт целиком статический, данные лежат в LocalStorage;
 *  - новая версия сайта = новый хэш в VERSION = новый кэш; старые кэши удаляются при активации.
 *
 * Записи пользователя этот файл не трогает: они в LocalStorage, не в кэше.
 */
const VERSION = /*__VERSION__*/ "dev";
const PRECACHE = /*__PRECACHE__*/ ["/"];
const CACHE = `garden-${VERSION}`;

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

      // Переходы по адресам: у сайта одна страница, отдаём её из кэша.
      if (req.mode === "navigate") {
        const cached = (await cache.match(url.pathname)) || (await cache.match("/"));
        if (cached) {
          // Тихо обновляем копию, если сеть есть (появится при следующем открытии после новой версии SW).
          return cached;
        }
        try {
          return await fetch(req);
        } catch {
          return (await cache.match("/")) || new Response("Нет сети, и страница ещё не сохранена.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
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
