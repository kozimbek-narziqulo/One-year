import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const svgBase = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

// Формы нарисованы в квадрате 32x32 и используются и по отдельности, и в составных иконках.
function FlowerShape() {
  return (
    <>
      <path d="M16 30V18" />
      <path d="M16 25c-3.5-.3-5.6-2.2-6.2-5 3.4.1 5.6 1.9 6.2 5Z" />
      <circle cx="16" cy="6.4" r="3" />
      <circle cx="20.4" cy="9.6" r="3" />
      <circle cx="18.7" cy="14.7" r="3" />
      <circle cx="13.3" cy="14.7" r="3" />
      <circle cx="11.6" cy="9.6" r="3" />
      <circle cx="16" cy="11" r="1.6" />
    </>
  );
}

function SproutShape() {
  return (
    <>
      <path d="M16 30V12" />
      <path d="M16 22c-4 0-6.5-2-7-5.5 4 0 6.5 2 7 5.5Z" />
      <path d="M16 17c4 0 6.5-2 7-5.5-4 0-6.5 2-7 5.5Z" />
      <path d="M16 12c0-3 1.5-5 4-6" />
    </>
  );
}

function MushroomShape() {
  return (
    <>
      <path d="M6 17c0-6 4.5-10 10-10s10 4 10 10Z" />
      <path d="M12.5 17v8.5a3.5 3.5 0 0 0 7 0V17" />
      <circle cx="12" cy="13" r="1" />
      <circle cx="18.5" cy="11" r="1" />
    </>
  );
}

const SHAPES = [FlowerShape, FlowerShape, SproutShape, MushroomShape];

export function IconFlower(props: IconProps) {
  return (
    <svg viewBox="0 0 32 32" {...svgBase} {...props}>
      <FlowerShape />
    </svg>
  );
}

/** Иконка «Сад» в нижней панели: цветок, гриб и росток рядом. */
export function IconGardenGroup(props: IconProps) {
  return (
    <svg viewBox="0 0 64 32" {...svgBase} {...props}>
      <g transform="translate(0 4) scale(.8)">
        <FlowerShape />
      </g>
      <g transform="translate(19 6) scale(.8)">
        <MushroomShape />
      </g>
      <g transform="translate(38 3) scale(.8)">
        <SproutShape />
      </g>
    </svg>
  );
}

/** Выросшее растение для дня с записью. Вид выбирается по seed, поэтому у одного дня он всегда один и тот же. */
export function PlantIcon({ seed, ...props }: IconProps & { seed: number }) {
  const Shape = SHAPES[(seed >>> 5) % SHAPES.length] ?? FlowerShape;
  return (
    <svg viewBox="0 0 32 32" {...svgBase} {...props}>
      <Shape />
    </svg>
  );
}
