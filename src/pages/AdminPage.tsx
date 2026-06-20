import { motion } from "framer-motion";
import { CheckCircle2, ClipboardList, FlaskConical, MessageCircleQuestion, Paperclip, Hourglass, Send } from "lucide-react";
import { useReferralStore } from "@/store/useReferralStore";
import { relativeFromNow } from "@/lib/format";
import { Avatar, Badge, Button, Card, EmptyState, SectionTitle } from "@/components/ui";
import { initials } from "@/lib/format";

const ACTION_ICON = {
  order: FlaskConical,
  ask: MessageCircleQuestion,
  attach: Paperclip,
} as const;

export default function AdminPage() {
  const referrals = useReferralStore((s) => s.referrals);
  const resolveGapTask = useReferralStore((s) => s.resolveGapTask);
  const advanceReferral = useReferralStore((s) => s.advanceReferral);

  const needsInfo = referrals.filter(
    (r) => r.status === "needs-info" && r.gapTasks.some((t) => !t.resolved)
  );
  const escalations = referrals.filter((r) => r.status === "no-response");

  const openTasks = needsInfo.reduce(
    (n, r) => n + r.gapTasks.filter((t) => !t.resolved).length,
    0
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="bg-amber-50 text-amber-700">
          <div className="text-3xl font-extrabold">{openTasks}</div>
          <div className="text-xs font-semibold">Open gap tasks</div>
        </Card>
        <Card className="bg-rose-50 text-rose-600">
          <div className="text-3xl font-extrabold">{escalations.length}</div>
          <div className="text-xs font-semibold">No-response escalations</div>
        </Card>
        <Card className="col-span-2 bg-primary-50 text-primary-700 sm:col-span-1">
          <div className="text-3xl font-extrabold">{referrals.length}</div>
          <div className="text-xs font-semibold">Referrals in flight</div>
        </Card>
      </div>

      <div>
        <SectionTitle
          eyebrow="Gap resolution"
          title="Referrals waiting on missing information"
          subtitle="Clear these to get the referral back into the clinic's triage queue."
        />
        {needsInfo.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-10 w-10 text-primary-400" />}
            title="No open gaps"
            subtitle="Every active referral has the information its destination clinic needs."
          />
        ) : (
          <div className="space-y-3">
            {needsInfo.map((r) => (
              <Card key={r.id}>
                <div className="mb-3 flex items-start gap-3">
                  <Avatar initials={initials(r.patientName)} size={40} hue={(r.id.length * 53) % 360} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sand-900">{r.patientName}</div>
                    <div className="text-xs text-sand-400">
                      {r.specialtyLabel} · {r.providerName}
                    </div>
                  </div>
                  <Badge tone="warning">
                    {r.gapTasks.filter((t) => !t.resolved).length} open
                  </Badge>
                </div>
                <div className="space-y-2">
                  {r.gapTasks.map((t) => {
                    const Icon = ACTION_ICON[t.actionKind];
                    return (
                      <motion.div
                        key={t.id}
                        layout
                        className="flex flex-col gap-3 rounded-xl bg-sand-50 px-3 py-2.5 ring-1 ring-sand-200 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-lavender-500 ring-1 ring-sand-200">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className={t.resolved ? "text-sm text-sand-400 line-through" : "text-sm font-semibold text-sand-800"}>
                              {t.label}
                            </div>
                            <div className="text-[11px] text-sand-400">{t.detail}</div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={t.resolved ? "ghost" : "primary"}
                          disabled={t.resolved}
                          onClick={() => resolveGapTask(r.id, t.id)}
                          className="w-full sm:w-auto"
                        >
                          {t.resolved ? "Done" : "Draft & resolve"}
                        </Button>
                      </motion.div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionTitle
          eyebrow="Escalations"
          title="Referrals with no clinic response"
          subtitle="Send a reminder before the patient gets lost in the system."
        />
        {escalations.length === 0 ? (
          <EmptyState title="No escalations" subtitle="Every clinic has responded in time." />
        ) : (
          <div className="space-y-3">
            {escalations.map((r) => (
              <Card key={r.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                  <Hourglass className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sand-900">{r.patientName}</div>
                  <div className="text-xs text-sand-400">
                    {r.providerName} · sent {relativeFromNow(r.createdAt)} · {r.daysWaiting} days waiting
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    advanceReferral(r.id, "received", "Escalation reminder sent — clinic acknowledged.")
                  }
                  className="w-full sm:w-auto"
                >
                  <Send className="h-4 w-4" /> Remind clinic
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card className="flex items-start gap-3 bg-lavender-50 ring-lavender-100">
        <ClipboardList className="h-5 w-5 text-lavender-500" />
        <p className="text-sm text-sand-600">
          Admins clear gaps and chase responses — physicians only see what truly needs a clinical
          decision. That division of labour is how referrals stop falling through the cracks.
        </p>
      </Card>
    </div>
  );
}
