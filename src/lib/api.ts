/**
 * Typed client for the Referral GPS FastAPI backend.
 *
 * In dev, calls go to a relative base ("/api") which Vite proxies to the backend
 * (see vite.config.ts), so there is no CORS setup to worry about. Override with
 * VITE_API_BASE_URL for a deployed backend.
 *
 * Every call is defensive: a short timeout + typed errors so the UI can fall back
 * to its local sample output and never hang the demo if the backend is offline.
 */
import type { Patient, Pathway, Provider } from "@/types";
import { getDocument } from "@/data/documents";

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "/api";

/* ---- Backend response contract (mirrors backend/models.py) ---- */

export type LlmMode = "live" | "offline";
export type ChecklistStatus = "complete" | "warning" | "blocked" | "not_applicable";

export interface GapRequisition {
  document_name: string;
  requisition_text: string;
  urgency: "routine" | "urgent";
  estimated_days: number;
}

export interface ChecklistItem {
  label: string;
  status: ChecklistStatus;
  note: string;
}

export interface ReferralPackage {
  referral_letter: string;
  clinical_question: string;
  selected_form_template: string;
  included_documents: string[];
  missing_required: string[];
  missing_preferred: string[];
  gap_requisitions: GapRequisition[];
  readiness_score: number;
  readiness_label: string;
  pre_send_checklist: ChecklistItem[];
}

export interface DraftResponse {
  llm_mode: LlmMode;
  patient_profile: unknown;
  referral_package: ReferralPackage;
}

export interface HealthResponse {
  status: string;
  llm_mode: LlmMode;
  model: string | null;
  provider_count: number;
}

/* ---- Low-level fetch with timeout ---- */

async function apiFetch<T>(path: string, init?: RequestInit, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Backend ${res.status}: ${detail || res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function checkHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/health", { method: "GET" }, 4000);
}

/* ---- Mapping helpers: frontend domain model -> backend request ---- */

const SPECIALTY_MAP: Record<string, string> = {
  cardiology: "cardiology",
  "orthopaedic surgery": "orthopedics",
  "orthopedic surgery": "orthopedics",
  orthopaedics: "orthopedics",
  dermatology: "dermatology",
  gastroenterology: "gastroenterology",
  neurology: "neurology",
  endocrinology: "endocrinology",
  pulmonology: "pulmonology",
  nephrology: "nephrology",
};

function toBackendSpecialty(specialty: string): string {
  const key = specialty.trim().toLowerCase();
  return SPECIALTY_MAP[key] ?? key.split(/\s+/)[0];
}

function docLabels(ids: string[]): string[] {
  return ids.map((id) => {
    try {
      return getDocument(id).label;
    } catch {
      return id;
    }
  });
}

function urgencyFor(patient: Patient): "low" | "moderate" | "high" | "emergent" {
  if (patient.redFlags.length > 0) return "emergent";
  if (patient.intent.confidence >= 90) return "high";
  return "moderate";
}

function buildTranscript(patient: Patient): string {
  const lines = [
    `${patient.intent.specialty} referral. ${patient.reason}.`,
    patient.visitSummary,
  ];
  if (patient.redFlags.length > 0) {
    lines.push(`Urgent / high-priority: ${patient.redFlags.join("; ")}.`);
  }
  for (const c of patient.constraints) {
    if (c.icon === "transit") lines.push("Patient relies on public transit (no car).");
    if (c.icon === "language") lines.push(`Language: ${c.detail}.`);
    if (c.icon === "mobility") lines.push(`Mobility: ${c.detail}.`);
  }
  return lines.join(" ");
}

function buildEhr(patient: Patient, presentDocIds: string[], missingDocIds: string[]): string {
  const vitals = patient.vitals.map((v) => `${v.label}: ${v.value}`).join(", ");
  const onFile = docLabels(presentDocIds).join(", ") || "none recorded";
  const toOrder = docLabels(missingDocIds).join(", ") || "none";
  return [
    `Dx: ${patient.reason}.`,
    `Vitals: ${vitals}.`,
    `On file: ${onFile}.`,
    `To be ordered / still required: ${toOrder}.`,
  ].join(" ");
}

export interface DraftRequestArgs {
  patient: Patient;
  pathway: Pathway;
  provider: Provider;
  presentDocIds: string[];
  province?: string;
}

/** Build the /draft-package request body from the wizard's current state. */
export function buildDraftRequest(args: DraftRequestArgs) {
  const { patient, pathway, provider, presentDocIds, province = "Ontario" } = args;
  const present = new Set(presentDocIds);

  // What this patient's pathway needs vs. what's on file.
  const missingPathwayDocIds = patient.requiredDocIds.filter((id) => !present.has(id));

  // The selected clinic's hard requirements; the rest of the pathway docs are "preferred".
  const providerRequired = provider.requiredDocIds ?? [];
  const preferredDocIds = patient.requiredDocIds.filter(
    (id) => !providerRequired.includes(id)
  );

  return {
    clinical_intent: `${pathway.specialty.toLowerCase()} ${pathway.subspecialty.toLowerCase()} assessment`,
    urgency: urgencyFor(patient),
    available_documents: docLabels(presentDocIds),
    missing_documents: docLabels(missingPathwayDocIds),
    patient_constraints: {
      max_distance_km: 50,
      requires_transit: patient.constraints.some((c) => c.icon === "transit"),
      language:
        patient.constraints.find((c) => c.icon === "language")?.detail.toLowerCase() ??
        "english",
      mobility_limited: patient.constraints.some((c) => c.icon === "mobility"),
    },
    transcript: buildTranscript(patient),
    ehr_data: buildEhr(patient, presentDocIds, missingPathwayDocIds),
    province,
    provider: {
      name: provider.name,
      specialty: toBackendSpecialty(pathway.specialty),
      province,
      address: provider.modality === "virtual" ? "Virtual / telehealth" : undefined,
      required_documents: docLabels(providerRequired),
      preferred_documents: docLabels(preferredDocIds),
    },
  };
}

/** Call the backend to draft a referral package for the selected destination. */
export function draftReferralPackage(args: DraftRequestArgs): Promise<DraftResponse> {
  return apiFetch<DraftResponse>("/draft-package", {
    method: "POST",
    body: JSON.stringify(buildDraftRequest(args)),
  });
}
