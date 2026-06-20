import { motion } from "framer-motion";
import {
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  HeartPulse,
  Hourglass,
  Inbox,
  XCircle,
} from "lucide-react";
import type { Referral, ReferralStatus } from "@/types";
import { useReferralStore } from "@/store/useReferralStore";
import { relativeFromNow, weeksLabel } from "@/lib/format";
import { Badge, Card, SectionTitle, cn } from "@/components/ui";

const PATIENT_STATUS: Record<
  ReferralStatus,
  { label: string; help: string; tone: "primary" | "info" | "warning" | "danger" | "neutral" }
> = {
  draft: { label: "Being prepared", help: "Your doctor is preparing the referral.", tone: "neutral" },
  sent: { label: "Sent to specialist", help: "The clinic has received your referral.", tone: "info" },
  received: { label: "With the specialist", help: "The clinic is reviewing your referral.", tone: "info" },
  accepted: { label: "Accepted", help: "You're in the queue — booking soon.", tone: "primary" },
  scheduled: { label: "Appointment booked", help: "Check your prep instructions below.", tone: "primary" },
  "needs-info": {
    label: "Action in progress",
    help: "The clinic asked for more info — your care team is handling it.",
    tone: "warning",
  },
  rejected: { label: "Being re-routed", help: "We're finding you a better-matched clinic.", tone: "danger" },
  "no-response": { label: "Following up", help: "We're chasing the clinic for a response.", tone: "danger" },
};

const STATUS_ICON: Record<ReferralStatus, typeof Inbox> = {
  draft: Clock3,
  sent: Inbox,
  received: Inbox,
  accepted: CheckCircle2,
  scheduled: CalendarCheck,
  "needs-info": ClipboardCheck,
  rejected: XCircle,
  "no-response": Hourglass,
};

export default function PatientPage() {
  // For the demo, "my referrals" = the two most recent in the system.
  const referrals = useReferralStore((s) => s.referrals).slice(0, 3);

  return (
    <div className="space-y-5">
      <Card className="flex items-start gap-3 bg-gradient-to-br from-primary-500 to-lavender-500 text-white">
        <HeartPulse className="h-7 w-7 shrink-0" />
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold">Your referrals, in plain language</h2>
          <p className="text-sm text-white/80">
            We'll text and email you at every step — no chasing required.
          </p>
        </div>
      </Card>

      <SectionTitle eyebrow="Status" title="Where things stand" />

      <div className="space-y-4">
        {referrals.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <PatientReferralCard referral={r} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function PatientReferralCard({ referral }: { referral: Referral }) {
  const meta = PATIENT_STATUS[referral.status];
  const Icon = STATUS_ICON[referral.status];

  return (
    <Card className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
              meta.tone === "primary"
                ? "bg-primary-100 text-primary-600"
                : meta.tone === "warning"
                  ? "bg-amber-100 text-amber-600"
                  : meta.tone === "danger"
                    ? "bg-rose-100 text-rose-500"
                    : "bg-sky-100 text-sky-600"
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="font-bold text-sand-900">{referral.specialtyLabel.split(" · ")[0]}</div>
            <div className="text-xs text-sand-400">{referral.providerName}</div>
          </div>
        </div>
        <Badge tone={meta.tone} className="self-start">{meta.label}</Badge>
      </div>

      <p className="rounded-xl bg-sand-50 px-3 py-2 text-sm text-sand-600 ring-1 ring-sand-200">
        {meta.help}
      </p>

      {/* Progress timeline */}
      <PatientTimeline status={referral.status} />

      {referral.status === "scheduled" && (
        <div className="flex items-start gap-2 rounded-xl bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-700 sm:items-center">
          <CalendarCheck className="h-4 w-4" /> Estimated time to be seen:{" "}
          {weeksLabel(referral.timeToAcceptedCareWeeks)}
        </div>
      )}

      {referral.patientPrep && (referral.status === "scheduled" || referral.status === "accepted") && (
        <div className="rounded-xl bg-lavender-50 p-3 ring-1 ring-lavender-100">
          <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-lavender-500">
            How to prepare
          </div>
          <ul className="space-y-1 text-sm text-sand-600">
            {referral.patientPrep.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <span className="mt-0.5 text-lavender-500">•</span> {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-[11px] text-sand-300">Last update {relativeFromNow(referral.updatedAt)}</div>
    </Card>
  );
}

const TIMELINE: ReferralStatus[] = ["sent", "received", "accepted", "scheduled"];
const TIMELINE_LABEL = ["Sent", "Reviewed", "Accepted", "Booked"];

function PatientTimeline({ status }: { status: ReferralStatus }) {
  // Map non-linear statuses onto the happy path for a friendly progress bar.
  const reached: Record<ReferralStatus, number> = {
    draft: 0,
    sent: 1,
    received: 2,
    "needs-info": 2,
    "no-response": 1,
    rejected: 1,
    accepted: 3,
    scheduled: 4,
  };
  const progress = reached[status];

  return (
    <div className="flex items-center">
      {TIMELINE.map((_, i) => {
        const done = i < progress;
        const active = i === progress - 1;
        return (
          <div key={i} className="flex flex-1 items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "h-3 w-3 rounded-full",
                  done ? "bg-primary-500" : active ? "bg-lavender-500" : "bg-sand-200"
                )}
              />
              <span className="mt-1 text-[10px] font-medium text-sand-400">{TIMELINE_LABEL[i]}</span>
            </div>
            {i < TIMELINE.length - 1 && (
              <div className={cn("mb-4 h-0.5 flex-1", i < progress - 1 ? "bg-primary-400" : "bg-sand-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
