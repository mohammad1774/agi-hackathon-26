import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  FileJson,
  FileText,
  Paperclip,
  Send,
  Shield,
  XCircle,
  Zap,
} from "lucide-react";
import type {
  Patient,
  ReferralDeliveryOption,
  DeliveryMethodType,
  IntegrationStatus,
} from "@/types";
import { getProvider } from "@/data/providers";
import { getDeliveryOptions } from "@/data/deliveryOptions";
import { rankDeliveryOptions } from "@/lib/deliveryRanking";
import { computeReadiness } from "@/lib/readiness";
import { useReferralStore } from "@/store/useReferralStore";
import { ResponsibleAIBanner } from "@/components/ai";
import { Badge, Button, Card, EmptyState, SourceChip, cn } from "@/components/ui";
import { StepHeading, StepNav } from "../parts";

// ---- Label maps ------------------------------------------------------------

const METHOD_LABELS: Record<DeliveryMethodType, string> = {
  ocean_ereferral: "Ocean eReferral",
  ocean_econsult: "Ocean eConsult",
  ocean_eorder: "Ocean eOrder",
  central_intake: "Central Intake",
  community_service: "Community Service",
  hospital_portal: "Hospital Portal",
  fax: "eFax / Fax",
  secure_message: "Secure Message",
  patient_self_booking: "Patient Self-Booking",
};

const STATUS_LABEL: Record<IntegrationStatus, string> = {
  connected: "Connected",
  available_manual: "Manual",
  unavailable: "Unavailable",
  unknown: "Unknown",
};

const STATUS_TONE = {
  connected: "success",
  available_manual: "warning",
  unavailable: "neutral",
  unknown: "neutral",
} as const;

function trackingLabel(o: ReferralDeliveryOption): string {
  if (o.methodType === "fax") return "Tracking: Limited";
  if (o.status === "unavailable") return "N/A";
  if (o.status === "connected") return "Tracking: Full";
  return "Tracking: Partial";
}

// ---- MethodCard ------------------------------------------------------------

function MethodCard({
  option,
  selected,
  onSelect,
}: {
  option: ReferralDeliveryOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const missingCount = option.requiredDocuments.filter((d) => d.status === "missing").length;

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition-all",
        option.recommended
          ? "border-primary-300 bg-primary-50/40 ring-2 ring-primary-400"
          : selected
            ? "border-lavender-300 bg-lavender-50/30 ring-2 ring-lavender-400"
            : "border-sand-200 bg-white hover:border-sand-300"
      )}
    >
      {/* Header row */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {option.recommended && (
          <Badge tone="success" className="text-[11px]">
            <Zap className="h-3 w-3" /> Recommended
          </Badge>
        )}
        <span className="text-sm font-bold text-sand-900">{option.portalName}</span>
        <Badge tone="neutral" className="text-[10px]">
          {METHOD_LABELS[option.methodType]}
        </Badge>
        <Badge tone={STATUS_TONE[option.status]} className="text-[10px]">
          {STATUS_LABEL[option.status]}
        </Badge>
        <Badge tone="neutral" className="text-[10px] opacity-70 sm:ml-auto">
          Demo data
        </Badge>
      </div>

      {/* Recommendation reason */}
      {option.recommended && (
        <p className="mb-3 text-xs italic text-primary-700">{option.recommendationReason}</p>
      )}

      {/* Metrics pills */}
      <div className="mb-3 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 rounded-lg bg-sand-100 px-2.5 py-1 text-xs text-sand-700">
          <Send className="h-3 w-3 opacity-60" />
          {option.estimatedTimeToAcceptedCare}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs",
            option.acceptanceProbability === "high"
              ? "bg-primary-100 text-primary-700"
              : option.acceptanceProbability === "medium"
                ? "bg-amber-100 text-amber-700"
                : "bg-rose-100 text-rose-600"
          )}
        >
          Acceptance: {option.acceptanceProbability}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs",
            option.riskLevel === "low"
              ? "bg-primary-100 text-primary-700"
              : option.riskLevel === "medium"
                ? "bg-amber-100 text-amber-700"
                : "bg-rose-100 text-rose-600"
          )}
        >
          Risk: {option.riskLevel}
        </span>
        <span className="inline-flex items-center gap-1 rounded-lg bg-sand-100 px-2.5 py-1 text-xs text-sand-600">
          {trackingLabel(option)}
        </span>
      </div>

      {/* Risk reasons */}
      {option.riskReasons.length > 0 && (
        <div className="mb-3 space-y-1">
          {option.riskReasons.map((r) => (
            <div key={r} className="flex items-start gap-1.5 text-xs text-amber-700">
              <span className="mt-0.5">⚠</span> {r}
            </div>
          ))}
        </div>
      )}

      {/* Missing docs alert */}
      {missingCount > 0 && (
        <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          {missingCount} required document{missingCount > 1 ? "s" : ""} missing
        </div>
      )}

      {/* Action row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          variant={selected ? "secondary" : "soft"}
          size="sm"
          onClick={onSelect}
          className={cn("w-full sm:w-auto", selected ? "ring-2 ring-lavender-300" : "")}
        >
          {selected ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" /> Selected
            </>
          ) : (
            "Select this method"
          )}
        </Button>

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-center gap-1 text-xs text-sand-400 hover:text-sand-600 sm:ml-auto sm:justify-start"
        >
          Generated package
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
          />
        </button>
      </div>

      {/* Inline form list (collapsed by default) */}
      {expanded && (
        <div className="mt-3 space-y-1 border-t border-sand-100 pt-3">
          {option.generatedForms.map((f) => (
            <div key={f.name} className="flex flex-wrap items-center gap-2 text-xs text-sand-600">
              {f.type === "fhir_payload" ? (
                <FileJson className="h-3.5 w-3.5 shrink-0 text-lavender-400" />
              ) : (
                <FileText className="h-3.5 w-3.5 shrink-0 text-primary-400" />
              )}
              <span className="min-w-0 flex-1">{f.name}</span>
              <Badge tone="neutral" className="text-[10px]">
                {f.format}
              </Badge>
              {f.requiresPhysicianReview && (
                <Badge tone="lavender" className="text-[10px]">
                  <Shield className="h-2.5 w-2.5" /> Physician review
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- UnavailableRow --------------------------------------------------------

function UnavailableRow({ option }: { option: ReferralDeliveryOption }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-sand-50 px-3 py-2.5 text-xs text-sand-500">
      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sand-300" />
      <div className="min-w-0 flex-1">
        <span className="font-semibold">{option.portalName}</span>
        <span className="ml-1.5">
          <Badge tone="neutral" className="text-[10px]">
            Unavailable
          </Badge>
        </span>
        <span className="ml-2 text-sand-400">{option.recommendationReason}</span>
      </div>
    </div>
  );
}

// ---- GeneratedPackagePreview -----------------------------------------------

function GeneratedPackagePreview({ option }: { option: ReferralDeliveryOption | null }) {
  if (!option) {
    return (
      <EmptyState
        icon={<FileText className="h-8 w-8" />}
        title="Select a send method"
        subtitle="The generated package and submission actions will appear here."
      />
    );
  }

  const hasActionable = option.submissionActions.some((a) => a.enabled);

  return (
    <div className="space-y-4">
      <div className="text-xs font-bold uppercase tracking-wide text-sand-400">
        Generated package — {option.portalName}
      </div>

      {/* Generated forms */}
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-sand-500 uppercase tracking-wide">
          <FileText className="h-3.5 w-3.5" /> Generated forms
        </div>
        <div className="space-y-2">
          {option.generatedForms.map((f) => (
            <div key={f.name} className="flex flex-wrap items-center gap-1.5 text-xs">
              {f.type === "fhir_payload" ? (
                <FileJson className="h-3.5 w-3.5 shrink-0 text-lavender-400" />
              ) : (
                <FileText className="h-3.5 w-3.5 shrink-0 text-primary-500" />
              )}
              <span className="min-w-[160px] flex-1 text-sand-700">{f.name}</span>
              <Badge tone="neutral" className="text-[10px]">
                {f.format}
              </Badge>
              {f.requiresPhysicianReview && (
                <Badge tone="lavender" className="text-[10px]">
                  <Shield className="h-2.5 w-2.5" /> Physician review required
                </Badge>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Attachments */}
      {option.attachments.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-sand-500 uppercase tracking-wide">
            <Paperclip className="h-3.5 w-3.5" /> Attachments
          </div>
          <div className="space-y-1.5">
            {option.attachments.map((a) => (
              <div key={a.name} className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    a.status === "attached"
                      ? "bg-primary-500"
                      : a.status === "missing"
                        ? "bg-rose-400"
                        : "bg-sand-300"
                  )}
                />
                <span className="min-w-[160px] flex-1 text-sand-700">{a.name}</span>
                <Badge
                  tone={
                    a.status === "attached"
                      ? "success"
                      : a.status === "missing"
                        ? "danger"
                        : "neutral"
                  }
                  className="text-[10px]"
                >
                  {a.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Required documents */}
      {option.requiredDocuments.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-sand-500 uppercase tracking-wide">
            <Shield className="h-3.5 w-3.5" /> Required documents
          </div>
          <div className="space-y-2">
            {option.requiredDocuments.map((d) => (
              <div key={d.name} className="text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      d.status === "available"
                        ? "success"
                        : d.status === "missing"
                          ? "danger"
                          : d.status === "optional"
                            ? "neutral"
                            : "info"
                    }
                    className="text-[10px]"
                  >
                    {d.status}
                  </Badge>
                  <span className="min-w-[140px] flex-1 text-sand-700">{d.name}</span>
                  <SourceChip>{d.source}</SourceChip>
                </div>
                {d.actionRequired && (
                  <p className="mt-1 text-amber-600 sm:pl-14">{d.actionRequired}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Submission actions */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-bold text-sand-500 uppercase tracking-wide">
          <Send className="h-3.5 w-3.5" /> Submission actions
        </div>
        {!hasActionable && (
          <p className="mb-2 text-xs text-amber-600">
            Complete readiness requirements before submitting.
          </p>
        )}
        <div className="space-y-2">
          {option.submissionActions.map((a) => (
            <div key={a.label}>
              <Button
                variant={a.enabled ? "primary" : "ghost"}
                size="sm"
                disabled={!a.enabled}
                className="w-full justify-start"
              >
                {a.label}
              </Button>
              {!a.enabled && a.disabledReason && (
                <p className="mt-0.5 pl-1 text-[11px] text-amber-600">{a.disabledReason}</p>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Audit footer */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-sand-400">
        <SourceChip>Verified {option.audit.lastVerified}</SourceChip>
        <SourceChip>{option.audit.dataSource}</SourceChip>
        <SourceChip>AI confidence {option.audit.aiConfidence}%</SourceChip>
      </div>
    </div>
  );
}

// ---- Main step -------------------------------------------------------------

export function StepDelivery({ patient }: { patient: Patient }) {
  const prevStep = useReferralStore((s) => s.prevStep);
  const nextStep = useReferralStore((s) => s.nextStep);
  const selectedProviderId = useReferralStore((s) => s.selectedProviderId);
  const selectedDeliveryOptionId = useReferralStore((s) => s.selectedDeliveryOptionId);
  const selectDeliveryOption = useReferralStore((s) => s.selectDeliveryOption);
  const presentDocIds = useReferralStore((s) => s.presentDocIds);

  const [showUnavailable, setShowUnavailable] = useState(false);

  const provider = getProvider(selectedProviderId ?? patient.candidateProviderIds[0]);
  const readiness = computeReadiness(patient, presentDocIds);

  const rawOptions = getDeliveryOptions(provider, readiness.score, presentDocIds);
  const rankedOptions = rankDeliveryOptions(rawOptions);

  const available = rankedOptions.filter((o) => o.status !== "unavailable");
  const unavailable = rankedOptions.filter((o) => o.status === "unavailable");
  const recommended = available.filter((o) => o.recommended);
  const others = available.filter((o) => !o.recommended);

  const selectedOption = rankedOptions.find((o) => o.id === selectedDeliveryOptionId) ?? null;

  return (
    <div>
      <StepHeading
        eyebrow="Step 6 · Send Method"
        title="Choose how to send this referral"
        subtitle="Select a delivery channel to see the generated package and submission requirements. The AI recommends — you decide."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: method selection */}
        <div className="space-y-4 lg:col-span-2">
          {/* Recommended */}
          {recommended.length > 0 && (
            <div className="space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-primary-600">
                Recommended
              </div>
              {recommended.map((o) => (
                <MethodCard
                  key={o.id}
                  option={o}
                  selected={selectedDeliveryOptionId === o.id}
                  onSelect={() => selectDeliveryOption(o.id)}
                />
              ))}
            </div>
          )}

          {/* Other available */}
          {others.length > 0 && (
            <div className="space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-sand-400">
                Other available methods
              </div>
              {others.map((o) => (
                <MethodCard
                  key={o.id}
                  option={o}
                  selected={selectedDeliveryOptionId === o.id}
                  onSelect={() => selectDeliveryOption(o.id)}
                />
              ))}
            </div>
          )}

          {/* Unavailable */}
          {unavailable.length > 0 && (
            <div>
              <button
                onClick={() => setShowUnavailable(!showUnavailable)}
                className="flex items-center gap-1.5 text-xs font-semibold text-sand-400 hover:text-sand-600"
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    showUnavailable && "rotate-180"
                  )}
                />
                Not available / not recommended ({unavailable.length})
              </button>
              {showUnavailable && (
                <div className="mt-2 space-y-1.5">
                  {unavailable.map((o) => (
                    <UnavailableRow key={o.id} option={o} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: package preview */}
        <div className="lg:col-span-1">
          <GeneratedPackagePreview option={selectedOption} />
        </div>
      </div>

      <div className="mt-5">
        <ResponsibleAIBanner compact />
      </div>

      <StepNav
        onBack={prevStep}
        onNext={nextStep}
        nextLabel="Continue to Draft"
        nextDisabled={!selectedDeliveryOptionId}
      />
    </div>
  );
}
