"use client";

import { useRef, type KeyboardEvent } from "react";
import { MOOD_VALUES, type Mood } from "../lib/types.ts";
import { MOOD_LABELS } from "../lib/moods.ts";
import { MoodFace } from "./MoodFace.tsx";

const IDLE: Record<Mood, string> = {
  1: "border-mood-1 text-mood-1",
  2: "border-mood-2 text-mood-2",
  3: "border-mood-3 text-mood-3",
  4: "border-mood-4 text-mood-4",
  5: "border-mood-5 text-mood-5",
};
const ACTIVE: Record<Mood, string> = {
  1: "border-mood-1 bg-mood-1 text-on-mood-1",
  2: "border-mood-2 bg-mood-2 text-on-mood-2",
  3: "border-mood-3 bg-mood-3 text-on-mood-3",
  4: "border-mood-4 bg-mood-4 text-on-mood-4",
  5: "border-mood-5 bg-mood-5 text-on-mood-5",
};

export interface MoodPickerProps {
  value: Mood | null;
  onChange: (m: Mood | null) => void;
}

/** Пять ступеней настроения. Цвет не единственный носитель: у каждой есть лицо и слово. */
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
      <div ref={group} role="radiogroup" aria-label="Настроение дня" onKeyDown={onKeyDown} className="flex gap-2">
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
              className={`grid size-12 place-items-center rounded-full border-2 transition-colors duration-(--duration-fast) max-[360px]:size-11 ${
                selected ? ACTIVE[m] : `bg-transparent hover:bg-accent-subtle ${IDLE[m]}`
              }`}
            >
              <MoodFace mood={m} className="size-6" />
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-text-muted" aria-live="polite">
        {value ? MOOD_LABELS[value] : "Настроение не выбрано"}
      </p>
    </div>
  );
}
