"""Step 4: LLM-generated plain-English explanation + concrete auto-actions for
the #1 ranked provider. Falls back to a deterministic template offline or on error.
"""
import json

from config import get_settings
from models import ExtractedPatientProfile, ScoredProvider
from scorer import PREREQUISITE_PROCUREMENT_DAYS, _missing_preferred

EXPLAIN_PROMPT = """
You are a clinical decision support assistant helping a referral coordinator. Given a
winning clinic's score breakdown and a patient profile, write:
1. A 2-sentence plain-English explanation of why this clinic ranked #1, mentioning the
   real time-to-accepted-care and any rejection risk or access gap if present.
2. A list of 2-4 concrete auto-actions (short imperative strings) the system should
   trigger (e.g. "Draft Holter Monitor requisition", "Arrange accessible transport").

Return JSON only:
{
  "explanation": "string",
  "auto_actions": ["string", ...]
}
"""


def _build_payload(winner: ScoredProvider, profile: ExtractedPatientProfile,
                   missing_pref: list[str]) -> dict:
    return {
        "clinic_name": winner.name,
        "score_breakdown": winner.score_breakdown,
        "total_score": winner.total_score,
        "nominal_wait_days": winner.nominal_wait_days,
        "prerequisite_days": winner.prerequisite_days,
        "real_ttc_days": winner.real_ttc_days,
        "readiness_pct": winner.readiness_pct,
        "rejection_risk": winner.rejection_risk,
        "rejection_reason": winner.rejection_reason,
        "equity_flag": winner.equity_flag,
        "patient_intent": profile.clinical_intent,
        "urgency": profile.urgency.value,
        "missing_preferred_documents": missing_pref,
    }


def _template_explanation(winner: ScoredProvider, profile: ExtractedPatientProfile,
                          missing_pref: list[str]) -> tuple[str, list[str]]:
    parts = [
        f"{winner.name} ranks #1 for this {profile.clinical_intent} with a real "
        f"time-to-accepted-care of {winner.real_ttc_days} days "
        f"({winner.nominal_wait_days}-day clinic wait + {winner.prerequisite_days} days to "
        f"procure prerequisites) and a referral readiness of {winner.readiness_pct}%."
    ]
    if winner.rejection_risk == "low":
        parts.append("All preferred prerequisites are already on file, so the referral is unlikely to bounce.")
    else:
        parts.append(
            f"Rejection risk is {winner.rejection_risk} because of missing prerequisites; "
            "pre-emptively procuring them protects the referral from bouncing back."
        )
    if winner.equity_flag:
        parts.append(
            f"Note — an access gap was flagged ({winner.equity_flag}); it is surfaced for "
            "coordinator action rather than silently downranking the patient's best option."
        )

    actions = []
    for doc in missing_pref:
        days = PREREQUISITE_PROCUREMENT_DAYS.get(doc, 7)
        actions.append(f"Draft {doc} requisition (≈{days}-day lead time)")
    if winner.equity_flag:
        if "transit" in winner.equity_flag:
            actions.append("Arrange accessible transport or offer a telehealth intake")
        if "language" in winner.equity_flag:
            actions.append("Book a medical interpreter for the appointment")
    actions.append(f"Pre-fill and submit referral package to {winner.name}")
    actions.append(f"Notify patient of estimated {winner.real_ttc_days}-day time-to-care")
    return " ".join(parts), actions[:4]


def _llm_explanation(payload: dict) -> tuple[str, list[str]]:
    from openai import OpenAI

    settings = get_settings()
    client = OpenAI(api_key=settings.openai_api_key)
    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": EXPLAIN_PROMPT},
            {"role": "user", "content": json.dumps(payload)},
        ],
        temperature=settings.explanation_temperature,
        response_format={"type": "json_object"},
    )
    result = json.loads(response.choices[0].message.content)
    return result["explanation"], result.get("auto_actions", [])


def generate_explanation(winner: ScoredProvider,
                         profile: ExtractedPatientProfile) -> ScoredProvider:
    missing_pref = _missing_preferred_for(winner, profile)
    settings = get_settings()

    if settings.use_mock_llm:
        winner.explanation, winner.auto_actions = _template_explanation(winner, profile, missing_pref)
        return winner

    payload = _build_payload(winner, profile, missing_pref)
    try:
        winner.explanation, winner.auto_actions = _llm_explanation(payload)
    except Exception:
        winner.explanation, winner.auto_actions = _template_explanation(winner, profile, missing_pref)
    return winner


def _missing_preferred_for(winner: ScoredProvider, profile: ExtractedPatientProfile) -> list[str]:
    """Reconstruct the missing preferred docs from the winner + profile so the
    explainer doesn't need the raw provider dict."""
    # prerequisite_days > 0 implies at least one preferred doc is missing; we recover
    # the names by comparing the patient's docs against what drove the gap.
    from filter import load_providers

    for p in load_providers():
        if p["id"] == winner.provider_id:
            return _missing_preferred(p, profile)
    return []
