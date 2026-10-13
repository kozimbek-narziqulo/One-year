// Процедурные растения: один день года даёт одно растение из 720 сочетаний параметров.
// Порт design/plants.mjs. День d берёт сочетание (d-1)*307 mod 720; 307 простое и не имеет
// общих делителей с 720, поэтому два дня одного года не получают одинаковых параметров.
// Рисунки свои: ни форм, ни названий из других приложений здесь нет.

export const PETALS = [5, 6, 7, 8] as const;
export const SHAPES = ["round", "tear", "long"] as const;
export const LEAVES = [0, 1, 2, 3] as const;
export const LEANS = [-2, -1, 0, 1, 2] as const;
export const HEIGHTS = ["short", "mid", "tall"] as const;

export interface PlantSpec {
  petals: (typeof PETALS)[number];
  shape: (typeof SHAPES)[number];
  leaves: (typeof LEAVES)[number];
  lean: (typeof LEANS)[number];
  height: (typeof HEIGHTS)[number];
}

const RADICES = [PETALS.length, SHAPES.length, LEAVES.length, LEANS.length, HEIGHTS.length];
const SPACE = RADICES.reduce((a, b) => a * b, 1); // 720
const STEP = 307;

export const VIEWBOX = 48;
const GROUND_Y = 44;
const CENTER_X = 24;

const SHAPE_DIMS = {
  round: { rx: 3.8, ry: 4.6 },
  tear: { rx: 2.9, ry: 5.4 },
  long: { rx: 2.2, ry: 6.2 },
} as const;
const TOP_Y = { short: 27, mid: 22, tall: 18 } as const;

export function plantSpec(day: number): PlantSpec {
  if (!Number.isInteger(day) || day < 1 || day > 366) throw new RangeError(`day of year out of range: ${day}`);
  let idx = ((day - 1) * STEP) % SPACE;
  const pick: number[] = [];
  for (const r of RADICES) {
    pick.push(idx % r);
    idx = Math.floor(idx / r);
  }
  return {
    petals: PETALS[pick[0] ?? 0] ?? 5,
    shape: SHAPES[pick[1] ?? 0] ?? "round",
    leaves: LEAVES[pick[2] ?? 0] ?? 0,
    lean: LEANS[pick[3] ?? 0] ?? 0,
    height: HEIGHTS[pick[4] ?? 0] ?? "mid",
  };
}

export const signature = (s: PlantSpec) => `${s.petals}|${s.shape}|${s.leaves}|${s.lean}|${s.height}`;

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rot: number;
  ox: number;
  oy: number;
}

export interface PlantGeometry {
  stem: { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number };
  leaves: Ellipse[];
  petals: Ellipse[];
  core: { cx: number; cy: number; r: number };
}

export function plantGeometry(spec: PlantSpec): PlantGeometry {
  const topY = TOP_Y[spec.height];
  const topX = CENTER_X + spec.lean * 3;
  const ctrl = { x: CENTER_X + spec.lean * 1.2, y: (GROUND_Y + topY) / 2 };
  const point = (u: number) => ({
    x: (1 - u) ** 2 * CENTER_X + 2 * u * (1 - u) * ctrl.x + u ** 2 * topX,
    y: (1 - u) ** 2 * GROUND_Y + 2 * u * (1 - u) * ctrl.y + u ** 2 * topY,
  });

  const leaves: Ellipse[] = [];
  for (let i = 0; i < spec.leaves; i++) {
    const p = point(0.3 + 0.2 * i);
    const side = (i + (spec.lean < 0 ? 1 : 0)) % 2 === 0 ? 1 : -1;
    leaves.push({ cx: r2(p.x + side * 3.1), cy: r2(p.y - 1.2), rx: 1.9, ry: 4.2, rot: side * 55, ox: r2(p.x), oy: r2(p.y) });
  }

  const { rx, ry } = SHAPE_DIMS[spec.shape];
  const off = ry * 0.9;
  const petals: Ellipse[] = [];
  for (let k = 0; k < spec.petals; k++) {
    petals.push({ cx: r2(topX), cy: r2(topY - off), rx, ry, rot: r2((360 / spec.petals) * k), ox: r2(topX), oy: r2(topY) });
  }
  return {
    stem: { x0: CENTER_X, y0: GROUND_Y, cx: r2(ctrl.x), cy: r2(ctrl.y), x1: r2(topX), y1: topY },
    leaves,
    petals,
    core: { cx: r2(topX), cy: topY, r: 2.6 },
  };
}

/** Габариты нарисованного (с учётом поворота эллипсов): для проверки, что растение не выходит из рамки. */
export function plantBounds(g: PlantGeometry) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x: number, y: number, hw: number, hh: number) => {
    x0 = Math.min(x0, x - hw); x1 = Math.max(x1, x + hw);
    y0 = Math.min(y0, y - hh); y1 = Math.max(y1, y + hh);
  };
  const ell = (e: Ellipse) => {
    const a = (e.rot * Math.PI) / 180;
    const dx = e.cx - e.ox, dy = e.cy - e.oy;
    const x = e.ox + dx * Math.cos(a) - dy * Math.sin(a);
    const y = e.oy + dx * Math.sin(a) + dy * Math.cos(a);
    grow(x, y, Math.sqrt((e.rx * Math.cos(a)) ** 2 + (e.ry * Math.sin(a)) ** 2), Math.sqrt((e.rx * Math.sin(a)) ** 2 + (e.ry * Math.cos(a)) ** 2));
  };
  g.petals.forEach(ell);
  g.leaves.forEach(ell);
  grow(g.stem.x0, g.stem.y0, 1, 1);
  grow(g.stem.x1, g.stem.y1, 1, 1);
  return { x0, y0, x1, y1 };
}

export const GROUND = { y: GROUND_Y, x: CENTER_X };
