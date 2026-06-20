import { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRightLeft,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Hourglass,
  Inbox,
  Send,
  XCircle,
} from "lucide-react";
import type { Referral, ReferralStatus } from "@/types";
import { getProvider } from "@/data/providers";
import { relativeFromNow, weeksLabel } from "@/lib/format";
import { useReferralStore } from "@/store/useReferralStore";
import { Avatar, Badge, Button, Card, EmptyState, SectionTitle, cn } from "@/components/ui";
import { initials } from "@/lib/format";

const STATUS_META: Record<
  ReferralStatus,
  { label: string; tone: "primary" | "lavender" | "warning" | "danger" | "info" | "neutral"; icon: typeof Send }
> = {
  draft: { label: "Draft", tone: "neutral", icon: Clock3 },
  sent: { label: "Sent", tone: "info", icon: Send },
  received: { label: "Received", tone: "info", icon: Inbox },
  accepted: { label: "Accepted", tone: "primary", icon: CheckCircle2 },
  scheduled: { label: "Scheduled", tone: "primary", icon: CalendarCheck },
  "needs-info": { label: "Needs info", tone: "warning", icon: AlertCircle },
  rejected: { label: "Rejected", tone: "danger", icon: XCircle },
  "no-response": { label: "No response", tone: "danger", icon: Hourglass },
};

const FILTERS: Array<{ key: "all" | ReferralStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "needs-info", label: "Needs info" },
  { key: "rejected", label: "Rejected" },
  { key: "no-response", label: "Escalation" },
  { key: "accepted", label: "Accepted" },
  { key: "scheduled", label: "Scheduled" },
];

export default function TrackerPage() {
  const referrals = useReferralStore((s) => s.referrals);
  const [filter, setFilter] = useState<"all" | ReferralStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(referrals[0]?.id ?? null);

  const filtered =
    filter === "all" ? referrals : referrals.filter((r) => r.status === filter);
  const selected = referrals.find((r) => r.id === selectedId) ?? filtered[0] ?? null;

  const counts = referrals.reduce(
    (acc, r) => {
      if (r.status === "needs-info") acc.needs += 1;
      if (r.status === "rejected") acc.rejected += 1;
      if (r.status === "no-response") acc.escalation += 1;
      if (r.status === "accepted" || r.status === "scheduled") acc.done += 1;
      return acc;
    },
    { needs: 0, rejected: 0, escalation: 0, done: 0 }
  );

  return (
    <div className="space-y-5">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Total tracked" value={referrals.length} tone="lavender" icon={Send} />
        <SummaryTile label="Need info" value={counts.needs} tone="warning" icon={AlertCircle} />
        <SummaryTile label="Rejected" value={counts.rejected} tone="danger" icon={XCircle} />
        <SummaryTile label="Accepted / booked" value={counts.done} tone="primary" icon={CheckCircle2} />
      </div>

      <div className="scroll-soft -mx-3 flex flex-nowrap items-center gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              filter === f.key
                ? "bg-lavender-600 text-white"
                : "bg-white text-sand-500 ring-1 ring-sand-200 hover:bg-sand-100"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        {/* List */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-10 w-10" />}
              title="Nothing here"
              subtitle="No referrals match this filter."
            />
          ) : (
            filtered.map((r) => (
              <ReferralRow
                key={r.id}
                referral={r}
                active={selected?.id === r.id}
                onClick={() => setSelectedId(r.id)}
              />
            ))
          )}
        </div>

        {/* Detail */}
        <div className="lg:sticky lg:top-2 lg:self-start">
          {selected ? (
            <ReferralDetail referral={selected} />
          ) : (
            <EmptyState title="Select a referral" subtitle="Choose one to see its closed loop." />
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "primary" | "lavender" | "warning" | "danger";
  icon: typeof Send;
}) {
  const tones = {
    primary: "bg-primary-50 text-primary-700",
    lavender: "bg-lavender-50 text-lavender-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-rose-50 text-rose-600",
  };
  return (
    <Card className={cn("flex min-h-[92px] items-center justify-between gap-3", tones[tone])}>
      <div>
        <div className="text-2xl font-extrabold">{value}</div>
        <div className="text-xs font-semibold opacity-80">{label}</div>
      </div>
      <Icon className="h-6 w-6 opacity-60" />
    </Card>
  );
}

function ReferralRow({
  referral,
  active,
  onClick,
}: {
  referral: Referral;
  active: boolean;
  onClick: () => void;
}) {
  const meta = STATUS_META[referral.status];
  const Icon = meta.icon;
  const escalated = referral.status === "no-response" && referral.daysWaiting >= 10;

  return (
    <button onClick={onClick} className="w-full text-left">
      <Card
        className={cn(
          "transition-all hover:shadow-soft",
          active ? "ring-2 ring-lavender-300" : "ring-sand-200"
        )}
      >
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 sm:flex sm:items-center">
          <Avatar initials={initials(referral.patientName)} size={40} hue={(referral.id.length * 47) % 360} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-bold text-sand-900">{referral.patientName}</span>
              <span className="text-xs text-sand-300">{referral.id}</span>
            </div>
            <div className="truncate text-xs text-sand-400">
              {referral.specialtyLabel} · {referral.providerName}
            </div>
          </div>
          <div className="col-start-2 flex flex-row items-center justify-between gap-2 sm:flex-col sm:items-end">
            <Badge tone={meta.tone}>
              <Icon className="h-3 w-3" /> {meta.label}
            </Badge>
            <span className="text-[11px] text-sand-400">{relativeFromNow(referral.updatedAt)}</span>
          </div>
        </div>
        {escalated && (
          <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600">
            <Hourglass className="h-3.5 w-3.5" /> {referral.daysWaiting} days with no response — escalation
            recommended
          </div>
        )}
      </Card>
    </button>
  );
}

function ReferralDetail({ referral }: { referral: Referral }) {
  const resolveGapTask = useReferralStore((s) => s.resolveGapTask);
  const rerouteReferral = useReferralStore((s) => s.rerouteReferral);
  const advanceReferral = useReferralStore((s) => s.advanceReferral);
  const meta = STATUS_META[referral.status];

  return (
    <Card className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-sand-400">{referral.id}</div>
          <h3 className="text-lg font-extrabold text-sand-900">{referral.patientName}</h3>
          <div className="text-xs text-sand-400">{referral.specialtyLabel}</div>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <MiniStat label="Match" value={`${referral.matchScore}%`} />
        <MiniStat label="Readiness" value={`${referral.readinessAtSend}%`} />
        <MiniStat label="Time-to-care" value={weeksLabel(referral.timeToAcceptedCareWeeks)} />
      </div>

      <div className="rounded-xl bg-sand-50 px-3 py-2 text-sm text-sand-600 ring-1 ring-sand-200">
        Destination: <span className="font-semibold text-sand-800">{referral.providerName}</span>
      </div>

      {/* Status-specific action zone */}
      {referral.status === "needs-info" && (
        <div className="space-y-2 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-700">
            <AlertCircle className="h-4 w-4" /> Gap-resolution required
          </div>
          {referral.gapTasks.map((t) => (
            <div
              key={t.id}
              className="flex flex-col gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-amber-100 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div
                  className={cn(
                    "text-sm font-semibold",
                    t.resolved ? "text-sand-400 line-through" : "text-sand-800"
                  )}
                >
                  {t.label}
                </div>
                <div className="text-[11px] text-sand-400">{t.detail}</div>
              </div>
              <Button
                size="sm"
                variant={t.resolved ? "ghost" : "primary"}
                disabled={t.resolved}
                onClick={() => resolveGapTask(referral.id, t.id)}
                className="w-full sm:w-auto"
              >
                {t.resolved ? "Done" : "Resolve"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {referral.status === "rejected" && (
        <div className="space-y-2 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-rose-600">
            <XCircle className="h-4 w-4" /> Rejection reason
          </div>
          <p className="text-sm text-sand-600">{referral.rejectionReason}</p>
          {referral.nextBestProviderId && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => rerouteReferral(referral.id)}
              className="w-full sm:w-auto"
            >
              <ArrowRightLeft className="h-4 w-4" /> Re-route to{" "}
              {getProvider(referral.nextBestProviderId).name}
            </Button>
          )}
        </div>
      )}

      {(referral.status === "sent" || referral.status === "received") && (
        <div className="rounded-xl bg-sky-50 p-3 ring-1 ring-sky-100">
          <div className="mb-2 text-xs font-semibold text-sky-700">Simulate clinic response</div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="soft"
              onClick={() => advanceReferral(referral.id, "accepted", "Accepted — entered triage.")}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                advanceReferral(referral.id, "needs-info", "Requested additional information.")
              }
            >
              Request info
            </Button>
          </div>
        </div>
      )}

      {referral.status === "no-response" && (
        <div className="rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-rose-600">
            <Hourglass className="h-4 w-4" /> {referral.daysWaiting} days, no response
          </div>
          <Button
            size="sm"
            variant="danger"
            onClick={() =>
              advanceReferral(referral.id, "received", "Escalation reminder sent — clinic acknowledged.")
            }
            className="w-full sm:w-auto"
          >
            <Send className="h-4 w-4" /> Send escalation reminder
          </Button>
        </div>
      )}

      {referral.patientPrep && (referral.status === "accepted" || referral.status === "scheduled") && (
        <div className="rounded-xl bg-primary-50 p-3 ring-1 ring-primary-200">
          <div className="mb-1.5 text-xs font-semibold text-primary-700">Patient prep sent</div>
          <ul className="space-y-1 text-sm text-sand-600">
            {referral.patientPrep.map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Audit trail */}
      <div>
        <SectionTitle title={<span className="text-sm">Audit trail</span>} />
        <ol className="space-y-3 border-l-2 border-sand-200 pl-4">
          {referral.audit.map((a, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className="relative"
            >
              <span
                className={cn(
                  "absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white",
                  a.actor === "clinic"
                    ? "bg-sky-400"
                    : a.actor === "ai"
                      ? "bg-lavender-500"
                      : a.actor === "admin"
                        ? "bg-amber-400"
                        : "bg-primary-500"
                )}
              />
              <div className="text-sm text-sand-700">{a.message}</div>
              <div className="text-[11px] uppercase tracking-wide text-sand-300">
                {a.actor} · {relativeFromNow(a.at)}
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-sand-50 py-2 ring-1 ring-sand-200">
      <div className="text-sm font-bold text-sand-800">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-sand-400">{label}</div>
    </div>
  );
}
