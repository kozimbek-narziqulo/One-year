"use client";

import { useEffect } from "react";

/** Как часто проверять новую версию, пока приложение открыто (мс). */
const UPDATE_CHECK_MS = 30 * 60 * 1000;

/** Регистрирует service worker (только в рабочей сборке) и следит за обновлениями. Ничего не рисует. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return; // в `next dev` кэш мешал бы разработке
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

    // Если страницу уже вела старая версия, после смены версии перезагружаемся один раз,
    // чтобы не оставаться на смеси старых и новых файлов. Не трогаем, пока открыто окно записи.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    const onChange = () => {
      if (!hadController || reloaded) return;
      if (document.querySelector("dialog[open]")) return; // применится при следующем открытии
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    const start = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        if (cancelled) return;

        // Нашлась новая версия: просим применить её сразу, не дожидаясь закрытия приложения.
        const onUpdateFound = () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) worker.postMessage({ type: "SKIP_WAITING" });
          });
        };
        reg.addEventListener("updatefound", onUpdateFound);

        // Запасной путь: просим SW сохранить то, что эта страница уже загрузила.
        const ready = await navigator.serviceWorker.ready;
        if (cancelled) return;
        const urls = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((n) => n.startsWith(window.location.origin));
        ready.active?.postMessage({ type: "CACHE_URLS", urls: [window.location.pathname, ...urls] });

        // Проверка обновлений. На iPhone приложение месяцами «спит» в фоне, а событие visibilitychange
        // срабатывает не всегда, поэтому слушаем ещё focus, pageshow и online, плюс проверяем по таймеру.
        const check = () => {
          if (document.visibilityState === "visible") void reg.update().catch(() => undefined);
        };
        check();
        document.addEventListener("visibilitychange", check);
        window.addEventListener("focus", check);
        window.addEventListener("pageshow", check);
        window.addEventListener("online", check);
        const timer = window.setInterval(check, UPDATE_CHECK_MS);

        cleanup = () => {
          reg.removeEventListener("updatefound", onUpdateFound);
          document.removeEventListener("visibilitychange", check);
          window.removeEventListener("focus", check);
          window.removeEventListener("pageshow", check);
          window.removeEventListener("online", check);
          window.clearInterval(timer);
        };
      } catch {
        /* без офлайна приложение всё равно работает */
      }
    };
    if (document.readyState === "complete") void start();
    else window.addEventListener("load", () => void start(), { once: true });

    return () => {
      cancelled = true;
      cleanup?.();
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
    };
  }, []);
  return null;
}
