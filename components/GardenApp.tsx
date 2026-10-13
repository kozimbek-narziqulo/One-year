"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPhotoStore, getRepo, useGardenState, useToday } from "../hooks/useGarden.ts";
import { APP_NAME } from "../lib/brand.ts";
import { compareKeys, daysElapsed, daysInYear, formatShort, yearOf, type DateKey } from "../lib/date.ts";
import { plantSeedOf, shiftKey } from "../lib/dayKeys.ts";
import { referencedPhotoIds } from "../lib/photos.ts";
import { shouldNudgeBackup } from "../lib/repo.ts";
import { LIMITS, type Entry, type PlantInfo } from "../lib/types.ts";
import { BackupPanel } from "./BackupPanel.tsx";
import { EntryModal } from "./EntryModal.tsx";
import { GardenDots } from "./GardenDots.tsx";
import { IconFlower, IconGardenGroup, PlantIcon } from "./GardenIcons.tsx";
import { MemoryFeed } from "./MemoryFeed.tsx";
import { Toast, type ToastData } from "./Toast.tsx";
import { Button, IconButton, IconChevronLeft, IconChevronRight, IconSettings } from "./ui.tsx";

const DEFAULT_MIN_YEAR = 2000;
// Свайп: минимум 50 px по горизонтали и заметно больше, чем по вертикали.
const SWIPE_MIN_PX = 50;
const SWIPE_RATIO = 1.5;

type View = "today" | "garden" | "feed";

/* ---------- маленькие части интерфейса ---------- */

function NavButton({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`grid h-[4.25rem] w-[4.5rem] place-items-center rounded-2xl transition-colors duration-(--duration-fast) ${
        active ? "bg-[#5b3dff] text-white" : "text-[#6b4dff]"
      }`}
    >
      {children}
    </button>
  );
}

/** Большая кнопка «+» посередине экрана «Сегодня». */
function PlantButton({ hasEntry, onClick }: { hasEntry: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-3 rounded-3xl p-4 font-mono text-xl text-[#5b3dff] transition-transform duration-(--duration-fast) active:scale-95"
    >
      <span className="relative grid size-24 place-items-center">
        <svg
          viewBox="0 0 96 96"
          className="absolute inset-0 size-full"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable={false}
        >
          <path d="M47 7C27 5 8 20 8 45c0 22 20 42 42 41 22-1 38-20 37-42C86 22 68 8 47 7Z" />
          {!hasEntry && <path d="M48 30v36M30 48h36" />}
        </svg>
        {hasEntry && <IconFlower className="relative size-12 text-[#9a85ff]" />}
      </span>
      {hasEntry ? "Открыть запись" : "Посадить воспоминание"}
    </button>
  );
}

/** Полоска дней сверху: три прошедших дня точками и сегодняшний день в рамке по центру. */
function DayStrip({ today, plants, onOpen }: { today: DateKey; plants: ReadonlyMap<string, PlantInfo>; onOpen: (key: DateKey) => void }) {
  const past = [-3, -2, -1].map((n) => shiftKey(today, n));
  const todayMarked = plants.has(today);
  return (
    <div className="pt-4">
      <h1 className="mb-2 text-center font-mono text-base">Сегодня</h1>
      <ul className="grid grid-cols-7 items-center">
        {past.map((key) => (
          <li key={key} className="grid place-items-center">
            <button
              type="button"
              onClick={() => onOpen(key)}
              aria-label={`${formatShort(key)}${plants.has(key) ? ", есть запись" : ", записи нет"}`}
              className="grid size-11 place-items-center rounded-full"
            >
              {plants.has(key) ? <PlantIcon seed={plantSeedOf(key)} className="size-6 text-[#9a85ff]" /> : <span className="size-1 rounded-full bg-current" />}
            </button>
          </li>
        ))}
        <li className="grid place-items-center">
          <button
            type="button"
            onClick={() => onOpen(today)}
            aria-label={`Сегодня, ${formatShort(today)}${todayMarked ? ", есть запись" : ", записи нет"}`}
            aria-current="date"
            className="grid aspect-square w-[88%] place-items-center rounded-[1.4rem] border border-[#5b3dff]/40 bg-[#5b3dff]/15"
          >
            {todayMarked ? <PlantIcon seed={plantSeedOf(today)} className="size-7 text-[#9a85ff]" /> : <span className="size-1 rounded-full bg-current" />}
          </button>
        </li>
        {[0, 1, 2].map((i) => (
          <li key={i} aria-hidden="true" />
        ))}
      </ul>
    </div>
  );
}

function Skeleton() {
  return (
    <main className="grid h-dvh place-items-center bg-[#02001a] text-[#5b3dff]">
      <div className="text-center">
        <h1 className="font-mono text-xl">{APP_NAME}</h1>
        <div className="mt-4 flex justify-center gap-6" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    </main>
  );
}

/* ---------- главный компонент ---------- */

export function GardenApp() {
  const state = useGardenState();
  const today = useToday();
  const repo = state ? getRepo() : null;
  const photoStore = state ? getPhotoStore() : null;

  const [view, setView] = useState<View>("today");
  const [viewYear, setViewYear] = useState<number | null>(null);
  const [modalDate, setModalDate] = useState<DateKey | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [planted, setPlanted] = useState<DateKey | null>(null);
  const toastId = useRef(0);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const year = viewYear ?? (today ? yearOf(today) : null);
  const settings = state?.settings;

  // Палитры из настроек -> атрибуты на <html>. Новый дизайн только тёмный, поэтому тему фиксируем.
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    root.setAttribute("data-theme", "dark");
    root.setAttribute("data-mood-palette", settings.moodPalette);
    root.setAttribute("data-plant-palette", settings.plantPalette);
  }, [settings]);

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

  // Растения сада по датам: рисунок (shapeId) и настроение (цвет). Наличие даты в карте = есть запись.
  const plants = useMemo<ReadonlyMap<string, PlantInfo>>(() => {
    const map = new Map<string, PlantInfo>();
    if (state) {
      for (const e of Object.values(state.entries)) {
        map.set(e.date, { mood: e.mood, ...(e.shapeId !== undefined ? { shapeId: e.shapeId } : {}) });
      }
    }
    return map;
  }, [state]);

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

  if (!state || !repo || !photoStore || !today || year === null) return <Skeleton />;

  const thisYear = yearOf(today);
  const elapsed = daysElapsed(year, today);
  const total = daysInYear(year);
  const nudge = shouldNudgeBackup(state, Date.now());
  const todayHasEntry = plants.has(today);

  function onSaved(entry: Entry, wasNew: boolean) {
    setModalDate(null);
    if (yearOf(entry.date) !== year) setViewYear(yearOf(entry.date));
    setPlanted(entry.date);
    window.setTimeout(() => setPlanted((p) => (p === entry.date ? null : p)), LIMITS.undoDeleteMs / 5);
    showToast(wasNew ? "Записано. Растение уже в саду." : "Запись обновлена.");
    // Просим браузер не вычищать данные при нехватке места; ответ нам не важен.
    void navigator.storage?.persist?.().catch(() => undefined);
  }

  function onDeleted(entry: Entry) {
    setModalDate(null);
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

  // Свайп влево открывает «Сад», вправо возвращает на «Сегодня». Вертикальная прокрутка остаётся за браузером (touch-pan-y).
  function onPointerUp(e: React.PointerEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;
    setView(dx < 0 ? "garden" : "today");
  }

  const pageStyle = (active: boolean) => ({
    visibility: active ? ("visible" as const) : ("hidden" as const),
    // Скрываем неактивную страницу от фокуса и экранных читалок только после окончания анимации.
    transition: `visibility 0s linear ${active ? "0s" : "0.3s"}`,
  });

  return (
    <>
      <main className="flex h-dvh flex-col bg-[#02001a] text-[#5b3dff]">
        {/* Верхняя строка: лента слева, копия и настройки справа */}
        <header className="flex min-h-14 items-center justify-between px-(--layout-gutter) pt-[env(safe-area-inset-top)]">
          {view === "feed" ? (
            <Button variant="ghost" onClick={() => setView("today")}>
              Назад
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setView("feed")}>
              Лента
            </Button>
          )}
          <IconButton label="Копия и настройки" onClick={() => setPanelOpen(true)}>
            <IconSettings />
          </IconButton>
        </header>

        {!state.persistent && (
          <p role="status" className="mx-(--layout-gutter) mb-3 rounded-md border border-warning p-3 text-sm text-warning">
            Браузер не сохраняет данные сайта (возможно, приватный режим). Записи пропадут при закрытии вкладки. Сохраните копию файлом.
          </p>
        )}
        {state.loadProblem && (
          <p role="alert" className="mx-(--layout-gutter) mb-3 rounded-md border border-danger p-3 text-sm text-danger">
            Часть сохранённых записей не удалось прочитать. Исходный текст отложен в хранилище браузера и не стёрт. Сохраните копию и обратитесь за помощью, прежде чем что-то менять.
          </p>
        )}
        {nudge && (
          <div role="region" aria-label="Напоминание о копии" className="mx-(--layout-gutter) mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-accent-subtle p-3 text-base text-text">
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

        {view === "feed" ? (
          <section className="min-h-0 flex-1 overflow-y-auto px-(--layout-gutter) pb-32 text-text">
            <h1 className="mb-1 text-xl">Лента воспоминаний</h1>
            <p className="mb-4 text-sm tabular-nums text-text-muted">Записей: {Object.keys(state.entries).length}</p>
            <MemoryFeed entries={state.entries} store={photoStore} onOpen={openDate} />
          </section>
        ) : (
          <div
            className="relative min-h-0 flex-1 touch-pan-y overflow-hidden"
            onPointerDown={(e) => {
              swipeStart.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              swipeStart.current = null;
            }}
          >
            <div
              className="flex h-full w-[200%] transition-transform duration-300 ease-out motion-reduce:transition-none"
              style={{ transform: view === "garden" ? "translateX(-50%)" : "translateX(0)" }}
            >
              {/* Экран «Сегодня» */}
              <section className="flex h-full w-1/2 flex-col px-(--layout-gutter) pb-32" style={pageStyle(view === "today")}>
                <DayStrip today={today} plants={plants} onOpen={openDate} />
                <div className="grid flex-1 place-items-center">
                  <PlantButton hasEntry={todayHasEntry} onClick={() => openDate(today)} />
                </div>
              </section>

              {/* Экран «Сад»: полотно точек */}
              <section className="h-full w-1/2 overflow-y-auto px-(--layout-gutter) pb-32" style={pageStyle(view === "garden")}>
                <div className="flex items-center justify-center gap-2 pb-5 pt-2">
                  <IconButton label="Предыдущий год" disabled={year <= minYear} onClick={() => setViewYear(year - 1)}>
                    <IconChevronLeft />
                  </IconButton>
                  <h1 className="rounded-full bg-[#5b3dff] px-8 py-2 font-mono text-xl tabular-nums text-white" aria-live="polite">
                    {year}
                  </h1>
                  <IconButton label="Следующий год" disabled={year >= thisYear} onClick={() => setViewYear(year + 1)}>
                    <IconChevronRight />
                  </IconButton>
                </div>

                {Object.keys(state.entries).length === 0 && <p className="mb-4 text-center font-mono text-sm">Пока здесь одни семена. Начнём с сегодняшнего дня?</p>}

                <GardenDots year={year} today={today} plants={plants} plantedKey={planted} onOpen={openDate} />

                <p className="mt-6 text-center font-mono text-xs tabular-nums opacity-70">
                  Записей: {entryCountThisYear} из {total} · прошло {elapsed} дн.
                </p>
              </section>
            </div>
          </div>
        )}

        {/* Нижняя панель: Сад / Сегодня */}
        <nav aria-label="Разделы" className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto flex gap-1 rounded-3xl border border-[#5b3dff]/30 bg-[#16103f]/80 p-1.5 backdrop-blur">
            <NavButton active={view === "garden"} label="Сад" onClick={() => setView("garden")}>
              <IconGardenGroup className="h-8 w-14" />
            </NavButton>
            <NavButton active={view === "today"} label="Сегодня" onClick={() => setView("today")}>
              <IconFlower className="size-9" />
            </NavButton>
          </div>
        </nav>
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
