"use client";

import { forwardRef, type ReactNode } from "react";

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
