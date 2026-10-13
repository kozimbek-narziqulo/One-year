"use client";

import { useRef, type KeyboardEvent } from "react";
import { MOOD_VALUES, type Mood } from "../lib/types.ts";
import { MOOD_LABELS } from "../lib/moods.ts";

const DOT: Record<Mood, string> = {
  1: "bg-mood-1",
  2: "bg-mood-2",
  3: "bg-mood-3",
  4: "bg-mood-4",
  5: "bg-mood-5",
};

export interface MoodPickerProps {
  value: Mood | null;
  onChange: (m: Mood | null) => void;
}

/** Пять ступеней настроения — цветные точки. Цвет не единственный носитель: выбранная точка крупнее, под рядом подпись словом. */
export function MoodPicker({ value, onChange }: MoodPickerProps) {
  const group = useRef<HTMLDivElement>(null);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    // Идём от кнопки, на которой фокус (а не от выбранной): так работают стандартные группы радиокнопок.
    const focused = Number((e.target as HTMLElement).closest<HTMLElement>("[data-mood]")?.dataset.mood);
    const cur = focused >= 1 && focused <= 5 ? focused : (value ?? (step > 0 ? 0 : 6));
    const next = Math.min(5, Math.max(1, cur + step)) as Mood;
    onChange(next);
    group.current?.querySelector<HTMLElement>(`[data-mood="${next}"]`)?.focus();
  }

  return (
    <div>
      <div ref={group} role="radiogroup" aria-label="Настроение дня" onKeyDown={onKeyDown} className="-ml-2 flex">
        {MOOD_VALUES.map((m) => {
          const selected = value === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`Настроение ${m} из 5, ${MOOD_LABELS[m]}`}
              data-mood={m}
              tabIndex={selected || (value === null && m === 1) ? 0 : -1}
              onClick={() => onChange(selected ? null : m)}
              className="group grid size-11 place-items-center rounded-full outline-offset-0"
            >
              <span
                aria-hidden="true"
                className={`block size-5 rounded-full transition-all duration-(--duration-fast) ${DOT[m]} ${
                  selected ? "scale-[1.5]" : value === null ? "group-hover:scale-110" : "opacity-45 group-hover:opacity-100"
                }`}
              />
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-sm text-text-muted" aria-live="polite">
        {value ? MOOD_LABELS[value] : "Настроение не выбрано"}
      </p>
    </div>
  );
}
