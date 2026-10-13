import type { Mood } from "./types.ts";

export const MOOD_LABELS: Record<Mood, string> = {
  1: "очень плохо",
  2: "плохо",
  3: "так себе",
  4: "хорошо",
  5: "очень хорошо",
};

/** Рот лица, окружность 24x24, линия 2px. Глаза рисует компонент. */
export const MOOD_MOUTH: Record<Mood, string> = {
  1: "M7.5 17 Q12 11.5 16.5 17",
  2: "M8 16.2 Q12 13 16 16.2",
  3: "M8 15.5 L16 15.5",
  4: "M8 14.2 Q12 17.4 16 14.2",
  5: "M7 13.6 Q12 19.6 17 13.6",
};

export const moodLabel = (m: Mood | null): string => (m ? MOOD_LABELS[m] : "настроение не выбрано");
