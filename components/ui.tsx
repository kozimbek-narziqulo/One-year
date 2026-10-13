import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-on-accent border border-transparent hover:brightness-90 active:brightness-75",
  secondary: "bg-surface text-text border border-border-input hover:bg-accent-subtle",
  ghost: "bg-transparent text-accent border border-transparent hover:bg-accent-subtle",
  danger: "bg-surface text-danger border border-danger hover:bg-accent-subtle",
};

export function Button({
  variant = "secondary",
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-(--layout-tapMin) items-center justify-center gap-2 rounded-md px-4 text-base font-semibold transition-[filter,background-color] duration-(--duration-fast) disabled:cursor-not-allowed disabled:opacity-45 ${VARIANT[variant]} ${className}`}
      {...rest}
    />
  );
}

export function IconButton({
  label,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid size-(--layout-tapMin) place-items-center rounded-full text-text hover:bg-accent-subtle disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

const svgProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false, className: "size-6" } as const;

export const IconChevronLeft = () => (<svg {...svgProps}><path d="M15 5 8 12l7 7" /></svg>);
export const IconChevronRight = () => (<svg {...svgProps}><path d="m9 5 7 7-7 7" /></svg>);
export const IconClose = () => (<svg {...svgProps}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const IconSettings = () => (<svg {...svgProps}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx={16} cy={7} r={2} /><circle cx={8} cy={17} r={2} /></svg>);
