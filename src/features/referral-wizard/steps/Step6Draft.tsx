import { useMemo, useState } from "react";
import { FileSignature, Paperclip, Send, Sparkles } from "lucide-react";
import type { Patient } from "@/types";
import { getPathway } from "@/data/pathways";
import { getProvider } from "@/data/providers";
import { getDocument } from "@/data/documents";
import { computeReadiness } from "@/lib/readiness";
import { rankProvider } from "@/lib/scoring";
import { useReferralStore } from "@/store/useReferralStore";
import { ResponsibleAIBanner } from "@/components/ai";
import { Badge, Button, Card, SourceChip } from "@/components/ui";
import { StepHeading, StepNav } from "../parts";

export function Step6Draft({ patient }: { patient: Patient }) {
  const prevStep = useReferralStore((s) => s.prevStep);
  const pathwayId = useReferralStore((s) => s.pathwayId);
  const presentDocIds = useReferralStore((s) => s.presentDocIds);
  const selectedProviderId = useReferralStore((s) => s.selectedProviderId);
  const sendReferral = useReferralStore((s) => s.sendReferral);

  const pathway = getPathway(pathwayId ?? patient.recommendedPathwayId);
  const provider = getProvider(selectedProviderId ?? patient.candidateProviderIds[0]);
  const readiness = computeReadiness(patient, presentDocIds);

  const draft = useMemo(
    () => buildDraft(patient, pathway.specialty, pathway.subspecialty, provider.name),
    [patient, pathway, provider]
  );

  const [text, setText] = useState(draft);
  const [signed, setSigned] = useState(false);

  const attached = presentDocIds.map((id) => getDocument(id).label);

  return (
    <div>
      <StepHeading
        eyebrow="Step 6 · Draft & Sign"
        title="AI-drafted referral package"
        subtitle="Edit anything before signing. The AI never sends without your signature."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <Badge tone="lavender">
              <Sparkles className="h-3 w-3" /> AI draft
            </Badge>
            <span className="text-xs text-sand-400">Editable</span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            className="scroll-soft w-full resize-none rounded-xl border border-sand-200 bg-sand-50/50 p-4 font-mono text-[13px] leading-relaxed text-sand-700 outline-none focus:border-lavender-300 focus:ring-2 focus:ring-lavender-100"
          />
        </Card>

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
                <div className="text-lg font-extrabold text-primary-700">{readiness.score}%</div>
                <div className="text-[10px] font-semibold text-primary-600">readiness</div>
              </div>
              <div className="rounded-lg bg-lavender-50 py-2">
                <div className="text-lg font-extrabold text-lavender-700">
                  {rankProvider(provider, readiness.score).score}%
                </div>
                <div className="text-[10px] font-semibold text-lavender-600">match</div>
              </div>
            </div>
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
          disabled={!signed}
          onClick={() => sendReferral(rankProvider(provider, readiness.score))}
          className="w-full sm:w-auto"
        >
          <Send className="h-4 w-4" /> Sign & send referral
        </Button>
      </StepNav>
    </div>
  );
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
