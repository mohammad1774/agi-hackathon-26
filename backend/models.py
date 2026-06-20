from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from enum import Enum


class Urgency(str, Enum):
    low = "low"
    moderate = "moderate"
    high = "high"
    emergent = "emergent"


class PatientConstraints(BaseModel):
    max_distance_km: float = 50
    requires_transit: bool = False
    language: str = "english"
    mobility_limited: bool = False


class ExtractedPatientProfile(BaseModel):
    clinical_intent: str                       # e.g. "arrhythmia assessment"
    urgency: Urgency
    available_documents: List[str] = Field(default_factory=list)
    missing_documents: List[str] = Field(default_factory=list)
    patient_constraints: PatientConstraints = Field(default_factory=PatientConstraints)
    extraction_confidence: float = 0.0         # 0.0-1.0 — gates the pipeline
    extraction_source: Literal["llm", "heuristic", "frontend"] = "llm"  # provenance


class ScoredProvider(BaseModel):
    provider_id: str
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    total_score: float
    score_breakdown: dict                      # auditable per-dimension points
    nominal_wait_days: int                     # raw clinic wait (naive metric)
    prerequisite_days: int                     # time to procure missing prerequisites
    real_ttc_days: int                         # real time-to-accepted-care
    readiness_pct: float                       # "Referral Readiness Score"
    rejection_risk: Literal["low", "moderate", "high"] = "low"
    rejection_reason: Optional[str] = None
    equity_flag: Optional[str] = None          # surfaces access gaps, never hidden
    distance_km: float = 0
    explanation: str = ""                      # generated in Step 4
    auto_actions: List[str] = Field(default_factory=list)


# ---- Step 5: referral package generation ----

class GapRequisition(BaseModel):
    document_name: str
    requisition_text: str                      # drafted requisition the doctor can sign
    urgency: Literal["routine", "urgent"] = "routine"
    estimated_days: int                        # procurement lead time


class ChecklistItem(BaseModel):
    label: str
    status: Literal["complete", "warning", "blocked", "not_applicable"]
    note: str = ""


class ReferralPackage(BaseModel):
    referral_letter: str                       # complete, copy-pasteable drafted letter
    clinical_question: str                     # the focused question to the specialist
    selected_form_template: str               # form appropriate for this clinic/specialty
    included_documents: List[str] = Field(default_factory=list)
    missing_required: List[str] = Field(default_factory=list)   # hard blocks (will reject)
    missing_preferred: List[str] = Field(default_factory=list)  # soft gaps (may delay)
    gap_requisitions: List[GapRequisition] = Field(default_factory=list)
    readiness_score: float = 0.0               # 0-100 likelihood of acceptance as-is
    readiness_label: str = ""
    pre_send_checklist: List[ChecklistItem] = Field(default_factory=list)


# ---- API request / response contracts (stable shape for the frontend) ----

class ReferralRequest(BaseModel):
    transcript: str = ""
    ehr_data: str = ""
    confidence_threshold: Optional[float] = None
    province: str = "Ontario"


class RouteResponse(BaseModel):
    status: Literal["routed", "review_required", "no_eligible_providers"]
    llm_mode: Literal["live", "offline"]
    message: Optional[str] = None
    patient_profile: Optional[ExtractedPatientProfile] = None
    ranked_providers: List[ScoredProvider] = Field(default_factory=list)
    referral_package: Optional[ReferralPackage] = None   # Step 5 for the #1 provider
    filtered_out: int = 0                      # how many providers the hard filter removed


# ---- /draft-package: build a package for a caller-chosen provider ----
# Lets the frontend drive WHICH destination the letter is drafted for (the one the
# physician selected in the routing step), using the exact documents the UI shows.

class ProviderInput(BaseModel):
    name: str
    specialty: str = ""
    province: str = "Ontario"
    address: Optional[str] = None
    required_documents: List[str] = Field(default_factory=list)
    preferred_documents: List[str] = Field(default_factory=list)


class DraftRequest(BaseModel):
    clinical_intent: str
    urgency: Urgency = Urgency.moderate
    available_documents: List[str] = Field(default_factory=list)
    missing_documents: List[str] = Field(default_factory=list)
    patient_constraints: PatientConstraints = Field(default_factory=PatientConstraints)
    transcript: str = ""
    ehr_data: str = ""
    province: str = "Ontario"
    provider: ProviderInput


class DraftResponse(BaseModel):
    llm_mode: Literal["live", "offline"]
    patient_profile: ExtractedPatientProfile
    referral_package: ReferralPackage
