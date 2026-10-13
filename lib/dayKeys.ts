import type { DateKey } from "./date.ts";

function toKey(t: Date): DateKey {
  return t.toISOString().slice(0, 10) as DateKey;
}

/** Все дни года по порядку: "2026-01-01" … "2026-12-31" (365 или 366 штук). */
export function keysOfYear(year: number): DateKey[] {
  const out: DateKey[] = [];
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCFullYear() === year) {
    out.push(toKey(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Сдвиг даты на N дней (можно отрицательное число). */
export function shiftKey(key: DateKey, days: number): DateKey {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const d = Number(key.slice(8, 10));
  return toKey(new Date(Date.UTC(y, m - 1, d + days)));
}

/** Стабильное число для даты: из него выбираем вид растения и лёгкий «сдвиг» точки, чтобы сад не выглядел решёткой. */
export function plantSeedOf(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}
