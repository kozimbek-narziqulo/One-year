"use client";

import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getPhotoStore, getRepo, useGardenState, useToday } from "../hooks/useGarden.ts";
import { APP_NAME } from "../lib/brand.ts";
import { compareKeys, daysElapsed, daysInYear, formatShort, yearOf, type DateKey } from "../lib/date.ts";
import { shiftKey } from "../lib/dayKeys.ts";
import { referencedPhotoIds } from "../lib/photos.ts";
import { shouldNudgeBackup } from "../lib/repo.ts";
import { LIMITS, type Entry, type PlantInfo } from "../lib/types.ts";
import { BackupPanel } from "./BackupPanel.tsx";
import { EntryModal } from "./EntryModal.tsx";
import { GardenDots } from "./GardenDots.tsx";
import { IconFlower, IconGardenGroup } from "./GardenIcons.tsx";
import { MemoryFeed } from "./MemoryFeed.tsx";
import { MOOD_TONE } from "./MoodFlower.tsx";
import { PlantSketch, resolveShapeId } from "./SketchUI.tsx";
import { Toast, type ToastData } from "./Toast.tsx";
import { Button, IconButton, IconSettings } from "./ui.tsx";

// Свайп между экранами: жест «захватывается» после 10 px по горизонтали, если он заметно горизонтальнее вертикали.
const SWIPE_LOCK_PX = 10;
const SWIPE_LOCK_RATIO = 1.5;
// Экран переключается, если страницу утянули дальше четверти ширины или смахнули быстро.
const SWIPE_COMMIT_FRACTION = 0.25;
const SWIPE_COMMIT_SPEED = 0.5; // px/мс
const SWIPE_COMMIT_MIN_PX = 30;
// За краем (с «Сегодня» вправо, с «Сада» влево) страница тянется туго, как в iOS.
const SWIPE_EDGE_RESISTANCE = 0.25;
const APP_BG = "#02001a";

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

/** Большая кнопка «+» посередине экрана. Показывается, только пока за выбранный день нет записи. */
function PlantButton({ label, onClick }: { label: string; onClick: () => void }) {
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
          <path d="M48 30v36M30 48h36" />
        </svg>
      </span>
      {label}
    </button>
  );
}

/** Сколько прошедших дней можно листать в полоске. */
const STRIP_PAST_DAYS = 90;
const NO_MOOD_TONE = "text-[#9a85ff]";

/** Растение из библиотеки в цвете настроения: так же, как в саду. */
function StripPlant({ plant, dateKey, className, strokeWidth = 3 }: { plant: PlantInfo; dateKey: DateKey; className: string; strokeWidth?: number }) {
  return (
    <PlantSketch
      shapeId={resolveShapeId(plant.shapeId, dateKey)}
      strokeWidth={strokeWidth}
      className={`${className} ${plant.mood != null ? MOOD_TONE[plant.mood] : NO_MOOD_TONE}`}
    />
  );
}

/** Один день в полоске. memo: при смене выбора перерисовываются только два дня (был и стал), а не все девяносто. */
const StripDay = memo(function StripDay({
  dayKey,
  today,
  plant,
  isSelected,
  onSelect,
  onOpen,
}: {
  dayKey: DateKey;
  today: DateKey;
  plant: PlantInfo | undefined;
  isSelected: boolean;
  onSelect: (key: DateKey) => void;
  onOpen: (key: DateKey) => void;
}) {
  return (
    <li className="aspect-square w-[calc(100%/7)] shrink-0 snap-center">
      <button
        type="button"
        onClick={() => (isSelected ? onOpen(dayKey) : onSelect(dayKey))}
        aria-label={`${dayKey === today ? "Сегодня, " : ""}${formatShort(dayKey)}${plant ? ", есть запись" : ", записи нет"}`}
        aria-current={isSelected ? "date" : undefined}
        className="grid size-full place-items-center rounded-full"
      >
        <span className={`grid place-items-center transition-transform duration-300 motion-reduce:transition-none ${isSelected ? "scale-125" : ""}`}>
          {plant ? <StripPlant plant={plant} dateKey={dayKey} className="size-6" /> : <span className="size-1 rounded-full bg-current" />}
        </span>
      </button>
    </li>
  );
});

/**
 * Полоска дней сверху. Листается пальцем по горизонтали (touch-pan-x, нативная инерция, мягкая привязка).
 * День под рамкой по центру и есть выбранный. Он пересчитывается прямо в onScroll, на каждом кадре движения,
 * поэтому запись внизу меняется «под пальцем», как в сторис. Когда прокрутка затихает, ленту доводит до центра.
 * Тап по другому дню выбирает его и плавно подводит к центру, тап по уже выбранному открывает редактор.
 */
function DayStrip({
  today,
  selected,
  plants,
  onSelect,
  onOpen,
}: {
  today: DateKey;
  selected: DateKey;
  plants: ReadonlyMap<string, PlantInfo>;
  /** Должна быть стабильной (useCallback), иначе memo у дней не сработает. */
  onSelect: (key: DateKey) => void;
  onOpen: (key: DateKey) => void;
}) {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const placed = useRef(false);
  const settleTimer = useRef<number | undefined>(undefined);
  // Идёт прокрутка, начатая кодом (первая посадка, тап по дню, доводка): выбор из неё не вычисляем.
  const programmatic = useRef(true);
  // Идёт прокрутка пальцем: пока она не затихла, ленту не подтягиваем к центру, иначе мы боролись бы с пальцем.
  const userScroll = useRef(false);
  const lastIndex = useRef(-1);
  // Дни от старых к новым; последний элемент (индекс STRIP_PAST_DAYS) это сегодня.
  const days = useMemo(() => Array.from({ length: STRIP_PAST_DAYS + 1 }, (_, i) => shiftKey(today, i - STRIP_PAST_DAYS)), [today]);
  const selectedIndex = Math.max(0, days.indexOf(selected));

  function indexAtCenter(box: HTMLElement): number {
    return Math.min(STRIP_PAST_DAYS, Math.max(0, Math.round(box.scrollLeft / (box.clientWidth / 7))));
  }

  function settle() {
    const box = scrollerRef.current;
    programmatic.current = false;
    userScroll.current = false;
    if (!box) return;
    // Финальный выбор на случай, если последнее событие прокрутки пришло до последнего сдвига.
    const index = indexAtCenter(box);
    if (index !== lastIndex.current) {
      lastIndex.current = index;
      onSelect(days[index] ?? today);
    }
    // Привязка могла остановиться чуть мимо центра: доводим.
    const left = index * (box.clientWidth / 7);
    if (Math.abs(box.scrollLeft - left) >= 2) {
      programmatic.current = true;
      box.scrollTo({ left, behavior: "smooth" });
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(settle, 150);
    }
  }

  // Подводим выбранный день к центру, если выбор пришёл не от пальца (тап, первая посадка, смена суток).
  // В первый раз без анимации, дальше плавно. Три пустых элемента с каждой стороны позволяют подвести к центру любой день.
  useLayoutEffect(() => {
    const box = scrollerRef.current;
    if (!box || userScroll.current) return;
    lastIndex.current = selectedIndex;
    const left = selectedIndex * (box.clientWidth / 7);
    if (Math.abs(box.scrollLeft - left) >= 2) {
      programmatic.current = true;
      box.scrollTo({ left, behavior: placed.current ? "smooth" : "auto" });
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(settle, 150);
    } else {
      programmatic.current = false;
    }
    placed.current = true;
    // settle берёт свежие days и today из замыкания этого рендера; лишние зависимости только перезапускали бы подведение.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, today]);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  // Без throttle и debounce: событие прокрутки приходит не чаще раза за кадр, а вычисление это одно деление.
  // setState вызывается только когда под рамку попал другой день.
  function onScroll() {
    const box = scrollerRef.current;
    if (!box) return;
    if (!programmatic.current) {
      userScroll.current = true;
      const index = indexAtCenter(box);
      if (index !== lastIndex.current) {
        lastIndex.current = index;
        onSelect(days[index] ?? today);
      }
    }
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(settle, 120);
  }

  return (
    <div className="pt-4">
      <h1 className="mb-2 text-center font-mono text-base" aria-live="polite">
        {selected === today ? "Сегодня" : formatShort(selected)}
      </h1>
      <div className="relative">
        {/* Неподвижная рамка по центру: дни проезжают под ней */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[calc(100%/7*0.88)] -translate-x-1/2 -translate-y-1/2 rounded-[1.4rem] border border-[#5b3dff]/40 bg-[#5b3dff]/15"
        />
        <ul
          ref={scrollerRef}
          aria-label="Дни"
          onScroll={onScroll}
          // Жест начинается в полоске: листаем её, а не переключаем экраны «Сегодня» / «Сад». И снова слушаем палец.
          onPointerDown={(e) => {
            e.stopPropagation();
            programmatic.current = false;
          }}
          className="relative flex touch-pan-x snap-x snap-proximity items-center overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {[0, 1, 2].map((i) => (
            <li key={`before-${i}`} aria-hidden="true" className="aspect-square w-[calc(100%/7)] shrink-0" />
          ))}
          {days.map((key) => (
            <StripDay key={key} dayKey={key} today={today} plant={plants.get(key)} isSelected={key === selected} onSelect={onSelect} onOpen={onOpen} />
          ))}
          {[0, 1, 2].map((i) => (
            <li key={`after-${i}`} aria-hidden="true" className="aspect-square w-[calc(100%/7)] shrink-0" />
          ))}
        </ul>
      </div>
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
  // Выбранный в полоске день. null значит «сегодня»: так выбор сам переезжает на новый день после полуночи.
  const [selectedDate, setSelectedDate] = useState<DateKey | null>(null);
  const toastId = useRef(0);
  const pagerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ id: number; x: number; y: number; t: number; locked: boolean } | null>(null);
  // Идёт перетаскивание экрана: соседний экран должен быть виден, а не спрятан visibility.
  const [peek, setPeek] = useState(false);

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

  // Полноэкранный тёмный фон до самого верха: iOS рисует свои часы поверх, а под ними должен быть наш цвет, не серый.
  // Это страховка на стороне клиента; основа это viewportFit: "cover", themeColor и statusBarStyle "black-translucent" в layout.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlBg: html.style.backgroundColor,
      bodyBg: body.style.backgroundColor,
      htmlOverscroll: html.style.overscrollBehaviorX,
      bodyOverscroll: body.style.overscrollBehaviorX,
    };
    html.style.backgroundColor = APP_BG;
    body.style.backgroundColor = APP_BG;
    // Страница не тянется вбок и не уходит «назад» жестом от края.
    html.style.overscrollBehaviorX = "none";
    body.style.overscrollBehaviorX = "none";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const created = !meta;
    const prevTheme = meta?.content;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = APP_BG;
    return () => {
      html.style.backgroundColor = prev.htmlBg;
      body.style.backgroundColor = prev.bodyBg;
      html.style.overscrollBehaviorX = prev.htmlOverscroll;
      body.style.overscrollBehaviorX = prev.bodyOverscroll;
      if (meta) {
        if (created) meta.remove();
        else if (prevTheme !== undefined) meta.content = prevTheme;
      }
    };
  }, []);

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

  const target = selectedDate ?? today;
  // Рамка и подсветка в полоске берут target сразу, а тяжёлое содержимое (запись, фото) следует за ним как успеет:
  // React бросает устаревший рендер, если палец уже на другом дне, поэтому быстрый скраббинг не копит очередь.
  const shownDate = useDeferredValue(target);

  // Стабильный обработчик выбора: иначе memo у дней в полоске перерисовывалось бы целиком на каждый кадр.
  const selectDay = useCallback((key: DateKey) => setSelectedDate(key === today ? null : key), [today]);

  // Запись показанного дня в том же виде, что и вся карта записей: её рисует MemoryFeed. Ссылка стабильна, пока запись не изменилась.
  const shownEntries = useMemo(() => {
    if (!state || !shownDate) return null;
    const e = state.entries[shownDate];
    return e ? ({ [shownDate]: e } as typeof state.entries) : null;
  }, [state, shownDate]);

  const entryCountThisYear = useMemo(() => {
    if (!state || year === null) return 0;
    const prefix = `${year}-`;
    return Object.keys(state.entries).filter((k) => k.startsWith(prefix)).length;
  }, [state, year]);

  if (!state || !repo || !photoStore || !today || year === null) return <Skeleton />;

  const elapsed = daysElapsed(year, today);
  const total = daysInYear(year);
  const nudge = shouldNudgeBackup(state, Date.now());
  const selected = target ?? today;
  const shownDay = shownDate ?? today;
  const shownPlant = plants.get(shownDay);
  const hasShownEntry = shownEntries !== null && shownPlant !== undefined;

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

  /* Свайп между «Сегодня» и «Садом»: экран идёт за пальцем, на отпускании доезжает пружинистым переходом.
     Во время жеста transform пишем прямо в элемент (без setState на каждый пиксель), чтобы не перерисовывать экран.
     Вертикальная прокрутка остаётся за браузером (touch-pan-y). Полоска дней и стопка фото гасят pointerdown
     у себя (stopPropagation), поэтому их собственные жесты экраны не переключают. */
  const TRACK_TODAY = "translate3d(0,0,0)";
  const TRACK_GARDEN = "translate3d(-50%,0,0)";

  function onSwipeDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), locked: false };
  }

  function onSwipeMove(e: React.PointerEvent<HTMLDivElement>) {
    const s = swipe.current;
    const pager = pagerRef.current;
    const track = trackRef.current;
    if (!s || !pager || !track || e.pointerId !== s.id) return;
    let dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.locked) {
      // Вертикальный жест: это прокрутка, не наш.
      if (Math.abs(dy) > SWIPE_LOCK_PX && Math.abs(dy) > Math.abs(dx)) {
        swipe.current = null;
        return;
      }
      if (Math.abs(dx) < SWIPE_LOCK_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_LOCK_RATIO) return;
      s.locked = true;
      // Отсчёт от места захвата, чтобы страница не прыгнула на 10 px.
      s.x = e.clientX;
      s.t = performance.now();
      dx = 0;
      pager.setPointerCapture(e.pointerId);
      track.style.transition = "none";
      window.getSelection()?.removeAllRanges();
      setPeek(true);
    }
    const w = pager.clientWidth;
    const pastEdge = (view === "today" && dx > 0) || (view === "garden" && dx < 0);
    const offset = Math.max(-w, Math.min(w, pastEdge ? dx * SWIPE_EDGE_RESISTANCE : dx));
    const base = view === "garden" ? -w : 0;
    track.style.transform = `translate3d(${base + offset}px,0,0)`;
  }

  function endSwipe(e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const s = swipe.current;
    swipe.current = null;
    const pager = pagerRef.current;
    const track = trackRef.current;
    if (!s || !s.locked || !pager || !track) return;
    if (pager.hasPointerCapture(e.pointerId)) pager.releasePointerCapture(e.pointerId);
    const dx = e.clientX - s.x;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - s.t);
    const commit =
      !cancelled && (Math.abs(dx) > pager.clientWidth * SWIPE_COMMIT_FRACTION || (speed > SWIPE_COMMIT_SPEED && Math.abs(dx) > SWIPE_COMMIT_MIN_PX));
    let next: View = view;
    if (commit) {
      if (dx < 0 && view === "today") next = "garden";
      else if (dx > 0 && view === "garden") next = "today";
    }
    // Возвращаем переход из класса и плавно доводим страницу до нужного положения.
    track.style.transition = "";
    track.style.transform = next === "garden" ? TRACK_GARDEN : TRACK_TODAY;
    setPeek(false);
    if (next !== view) setView(next);
  }

  const pageStyle = (active: boolean) => {
    const shown = active || peek;
    return {
      visibility: shown ? ("visible" as const) : ("hidden" as const),
      // Скрываем неактивную страницу от фокуса и экранных читалок только после окончания анимации.
      transition: `visibility 0s linear ${shown ? "0s" : "0.3s"}`,
    };
  };

  return (
    <>
      {/* Фон заливает экран до самого верха; под системные часы iOS подкладывается отступ safe-area, без своей строки состояния. */}
      <main className="flex h-dvh flex-col overflow-hidden bg-[#02001a] pt-[env(safe-area-inset-top)] text-[#5b3dff]">
        {/* Верхняя строка: лента слева, копия и настройки справа. */}
        <header className="flex min-h-14 items-center justify-between px-(--layout-gutter)">
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
            ref={pagerRef}
            className="relative min-h-0 flex-1 touch-pan-y overflow-hidden overscroll-x-none"
            onPointerDown={onSwipeDown}
            onPointerMove={onSwipeMove}
            onPointerUp={(e) => endSwipe(e, false)}
            onPointerCancel={(e) => endSwipe(e, true)}
          >
            <div
              ref={trackRef}
              className="flex h-full w-[200%] transition-transform duration-300 ease-out will-change-transform motion-reduce:transition-none"
              style={{ transform: view === "garden" ? TRACK_GARDEN : TRACK_TODAY }}
            >
              {/* Экран «Сегодня» */}
              <section className="flex h-full w-1/2 flex-col px-(--layout-gutter) pb-32" style={pageStyle(view === "today")}>
                <DayStrip
                  today={today}
                  selected={selected}
                  plants={plants}
                  onSelect={selectDay}
                  onOpen={openDate}
                />
                {/* Содержимое выбранного дня. Меняется сразу, без угасания: так работает скраббинг. Новый день чуть проявляется. */}
                <div key={shownDay} className="flex min-h-0 flex-1 flex-col transition-opacity duration-150 starting:opacity-60 motion-reduce:transition-none">
                  {hasShownEntry ? (
                    // Запись за день: растение и сама запись. Касание растения или пустого места открывает редактор
                    // (текст, фото, удаление); карточка записи открывает его сама через onOpen.
                    <div
                      className="min-h-0 flex-1 cursor-pointer overflow-y-auto pt-4"
                      onClick={(e) => {
                        if (e.target === e.currentTarget) openDate(shownDay);
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => openDate(shownDay)}
                        aria-label={shownDay === today ? "Изменить запись за сегодня" : `Изменить запись за ${formatShort(shownDay)}`}
                        className="mx-auto mb-4 grid size-36 place-items-center rounded-full transition-transform duration-(--duration-fast) active:scale-95"
                      >
                        <StripPlant
                          plant={shownPlant}
                          dateKey={shownDay}
                          strokeWidth={2.4}
                          className={`size-28 ${planted === shownDay ? "animate-pulse" : ""}`}
                        />
                      </button>
                      <MemoryFeed entries={shownEntries} store={photoStore} onOpen={openDate} />
                    </div>
                  ) : (
                    <div className="grid flex-1 place-items-center">
                      <PlantButton label={shownDay === today ? "Посадить воспоминание" : `Записать ${formatShort(shownDay)}`} onClick={() => openDate(shownDay)} />
                    </div>
                  )}
                </div>
              </section>

              {/* Экран «Сад»: полотно точек */}
              <section className="h-full w-1/2 overflow-y-auto px-(--layout-gutter) pb-32 pt-2" style={pageStyle(view === "garden")}>
                {Object.keys(state.entries).length === 0 && <p className="mb-4 text-center font-mono text-sm">Пока здесь одни семена. Начнём с сегодняшнего дня?</p>}

                <GardenDots year={year} today={today} plants={plants} plantedKey={planted} onOpen={openDate} />

                <p className="mt-6 text-center font-mono text-xs tabular-nums opacity-70">
                  Записей: {entryCountThisYear} из {total} · прошло {elapsed} дн.
                </p>
              </section>
            </div>
          </div>
        )}

        {/* Нижняя панель. Порядок кнопок совпадает с порядком экранов: «Сегодня» слева, «Сад» справа,
            как и сами экраны (свайп влево открывает «Сад»). Подсветка следит за тем, какой экран на самом деле открыт. */}
        <nav aria-label="Разделы" className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto flex gap-1 rounded-3xl border border-[#5b3dff]/30 bg-[#16103f]/80 p-1.5 backdrop-blur">
            <NavButton active={view === "today"} label="Сегодня" onClick={() => setView("today")}>
              <IconFlower className="size-9" />
            </NavButton>
            <NavButton active={view === "garden"} label="Сад" onClick={() => setView("garden")}>
              <IconGardenGroup className="h-8 w-14" />
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
