"use client";

import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  addDays,
  compareKeys,
  dayOfYear,
  daysInMonth,
  formatShort,
  makeKey,
  monthName,
  parseKey,
  WEEKDAYS_SHORT,
  yearGrid,
  yearOf,
  type DateKey,
} from "../lib/date.ts";
import { moodLabel } from "../lib/moods.ts";
import type { Entry } from "../lib/types.ts";
import type { EntryMap } from "../lib/repo.ts";
import { PlantSprite } from "./PlantSprite.tsx";

export interface FocusRequest {
  key: DateKey;
  /** Перевести фокус клавиатуры на клетку (false: только прокрутить). */
  focus: boolean;
  n: number;
}

export interface GardenFieldProps {
  year: number;
  entries: EntryMap;
  today: DateKey;
  /** Дата, для которой только что сохранили запись: её растение «вырастает». */
  plantedKey: DateKey | null;
  focusRequest: FocusRequest | null;
  onOpen: (key: DateKey) => void;
}

const cellId = (k: DateKey) => `cell-${k}`;

function describe(key: DateKey, entry: Entry | undefined, isToday: boolean, isFuture: boolean): string {
  const date = formatShort(key);
  if (isFuture) return `${date}, ещё не наступило`;
  const prefix = isToday ? `Сегодня, ${date}` : date;
  if (!entry) return `${prefix}, записи нет`;
  return entry.mood ? `${prefix}, запись, настроение: ${moodLabel(entry.mood)}` : `${prefix}, запись`;
}

interface CellProps {
  dateKey: DateKey;
  entry: Entry | undefined;
  isToday: boolean;
  isFuture: boolean;
  tabbable: boolean;
  animate: boolean;
  onActivate: (k: DateKey) => void;
  onFocusCell: (k: DateKey) => void;
}

const Cell = memo(function Cell({ dateKey, entry, isToday, isFuture, tabbable, animate, onActivate, onFocusCell }: CellProps) {
  const p = parseKey(dateKey);
  const glyphVar = "var(--garden-comfortable-glyph)";
  const base =
    "relative flex aspect-square w-full flex-col items-center justify-center rounded-cell border transition-colors duration-(--duration-fast) hover:bg-accent-subtle";
  const skin = isFuture ? "border-transparent bg-transparent" : "border-border bg-surface";
  const ring = isToday ? "outline-2 outline-offset-2 outline-accent" : "";
  return (
    <button
      id={cellId(dateKey)}
      type="button"
      data-date={dateKey}
      role="gridcell"
      aria-label={describe(dateKey, entry, isToday, isFuture)}
      aria-disabled={isFuture || undefined}
      tabIndex={tabbable ? 0 : -1}
      onClick={() => onActivate(dateKey)}
      onFocus={() => onFocusCell(dateKey)}
      className={`${base} ${skin} ${ring}`}
    >
      <span className={`text-xs leading-none ${isToday ? "font-semibold text-text" : "text-text-muted"}`} aria-hidden="true">
        {p?.d}
      </span>
      <span className="mt-0.5 grid place-items-center" style={{ width: glyphVar, height: glyphVar }} aria-hidden="true">
        {entry ? (
          <PlantSprite day={dayOfYear(dateKey)} mood={entry.mood} animate={animate} className="size-full" />
        ) : (
          <span className={`rounded-full ${isFuture ? "size-1 bg-border" : "size-1.5 bg-border-input"}`} />
        )}
      </span>
    </button>
  );
});

export function GardenField({ year, entries, today, plantedKey, focusRequest, onOpen }: GardenFieldProps) {
  const [focusKeyRaw, setFocusKey] = useState<DateKey>(today);
  const pendingFocus = useRef(false);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  // Единственная клетка в Tab-порядке: последняя, на которой был фокус, иначе сегодня, иначе 1 января.
  const focusKey = yearOf(focusKeyRaw) === year ? focusKeyRaw : yearOf(today) === year ? today : makeKey(year, 1, 1);

  const onActivate = useCallback((k: DateKey) => openRef.current(k), []);
  const onFocusCell = useCallback((k: DateKey) => setFocusKey(k), []);

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    document.getElementById(cellId(focusKey))?.focus();
  }, [focusKey]);

  useEffect(() => {
    if (!focusRequest) return;
    const el = document.getElementById(cellId(focusRequest.key));
    if (!el) return;
    setFocusKey(focusRequest.key);
    el.scrollIntoView({ block: "center" });
    if (focusRequest.focus) el.focus({ preventScroll: true });
  }, [focusRequest]);

  function moveTo(next: DateKey) {
    pendingFocus.current = true;
    setFocusKey(next);
    // Если тот же ключ, эффект выше не сработает: фокусируем сразу.
    if (next === focusKey) {
      pendingFocus.current = false;
      document.getElementById(cellId(next))?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-date]");
    const key = target?.dataset.date;
    const p = key ? parseKey(key) : null;
    if (!key || !p) return;
    let next: DateKey | null = null;
    switch (e.key) {
      case "ArrowLeft": next = addDays(key, -1); break;
      case "ArrowRight": next = addDays(key, 1); break;
      case "ArrowUp": next = addDays(key, -7); break;
      case "ArrowDown": next = addDays(key, 7); break;
      case "Home": next = makeKey(p.y, p.m, 1); break;
      case "End": next = makeKey(p.y, p.m, daysInMonth(p.y, p.m)); break;
      case "PageUp": if (p.m > 1) next = makeKey(p.y, p.m - 1, Math.min(p.d, daysInMonth(p.y, p.m - 1))); break;
      case "PageDown": if (p.m < 12) next = makeKey(p.y, p.m + 1, Math.min(p.d, daysInMonth(p.y, p.m + 1))); break;
      default: return;
    }
    if (next && yearOf(next) === year) {
      e.preventDefault();
      moveTo(next);
    } else if (next) {
      e.preventDefault();
    }
  }

  const months = yearGrid(year);
  const gap = "var(--garden-comfortable-gap)";

  return (
    <div
      role="grid"
      aria-label={`Сад ${year} года`}
      onKeyDown={onKeyDown}
      className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 md:grid-cols-3"
    >
      {months.map((m) => (
        <section key={m.month} className="min-w-0">
          <h2 className="flex items-center text-lg capitalize text-text" style={{ height: "var(--garden-month-header)" }}>
            {monthName(m.month)}
          </h2>
          <div role="rowgroup" aria-label={monthName(m.month)} className="flex flex-col" style={{ gap }}>
          <div role="row" className="grid grid-cols-7" style={{ gap }}>
            {WEEKDAYS_SHORT.map((d) => (
              <span key={d} role="columnheader" className="pb-1 text-center text-xs text-text-muted">
                {d}
              </span>
            ))}
          </div>
            {m.weeks.map((week, wi) => (
              <div key={wi} role="row" className="grid grid-cols-7" style={{ gap }}>
                {week.map((k, di) =>
                  k === null ? (
                    <div key={`e${di}`} role="gridcell" aria-hidden="true" />
                  ) : (
                    <Cell
                      key={k}
                      dateKey={k}
                      entry={entries[k]}
                      isToday={k === today}
                      isFuture={compareKeys(k, today) > 0}
                      tabbable={k === focusKey}
                      animate={k === plantedKey}
                      onActivate={onActivate}
                      onFocusCell={onFocusCell}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
