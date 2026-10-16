"use client";

import { useEffect } from "react";

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
    const start = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        
        // --- ДОБАВЛЕНО ДЛЯ АВТООБНОВЛЕНИЯ ---
        // Ловим момент, когда нашлась новая версия
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          
          newWorker.addEventListener("statechange", () => {
            // Если новая версия скачалась и готова (installed), а старая всё ещё работает
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // Принудительно заставляем новую версию примениться прямо сейчас
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
        // ------------------------------------

        // Запасной путь: просим SW сохранить то, что эта страница уже загрузила.
        const ready = await navigator.serviceWorker.ready;
        if (cancelled) return;
        const urls = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((n) => n.startsWith(window.location.origin));
        ready.active?.postMessage({ type: "CACHE_URLS", urls: [window.location.pathname, ...urls] });
        
        // Проверка обновлений при возвращении в приложение (на телефоне оно месяцами «спит» в фоне).
        const check = () => {
          if (document.visibilityState === "visible") void reg.update().catch(() => undefined);
        };
        document.addEventListener("visibilitychange", check);
      } catch {
        /* без офлайна приложение всё равно работает */
      }
    };
    if (document.readyState === "complete") void start();
    else window.addEventListener("load", () => void start(), { once: true });

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
    };
  }, []);
  return null;
}
