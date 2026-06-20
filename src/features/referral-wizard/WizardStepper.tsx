import { Check } from "lucide-react";
import { WIZARD_ORDER, type WizardStep } from "@/store/useReferralStore";
import { cn } from "@/components/ui";

const LABELS: Record<WizardStep, string> = {
  intent: "Intent",
  safety: "Safety",
  pathway: "Pathway",
  readiness: "Readiness",
  routing: "Routing",
  delivery: "Send Method",
  draft: "Draft",
  sent: "Sent",
};

export function WizardStepper({ current }: { current: WizardStep }) {
  const currentIndex = WIZARD_ORDER.indexOf(current);

  return (
    <div className="scroll-soft overflow-x-auto pb-1">
      <div className="flex items-center gap-1">
        {WIZARD_ORDER.map((step, i) => {
          const isDone = i < currentIndex;
          const isActive = i === currentIndex;
          return (
            <div key={step} className="flex flex-1 items-center gap-1">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                    isDone
                      ? "bg-primary-500 text-white"
                      : isActive
                        ? "bg-lavender-600 text-white ring-4 ring-lavender-100"
                        : "bg-sand-200 text-sand-500"
                  )}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span
                  className={cn(
                    "hidden text-xs font-semibold sm:inline",
                    isActive ? "text-lavender-700" : isDone ? "text-primary-600" : "text-sand-400"
                  )}
                >
                  {LABELS[step]}
                </span>
              </div>
              {i < WIZARD_ORDER.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 rounded-full transition-colors",
                    i < currentIndex ? "bg-primary-400" : "bg-sand-200"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
