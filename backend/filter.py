"""Step 2: deterministic hard filter. No LLM, no scoring — only pass/fail rules
that decide whether a provider is *eligible at all*. Everything that survives is
ranked in Step 3.
"""
import json
import re
from functools import lru_cache

from config import get_settings
from models import ExtractedPatientProfile

_STOPWORDS = {"assessment", "evaluation", "referral", "general", "specialist", "consult", "review"}


@lru_cache(maxsize=1)
def load_providers() -> list:
    settings = get_settings()
    with open(settings.providers_path, encoding="utf-8") as f:
        return json.load(f)


def _tokens(text: str) -> set:
    return {t for t in re.split(r"[^a-z]+", text.lower()) if t and t not in _STOPWORDS}


def subspecialty_matches(clinical_intent: str, subspecialty: list[str]) -> bool:
    """Token-overlap match so multi-word intents like 'arrhythmia assessment'
    still match a subspecialty list like ['arrhythmia', 'electrophysiology']."""
    intent_tokens = _tokens(clinical_intent)
    sub_tokens = _tokens(" ".join(subspecialty))
    return bool(intent_tokens & sub_tokens)


def hard_filter(profile: ExtractedPatientProfile) -> tuple[list, list]:
    """Returns (eligible_providers, rejections) where each rejection is
    {provider, reason} for transparency/auditing."""
    providers = load_providers()
    candidates, rejections = [], []
    constraints = profile.patient_constraints
    urgency = profile.urgency.value

    for p in providers:
        # Rule 0: provider must be open to new referrals.
        if not p.get("accepting_new_patients", True):
            rejections.append({"provider": p["name"], "reason": "not accepting new patients"})
            continue

        # Rule 1: distance.
        if p["location_km_from_centre"] > constraints.max_distance_km:
            rejections.append({"provider": p["name"], "reason": "outside max travel distance"})
            continue

        # Rule 2: subspecialty match.
        if not subspecialty_matches(profile.clinical_intent, p["subspecialty"]):
            rejections.append({"provider": p["name"], "reason": "subspecialty mismatch"})
            continue

        # Rule 3: hard document block — a *required* doc the patient is known to be missing.
        hard_blocks = [
            doc for doc in p.get("required_documents", [])
            if doc not in profile.available_documents and doc in profile.missing_documents
        ]
        if hard_blocks:
            rejections.append(
                {"provider": p["name"], "reason": f"requires unavailable document(s): {', '.join(hard_blocks)}"}
            )
            continue

        # Rule 4: urgency compatibility.
        if urgency not in p.get("accepts_urgency", []):
            rejections.append({"provider": p["name"], "reason": f"does not accept '{urgency}' urgency"})
            continue

        candidates.append(p)

    return candidates, rejections
