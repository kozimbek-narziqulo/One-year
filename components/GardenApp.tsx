"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPhotoStore, getRepo, useGardenState, useToday } from "../hooks/useGarden.ts";
import { APP_NAME } from "../lib/brand.ts";
import { compareKeys, daysElapsed, daysInYear, formatShort, yearOf, type DateKey } from "../lib/date.ts";
import { referencedPhotoIds } from "../lib/photos.ts";
import { shouldNudgeBackup } from "../lib/repo.ts";
import { LIMITS, type Entry } from "../lib/types.ts";
import { BackupPanel } from "./BackupPanel.tsx";
import { EntryModal } from "./EntryModal.tsx";
import { GardenField, type FocusRequest } from "./GardenField.tsx";
import { MemoryFeed } from "./MemoryFeed.tsx";
import { Toast, type ToastData } from "./Toast.tsx";
import { Button, IconButton, IconChevronLeft, IconChevronRight, IconSettings } from "./ui.tsx";

const DEFAULT_MIN_YEAR = 2000;

type View = "garden" | "feed";

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-(--layout-tapMin) rounded-sm px-4 text-base ${active ? "bg-accent-subtle text-text" : "text-text-muted"}`}
    >
      {children}
    </button>
  );
}

function GardenSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 md:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div className="mb-3 h-5 w-24 rounded-sm bg-border" />
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, j) => (
              <div key={j} className="aspect-square rounded-cell bg-border opacity-50" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function GardenApp() {
  const state = useGardenState();
  const today = useToday();
  const repo = state ? getRepo() : null;
  const photoStore = state ? getPhotoStore() : null;

  const [view, setView] = useState<View>("garden");
  const [viewYear, setViewYear] = useState<number | null>(null);
  const [modalDate, setModalDate] = useState<DateKey | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [planted, setPlanted] = useState<DateKey | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [showRemaining, setShowRemaining] = useState(false);
  const toastId = useRef(0);
  const initialScroll = useRef(false);

  const year = viewYear ?? (today ? yearOf(today) : null);
  const settings = state?.settings;

  // Настройки внешнего вида -> атрибуты на <html> (до первой отрисовки их уже выставил скрипт в layout).
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    if (settings.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", settings.theme);
    root.setAttribute("data-mood-palette", settings.moodPalette);
    root.setAttribute("data-plant-palette", settings.plantPalette);
  }, [settings]);

  // При первом показе прокручиваем к сегодняшнему дню.
  useEffect(() => {
    if (initialScroll.current || !state || !today) return;
    initialScroll.current = true;
    setFocusRequest({ key: today, focus: false, n: 1 });
  }, [state, today]);

  // Раз за запуск убираем фото, на которые не ссылается ни одна запись (см. PhotoStore.sweep).
  // Состояние берём свежее, в момент уборки. Если записи не загрузились или не сохраняются, не трогаем ничего:
  // иначе фото существующих записей выглядели бы «ничьими».
  const ready = state !== null;
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => {
      const store = getPhotoStore();
      const s = getRepo().getState();
      if (!store.available || !s.persistent || s.loadProblem || Object.keys(s.entries).length === 0) return;
      void store.sweep(referencedPhotoIds(Object.values(s.entries))).catch(() => undefined);
    }, 3000);
    return () => window.clearTimeout(id);
  }, [ready]);

  const showToast = useCallback((text: string, opts?: { action?: ToastData["action"]; ms?: number }) => {
    toastId.current += 1;
    setToast({ id: toastId.current, text, action: opts?.action, ms: opts?.ms ?? 4000 });
  }, []);
  const dismissToast = useCallback((id: number) => setToast((t) => (t && t.id === id ? null : t)), []);

  const openDate = useCallback(
    (key: DateKey) => {
      if (today && compareKeys(key, today) > 0) {
        showToast("Завтра ещё не наступило.");
        return;
      }
      setModalDate(key);
    },
    [today, showToast],
  );

  // Самый ранний год, до которого можно дойти: не раньше самой старой записи (например, из импортированной копии).
  const minYear = useMemo(() => {
    let min = DEFAULT_MIN_YEAR;
    if (state) for (const k of Object.keys(state.entries)) min = Math.min(min, yearOf(k));
    return min;
  }, [state]);

  const entryCountThisYear = useMemo(() => {
    if (!state || year === null) return 0;
    const prefix = `${year}-`;
    return Object.keys(state.entries).filter((k) => k.startsWith(prefix)).length;
  }, [state, year]);

  if (!state || !repo || !photoStore || !today || year === null) {
    return (
      <main className="mx-auto w-full max-w-(--layout-gardenMax) px-(--layout-gutter) py-6">
        <h1 className="mb-6 text-xl">{APP_NAME}</h1>
        <GardenSkeleton />
      </main>
    );
  }

  const thisYear = yearOf(today);
  const elapsed = daysElapsed(year, today);
  const total = daysInYear(year);
  const nudge = shouldNudgeBackup(state, Date.now());

  function goToday() {
    setViewYear(thisYear);
    setFocusRequest((r) => ({ key: today as DateKey, focus: true, n: (r?.n ?? 0) + 1 }));
  }

  function onSaved(entry: Entry, wasNew: boolean) {
    setModalDate(null);
    if (yearOf(entry.date) !== year) setViewYear(yearOf(entry.date));
    setPlanted(entry.date);
    window.setTimeout(() => setPlanted((p) => (p === entry.date ? null : p)), LIMITS.undoDeleteMs / 5);
    showToast(wasNew ? "Записано. Растение уже в саду." : "Запись обновлена.");
    // Просим браузер не вычищать данные при нехватке места; ответ нам не важен.
    void navigator.storage?.persist?.().catch(() => undefined);
    setFocusRequest((r) => ({ key: entry.date, focus: true, n: (r?.n ?? 0) + 1 }));
  }

  function onDeleted(entry: Entry) {
    setModalDate(null);
    setFocusRequest((r) => ({ key: entry.date, focus: true, n: (r?.n ?? 0) + 1 }));
    showToast(`Запись за ${formatShort(entry.date)} удалена.`, {
      ms: LIMITS.undoDeleteMs,
      action: {
        label: "Вернуть",
        run: () => {
          try {
            repo?.restoreEntry(entry);
          } catch {
            showToast("Не удалось вернуть запись: нет места.");
          }
        },
      },
    });
  }

  return (
    <>
      <main className="mx-auto w-full max-w-(--layout-gardenMax) px-(--layout-gutter) pb-24 pt-4">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {view === "garden" ? (
            <div className="flex items-center gap-1">
              <IconButton label="Предыдущий год" disabled={year <= minYear} onClick={() => setViewYear(year - 1)}>
                <IconChevronLeft />
              </IconButton>
              <h1 className="text-xl tabular-nums" aria-live="polite">
                {year}
              </h1>
              <IconButton label="Следующий год" disabled={year >= thisYear} onClick={() => setViewYear(year + 1)}>
                <IconChevronRight />
              </IconButton>
            </div>
          ) : (
            <h1 className="text-xl">Лента воспоминаний</h1>
          )}
          <div className="flex items-center gap-2">
            {view === "garden" && (
              <Button variant="ghost" onClick={goToday}>
                К сегодня
              </Button>
            )}
            <IconButton label="Копия и настройки" onClick={() => setPanelOpen(true)}>
              <IconSettings />
            </IconButton>
          </div>
        </header>

        <div role="group" aria-label="Вид" className="mb-4 inline-flex rounded-md border border-border p-0.5">
          <ViewButton active={view === "garden"} onClick={() => setView("garden")}>
            Сад
          </ViewButton>
          <ViewButton active={view === "feed"} onClick={() => setView("feed")}>
            Лента
          </ViewButton>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {view === "garden" ? (
            <p className="text-sm text-text-muted">
              <span className="tabular-nums">
                Записей: {entryCountThisYear} из {total}
              </span>
              {" · "}
              <button
                type="button"
                onClick={() => setShowRemaining((v) => !v)}
                className="min-h-6 rounded-sm tabular-nums underline"
                aria-label={showRemaining ? "Показать, сколько дней прошло" : "Показать, сколько дней осталось"}
              >
                {showRemaining ? `осталось ${total - elapsed} дн.` : `прошло ${elapsed} дн.`}
              </button>
            </p>
          ) : (
            <p className="text-sm tabular-nums text-text-muted">Записей: {Object.keys(state.entries).length}</p>
          )}
          <Button variant="primary" onClick={() => openDate(today)}>
            Записать этот день
          </Button>
        </div>

        {!state.persistent && (
          <p role="status" className="mb-4 rounded-md border border-warning p-3 text-sm text-warning">
            Браузер не сохраняет данные сайта (возможно, приватный режим). Записи пропадут при закрытии вкладки. Сохраните копию файлом.
          </p>
        )}
        {state.loadProblem && (
          <p role="alert" className="mb-4 rounded-md border border-danger p-3 text-sm text-danger">
            Часть сохранённых записей не удалось прочитать. Исходный текст отложен в хранилище браузера и не стёрт. Сохраните копию и обратитесь за помощью, прежде чем что-то менять.
          </p>
        )}
        {nudge && (
          <div role="region" aria-label="Напоминание о копии" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-accent-subtle p-3 text-base">
            <p>Давно не было копии. Сохраните файл, на случай если телефон потеряется.</p>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => setPanelOpen(true)}>
                Сохранить копию
              </Button>
              <Button variant="ghost" onClick={() => repo.snoozeBackupNudge()}>
                Позже
              </Button>
            </div>
          </div>
        )}
        {view === "garden" && Object.keys(state.entries).length === 0 && (
          <p className="mb-4 rounded-md border border-border bg-surface p-4 text-base">
            Пока здесь одни семена. Начнём с сегодняшнего дня?
          </p>
        )}

        {view === "garden" ? (
          <GardenField
            year={year}
            entries={state.entries}
            today={today}
            density={state.settings.density}
            plantedKey={planted}
            focusRequest={focusRequest}
            onOpen={openDate}
          />
        ) : (
          <MemoryFeed entries={state.entries} store={photoStore} onOpen={openDate} />
        )}
      </main>

      {modalDate && (
        <EntryModal
          key={modalDate}
          repo={repo}
          photoStore={photoStore}
          initialDate={modalDate}
          today={today}
          onClose={() => setModalDate(null)}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
      {panelOpen && <BackupPanel repo={repo} photoStore={photoStore} state={state} onClose={() => setPanelOpen(false)} onMessage={(t) => showToast(t, { ms: 6000 })} />}
      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
