"use client";

import { useEffect } from "react";

// Фокус в поле ввода: перезагрузка сейчас потеряла бы несохранённый текст записи.
function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // в dev SW только мешает

    // Если страница уже была под управлением SW, смена контроллера означает обновление.
    // При самой первой установке контроллера нет, и перезагружать ничего не нужно.
    let hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    let pendingReload = false;
    let registration: ServiceWorkerRegistration | undefined;
    let interval: number | undefined;

    const tryReload = () => {
      if (reloading) return;
      if (isTyping()) {
        pendingReload = true; // доделаем, когда пользователь выйдет из поля
        return;
      }
      reloading = true;
      window.location.reload();
    };

    const onControllerChange = () => {
      if (!hadController) {
        hadController = true;
        return;
      }
      tryReload();
    };

    const onFocusOut = () => {
      if (pendingReload) setTimeout(tryReload, 300); // фокус мог просто перейти в соседнее поле
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (pendingReload) tryReload();
      registration?.update().catch(() => {}); // на iPhone приложение долго висит в фоне
    };

    const onUpdateFound = () => {
      const installing = registration?.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        // Новая версия установилась. Из-за skipWaiting она сразу активируется,
        // после чего сработает controllerchange и страница перезагрузится.
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          console.info("[pwa] новая версия установлена, обновляем…");
        }
      });
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("visibilitychange", onVisibility);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
        reg.addEventListener("updatefound", onUpdateFound);
        reg.update().catch(() => {});
        interval = window.setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      })
      .catch((err) => console.error("[pwa] не удалось зарегистрировать SW", err));

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("visibilitychange", onVisibility);
      registration?.removeEventListener("updatefound", onUpdateFound);
      if (interval) window.clearInterval(interval);
    };
  }, []);

  return null;
}
