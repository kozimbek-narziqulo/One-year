"use client";

import { memo, useMemo } from "react";
import { compareKeys, formatShort, type DateKey } from "../lib/date.ts";
import { keysOfYear, plantSeedOf } from "../lib/dayKeys.ts";
import type { Mood } from "../lib/types.ts";
import { MOOD_TONE } from "./MoodFlower.tsx";
import { PlantSketch, resolveShapeId } from "./SketchUI.tsx";

const COLUMNS = 14;

/** Что нужно саду знать о записи, чтобы нарисовать её растение. */
export interface GardenPlant {
  /** Сохранённая форма. У старых записей её нет: тогда форма берётся по дате и больше не меняется. */
  shapeId?: number | null;
  mood: Mood | null;
}

type Props = {
  year: number;
  today: DateKey;
  /** Записи по датам. Передавайте через useMemo, иначе сад будет перерисовываться целиком. */
  plants: ReadonlyMap<string, GardenPlant>;
  /** Дата, которую только что сохранили: её растение коротко «оживает». */
  plantedKey: DateKey | null;
  onOpen: (key: DateKey) => void;
};

/** Полотно года: по одной маленькой точке на каждый день. Если есть запись, на месте точки вырастает её растение. */
export const GardenDots = memo(function GardenDots({ year, today, plants, plantedKey, onOpen }: Props) {
  const keys = useMemo(() => keysOfYear(year), [year]);

  return (
    <ol
      aria-label={`Сад ${year}`}
      className="mx-auto grid w-full max-w-sm"
      style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}
    >
      {keys.map((key) => {
        const seed = plantSeedOf(key);
        const plant = plants.get(key);
        const hasEntry = plant !== undefined;
        const isFuture = compareKeys(key, today) > 0;
        const isToday = key === today;
        // Небольшой детерминированный сдвиг (до 3 px), чтобы точки лежали «от руки», а не по линейке.
        const dx = (seed % 7) - 3;
        const dy = ((seed >>> 3) % 7) - 3;

        return (
          <li key={key} className="aspect-square">
            <button
              type="button"
              onClick={() => onOpen(key)}
              aria-label={`${formatShort(key)}${hasEntry ? ", есть запись" : isFuture ? "" : ", записи нет"}`}
              aria-current={isToday ? "date" : undefined}
              className="grid size-full place-items-center rounded-full text-[#6b4dff]"
            >
              <span className="grid place-items-center" style={{ transform: `translate(${dx}px, ${dy}px)` }}>
                {hasEntry ? (
                  <PlantSketch
                    shapeId={resolveShapeId(plant.shapeId, key)}
                    strokeWidth={3}
                    className={`size-6 ${plant.mood ? MOOD_TONE[plant.mood] : "text-[#9a85ff]"} ${plantedKey === key ? "animate-pulse" : ""}`}
                  />
                ) : (
                  <span
                    className={
                      isToday
                        ? "size-2 rounded-full bg-[#9a85ff] ring-4 ring-[#5b3dff]/30"
                        : `size-1 rounded-full bg-current ${isFuture ? "opacity-30" : "opacity-80"}`
                    }
                  />
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
});
