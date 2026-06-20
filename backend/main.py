"""Referral GPS — Clinical Referral Intelligence Backend.

5-step hybrid pipeline:
    1. extract   (LLM or offline heuristic) -> structured patient profile
    2. filter    (pure Python hard rules)    -> eligible providers
    3. score     (pure Python math)          -> ranked providers + audit breakdown
    4. explain   (LLM or template)           -> plain-English why + auto-actions
    5. package   (LLM or template)           -> ready-to-send referral package (#1 provider)

Run:  uvicorn main:app --reload
Docs: http://localhost:8000/docs
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from demos import DEMO_CASES
from explainer import generate_explanation
from extractor import extract_patient_profile
from filter import hard_filter, load_providers
from models import (
    DraftRequest,
    DraftResponse,
    ExtractedPatientProfile,
    ReferralRequest,
    RouteResponse,
)
from referral_builder import build_referral_package
from scorer import rank_providers


def _provider_by_id(provider_id: str) -> dict | None:
    for p in load_providers():
        if p["id"] == provider_id:
            return p
    return None

settings = get_settings()

app = FastAPI(
    title="Referral GPS",
    description="Clinical referral intelligence backend — routes patient referrals to "
                "specialists using real time-to-accepted-care, not naive wait times.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def run_pipeline(profile: ExtractedPatientProfile,
                 confidence_threshold: float,
                 transcript: str = "",
                 ehr_data: str = "",
                 province: str = "Ontario") -> RouteResponse:
    """Steps 2-5 over an already-extracted profile. Shared by /route and /demo."""
    # Validation gate — flag low-confidence extractions for human review.
    if profile.extraction_confidence < confidence_threshold:
        return RouteResponse(
            status="review_required",
            llm_mode=settings.llm_mode,
            message=(
                f"Extraction confidence {profile.extraction_confidence:.2f} is below the "
                f"{confidence_threshold:.2f} threshold. Please verify the patient profile."
            ),
            patient_profile=profile,
        )

    candidates, rejections = hard_filter(profile)
    if not candidates:
        return RouteResponse(
            status="no_eligible_providers",
            llm_mode=settings.llm_mode,
            message="No providers passed the hard filter for this referral.",
            patient_profile=profile,
            filtered_out=len(rejections),
        )

    ranked = rank_providers(candidates, profile)
    ranked[0] = generate_explanation(ranked[0], profile)  # Step 4: explain the #1 result

    # Step 5: build a ready-to-send referral package for the #1 provider.
    winning_provider = _provider_by_id(ranked[0].provider_id)
    referral_package = None
    if winning_provider is not None:
        referral_package = build_referral_package(
            profile, winning_provider, transcript, ehr_data, province
        )

    return RouteResponse(
        status="routed",
        llm_mode=settings.llm_mode,
        patient_profile=profile,
        ranked_providers=ranked,
        referral_package=referral_package,
        filtered_out=len(rejections),
    )


@app.get("/health")
def health():
    return {
        "status": "ok",
        "llm_mode": settings.llm_mode,
        "model": settings.openai_model if not settings.use_mock_llm else None,
        "provider_count": len(load_providers()),
    }


@app.get("/providers")
def providers():
    return {"count": len(load_providers()), "providers": load_providers()}


@app.get("/demo")
def list_demos():
    return {
        case_id: {"title": case["title"], "transcript": case["transcript"]}
        for case_id, case in DEMO_CASES.items()
    }


@app.post("/route", response_model=RouteResponse)
def route_referral(req: ReferralRequest):
    if not (req.transcript.strip() or req.ehr_data.strip()):
        raise HTTPException(status_code=422, detail="Provide a transcript and/or ehr_data.")
    threshold = (
        req.confidence_threshold
        if req.confidence_threshold is not None
        else settings.default_confidence_threshold
    )
    profile = extract_patient_profile(req.transcript, req.ehr_data)
    return run_pipeline(profile, threshold, req.transcript, req.ehr_data, req.province)


@app.post("/draft-package", response_model=DraftResponse)
def draft_package(req: DraftRequest):
    """Step 5 in isolation: draft a ready-to-send referral package for a SPECIFIC,
    caller-chosen provider (the destination selected in the routing step). The
    profile is supplied directly by the caller, so the letter, gap requisitions and
    readiness reflect exactly the documents the UI is showing."""
    profile = ExtractedPatientProfile(
        clinical_intent=req.clinical_intent,
        urgency=req.urgency,
        available_documents=req.available_documents,
        missing_documents=req.missing_documents,
        patient_constraints=req.patient_constraints,
        extraction_confidence=1.0,
        extraction_source="frontend",
    )
    provider = req.provider.model_dump()
    provider.setdefault("id", "selected_provider")
    province = req.provider.province or req.province
    package = build_referral_package(profile, provider, req.transcript, req.ehr_data, province)
    return DraftResponse(
        llm_mode=settings.llm_mode,
        patient_profile=profile,
        referral_package=package,
    )


@app.post("/demo/{case_id}", response_model=RouteResponse)
def run_demo(case_id: str):
    """Deterministic demo using a pre-extracted profile (always works offline)."""
    case = DEMO_CASES.get(case_id.upper())
    if not case:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown demo case '{case_id}'. Available: {list(DEMO_CASES)}",
        )
    return run_pipeline(
        case["profile"],
        settings.default_confidence_threshold,
        case.get("transcript", ""),
        case.get("ehr_data", ""),
        "Ontario",
    )
