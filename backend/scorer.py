"""Step 3: pure-Python deterministic scoring. No LLM in this loop.

Weights (total 100):
    clinical_fit      30
    acceptance_prob   25   (predicts the "referral rejection loop")
    real_ttc          20   (the core insight: wait + prerequisite procurement)
    feasibility       10
    equity            10   (gaps are SURFACED via equity_flag, not silently subtracted)
    format_match       5
"""
from models import ExtractedPatientProfile, ScoredProvider

# Typical procurement lead time (days) to obtain a missing prerequisite test.
PREREQUISITE_PROCUREMENT_DAYS = {
    "Holter Monitor": 7,
    "Echocardiogram": 10,
    "Stress Test": 5,
    "MRI": 21,
    "CT Scan": 14,
    "EEG": 12,
    "X-Ray": 2,
    "Bloodwork": 3,
    "Colonoscopy": 18,
    "Spirometry": 5,
    "Sleep Study": 14,
    "Ultrasound": 7,
}
DEFAULT_PROCUREMENT_DAYS = 7


def _missing_preferred(provider: dict, profile: ExtractedPatientProfile) -> list[str]:
    return [
        d for d in provider.get("preferred_documents", [])
        if d not in profile.available_documents
    ]


def prerequisite_days(provider: dict, profile: ExtractedPatientProfile) -> int:
    """Worst-case time to procure the missing preferred prerequisites in parallel."""
    gap = 0
    for doc in _missing_preferred(provider, profile):
        gap = max(gap, PREREQUISITE_PROCUREMENT_DAYS.get(doc, DEFAULT_PROCUREMENT_DAYS))
    return gap


def calculate_real_ttc(provider: dict, profile: ExtractedPatientProfile) -> int:
    """The genuine innovation: nominal wait + time to acquire missing prerequisites."""
    return provider["wait_days"] + prerequisite_days(provider, profile)


def _clinical_fit(provider: dict, profile: ExtractedPatientProfile) -> int:
    import re

    def toks(s: str) -> set:
        return {t for t in re.split(r"[^a-z]+", s.lower()) if t}

    intent_words = toks(profile.clinical_intent) - {"assessment", "evaluation", "general"}
    sub_words = toks(" ".join(provider["subspecialty"]))
    if not intent_words:
        return 0
    overlap = len(intent_words & sub_words) / len(intent_words)
    return round(30 * min(overlap * 2, 1.0))


def score_provider(provider: dict, profile: ExtractedPatientProfile,
                   max_real_ttc: int) -> ScoredProvider:
    breakdown = {}
    constraints = profile.patient_constraints

    # 1. Clinical fit (30)
    breakdown["clinical_fit"] = _clinical_fit(provider, profile)

    # 2. Acceptance probability (25) — proxy for the referral rejection loop.
    missing_pref = _missing_preferred(provider, profile)
    if not missing_pref:
        breakdown["acceptance_prob"] = 25
        rejection_risk, rejection_reason = "low", None
    elif len(missing_pref) == 1:
        breakdown["acceptance_prob"] = 14
        rejection_risk = "moderate"
        rejection_reason = f"Preferred document missing: {missing_pref[0]} (clinic may bounce the referral)"
    else:
        breakdown["acceptance_prob"] = 8
        rejection_risk = "high"
        rejection_reason = f"Preferred documents missing: {', '.join(missing_pref)} (high bounce-back risk)"

    # 3. Real time-to-accepted-care (20) — normalized by the worst real TTC in the pool.
    pre_days = prerequisite_days(provider, profile)
    real_ttc = provider["wait_days"] + pre_days
    ttc_score = max(0, 20 - round(20 * (real_ttc / max(max_real_ttc, 1))))
    breakdown["real_ttc"] = ttc_score

    # 4. Feasibility (10) — logistical fit (language + within travel range).
    feasibility = 0
    if constraints.language in [l.lower() for l in provider.get("languages", ["english"])]:
        feasibility += 5
    if provider["location_km_from_centre"] <= constraints.max_distance_km:
        feasibility += 5
    breakdown["feasibility"] = feasibility

    # 5. Equity (10) — SURFACE access gaps; do not silently penalize the patient.
    equity_flags = []
    if constraints.requires_transit and not provider.get("transit_accessible", True):
        equity_flags.append("transit access gap: patient relies on transit but clinic is not transit-accessible")
    if constraints.language not in [l.lower() for l in provider.get("languages", ["english"])]:
        equity_flags.append(f"language access gap: clinic may not offer service in '{constraints.language}'")
    equity_flag = "; ".join(equity_flags) if equity_flags else None
    # Keep the equity points: the gap is surfaced + mitigated (Step 4 emits an action),
    # rather than quietly dropping the patient's best clinical option.
    breakdown["equity"] = 10

    # 6. Format/document match (5)
    required_set = set(provider.get("required_documents", []))
    available_set = set(profile.available_documents)
    breakdown["format_match"] = 5 if required_set.issubset(available_set) else 2

    total = sum(breakdown.values())

    # Referral Readiness Score: fraction of required+preferred docs already in hand.
    needed = required_set | set(provider.get("preferred_documents", []))
    if needed:
        readiness_pct = round(100 * len(needed & available_set) / len(needed))
    else:
        readiness_pct = 100

    return ScoredProvider(
        provider_id=provider["id"],
        name=provider["name"],
        address=provider.get("address"),
        phone=provider.get("phone"),
        total_score=total,
        score_breakdown=breakdown,
        nominal_wait_days=provider["wait_days"],
        prerequisite_days=pre_days,
        real_ttc_days=real_ttc,
        readiness_pct=readiness_pct,
        rejection_risk=rejection_risk,
        rejection_reason=rejection_reason,
        equity_flag=equity_flag,
        distance_km=provider["location_km_from_centre"],
        explanation="",
        auto_actions=[],
    )


def rank_providers(candidates: list, profile: ExtractedPatientProfile,
                   top_n: int = 3) -> list[ScoredProvider]:
    max_real_ttc = max(
        (calculate_real_ttc(p, profile) for p in candidates), default=60
    )
    scored = [score_provider(p, profile, max_real_ttc) for p in candidates]
    # Deterministic tie-break: total desc, then real TTC asc, then name.
    scored.sort(key=lambda x: (-x.total_score, x.real_ttc_days, x.name))
    return scored[:top_n]
