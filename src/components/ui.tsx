import type { ReactNode } from "react";

/* ----------------------------------------------------------------------------
 * Tiny class helper
 * ------------------------------------------------------------------------- */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ----------------------------------------------------------------------------
 * Card
 * ------------------------------------------------------------------------- */
export function Card({
  children,
  className,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return <As className={cn("card p-4 sm:p-5", className)}>{children}</As>;
}

export function SectionTitle({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-lavender-500">
            {eyebrow}
          </div>
        )}
        <h2 className="text-lg font-bold text-sand-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-sand-500">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Button
 * ------------------------------------------------------------------------- */
type ButtonVariant = "primary" | "secondary" | "ghost" | "soft" | "danger";

export function Button({
  children,
  onClick,
  variant = "primary",
  className,
  type = "button",
  disabled,
  size = "md",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-primary-500 text-white shadow-soft hover:bg-primary-600 active:bg-primary-700",
    secondary:
      "bg-lavender-600 text-white shadow-soft hover:bg-lavender-700 active:bg-lavender-800",
    ghost: "bg-transparent text-sand-600 hover:bg-sand-100",
    soft: "bg-primary-50 text-primary-700 ring-1 ring-primary-200 hover:bg-primary-100",
    danger: "bg-danger text-white hover:opacity-90",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-2.5 text-sm",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex max-w-full items-center justify-center gap-2 rounded-xl text-center font-semibold leading-tight transition-all disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------------------
 * Badge / Pill
 * ------------------------------------------------------------------------- */
type Tone = "primary" | "lavender" | "success" | "warning" | "danger" | "neutral" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  primary: "bg-primary-100 text-primary-700",
  lavender: "bg-lavender-100 text-lavender-700",
  success: "bg-primary-100 text-primary-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-rose-100 text-rose-600",
  info: "bg-sky-100 text-sky-700",
  neutral: "bg-sand-200 text-sand-700",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return <span className={cn("pill max-w-full leading-tight", TONE_CLASSES[tone], className)}>{children}</span>;
}

/* ----------------------------------------------------------------------------
 * ScoreBar — animated horizontal meter
 * ------------------------------------------------------------------------- */
export function ScoreBar({
  value,
  tone = "primary",
  className,
}: {
  value: number;
  tone?: "primary" | "lavender" | "warning" | "danger";
  className?: string;
}) {
  const colors: Record<string, string> = {
    primary: "bg-primary-500",
    lavender: "bg-lavender-500",
    warning: "bg-amber-400",
    danger: "bg-rose-400",
  };
  return (
    <div className={cn("h-2.5 w-full overflow-hidden rounded-full bg-sand-200", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-700 ease-out", colors[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * ProgressRing — circular score
 * ------------------------------------------------------------------------- */
export function ProgressRing({
  value,
  size = 96,
  stroke = 9,
  tone = "primary",
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: "primary" | "lavender" | "warning" | "danger";
  label?: ReactNode;
}) {
  const colors: Record<string, string> = {
    primary: "#1fb88e",
    lavender: "#8472ee",
    warning: "#e8a33d",
    danger: "#e0617a",
  };
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.max(0, Math.min(100, value)) / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0ece6" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colors[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-extrabold text-sand-900">{Math.round(value)}%</span>
        {label && <span className="text-[10px] font-medium text-sand-400">{label}</span>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * StatPill — small metric tile
 * ------------------------------------------------------------------------- */
export function StatPill({
  value,
  label,
  tone = "neutral",
}: {
  value: ReactNode;
  label: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className={cn("rounded-2xl px-4 py-3", TONE_CLASSES[tone])}>
      <div className="text-2xl font-extrabold leading-none">{value}</div>
      <div className="mt-1 text-xs font-medium opacity-80">{label}</div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * SourceChip — "where did this come from" provenance
 * ------------------------------------------------------------------------- */
export function SourceChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-sand-100 px-1.5 py-0.5 text-[11px] font-medium text-sand-500 ring-1 ring-sand-200">
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * Avatar — soft generated by hue
 * ------------------------------------------------------------------------- */
export function Avatar({
  initials,
  hue = 200,
  size = 40,
}: {
  initials: string;
  hue?: number;
  size?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, hsl(${hue} 60% 62%), hsl(${(hue + 40) % 360} 64% 54%))`,
      }}
    >
      {initials}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * EmptyState
 * ------------------------------------------------------------------------- */
export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sand-200 bg-white/40 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-lavender-400">{icon}</div>}
      <h3 className="text-base font-semibold text-sand-800">{title}</h3>
      {subtitle && <p className="mt-1 max-w-sm text-sm text-sand-500">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
