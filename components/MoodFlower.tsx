import type { Mood } from "../lib/types.ts";

const TONE: Record<Mood, string> = {
  1: "text-mood-1",
  2: "text-mood-2",
  3: "text-mood-3",
  4: "text-mood-4",
  5: "text-mood-5",
};

/** Наклон головки: чем хуже настроение, тем сильнее цветок «поник». */
const TILT: Record<Mood, number> = { 1: 38, 2: 22, 3: 10, 4: 0, 5: 0 };

const PETAL_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export interface MoodFlowerProps {
  /** null — настроение ещё не выбрано: цветок рисуется основным акцентным цветом. */
  mood: Mood | null;
  className?: string;
}

/** Простой цветок-линия для окна выбора настроения. Цвет и наклон зависят от настроения. */
export function MoodFlower({ mood, className }: MoodFlowerProps) {
  const tone = mood ? TONE[mood] : "text-(color:--ink)";
  const tilt = mood ? TILT[mood] : 10;
  const petal = 11 + (mood ?? 3) * 2.2;

  return (
    <svg
      viewBox="0 0 120 160"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${tone} transition-colors duration-300 ${className ?? ""}`}
      style={{ filter: "drop-shadow(0 0 10px currentColor)" }}
    >
      <path d="M60 152 C 60 130 60 110 60 82" />
      <path d="M60 128 C 44 116 30 122 34 134 C 44 140 55 136 60 128" />
      <path d="M60 116 C 74 106 88 110 85 121 C 76 126 66 124 60 116" />
      <g style={{ transform: `rotate(${tilt}deg)`, transformOrigin: "60px 70px", transformBox: "view-box", transition: "transform 300ms ease" }}>
        {PETAL_ANGLES.map((a) => (
          <ellipse key={a} cx={60} cy={70 - 9 - petal * 0.9} rx={8} ry={petal} transform={`rotate(${a} 60 70)`} />
        ))}
        <circle cx={60} cy={70} r={8} />
      </g>
    </svg>
  );
}
