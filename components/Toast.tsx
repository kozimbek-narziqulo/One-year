"use client";

import { useEffect } from "react";

export interface ToastData {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
  /** Сколько показывать, мс. */
  ms: number;
}

/** Всплывающее сообщение снизу. Контейнер role=status есть всегда, чтобы дикторы озвучивали новые тексты. */
export function Toast({ toast, onDismiss }: { toast: ToastData | null; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => onDismiss(toast.id), toast.ms);
    return () => window.clearTimeout(t);
  }, [toast, onDismiss]);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4" style={{ paddingBottom: "max(var(--space-4), env(safe-area-inset-bottom))" }}>
      {toast && (
        <div className="pointer-events-auto flex max-w-(--layout-contentMax) items-center gap-3 rounded-md bg-text px-4 py-3 text-base text-bg shadow-md">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.run();
                onDismiss(toast.id);
              }}
              className="min-h-(--layout-tapMin) rounded-sm px-2 font-semibold underline"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
