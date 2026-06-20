import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, FileCheck2, FlaskConical, MessageCircleQuestion, Paperclip, Plus } from "lucide-react";
import type { Patient, ReadinessItem } from "@/types";
import { computeReadiness } from "@/lib/readiness";
import { scoreTone } from "@/lib/format";
import { useReferralStore } from "@/store/useReferralStore";
import { Badge, Card, ProgressRing, cn } from "@/components/ui";
import { AIChip } from "@/components/ai";
import { StepHeading, StepNav } from "../parts";

const ACTION_ICON = {
  order: FlaskConical,
  ask: MessageCircleQuestion,
  attach: Paperclip,
} as const;

export function Step4Readiness({ patient }: { patient: Patient }) {
  const nextStep = useReferralStore((s) => s.nextStep);
  const prevStep = useReferralStore((s) => s.prevStep);
  const presentDocIds = useReferralStore((s) => s.presentDocIds);
  const addDocument = useReferralStore((s) => s.addDocument);

  const readiness = computeReadiness(patient, presentDocIds);
  const tone = scoreTone(readiness.score);
  const ringTone = tone === "success" ? "primary" : tone === "warning" ? "warning" : "danger";

  const present = readiness.items.filter((i) => i.status === "present");
  const missing = readiness.items.filter((i) => i.status === "missing");

  return (
    <div>
      <StepHeading
        eyebrow="Step 4 · Readiness Agent"
        title={
          <span className="flex items-center gap-2">
            Will this referral be accepted? <AIChip>Readiness Agent</AIChip>
          </span>
        }
        subtitle="Beyond a checklist — we predict why a destination clinic might delay or reject it."
      />

      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <Card className="flex flex-col items-center justify-center gap-2 md:w-52">
          <ProgressRing value={readiness.score} tone={ringTone} size={120} label="ready" />
          <Badge tone={tone === "success" ? "primary" : tone === "warning" ? "warning" : "danger"}>
            {readiness.score >= 80
              ? "Ready to send"
              : readiness.score >= 60
                ? "Nearly ready"
                : "Likely to be parked"}
          </Badge>
          <p className="text-center text-xs text-sand-400">
            Weighted by what each clinic needs to triage
          </p>
        </Card>

        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-700 ring-1 ring-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">Likely delay reason: </span>
              {readiness.likelyDelayReason}
            </span>
          </div>

          {present.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-primary-500">
                Ready ({present.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {present.map((i) => (
                  <span
                    key={i.doc.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 px-2.5 py-1.5 text-xs font-medium text-primary-700 ring-1 ring-primary-200"
                  >
                    <FileCheck2 className="h-3.5 w-3.5" /> {i.doc.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-rose-500">
              Missing ({missing.length})
            </div>
            <AnimatePresence mode="popLayout">
              {missing.length === 0 ? (
                <motion.p
                  key="done"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-lg bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700"
                >
                  ✓ Every prerequisite satisfied — low risk of pre-triage delay.
                </motion.p>
              ) : (
                <div className="space-y-2">
                  {missing.map((item) => (
                    <MissingRow
                      key={item.doc.id}
                      item={item}
                      onResolve={() => addDocument(item.doc.id)}
                    />
                  ))}
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <StepNav
        onBack={prevStep}
        onNext={nextStep}
        nextLabel={readiness.score >= 80 ? "Rank destinations" : "Rank anyway"}
      />
    </div>
  );
}

function MissingRow({ item, onResolve }: { item: ReadinessItem; onResolve: () => void }) {
  const [resolving, setResolving] = useState(false);
  const Icon = ACTION_ICON[item.doc.actionKind];

  return (
    <motion.div
      layout
      exit={{ opacity: 0, x: 12 }}
      className="flex flex-col gap-3 rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-sand-200 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-sand-800">{item.doc.label}</div>
          <div className="text-xs text-sand-400 capitalize">{item.doc.actionKind} · +{item.doc.weight}% readiness</div>
        </div>
      </div>
      <button
        onClick={() => {
          setResolving(true);
          // brief "ordering…" beat before it resolves
          window.setTimeout(onResolve, 450);
        }}
        disabled={resolving}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
          resolving
            ? "bg-sand-100 text-sand-400"
            : "bg-primary-500 text-white hover:bg-primary-600",
          "w-full justify-center sm:w-auto"
        )}
      >
        <Plus className={cn("h-3.5 w-3.5", resolving && "animate-spin")} />
        {resolving ? "Working…" : item.doc.action}
      </button>
    </motion.div>
  );
}
