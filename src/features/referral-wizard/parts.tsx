import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Patient } from "@/types";
import { Avatar, Badge, Button, Card, cn } from "@/components/ui";
import { initials } from "@/lib/format";

/** Heading block at the top of each wizard step. */
export function StepHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="mb-1 text-xs font-bold uppercase tracking-wider text-lavender-500">
        {eyebrow}
      </div>
      <h2 className="text-lg font-extrabold text-sand-900 sm:text-xl">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-sand-500">{subtitle}</p>}
    </div>
  );
}

/** Back / Next footer for a step. */
export function StepNav({
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled,
  nextVariant = "primary",
  backLabel = "Back",
  hideBack,
  children,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: ReactNode;
  nextDisabled?: boolean;
  nextVariant?: "primary" | "secondary";
  backLabel?: string;
  hideBack?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-3 border-t border-sand-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex">
        {!hideBack && (
          <Button variant="ghost" onClick={onBack} className="w-full sm:w-auto">
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </Button>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {children}
        {onNext && (
          <Button
            variant={nextVariant}
            onClick={onNext}
            disabled={nextDisabled}
            size="lg"
            className="w-full sm:w-auto"
          >
            {nextLabel} <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Persistent left-rail patient context. */
export function PatientContextCard({ patient }: { patient: Patient }) {
  return (
    <Card className="space-y-4 lg:sticky lg:top-2">
      <div className="flex items-center gap-3">
        <Avatar initials={initials(patient.name)} hue={patient.avatarHue} size={48} />
        <div className="min-w-0">
          <div className="truncate text-base font-bold text-sand-900">{patient.name}</div>
          <div className="text-xs text-sand-400">
            {patient.age} · {patient.sex} · {patient.mrn}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-sand-50 p-3 text-sm text-sand-600 ring-1 ring-sand-200">
        {patient.visitSummary}
      </div>

      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-sand-400">
          Captured context
        </div>
        <div className="grid grid-cols-2 gap-2">
          {patient.vitals.map((v) => (
            <div
              key={v.label}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-xs ring-1",
                v.flag === "critical"
                  ? "bg-rose-50 text-rose-600 ring-rose-200"
                  : v.flag === "abnormal"
                    ? "bg-amber-50 text-amber-700 ring-amber-200"
                    : "bg-white text-sand-600 ring-sand-200"
              )}
            >
              <div className="font-semibold">{v.label}</div>
              <div>{v.value}</div>
            </div>
          ))}
        </div>
      </div>

      {patient.constraints.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-sand-400">
            Patient constraints
          </div>
          <div className="flex flex-wrap gap-1.5">
            {patient.constraints.map((c) => (
              <Badge key={c.label} tone="lavender">
                {c.label}: {c.detail}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/** A small ✓ / ⚠ reason list. */
export function ReasonList({
  reasons,
  tone = "good",
}: {
  reasons: string[];
  tone?: "good" | "warn";
}) {
  return (
    <ul className="space-y-1.5">
      {reasons.map((r) => (
        <li key={r} className="flex items-start gap-2 text-sm text-sand-600">
          <span className={cn("mt-0.5", tone === "good" ? "text-primary-500" : "text-amber-500")}>
            {tone === "good" ? "✓" : "⚠"}
          </span>
          <span>{r}</span>
        </li>
      ))}
    </ul>
  );
}
