import type { Mood } from "../lib/types.ts";
import { MOOD_MOUTH } from "../lib/moods.ts";

/** Лицо настроения: окружность, глаза, рот. Цвет берёт у текста (currentColor). */
export function MoodFace({ mood, className }: { mood: Mood; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx={12} cy={12} r={9.5} />
      <circle cx={9} cy={9.5} r={0.4} />
      <circle cx={15} cy={9.5} r={0.4} />
      <path d={MOOD_MOUTH[mood]} />
    </svg>
  );
}
