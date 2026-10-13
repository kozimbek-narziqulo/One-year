import type { Mood } from "../lib/types.ts";
import { PlantSketch } from "./SketchUI.tsx";

/** Цвет растения по настроению. Классы записаны целиком, чтобы Tailwind их не вырезал. */
export const MOOD_TONE: Record<Mood, string> = {
  1: "text-mood-1",
  2: "text-mood-2",
  3: "text-mood-3",
  4: "text-mood-4",
  5: "text-mood-5",
};

export interface MoodFlowerProps {
  /** null — настроение ещё не выбрано: растение рисуется основным акцентным цветом. */
  mood: Mood | null;
  /** Форма растения дня (индекс в библиотеке из SketchUI). Форма не зависит от настроения. */
  shapeId: number;
  className?: string;
}

/** Растение дня в окне выбора настроения: форма фиксирована, цвет меняется вместе с настроением. */
export function MoodFlower({ mood, shapeId, className }: MoodFlowerProps) {
  const tone = mood ? MOOD_TONE[mood] : "text-(color:--ink)";

  return (
    <PlantSketch
      shapeId={shapeId}
      strokeWidth={2.4}
      wobble
      double
      className={`${tone} transition-colors duration-300 ${className ?? ""}`}
    />
  );
}
