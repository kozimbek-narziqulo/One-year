// Календарные даты как строки "YYYY-MM-DD" в местном времени пользователя.
// Date из UTC-строк не парсим никогда: "2026-10-11" как UTC в часовых поясах западнее
// Гринвича превратился бы в 10 октября.

export type DateKey = string;

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function makeKey(y: number, m: number, d: number): DateKey {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

export function daysInYear(y: number): number {
  return isLeap(y) ? 366 : 365;
}

export function parseKey(key: string): { y: number; m: number; d: number } | null {
  const mt = RE.exec(key);
  if (!mt) return null;
  const y = Number(mt[1]);
  const m = Number(mt[2]);
  const d = Number(mt[3]);
  if (y < 1900 || y > 2999 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export const isValidKey = (key: unknown): key is DateKey => typeof key === "string" && parseKey(key) !== null;

export function todayKey(now: Date = new Date()): DateKey {
  return makeKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Порядковый номер дня в году, 1..366. */
export function dayOfYear(key: DateKey): number {
  const p = parseKey(key);
  if (!p) throw new RangeError(`bad date key: ${key}`);
  const cum = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return (cum[p.m - 1] ?? 0) + p.d + (isLeap(p.y) && p.m > 2 ? 1 : 0);
}

/** Сдвиг на n дней. Считаем в UTC-полдень только как календарь, часовой пояс не влияет. */
export function addDays(key: DateKey, n: number): DateKey {
  const p = parseKey(key);
  if (!p) throw new RangeError(`bad date key: ${key}`);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n, 12));
  return makeKey(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** День недели, понедельник = 0 ... воскресенье = 6. */
export function weekdayMon0(key: DateKey): number {
  const p = parseKey(key);
  if (!p) throw new RangeError(`bad date key: ${key}`);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d, 12));
  return (t.getUTCDay() + 6) % 7;
}

export const compareKeys = (a: DateKey, b: DateKey) => (a < b ? -1 : a > b ? 1 : 0);

export const yearOf = (key: DateKey): number => Number(key.slice(0, 4));

export interface MonthGrid {
  month: number; // 1..12
  weeks: (DateKey | null)[][]; // недели с понедельника, по 7 мест; null = пустое место
}

/** Месяцы года, выровненные по дням недели (неделя с понедельника). */
export function yearGrid(year: number): MonthGrid[] {
  const out: MonthGrid[] = [];
  for (let m = 1; m <= 12; m++) {
    const first = makeKey(year, m, 1);
    const lead = weekdayMon0(first);
    const n = daysInMonth(year, m);
    const cells: (DateKey | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= n; d++) cells.push(makeKey(year, m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (DateKey | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    out.push({ month: m, weeks });
  }
  return out;
}

const MONTHS_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WEEKDAYS = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
export const WEEKDAYS_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

export const monthName = (m: number) => MONTHS_NOM[m - 1] ?? "";

/** «11 октября» */
export function formatShort(key: DateKey): string {
  const p = parseKey(key);
  return p ? `${p.d} ${MONTHS_GEN[p.m - 1]}` : key;
}

/** «воскресенье, 11 октября» (с годом, если он не текущий) */
export function formatLong(key: DateKey, now: Date = new Date()): string {
  const p = parseKey(key);
  if (!p) return key;
  const wd = WEEKDAYS[weekdayMon0(key)];
  const y = p.y !== now.getFullYear() ? ` ${p.y}` : "";
  return `${wd}, ${p.d} ${MONTHS_GEN[p.m - 1]}${y}`;
}

/** Сколько дней года уже прошло включительно по сегодня (для текущего года), весь год для прошлых, 0 для будущих. */
export function daysElapsed(year: number, today: DateKey): number {
  const ty = yearOf(today);
  if (year < ty) return daysInYear(year);
  if (year > ty) return 0;
  return dayOfYear(today);
}
