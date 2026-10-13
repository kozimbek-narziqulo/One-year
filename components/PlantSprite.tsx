import { memo } from "react";
import type { Mood } from "../lib/types.ts";
import { GROUND, plantGeometry, plantSpec, VIEWBOX } from "../lib/plants.ts";

// Полные строки классов, чтобы Tailwind их увидел при сборке.
const BLOOM_FILL: Record<Mood | 0, string> = {
  0: "fill-bloom-neutral",
  1: "fill-mood-1",
  2: "fill-mood-2",
  3: "fill-mood-3",
  4: "fill-mood-4",
  5: "fill-mood-5",
};

export interface PlantSpriteProps {
  /** Номер дня в году, 1..366. */
  day: number;
  mood: Mood | null;
  /** 0 семя, 1 росток, 2 бутон, 3 цветок. */
  stage?: 0 | 1 | 2 | 3;
  /** Анимация роста при сохранении записи. */
  animate?: boolean;
  className?: string;
}

function PlantSpriteBase({ day, mood, stage = 3, animate = false, className }: PlantSpriteProps) {
  const cls = `plant${animate ? " grow" : ""}${className ? ` ${className}` : ""}`;
  const bloom = BLOOM_FILL[mood ?? 0];

  if (stage <= 0) {
    return (
      <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} className={cls} aria-hidden="true" focusable="false">
        <ellipse cx={GROUND.x} cy={GROUND.y - 1.5} rx={2.6} ry={1.8} className="fill-stem" />
      </svg>
    );
  }

  const g = plantGeometry(plantSpec(day));
  const s = g.stem;

  if (stage === 1) {
    const y = GROUND.y - (GROUND.y - s.y1) * 0.35;
    const x = GROUND.x + (s.x1 - GROUND.x) * 0.35;
    return (
      <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} className={cls} aria-hidden="true" focusable="false">
        <path className="stem stroke-stem" d={`M${GROUND.x} ${GROUND.y} L${x} ${y}`} strokeWidth={2} strokeLinecap="round" fill="none" />
        <ellipse className="leaf fill-leaf" cx={x - 2.4} cy={y + 1} rx={1.6} ry={3} transform={`rotate(-50 ${x} ${y})`} />
        <ellipse className="leaf fill-leaf" cx={x + 2.4} cy={y + 1} rx={1.6} ry={3} transform={`rotate(50 ${x} ${y})`} />
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} className={cls} aria-hidden="true" focusable="false">
      <path className="stem stroke-stem" d={`M${s.x0} ${s.y0} Q${s.cx} ${s.cy} ${s.x1} ${s.y1}`} strokeWidth={2} strokeLinecap="round" fill="none" />
      {g.leaves.map((l, i) => (
        <ellipse key={i} className="leaf fill-leaf" cx={l.cx} cy={l.cy} rx={l.rx} ry={l.ry} transform={`rotate(${l.rot} ${l.ox} ${l.oy})`} />
      ))}
      {stage === 2 ? (
        <circle className="bud" cx={g.core.cx} cy={g.core.cy} r={3.2} />
      ) : (
        <>
          <g className={`bloom ${bloom}`}>
            {g.petals.map((p, i) => (
              <ellipse key={i} className="petal" cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} transform={`rotate(${p.rot} ${p.ox} ${p.oy})`} />
            ))}
          </g>
          <circle className="core fill-bloom-core" cx={g.core.cx} cy={g.core.cy} r={g.core.r} />
        </>
      )}
    </svg>
  );
}

export const PlantSprite = memo(PlantSpriteBase);
