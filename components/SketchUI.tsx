"use client";

import { forwardRef, memo, type ReactNode } from "react";

/*
 * Карандашные элементы окна записи. Всё нарисовано вручную как SVG-пути с неровными линиями,
 * а «дрожание» карандаша добавляет SVG-фильтр (шум + смещение). Цвета берутся из переменных,
 * которые задаёт форма в EntryModal: --ink, --ink-deep, --ink-soft.
 */

const FRAME_A = "M7 8 C 20 6, 40 9, 57 7 C 58 22, 56 40, 58 57 C 40 59, 22 56, 6 58 C 8 42, 5 24, 7 8 Z";
const FRAME_B = "M9 6 C 24 9, 42 5, 58 9 C 55 24, 59 42, 56 59 C 38 56, 20 60, 8 56 C 5 40, 9 22, 9 6";
const BLOB = "M10 30 C 8 14, 30 8, 60 11 C 90 6, 124 10, 130 24 C 136 38, 118 50, 90 47 C 62 52, 28 52, 14 44 C 8 40, 10 34, 10 30 Z";

/** Общие фильтры и штриховка. Вставьте один раз в разметку окна. */
export function SketchDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
      <defs>
        <filter id="entry-sk-wobble" x="-12%" y="-12%" width="124%" height="124%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="entry-sk-blob" x="-15%" y="-30%" width="130%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="9" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feGaussianBlur in="d" stdDeviation="0.9" />
        </filter>
        <pattern id="entry-sk-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" strokeWidth="1.2" opacity="0.5" style={{ stroke: "var(--ink)" }} />
        </pattern>
        <pattern id="entry-sk-hatch-light" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <line x1="0" y1="0" x2="0" y2="6" strokeWidth="1.3" opacity="0.28" style={{ stroke: "var(--ink-soft)" }} />
        </pattern>
      </defs>
    </svg>
  );
}

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Кривоватая двойная рамка квадрата; с hatch — залита лёгкой штриховкой. */
function FrameBox({ hatch }: { hatch?: boolean }) {
  return (
    <g filter="url(#entry-sk-wobble)" {...STROKE}>
      {hatch && (
        <>
          <path d={FRAME_A} stroke="none" style={{ fill: "var(--ink)", fillOpacity: 0.14 }} />
          <path d={FRAME_A} stroke="none" fill="url(#entry-sk-hatch)" />
        </>
      )}
      <path d={FRAME_A} />
      <path d={FRAME_B} opacity={0.55} />
    </g>
  );
}

export type SketchIconName = "gallery" | "camera" | "trash";

function IconDrawing({ icon }: { icon: SketchIconName }) {
  if (icon === "gallery") {
    return (
      <g filter="url(#entry-sk-wobble)" {...STROKE}>
        <path d="M14 24 C 22 23, 32 25, 40 23" />
        <path d="M14 24 C 13 32, 15 42, 14 50 C 24 51, 34 49, 44 51 C 43 44, 45 38, 44 32" />
        <path d="M15 47 L 24 36 L 30 43 L 35 37 L 44 48" />
        <path d="M22 31 C 22 29, 26 29, 26 31 C 26 33, 22 33, 22 31" />
        <path d="M48 13 C 48 18, 48 22, 48 26" />
        <path d="M42 20 C 46 20, 50 20, 54 20" />
      </g>
    );
  }
  if (icon === "camera") {
    return (
      <g filter="url(#entry-sk-wobble)" {...STROKE}>
        <path d="M12 26 C 22 24, 40 27, 52 25 C 53 33, 51 42, 52 50 C 40 52, 24 49, 12 51 C 14 43, 11 34, 12 26 Z" />
        <path d="M24 25 L 27 19 C 31 18, 35 19, 38 19 L 41 25" />
        <path d="M23 38 C 23 33, 27 29, 32 29 C 37 29, 41 33, 41 38 C 41 43, 37 47, 32 47 C 27 47, 23 43, 23 38" />
        <path d="M28 38 C 28 35, 30 34, 32 34 C 34 34, 36 36, 36 38 C 36 40, 34 42, 32 42 C 30 42, 28 40, 28 38" opacity={0.7} />
        <path d="M46 31 L 46.5 31.5" strokeWidth={3} />
      </g>
    );
  }
  return (
    <g filter="url(#entry-sk-wobble)" {...STROKE}>
      <path d="M16 21 C 26 19, 38 22, 48 19" />
      <path d="M26 20 L 27 14 C 30 13, 34 13, 37 14 L 38 19" />
      <path d="M19 25 C 20 33, 19 42, 21 52 C 28 53, 36 51, 43 52 C 44 42, 44 33, 45 25" />
      <path d="M28 31 C 28 37, 28 42, 28 46" />
      <path d="M36 31 C 36 37, 36 42, 36 46" />
    </g>
  );
}

export interface SketchIconButtonProps {
  icon: SketchIconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Размер и прочее, например "size-14". */
  className?: string;
  /** Без рамки-квадрата: только набросок значка. */
  bare?: boolean;
}

/** Квадратная кнопка, нарисованная от руки, с набросанным значком внутри. */
export function SketchIconButton({ icon, label, onClick, disabled, className = "size-14", bare }: SketchIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`relative grid shrink-0 place-items-center rounded-xl text-(color:--ink) transition-opacity disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(color:--ink) ${className}`}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true" className="size-full overflow-visible">
        {!bare && <FrameBox hatch />}
        <IconDrawing icon={icon} />
      </svg>
    </button>
  );
}

/** Кривоватый квадрат с точкой по центру: нарисован карандашом. */
export function SketchSquare({ className = "size-[4.5rem]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={`overflow-visible text-(color:--ink) ${className}`}>
      <FrameBox />
      <g filter="url(#entry-sk-wobble)">
        <circle cx="32" cy="32" r="2.6" fill="currentColor" />
      </g>
    </svg>
  );
}

/** Крестик закрытия, нарисованный двумя неровными штрихами. */
export function SketchCloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-xl text-(color:--ink-soft) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(color:--ink)"
    >
      <svg viewBox="0 0 64 64" aria-hidden="true" className="size-9 overflow-visible">
        <g filter="url(#entry-sk-wobble)" {...STROKE} strokeWidth={3}>
          <path d="M16 17 C 25 27, 37 38, 48 48" />
          <path d="M48 16 C 38 27, 27 38, 16 49" />
        </g>
      </svg>
    </button>
  );
}

export interface SketchDoneButtonProps {
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** «Done»: неровное заштрихованное пятно с мягкими краями и светлым рукописным текстом. */
export const SketchDoneButton = forwardRef<HTMLButtonElement, SketchDoneButtonProps>(function SketchDoneButton({ children, disabled, className = "" }, ref) {
  return (
    <button
      ref={ref}
      type="submit"
      disabled={disabled}
      className={`relative grid h-14 min-w-36 place-items-center rounded-2xl px-9 text-2xl leading-none text-[#f1f0ff] transition-opacity active:opacity-80 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(color:--ink) ${className}`}
    >
      <svg viewBox="0 0 140 56" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 size-full overflow-visible">
        <g filter="url(#entry-sk-blob)">
          <path d={BLOB} style={{ fill: "var(--ink-deep)" }} />
          <path d={BLOB} fill="url(#entry-sk-hatch-light)" />
        </g>
      </svg>
      <span className="relative">{children}</span>
    </button>
  );
});

/* ================================================================================================
 * БИБЛИОТЕКА РАСТЕНИЙ
 *
 * Каждое растение — набор SVG-путей в квадрате 64×64, корень у нижнего края (y ≈ 58).
 * Цвет НЕ зашит: рисуем через currentColor, цвет задаёт настроение снаружи.
 *
 * ВАЖНО: shapeId — это индекс в массиве PLANTS. Порядок менять и растения удалять нельзя,
 * иначе у старых записей поменяется форма. Новые растения добавляйте только в КОНЕЦ.
 *
 * Неровность линий: пути собираются небольшими помощниками со «случайным», но детерминированным
 * дрожанием (генератор с фиксированным зерном). Результат одинаков при каждом запуске и на сервере,
 * поэтому форма не «прыгает» при перезагрузке и нет рассинхрона при гидратации.
 * ============================================================================================== */
// @plants-begin
type Rng = () => number;
type Pt = [number, number];

export interface PlantDef {
  name: string;
  /** Линии контура. */
  strokes: string[];
  /** Замкнутые контуры, которые слегка закрашиваются (с прозрачностью). */
  fills?: string[];
}

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (v: number) => String(Math.round(v * 10) / 10);
const rad = (deg: number) => (deg * Math.PI) / 180;
const jit = (r: Rng, a: number) => (r() - 0.5) * 2 * a;
const P = (p: Pt) => `${n(p[0])} ${n(p[1])}`;

/** Кубическая кривая и функция «точка на кривой» (чтобы крепить листья к стеблю). */
function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt) {
  const at = (t: number): Pt => {
    const u = 1 - t;
    const k0 = u * u * u;
    const k1 = 3 * u * u * t;
    const k2 = 3 * u * t * t;
    const k3 = t * t * t;
    return [k0 * p0[0] + k1 * p1[0] + k2 * p2[0] + k3 * p3[0], k0 * p0[1] + k1 * p1[1] + k2 * p2[1] + k3 * p3[1]];
  };
  return { d: `M${P(p0)} C${P(p1)},${P(p2)},${P(p3)}`, at };
}

/** Стебель от (x0,y0) к (x1,y1) с изгибом bend. */
function stem(x0: number, y0: number, x1: number, y1: number, bend = 0) {
  const dy = y1 - y0;
  return cubic([x0, y0], [x0 + bend, y0 + dy * 0.35], [x1 - bend * 0.6, y0 + dy * 0.7], [x1, y1]);
}

/** Лепесток/листик: от точки (x,y) в направлении ang (0 — вверх, по часовой), с r0 до r1, ширина w. */
function petal(r: Rng, x: number, y: number, ang: number, r0: number, r1: number, w: number, j = 0.8): string {
  const a = rad(ang + jit(r, 4));
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const px = Math.cos(a);
  const py = Math.sin(a);
  const len = r1 - r0;
  const bx = x + dx * r0;
  const by = y + dy * r0;
  const tx = bx + dx * (len + jit(r, j));
  const ty = by + dy * (len + jit(r, j));
  const wa = w * (1 + jit(r, 0.15));
  const wb = w * (1 + jit(r, 0.15));
  const c = (k: number, s: number, wd: number) => `${n(bx + dx * len * k + px * wd * s)} ${n(by + dy * len * k + py * wd * s)}`;
  return `M${n(bx)} ${n(by)} C${c(0.2, 1, wa)},${c(0.75, 0.9, wa)},${n(tx)} ${n(ty)} C${c(0.75, -0.9, wb)},${c(0.2, -1, wb)},${n(bx)} ${n(by)}Z`;
}

/** Листик, растущий из точки стебля. */
const leaf = (r: Rng, p: Pt, ang: number, len: number, w: number) => petal(r, p[0], p[1], ang, 0, len, w);

/** Венчик из count лепестков вокруг (cx,cy). */
function head(r: Rng, cx: number, cy: number, count: number, r0: number, r1: number, w: number, rot = 0): string[] {
  return Array.from({ length: count }, (_, i) => petal(r, cx, cy, rot + (i * 360) / count + jit(r, 3), r0, r1, w));
}

/** Неровный эллипс. */
function blob(r: Rng, cx: number, cy: number, rx: number, ry: number, j = 0.12): string {
  const a = rx * (1 + jit(r, j));
  const b = ry * (1 + jit(r, j));
  const c = rx * (1 + jit(r, j));
  const d = ry * (1 + jit(r, j));
  const k = 0.55;
  return (
    `M${n(cx + a)} ${n(cy)} C${n(cx + a)} ${n(cy + b * k)},${n(cx + a * k)} ${n(cy + b)},${n(cx)} ${n(cy + b)} ` +
    `C${n(cx - c * k)} ${n(cy + b)},${n(cx - c)} ${n(cy + d * k)},${n(cx - c)} ${n(cy)} ` +
    `C${n(cx - c)} ${n(cy - d * k)},${n(cx - c * k)} ${n(cy - d)},${n(cx)} ${n(cy - d)} ` +
    `C${n(cx + a * k)} ${n(cy - d)},${n(cx + a)} ${n(cy - d * k)},${n(cx + a)} ${n(cy)}Z`
  );
}

/** Зубчатый листик (сорняки, одуванчик, чертополох). */
function toothed(r: Rng, x: number, y: number, ang: number, len: number, w: number, teeth = 4): string {
  const a = rad(ang + jit(r, 4));
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const px = Math.cos(a);
  const py = Math.sin(a);
  const env = (t: number) => Math.sin(Math.PI * Math.pow(Math.min(t, 1), 0.8));
  const pt = (t: number, s: number) => `${n(x + dx * len * t + px * s)} ${n(y + dy * len * t + py * s)}`;
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 1; i <= teeth; i++) {
    const t = i / teeth;
    const tn = (i - 0.55) / teeth;
    const tipW = w * env(t) * (0.95 + jit(r, 0.2));
    const notchW = w * env(tn) * 0.35;
    left.push(`L${pt(tn, notchW)}`, `L${pt(t, tipW)}`);
    right.unshift(`L${pt(t, -tipW)}`, `L${pt(tn, -notchW)}`);
  }
  return `M${n(x)} ${n(y)} ${left.join(" ")} ${right.join(" ")} Z`;
}

/** Висящий колокольчик с верхушкой в (x,y). */
function bell(x: number, y: number, s: number): string {
  return (
    `M${n(x)} ${n(y)} C${n(x - 3 * s)} ${n(y + s)},${n(x - 5 * s)} ${n(y + 7 * s)},${n(x - 6 * s)} ${n(y + 10 * s)} ` +
    `C${n(x - 2 * s)} ${n(y + 12 * s)},${n(x + 2 * s)} ${n(y + 12 * s)},${n(x + 6 * s)} ${n(y + 10 * s)} ` +
    `C${n(x + 5 * s)} ${n(y + 7 * s)},${n(x + 3 * s)} ${n(y + s)},${n(x)} ${n(y)}`
  );
}

/** Спираль от радиуса rStart к rEnd. */
function spiral(cx: number, cy: number, rStart: number, rEnd: number, turns: number, startAng = 90, steps = 40): string {
  const out: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const rr = rStart + (rEnd - rStart) * t;
    const a = rad(startAng) + t * turns * 2 * Math.PI;
    out.push(`${i ? "L" : "M"}${n(cx + rr * Math.cos(a))} ${n(cy + rr * Math.sin(a))}`);
  }
  return out.join(" ");
}

/** Точки (короткие штрихи с круглыми концами). */
const dots = (pts: Pt[]) => pts.map((p) => `M${P(p)}h.1`).join("");

const def = (name: string, seed: number, build: (r: Rng) => { strokes: string[]; fills?: string[] }): PlantDef => ({ name, ...build(mulberry32(seed)) });

export const PLANTS: readonly PlantDef[] = [
  // ───── цветы ─────
  def("ромашка", 11, (r) => {
    const s = stem(32, 59, 32, 31, 2);
    return { strokes: [s.d, leaf(r, s.at(0.2), -66, 14, 4), leaf(r, s.at(0.45), 64, 12, 3.6), ...head(r, 32, 24, 9, 5, 17, 3.4), blob(r, 32, 24, 3.6, 3.6)] };
  }),
  def("тюльпан", 12, () => ({
    strokes: [
      "M32 58 C32 52,31 44,32 38",
      "M32 58 C23 55,19 47,20 38 C26 43,31 50,32 58",
      "M32 58 C40 55,45 49,45 42 C39 45,34 50,32 58",
      "M22 20 C21 31,26 38,32 38 C38 38,43 31,42 20 C39 25,37 20,32 15 C27 20,25 25,22 20Z",
    ],
    fills: ["M22 20 C21 31,26 38,32 38 C38 38,43 31,42 20 C39 25,37 20,32 15 C27 20,25 25,22 20Z"],
  })),
  def("пятилепестник", 13, (r) => {
    const s = stem(32, 59, 32, 30, -2);
    return { strokes: [s.d, leaf(r, s.at(0.25), 62, 13, 4.5), leaf(r, s.at(0.5), -60, 12, 4), ...head(r, 32, 22, 5, 3, 16, 6.4), blob(r, 32, 22, 3.2, 3.2)] };
  }),
  def("подсолнух", 14, (r) => {
    const s = stem(32, 59, 32, 33, 1);
    const core = blob(r, 32, 23, 8.5, 8.5, 0.07);
    return {
      strokes: [s.d, leaf(r, s.at(0.2), -62, 15, 6.5), leaf(r, s.at(0.5), 62, 14, 6), ...head(r, 32, 23, 14, 8, 20, 2.7), core, dots([[29, 21], [34, 20], [32, 25], [28, 26], [36, 25]])],
      fills: [core],
    };
  }),
  def("мак", 15, (r) => {
    const s = stem(32, 59, 32, 38, -2.5);
    const cup = "M14 22 C14 34,22 39,32 39 C42 39,50 34,50 22 C46 26,43 20,40 24 C37 17,34 22,32 17 C30 22,27 17,24 24 C21 20,18 26,14 22Z";
    return {
      strokes: [s.d, "M31 50 l-3 -1 M33 45 l3 -1", toothed(r, 32, 52, -62, 15, 4.5, 3), cup, "M23 25 C27 29,37 29,41 25", dots([[27, 21], [32, 20], [37, 21]])],
      fills: [cup],
    };
  }),
  def("роза", 16, (r) => {
    const s = stem(32, 59, 32, 35, -2);
    const bud = blob(r, 32, 22, 14, 12.5);
    return {
      strokes: [s.d, "M31 50 l-3 -2 M33 44 l3 -2", leaf(r, s.at(0.25), 62, 13, 4.5), leaf(r, s.at(0.55), -58, 12, 4), bud, spiral(32, 22, 1.5, 12, 1.5)],
      fills: [bud],
    };
  }),
  def("астра", 17, (r) => {
    const s = stem(32, 59, 32, 31, 1.5);
    return { strokes: [s.d, leaf(r, s.at(0.2), -64, 13, 4), leaf(r, s.at(0.45), 62, 11, 3.5), ...head(r, 32, 24, 14, 5, 17, 2.2), ...head(r, 32, 24, 9, 2, 10, 2, 18), blob(r, 32, 24, 2.2, 2.2)] };
  }),
  def("одуванчик", 18, (r) => {
    const s = stem(32, 59, 32, 31, 2);
    return { strokes: [s.d, toothed(r, 31, 57, -72, 18, 4.5, 4), toothed(r, 33, 57, 70, 17, 4.5, 4), ...head(r, 32, 23, 18, 3, 12.5, 1.5), blob(r, 32, 23, 2.6, 2.6)] };
  }),
  def("пух одуванчика", 19, (r) => {
    const s = stem(32, 59, 32, 33, 2);
    const lines: string[] = [];
    const tips: Pt[] = [];
    for (let i = 0; i < 14; i++) {
      const a = rad((i * 360) / 14 + jit(r, 5));
      const r1 = 14 + jit(r, 1.2);
      lines.push(`M${n(32 + Math.sin(a) * 4.5)} ${n(22 - Math.cos(a) * 4.5)} L${n(32 + Math.sin(a) * r1)} ${n(22 - Math.cos(a) * r1)}`);
      tips.push([32 + Math.sin(a) * (r1 + 1.6), 22 - Math.cos(a) * (r1 + 1.6)]);
    }
    return { strokes: [s.d, leaf(r, s.at(0.25), -60, 12, 3.5), ...lines, dots(tips), blob(r, 32, 22, 2.6, 2.6)] };
  }),
  def("колокольчик", 20, (r) => {
    const s = cubic([20, 59], [20, 30], [30, 10], [48, 18]);
    const out: string[] = [s.d, petal(r, 19, 58, -40, 0, 22, 2.8), petal(r, 21, 58, 34, 0, 20, 2.6)];
    const bells: string[] = [];
    [0.55, 0.75, 0.93].forEach((t) => {
      const p = s.at(t);
      out.push(`M${P(p)} L${n(p[0])} ${n(p[1] + 2.5)}`);
      bells.push(bell(p[0], p[1] + 2.5, 0.78));
    });
    return { strokes: [...out, ...bells], fills: bells };
  }),
  def("подснежник", 21, (r) => {
    const s = cubic([31, 59], [31, 42], [33, 26], [42, 18]);
    const ps = [petal(r, 42, 19, 205, 0, 13, 3.8), petal(r, 42, 19, 155, 0, 13, 3.8), petal(r, 42, 19, 180, 0, 16, 3.8)];
    return { strokes: [s.d, petal(r, 28, 58, -34, 0, 26, 2.4), petal(r, 34, 58, 30, 0, 22, 2.4), ...ps, "M41 20 C40 23,40 25,41 27"], fills: [ps[2]] };
  }),
  def("лаванда", 22, (r) => {
    const s = stem(32, 59, 32, 14, 1.5);
    const buds: string[] = [];
    for (let i = 0; i < 8; i++) {
      const y = 38 - i * 3.5;
      const k = 1 - i * 0.06;
      buds.push(blob(r, 28.6, y, 1.9 * k, 2.7 * k, 0.15), blob(r, 35.6, y + 1.5, 1.9 * k, 2.7 * k, 0.15));
    }
    return { strokes: [s.d, petal(r, 32, 56, -30, 0, 22, 1.7), petal(r, 32, 56, 26, 0, 20, 1.7), ...buds, blob(r, 32, 9.5, 1.6, 2.4)] };
  }),
  def("ирис", 23, (r) => {
    const s = stem(32, 59, 32, 34, 0);
    return {
      strokes: [s.d, petal(r, 31, 58, -14, 0, 34, 3.2), petal(r, 33, 58, 16, 0, 30, 3), petal(r, 32, 36, 0, 0, 24, 5), petal(r, 32, 33, -62, 0, 17, 5.5), petal(r, 32, 33, 62, 0, 17, 5.5), "M32 32 L32 24"],
      fills: [petal(r, 32, 36, 0, 0, 24, 5)],
    };
  }),
  def("незабудки", 24, (r) => {
    const stems = [stem(22, 59, 21, 36, 2), stem(33, 59, 34, 22, -2), stem(44, 59, 45, 38, 2)];
    const heads: Pt[] = [[21, 32], [34, 18], [45, 34]];
    const out: string[] = stems.map((s) => s.d);
    heads.forEach((h) => out.push(...head(r, h[0], h[1], 5, 1.2, 7, 3), dots([h])));
    out.push(leaf(r, stems[1].at(0.2), -60, 9, 3), leaf(r, stems[0].at(0.3), 60, 8, 2.8));
    return { strokes: out };
  }),
  def("бутон", 25, (r) => {
    const s = stem(32, 59, 32, 38, -2);
    return {
      strokes: [s.d, leaf(r, s.at(0.3), -55, 12, 4), "M32 12 C24 20,24 32,32 38 C40 32,40 20,32 12Z", "M32 38 C27 36,24 32,22 28 M32 38 C37 36,40 32,42 28", "M32 14 C30 22,30 30,32 36"],
      fills: ["M32 12 C24 20,24 32,32 38 C40 32,40 20,32 12Z"],
    };
  }),
  def("сакура", 26, (r) => {
    const t = cubic([10, 56], [24, 50], [34, 34], [54, 18]);
    const spots = [t.at(0.45), t.at(0.7), t.at(0.95)];
    const out: string[] = [t.d, "M22 50 C26 54,28 56,30 58"];
    spots.forEach((p) => out.push(...head(r, p[0], p[1] - 3, 5, 1, 7.5, 3.4), dots([[p[0], p[1] - 3]])));
    out.push(dots([[18, 46], [27, 38]]));
    return { strokes: out };
  }),
  def("кувшинка", 27, (r) => {
    const angles = [-80, -56, -32, -10, 10, 32, 56, 80];
    return {
      strokes: [
        "M6 56 C14 53,22 58,32 55 C42 52,50 58,58 55",
        blob(r, 14, 53, 9, 2.4), blob(r, 51, 54, 8, 2.2),
        ...angles.map((a, i) => petal(r, 32, 50, a, 0, 18 - Math.abs(a) * 0.05 - (i % 2) * 2, 4.4)),
      ],
    };
  }),

  // ───── ростки и листья ─────
  def("росток", 31, (r) => {
    const s = stem(32, 59, 32, 40, 1);
    return { strokes: [s.d, petal(r, 32, 42, -58, 0, 20, 7.5), petal(r, 32, 40, 55, 0, 18, 7)], fills: [petal(r, 32, 42, -58, 0, 20, 7.5), petal(r, 32, 40, 55, 0, 18, 7)] };
  }),
  def("всходы из семечка", 32, (r) => ({
    strokes: ["M18 58 C18 50,26 46,31 47", "M33 47 C38 46,46 50,46 58", "M31 47 L32 52 L33 47", "M32 47 C32 42,32 38,32 33", petal(r, 32, 35, -52, 0, 13, 5), petal(r, 32, 34, 50, 0, 13, 5)],
    fills: ["M18 58 C18 50,26 46,31 47 L32 52 L33 47 C38 46,46 50,46 58Z"],
  })),
  def("трилистник", 33, (r) => {
    const s = stem(32, 59, 32, 30, 0.5);
    return { strokes: [s.d, petal(r, 32, 32, 0, 0, 16, 5), petal(r, 32, 44, -62, 0, 15, 5.5), petal(r, 32, 48, 62, 0, 14, 5.5)] };
  }),
  def("листик", 34, (r) => {
    const veins: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const y = 47 - i * 6.6;
      const k = 1 - i * 0.13;
      veins.push(`M32 ${n(y)} L${n(32 - 10 * k)} ${n(y - 6)} M32 ${n(y)} L${n(32 + 10 * k)} ${n(y - 6)}`);
    }
    return { strokes: ["M32 59 C32 54,32 50,32 46", petal(r, 32, 48, 0, 0, 40, 12.5), "M32 46 L32 12", ...veins], fills: [petal(r, 32, 48, 0, 0, 40, 12.5)] };
  }),
  def("два листика", 35, (r) => {
    const s = stem(32, 59, 32, 38, -2);
    return { strokes: [s.d, petal(r, 32, 40, -35, 0, 25, 6.5), petal(r, 32, 49, 62, 0, 15, 5), petal(r, 32, 39, 8, 0, 11, 3)], fills: [petal(r, 32, 40, -35, 0, 25, 6.5)] };
  }),
  def("сердечко-листок", 36, () => ({
    strokes: ["M32 59 C32 56,32 52,32 48", "M32 14 C24 6,10 12,14 26 C17 36,26 42,32 48 C38 42,47 36,50 26 C54 12,40 6,32 14Z", "M32 47 C32 38,32 26,32 17", "M32 38 L24 32 M32 31 L40 25 M32 42 L40 36"],
    fills: ["M32 14 C24 6,10 12,14 26 C17 36,26 42,32 48 C38 42,47 36,50 26 C54 12,40 6,32 14Z"],
  })),
  def("клевер", 37, (r) => {
    const s = stem(32, 59, 32, 32, -3);
    const ls = [blob(r, 32, 14, 8, 7.5), blob(r, 22, 28, 8, 7.5), blob(r, 42, 28, 8, 7.5)];
    return { strokes: [s.d, ...ls, "M32 32 L32 20 M32 32 L26 28 M32 32 L38 28"], fills: ls };
  }),
  def("клевер на счастье", 38, (r) => {
    const s = stem(32, 59, 32, 40, 4);
    const ls = [blob(r, 24, 20, 8, 7.5), blob(r, 40, 20, 8, 7.5), blob(r, 24, 34, 8, 7.5), blob(r, 40, 34, 8, 7.5)];
    return { strokes: [s.d, ...ls, "M32 40 L26 22 M32 40 L38 22 M32 40 L26 34 M32 40 L38 34"], fills: [ls[0], ls[3]] };
  }),
  def("папоротник", 39, (r) => {
    const s = stem(30, 59, 36, 8, -5);
    const out: string[] = [s.d];
    for (let i = 0; i < 8; i++) {
      const p = s.at(0.14 + i * 0.1);
      const len = 15 - i * 1.5;
      out.push(leaf(r, p, -62, len, 2.4), leaf(r, p, 62, len, 2.4));
    }
    return { strokes: out };
  }),
  def("завиток папоротника", 40, (r) => {
    const s = stem(32, 59, 31, 28.5, 3);
    return { strokes: [s.d, spiral(31, 19, 9.5, 1.5, 1.25), leaf(r, s.at(0.4), 62, 9, 2.8), leaf(r, s.at(0.55), -62, 9, 2.8), leaf(r, s.at(0.72), 60, 7, 2.4)] };
  }),
  def("веточка с листьями", 41, (r) => {
    const t = cubic([12, 58], [14, 40], [30, 24], [52, 16]);
    const out: string[] = [t.d];
    [0.18, 0.34, 0.5, 0.66, 0.82].forEach((tt, i) => out.push(leaf(r, t.at(tt), i % 2 ? 150 : 8, 13 - i, 4)));
    out.push(leaf(r, t.at(1), 40, 9, 3.2));
    return { strokes: out };
  }),
  def("веточка с ягодами", 42, (r) => {
    const s = cubic([24, 59], [24, 42], [30, 28], [44, 20]);
    const out: string[] = [s.d, leaf(r, s.at(0.18), -50, 12, 4), leaf(r, s.at(0.9), 20, 10, 3.4)];
    const berries: string[] = [];
    [0.32, 0.55, 0.75].forEach((t, i) => {
      const p = s.at(t);
      out.push(`M${P(p)} C${n(p[0] + 3)} ${n(p[1])},${n(p[0] + 5)} ${n(p[1] + 3)},${n(p[0] + 6)} ${n(p[1] + 6)}`);
      berries.push(blob(r, p[0] + 7, p[1] + 9.5, 3.8, 3.8, 0.08));
      if (i === 1) berries.push(blob(r, p[0] + 11, p[1] + 7, 3, 3, 0.08));
    });
    return { strokes: [...out, ...berries], fills: berries };
  }),
  def("лист монстеры", 43, () => ({
    strokes: [
      "M32 59 C32 56,32 52,32 48",
      "M32 48 C20 46,10 38,11 26 C12 14,24 8,32 11 C40 8,52 14,53 26 C54 38,44 46,32 48Z",
      "M32 48 L32 18",
      "M32 40 L22 36 M32 32 L20 27 M32 40 L42 36 M32 32 L44 27 M11 26 L18 28 M53 26 L46 28 M20 12 L24 18 M44 12 L40 18",
    ],
    fills: ["M32 48 C20 46,10 38,11 26 C12 14,24 8,32 11 C40 8,52 14,53 26 C54 38,44 46,32 48Z"],
  })),

  // ───── травы и сорняки ─────
  def("травка", 51, () => ({
    strokes: ["M20 58 C20 48,17 40,12 34", "M26 58 C26 46,25 36,22 26", "M32 58 C32 44,34 34,38 20", "M38 58 C38 48,42 42,48 36", "M44 58 C44 52,47 49,52 46", "M29 58 C29 52,28 48,26 44"],
  })),
  def("сорняк", 52, (r) => {
    const s = stem(30, 59, 34, 20, 4);
    return { strokes: [s.d, toothed(r, 31, 52, -65, 18, 5.5, 4), toothed(r, 32, 42, 62, 16, 5, 4), toothed(r, 33, 32, -55, 12, 4, 3), toothed(r, 34, 25, 40, 10, 3.5, 3), dots([[32, 15], [36, 14], [34, 11], [38, 17]])] };
  }),
  def("чертополох", 53, (r) => {
    const s = stem(32, 59, 32, 36, 1);
    const spikes: string[] = [];
    for (let i = 0; i < 9; i++) {
      const a = rad(-56 + i * 14 + jit(r, 3));
      spikes.push(`M${n(32 + Math.sin(a) * 4)} ${n(29 - Math.cos(a) * 4)} L${n(32 + Math.sin(a) * 13)} ${n(29 - Math.cos(a) * 13)}`);
    }
    const bulb = blob(r, 32, 33, 6.5, 5.5, 0.07);
    return { strokes: [s.d, toothed(r, 32, 52, -60, 17, 5, 4), toothed(r, 32, 45, 60, 16, 5, 4), ...spikes, bulb, "M27 31 L33 36 M30 29 L36 35 M35 29 L28 36"], fills: [bulb] };
  }),
  def("колосок", 54, (r) => {
    const s = stem(32, 59, 32, 16, 1.5);
    const out: string[] = [s.d, petal(r, 32, 56, -40, 0, 22, 2.4), petal(r, 32, 52, 36, 0, 20, 2.4), petal(r, 32, 19, 0, 0, 11, 2.2)];
    for (let i = 0; i < 6; i++) {
      const p = s.at(0.62 + i * 0.065);
      out.push(leaf(r, p, -36, 8, 2.4), leaf(r, p, 36, 8, 2.4));
    }
    return { strokes: out };
  }),
  def("рогоз", 55, (r) => {
    const s = stem(30, 59, 32, 31, 1.5);
    const ear = blob(r, 32, 22, 3.8, 9.5, 0.05);
    return { strokes: [s.d, petal(r, 30, 58, -20, 0, 36, 2.6), petal(r, 31, 58, 26, 0, 32, 2.6), ear, "M32 12 L32 5", "M29 18 L35 21 M29 23 L35 26"], fills: [ear] };
  }),
  def("розетка сорняка", 56, (r) => ({
    strokes: [-74, 74, -42, 42, -10, 12].map((a) => toothed(r, 32, 57, a, 26, 5.5, 3)),
  })),
  def("бамбук", 57, (r) => ({
    strokes: [
      "M24 58 L24.5 12 M29 58 L29.5 12", "M23 44 L30 44 M23 29 L30 29 M23 16 L30 16",
      "M39 58 L39.5 26 M44 58 L44.5 26", "M38 46 L45 46 M38 35 L45 35",
      leaf(r, [27, 14], -42, 14, 2.2), leaf(r, [27, 22], 52, 13, 2.2), leaf(r, [42, 28], -48, 11, 2), leaf(r, [42, 33], 52, 10, 2),
    ],
  })),

  // ───── грибы ─────
  def("мухомор", 61, (r) => ({
    strokes: [
      "M10 36 C10 22,20 13,32 13 C44 13,54 22,54 36 C46 39,18 39,10 36Z",
      "M26 38 C27 46,25 52,23 58 C28 60,37 60,42 58 C40 52,38 46,38 38",
      "M26 44 C30 46,35 46,38 44",
      blob(r, 24, 26, 2.4, 2), blob(r, 34, 21, 2.7, 2.1), blob(r, 43, 29, 2.1, 1.8), blob(r, 20, 33, 1.7, 1.3),
    ],
    fills: ["M10 36 C10 22,20 13,32 13 C44 13,54 22,54 36 C46 39,18 39,10 36Z"],
  })),
  def("шампиньон", 62, () => ({
    strokes: [
      "M15 40 C14 28,22 22,32 22 C42 22,50 28,49 40 C42 42,22 42,15 40Z",
      "M27 41 C27 48,26 53,26 58 C30 59,35 59,38 58 C38 53,37 48,37 41",
      "M44 52 C44 47,48 45,51 45 C55 45,58 47,58 52 C55 53,47 53,44 52Z",
      "M49 53 C49 55,49 57,48 58 M53 53 C53 55,53 57,54 58",
    ],
    fills: ["M15 40 C14 28,22 22,32 22 C42 22,50 28,49 40 C42 42,22 42,15 40Z"],
  })),
  def("два гриба", 63, (r) => ({
    strokes: [
      "M14 26 C14 17,21 12,27 12 C33 12,40 17,40 26 C35 28,19 28,14 26Z",
      "M22 27 C23 38,22 46,21 56 C25 57,30 57,33 56 C32 46,31 38,31 27",
      "M36 44 C36 38,41 35,45 35 C49 35,54 38,54 44 C50 46,40 46,36 44Z",
      "M42 45 C42 50,41 54,41 58 M48 45 C48 50,49 54,49 58",
      blob(r, 22, 19, 1.8, 1.4), blob(r, 30, 17, 1.6, 1.3),
    ],
    fills: ["M14 26 C14 17,21 12,27 12 C33 12,40 17,40 26 C35 28,19 28,14 26Z", "M36 44 C36 38,41 35,45 35 C49 35,54 38,54 44 C50 46,40 46,36 44Z"],
  })),

  // ───── кусты, деревья, суккуленты ─────
  def("кустик", 71, () => {
    const cloud = "M14 54 C6 54,6 42,14 41 C12 32,22 26,29 31 C32 22,46 22,47 32 C56 31,59 44,51 54Z";
    return { strokes: [cloud, "M32 54 L32 44 M32 49 L26 43 M32 46 L38 40", "M20 47 l3 -2 M42 48 l3 -2"], fills: [cloud] };
  }),
  def("деревце", 72, (r) => {
    const crown = blob(r, 32, 24, 17, 14);
    return { strokes: ["M29 58 C30 50,30 44,29 38 M35 58 C34 50,34 44,35 38", "M32 46 L38 41", crown, "M20 24 L28 14 M24 30 L36 14 M30 34 L42 18 M38 34 L45 25"], fills: [crown] };
  }),
  def("ёлочка", 73, () => ({
    strokes: ["M32 6 L23 20 L28 20 L19 34 L25 34 L14 49 L50 49 L39 34 L45 34 L36 20 L41 20 Z", "M30 49 L30 58 M34 49 L34 58", "M27 28 l4 2 M37 40 l-4 2 M24 45 l5 1"],
    fills: ["M32 6 L23 20 L28 20 L19 34 L25 34 L14 49 L50 49 L39 34 L45 34 L36 20 L41 20 Z"],
  })),
  def("пальма", 74, () => ({
    strokes: ["M30 59 C28 46,34 34,32 22", "M32 22 C24 12,12 14,6 26 C13 20,24 19,32 22", "M32 22 C26 14,20 8,12 8 C20 11,26 15,32 22", "M32 22 C40 12,52 14,58 26 C51 20,40 19,32 22", "M32 22 C38 14,44 8,52 8 C44 11,38 15,32 22", "M32 22 C29 14,31 8,34 3 C35 9,35 16,32 22", "M29 25 C28 24,28 23,29 22 M34 26 C35 25,35 24,34 23"],
  })),
  def("кактус", 75, (r) => ({
    strokes: [
      "M26 58 C25 46,25 30,26 22 C26 13,38 13,38 22 C39 30,39 46,38 58",
      "M26 42 C19 42,16 40,16 34 L16 28 C16 25,21 25,21 28 L21 34 C21 36,23 37,26 37",
      "M38 36 C41 36,43 35,43 32 L43 26 C43 23,48 23,48 26 L48 32 C48 38,45 40,38 40",
      "M32 16 C31 28,32 44,32 58", "M29 28 l-3 -2 M35 33 l3 -2 M29 42 l-3 1 M35 47 l3 -1 M32 14 l0 -3",
      blob(r, 32, 10, 2.4, 2),
    ],
  })),
  def("суккулент", 76, (r) => {
    const ps = [-76, 76, -52, 52, -28, 28, -8, 8].map((a, i) => petal(r, 32, 56, a, 0, 17 + (i > 3 ? i * 1.2 : 0) + (i > 5 ? 3 : 0), 6.2));
    return { strokes: ps, fills: ps.slice(-2) };
  }),
  def("алоэ", 77, (r) => ({
    strokes: [-50, 50, -25, 25, 0].map((a, i) => petal(r, 32, 57, a, 0, 34 + (i > 3 ? 4 : 0) - Math.abs(a) * 0.1, 3.8)),
  })),
];

export const PLANT_COUNT = PLANTS.length;
// @plants-end

/** Случайная форма для нового растения. Вызывать при создании записи, не при отрисовке. */
export function randomShapeId(): number {
  return Math.floor(Math.random() * PLANT_COUNT);
}

/** Запасная форма для записей, у которых shapeId ещё не сохранён: стабильно зависит от даты. */
export function shapeIdForKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % PLANT_COUNT;
}

/** Итоговый shapeId: сохранённый, если он есть, иначе запасной по дате. */
export function resolveShapeId(id: number | null | undefined, key: string): number {
  return typeof id === "number" && Number.isInteger(id) && id >= 0 ? id % PLANT_COUNT : shapeIdForKey(key);
}

export interface PlantSketchProps {
  shapeId: number;
  className?: string;
  /** Толщина линии в единицах viewBox (64×64). Для мелких растений в саду берите ~3. */
  strokeWidth?: number;
  /** Карандашное дрожание (нужен <SketchDefs /> рядом). Только для крупного цветка в окне записи. */
  wobble?: boolean;
  /** Вторая, более бледная линия со сдвигом: эффект двойного штриха карандаша. */
  double?: boolean;
}

/** Растение из библиотеки. Цвет берётся из currentColor: его задаёт родитель (по настроению). */
export const PlantSketch = memo(function PlantSketch({ shapeId, className = "", strokeWidth = 2.2, wobble, double }: PlantSketchProps) {
  const plant = PLANTS[((shapeId % PLANT_COUNT) + PLANT_COUNT) % PLANT_COUNT];
  const lines = plant.strokes.map((d, i) => <path key={i} d={d} />);
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`overflow-visible ${className}`}
    >
      <g filter={wobble ? "url(#entry-sk-wobble)" : undefined}>
        {plant.fills?.map((d, i) => (
          <path key={i} d={d} stroke="none" fill="currentColor" fillOpacity={0.18} />
        ))}
        {double && (
          <g opacity={0.38} transform="translate(0.9 0.7)">
            {lines}
          </g>
        )}
        {lines}
      </g>
    </svg>
  );
});
