import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Cloud,
  CloudOff,
  FileSignature,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
} from "lucide-react";
import type { Patient } from "@/types";
import { getPathway } from "@/data/pathways";
import { getProvider } from "@/data/providers";
import { getDocument } from "@/data/documents";
import { computeReadiness } from "@/lib/readiness";
import { rankProvider } from "@/lib/scoring";
import { draftReferralPackage, type ReferralPackage } from "@/lib/api";
import { useReferralStore } from "@/store/useReferralStore";
import { ResponsibleAIBanner } from "@/components/ai";
import { Badge, Button, Card, SourceChip } from "@/components/ui";
import { StepHeading, StepNav } from "../parts";

type DraftSource = "loading" | "live" | "offline";

export function Step6Draft({ patient }: { patient: Patient }) {
  const prevStep = useReferralStore((s) => s.prevStep);
  const pathwayId = useReferralStore((s) => s.pathwayId);
  const presentDocIds = useReferralStore((s) => s.presentDocIds);
  const selectedProviderId = useReferralStore((s) => s.selectedProviderId);
  const sendReferral = useReferralStore((s) => s.sendReferral);

  const pathway = getPathway(pathwayId ?? patient.recommendedPathwayId);
  const provider = getProvider(selectedProviderId ?? patient.candidateProviderIds[0]);
  const readiness = computeReadiness(patient, presentDocIds);

  const localDraft = useMemo(
    () => buildDraft(patient, pathway.specialty, pathway.subspecialty, provider.name),
    [patient, pathway, provider]
  );

  const [text, setText] = useState(localDraft);
  const [signed, setSigned] = useState(false);
  const [source, setSource] = useState<DraftSource>("loading");
  const [pkg, setPkg] = useState<ReferralPackage | null>(null);

  // Ask the backend to draft the real referral package for the selected
  // destination. Falls back to the local sample draft if the API is unavailable.
  useEffect(() => {
    let cancelled = false;
    setSource("loading");
    setPkg(null);

    draftReferralPackage({ patient, pathway, provider, presentDocIds })
      .then((res) => {
        if (cancelled) return;
        setPkg(res.referral_package);
        setText(res.referral_package.referral_letter || localDraft);
        setSource("live");
      })
      .catch(() => {
        if (cancelled) return;
        setText(localDraft);
        setSource("offline");
      });

    return () => {
      cancelled = true;
    };
    // Re-draft whenever the destination or the attached documents change.
  }, [patient, pathway, provider, presentDocIds, localDraft]);

  const attached = presentDocIds.map((id) => getDocument(id).label);
  const matchScore = rankProvider(provider, readiness.score).score;

  return (
    <div>
      <StepHeading
        eyebrow="Step 6 · Draft & Sign"
        title="AI-drafted referral package"
        subtitle="Edit anything before signing. The AI never sends without your signature."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <Badge tone="lavender">
                <Sparkles className="h-3 w-3" /> AI draft
              </Badge>
              <BackendStatus source={source} />
            </div>
            {source === "loading" ? (
              <div className="flex h-[360px] items-center justify-center rounded-xl border border-sand-200 bg-sand-50/50 text-sm text-sand-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Drafting referral letter…
              </div>
            ) : (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={18}
                className="scroll-soft w-full resize-none rounded-xl border border-sand-200 bg-sand-50/50 p-4 font-mono text-[13px] leading-relaxed text-sand-700 outline-none focus:border-lavender-300 focus:ring-2 focus:ring-lavender-100"
              />
            )}
          </Card>

          {pkg && <PackageDetails pkg={pkg} />}
        </div>

        <div className="space-y-4">
          <Card>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sand-400">
              <Paperclip className="h-3.5 w-3.5" /> Attached documents
            </div>
            <div className="flex flex-wrap gap-1.5">
              {attached.length > 0 ? (
                attached.map((a) => <SourceChip key={a}>{a}</SourceChip>)
              ) : (
                <span className="text-xs text-sand-400">No documents attached yet.</span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-primary-50 py-2">
                <div className="text-lg font-extrabold text-primary-700">
                  {pkg ? Math.round(pkg.readiness_score) : readiness.score}%
                </div>
                <div className="text-[10px] font-semibold text-primary-600">readiness</div>
              </div>
              <div className="rounded-lg bg-lavender-50 py-2">
                <div className="text-lg font-extrabold text-lavender-700">{matchScore}%</div>
                <div className="text-[10px] font-semibold text-lavender-600">match</div>
              </div>
            </div>
            {pkg && (
              <div className="mt-2 text-center text-[11px] font-medium text-sand-500">
                {pkg.readiness_label} · {pkg.selected_form_template}
              </div>
            )}
          </Card>

          <Card className="bg-primary-50/50 ring-primary-200">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={signed}
                onChange={(e) => setSigned(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary-500"
              />
              <span className="text-sm text-sand-700">
                <span className="inline-flex items-center gap-1 font-semibold text-primary-700">
                  <FileSignature className="h-4 w-4" /> I have reviewed and approve this referral.
                </span>
                <span className="mt-1 block text-xs text-sand-500">
                  Routed to {provider.name}.
                </span>
              </span>
            </label>
          </Card>

          <ResponsibleAIBanner compact />
        </div>
      </div>

      <StepNav onBack={prevStep}>
        <Button
          variant="primary"
          size="lg"
          disabled={!signed || source === "loading"}
          onClick={() => sendReferral(rankProvider(provider, readiness.score))}
        >
          <Send className="h-4 w-4" /> Sign & send referral
        </Button>
      </StepNav>
    </div>
  );
}

function BackendStatus({ source }: { source: DraftSource }) {
  if (source === "loading") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-sand-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Contacting backend…
      </span>
    );
  }
  if (source === "live") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600">
        <Cloud className="h-3.5 w-3.5" /> Live backend draft
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600"
      title="Backend unavailable — showing a local sample draft. Start the API to generate the live package."
    >
      <CloudOff className="h-3.5 w-3.5" /> Offline sample draft
    </span>
  );
}

function PackageDetails({ pkg }: { pkg: ReferralPackage }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {pkg.gap_requisitions.length > 0 && (
        <Card>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-sand-400">
            Auto-drafted requisitions
          </div>
          <div className="space-y-2">
            {pkg.gap_requisitions.map((g) => (
              <div key={g.document_name} className="rounded-xl bg-sand-50 p-3 ring-1 ring-sand-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-sand-800">{g.document_name}</span>
                  <Badge tone={g.urgency === "urgent" ? "warning" : "neutral"}>
                    {g.urgency} · ~{g.estimated_days}d
                  </Badge>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-sand-500">
                  {g.requisition_text}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className={pkg.gap_requisitions.length > 0 ? "" : "sm:col-span-2"}>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-sand-400">
          Pre-send checklist
        </div>
        <ul className="space-y-1.5">
          {pkg.pre_send_checklist.map((item) => (
            <li key={item.label} className="flex items-start gap-2 text-sm">
              <ChecklistIcon status={item.status} />
              <span>
                <span className="font-medium text-sand-700">{item.label}</span>
                {item.note && (
                  <span className="block text-[11px] text-sand-400">{item.note}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function ChecklistIcon({ status }: { status: ReferralPackage["pre_send_checklist"][number]["status"] }) {
  if (status === "complete")
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />;
  if (status === "blocked")
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />;
  if (status === "warning")
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />;
  return <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-sand-300" />;
}

function buildDraft(
  patient: Patient,
  specialty: string,
  subspecialty: string,
  providerName: string
): string {
  const reasons = patient.intent.reasons.map((r) => `  • ${r}`).join("\n");
  return `REFERRAL — ${specialty} (${subspecialty})
To: ${providerName}
Re: ${patient.name} (${patient.age}${patient.sex}, ${patient.mrn})

Reason for referral:
${reasons}

History:
${patient.visitSummary}

Vitals / findings:
${patient.vitals.map((v) => `  • ${v.label}: ${v.value}`).join("\n")}

Question for specialist:
  Please assess and advise on management. Subspecialty routing chosen to
  match the clinical picture and reduce redirect risk.

Referring clinician: Dr. A. Okafor, Family Medicine
Generated by Referral GPS · physician-reviewed before sending.`;
}
