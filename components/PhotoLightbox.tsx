"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PhotoStore } from "../lib/photos.ts";

// Закрытие смахиванием вниз: далеко утянули или смахнули быстро.
const CLOSE_DISTANCE_PX = 110;
const CLOSE_SPEED_PX_MS = 0.6;
const CLOSE_MIN_FAST_PX = 40;
const DRAG_LOCK_PX = 8;

export interface PhotoLightboxProps {
  store: PhotoStore;
  photoId: string;
  alt: string;
  onClose: () => void;
}

/**
 * Фото на весь экран: в исходных пропорциях (object-contain) на тёмном фоне. Закрывается крестиком, Esc или смахиванием вниз.
 * Рисуется через портал в <body>: внутри ленты есть transform и overflow, из-за которых position: fixed не заняло бы весь экран.
 * Все события гасятся на корне: через дерево React они иначе дошли бы до записи под порталом и открыли бы редактор.
 */
export function PhotoLightbox({ store, photoId, alt, onClose }: PhotoLightboxProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; t: number; active: boolean } | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Оригинал берём из хранилища: тот же файл, что сохранён в записи (после сжатия при добавлении).
  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    setUrl(null);
    setMissing(false);
    store
      .get(photoId)
      .then((rec) => {
        if (cancelled) return;
        if (!rec) {
          setMissing(true);
          return;
        }
        made = URL.createObjectURL(rec.blob);
        setUrl(made);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [store, photoId]);

  // Esc, фокус на крестик и возврат фокуса, блокировка прокрутки страницы под оверлеем.
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, []);

  function setBackdrop(ty: number) {
    const root = rootRef.current;
    if (!root) return;
    const fade = Math.min(Math.abs(ty) / 400, 1);
    root.style.backgroundColor = `rgba(0,0,0,${0.97 * (1 - fade * 0.75)})`;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), active: false };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    const d = drag.current;
    const box = boxRef.current;
    if (!d || !box || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dy) < DRAG_LOCK_PX || Math.abs(dy) < Math.abs(dx)) return;
      d.active = true;
      d.y = e.clientY;
      d.t = performance.now();
      rootRef.current?.setPointerCapture(e.pointerId);
      box.style.transition = "none";
      return;
    }
    // Вниз идёт за пальцем, вверх тянется туго.
    const ty = dy > 0 ? dy : dy * 0.2;
    const scale = 1 - Math.min(Math.abs(ty) / 1200, 0.12);
    box.style.transform = `translate3d(0,${ty}px,0) scale(${scale})`;
    setBackdrop(ty);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) {
    e.stopPropagation();
    const d = drag.current;
    drag.current = null;
    const box = boxRef.current;
    const root = rootRef.current;
    if (!d || !d.active || !box || !root) return;
    if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
    const dy = e.clientY - d.y;
    const speed = dy / Math.max(1, performance.now() - d.t);
    if (!cancelled && (dy > CLOSE_DISTANCE_PX || (speed > CLOSE_SPEED_PX_MS && dy > CLOSE_MIN_FAST_PX))) {
      onCloseRef.current();
      return;
    }
    // Не дотянули: возвращаем на место.
    box.style.transition = "transform 260ms cubic-bezier(0.22, 0.8, 0.3, 1)";
    box.style.transform = "";
    root.style.backgroundColor = "";
  }

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Фотография на весь экран"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, false)}
      onPointerCancel={(e) => endDrag(e, true)}
      // touch-none: жесты на оверлее наши, страница под ним не листается и не тянется.
      className="fixed inset-0 z-[100] touch-none select-none bg-black/[0.97] transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none"
    >
      <div ref={boxRef} className="absolute inset-0 grid place-items-center pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] will-change-transform">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={alt} draggable={false} className="size-full object-contain" />
        ) : (
          <span className="font-mono text-sm text-white/60">{missing ? "Нет файла" : "…"}</span>
        )}
      </div>

      <button
        ref={closeRef}
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] grid size-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur [-webkit-tap-highlight-color:transparent] active:bg-white/25"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true" focusable={false}>
          <path d="M5 5l14 14M19 5L5 19" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
