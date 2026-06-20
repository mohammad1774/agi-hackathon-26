"""Step 5: complete referral package generation.

Turns the #1 ranked provider + patient profile into a ready-to-send package: a drafted
referral letter, the right form template, a document-completeness audit, auto-drafted
requisitions for any gaps, a readiness score, and a pre-send checklist.

Follows the codebase convention: LLM (steps that need prose) with a deterministic
offline/template fallback so the full package builds without an API key or on error.

Design note: provider-specific required/preferred documents drive the numeric readiness
score and the missing_required/missing_preferred lists. Universally-expected admin docs
(med list, allergies, recent labs, referring-physician details) are surfaced in the
pre-send CHECKLIST as reminders rather than tanking the score — a clinically-complete
referral should still read as "Ready to send".
"""
import json
from datetime import date
from typing import List

from config import get_settings
from models import (
    ChecklistItem,
    ExtractedPatientProfile,
    GapRequisition,
    ReferralPackage,
)

# ---- Procurement lead times (days) for drafting/estimating gap requisitions. ----
PROCUREMENT_DAYS = {
    "Holter Monitor": 7,
    "Echocardiogram": 10,
    "Stress Test": 5,
    "MRI": 21,
    "CT Scan": 14,
    "Blood Work": 2,
    "Bloodwork": 2,
    "ECG": 1,
    "Pulmonary Function Test": 7,
    "Spirometry": 7,
    "Sleep Study": 21,
    "X-Ray": 1,
    "EEG": 12,
    "Colonoscopy": 18,
    "Ultrasound": 7,
}
DEFAULT_PROCUREMENT_DAYS = 7

FALLBACK_FORM = "Standard Specialist Referral Letter (CPSO Format)"

# (province, specialty) -> realistic-looking form name. Mock data for the hackathon.
FORM_TEMPLATES = {
    ("ontario", "cardiology"): "Ontario Cardiac Care Network eReferral Form",
    ("ontario", "neurology"): "OTN Neurology Referral Form",
    ("ontario", "orthopedics"): "GTA Rehab Network Referral Form",
    ("ontario", "gastroenterology"): "Ontario GI Endoscopy eReferral Form",
    ("ontario", "dermatology"): "OTN Teledermatology Referral Form",
    ("ontario", "endocrinology"): "Ontario Diabetes/Endocrine Referral Form",
    ("ontario", "pulmonology"): "Ontario Lung Health Referral Form",
    ("ontario", "nephrology"): "Ontario Renal Network eConsult/Referral Form",
    ("british columbia", "cardiology"): "BC Cardiac Services Referral Form",
    ("alberta", "cardiology"): "Alberta APPROACH Cardiac Referral Form",
}


def estimated_days_for(document_name: str) -> int:
    return PROCUREMENT_DAYS.get(document_name, DEFAULT_PROCUREMENT_DAYS)


# ----------------------------------------------------------------------------
# 1. FORM SELECTOR
# ----------------------------------------------------------------------------
def select_form_template(specialty: str, clinic_name: str, province: str) -> str:
    key = ((province or "").strip().lower(), (specialty or "").strip().lower())
    return FORM_TEMPLATES.get(key, FALLBACK_FORM)


# ----------------------------------------------------------------------------
# 2. DOCUMENT COMPLETENESS CHECKER
# ----------------------------------------------------------------------------
UNIVERSAL_EXPECTED = {
    "Recent medication list": ["medication", "meds", " mg", "rx", "metoprolol",
                               "apixaban", "warfarin", "aspirin", "statin", "insulin"],
    "Allergy list": ["allerg", "nkda", "no known allergies"],
    "Recent relevant lab results": ["lab", "bloodwork", "blood work", "cbc", "creatinine",
                                    "tsh", "a1c", "panel", "troponin"],
}


def _text_mentions(text: str, cues: List[str]) -> bool:
    low = text.lower()
    return any(c in low for c in cues)


def check_document_completeness(profile: ExtractedPatientProfile, provider: dict,
                                ehr_data: str = "") -> dict:
    available = set(profile.available_documents)

    missing_required = [d for d in provider.get("required_documents", []) if d not in available]
    missing_preferred = [d for d in provider.get("preferred_documents", []) if d not in available]

    included = list(profile.available_documents)

    # Universal admin docs: surfaced as checklist reminders (see build_checklist),
    # detected from EHR/transcript text rather than counted as clinical hard blocks.
    universal_status = {}
    for label, cues in UNIVERSAL_EXPECTED.items():
        present = _text_mentions(ehr_data, cues)
        universal_status[label] = present
        if present and label not in included:
            included.append(label)

    return {
        "included": included,
        "missing_required": missing_required,
        "missing_preferred": missing_preferred,
        "universal_status": universal_status,
    }


# ----------------------------------------------------------------------------
# 3. GAP REQUISITION DRAFTER (LLM + fallback)
# ----------------------------------------------------------------------------
GAP_PROMPT = """
You are a clinical requisition drafting assistant. For each missing diagnostic document,
write a concise 2-3 sentence clinical requisition a referring physician could sign.
Reference the patient's clinical intent and urgency. Clinical tone, no preamble.

Return JSON ONLY in this exact shape:
{ "requisitions": [ { "document_name": "string", "requisition_text": "string" } ] }
"""


def _requisition_urgency(profile: ExtractedPatientProfile) -> str:
    return "urgent" if profile.urgency.value in {"high", "emergent"} else "routine"


def _template_requisition_text(doc: str, profile: ExtractedPatientProfile) -> str:
    urg = _requisition_urgency(profile)
    condition = _condition_phrase(profile.clinical_intent)
    return (
        f"Please perform {doc} to support the {condition} work-up. "
        f"Clinically indicated as part of the specialist assessment; {urg} priority given the "
        f"current {profile.urgency.value} clinical urgency. Forward results to the referring "
        f"clinic and the receiving specialist on completion."
    )


def draft_gap_requisitions(missing_docs: List[str],
                           profile: ExtractedPatientProfile) -> List[GapRequisition]:
    if not missing_docs:
        return []

    urgency = _requisition_urgency(profile)
    texts: dict[str, str] = {}

    settings = get_settings()
    if not settings.use_mock_llm:
        try:
            from openai import OpenAI

            client = OpenAI(api_key=settings.openai_api_key)
            payload = {
                "clinical_intent": profile.clinical_intent,
                "urgency": profile.urgency.value,
                "missing_documents": missing_docs,
            }
            response = client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {"role": "system", "content": GAP_PROMPT},
                    {"role": "user", "content": json.dumps(payload)},
                ],
                temperature=0.2,
                response_format={"type": "json_object"},
            )
            result = json.loads(response.choices[0].message.content)
            for item in result.get("requisitions", []):
                name = item.get("document_name")
                if name:
                    texts[name] = item.get("requisition_text", "")
        except Exception:
            texts = {}  # fall through to template per-doc

    requisitions = []
    for doc in missing_docs:
        requisitions.append(
            GapRequisition(
                document_name=doc,
                requisition_text=texts.get(doc) or _template_requisition_text(doc, profile),
                urgency=urgency,
                estimated_days=estimated_days_for(doc),
            )
        )
    return requisitions


# ----------------------------------------------------------------------------
# 4. REFERRAL LETTER DRAFTER (LLM + fallback)
# ----------------------------------------------------------------------------
LETTER_PROMPT = """
You are a clinical documentation assistant. Write a COMPLETE specialist referral letter
in standard Canadian clinical format, ready to copy-paste. Use placeholders
[DR. NAME], [CPSO#], [CLINIC], [FAX] where the referring physician must fill in details.

The letter MUST include, in order:
- Date and referring physician block (with the placeholders above)
- Patient demographics block (pull what you can from the EHR; use [ ] placeholders otherwise)
- Reason for referral — SPECIFIC, not vague (e.g. not "cardiac workup" but "assessment of
  symptomatic paroxysmal atrial fibrillation, with plan for Holter monitoring and discussion
  of rhythm-control strategy")
- Relevant history summary as 3-5 bullet points drawn from the transcript + EHR
- Current medications and allergies (state "not documented" if unknown)
- Documents enclosed (list the provided available documents)
- A single focused clinical question to the specialist
- An urgency statement
- Referring physician sign-off block

Return JSON ONLY:
{ "referral_letter": "the full letter as a single string with newlines",
  "clinical_question": "the one focused question sentence" }
"""


def _condition_phrase(clinical_intent: str) -> str:
    """Strip a trailing 'assessment'/'evaluation' so we don't write 'epilepsy
    assessment assessment' in the templated prose."""
    phrase = clinical_intent.strip()
    for suffix in (" assessment", " evaluation"):
        if phrase.lower().endswith(suffix):
            return phrase[: -len(suffix)].strip()
    return phrase


def _template_clinical_question(profile: ExtractedPatientProfile, provider: dict) -> str:
    condition = _condition_phrase(profile.clinical_intent)
    return (
        f"Could you please assess this patient for {condition} and advise on the "
        f"appropriate management and work-up plan?"
    )


def _template_letter(profile: ExtractedPatientProfile, provider: dict,
                     transcript: str, ehr_data: str, clinical_question: str) -> str:
    docs = ", ".join(profile.available_documents) if profile.available_documents else "None enclosed"
    history = transcript.strip() or "See enclosed EHR summary."
    ehr = ehr_data.strip() or "Not documented."
    urgency = profile.urgency.value
    condition = _condition_phrase(profile.clinical_intent)
    return f"""{date.today().strftime('%B %d, %Y')}

REFERRING PHYSICIAN
[DR. NAME], CPSO# [CPSO#]
[CLINIC]
Fax: [FAX]

TO: {provider['name']}
{provider.get('address') or ''}
RE: Specialist referral - {profile.clinical_intent}

PATIENT DEMOGRAPHICS
Name: [PATIENT NAME]   DOB: [DOB]   HIN: [HEALTH CARD #]
Contact: [PHONE]

REASON FOR REFERRAL
Assessment of {condition}. {clinical_question}

RELEVANT HISTORY
- Presenting concern: {profile.clinical_intent}
- Clinical summary: {history}
- EHR notes: {ehr}
- Urgency: {urgency}

MEDICATIONS & ALLERGIES
Medications: [see medication list / not documented]
Allergies: [NKDA / not documented]

DOCUMENTS ENCLOSED
{docs}

CLINICAL QUESTION
{clinical_question}

URGENCY
This referral is submitted as {urgency.upper()} priority.

Thank you for seeing this patient. Please contact our office with any questions.

Sincerely,
[DR. NAME], MD
CPSO# [CPSO#]
[CLINIC]
"""


def draft_referral_letter(profile: ExtractedPatientProfile, provider: dict,
                          transcript: str, ehr_data: str) -> tuple[str, str]:
    settings = get_settings()

    if not settings.use_mock_llm:
        try:
            from openai import OpenAI

            client = OpenAI(api_key=settings.openai_api_key)
            payload = {
                "clinic_name": provider["name"],
                "clinic_address": provider.get("address", ""),
                "specialty": provider.get("specialty", ""),
                "clinical_intent": profile.clinical_intent,
                "urgency": profile.urgency.value,
                "available_documents": profile.available_documents,
                "transcript": transcript,
                "ehr_data": ehr_data,
            }
            response = client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {"role": "system", "content": LETTER_PROMPT},
                    {"role": "user", "content": json.dumps(payload)},
                ],
                temperature=0.3,
                response_format={"type": "json_object"},
            )
            result = json.loads(response.choices[0].message.content)
            letter = result.get("referral_letter", "").strip()
            question = result.get("clinical_question", "").strip()
            if letter and question:
                return letter, question
        except Exception:
            pass

    question = _template_clinical_question(profile, provider)
    letter = _template_letter(profile, provider, transcript, ehr_data, question)
    return letter, question


# ----------------------------------------------------------------------------
# 5. READINESS SCORER
# ----------------------------------------------------------------------------
def calculate_readiness(missing_required: List[str], missing_preferred: List[str],
                        profile: ExtractedPatientProfile) -> tuple[float, str]:
    score = 100
    score -= 25 * len(missing_required)
    score -= 8 * len(missing_preferred)

    if profile.urgency.value == "emergent":
        score = max(score, 60)  # emergent referrals proceed regardless of paperwork
    score = max(0, min(100, round(score)))

    if score >= 85:
        label = "Ready to send"
    elif score >= 60:
        label = "Send with caution"
    else:
        label = "Gaps must be resolved first"
    return float(score), label


# ----------------------------------------------------------------------------
# 6. PRE-SEND CHECKLIST BUILDER
# ----------------------------------------------------------------------------
def build_checklist(package: ReferralPackage, profile: ExtractedPatientProfile,
                    used_fallback_form: bool, universal_status: dict) -> List[ChecklistItem]:
    items: List[ChecklistItem] = []

    items.append(ChecklistItem(
        label="Referral letter drafted",
        status="complete" if package.referral_letter.strip() else "blocked",
        note="Draft ready for review." if package.referral_letter.strip() else "Letter missing.",
    ))

    items.append(ChecklistItem(
        label="Clinical question specified",
        status="complete" if package.clinical_question.strip() else "warning",
        note=package.clinical_question or "No focused clinical question detected.",
    ))

    items.append(ChecklistItem(
        label="Correct form selected",
        status="warning" if used_fallback_form else "complete",
        note=(f"Using generic fallback: {package.selected_form_template}."
              if used_fallback_form else f"{package.selected_form_template}."),
    ))

    items.append(ChecklistItem(
        label="Required documents attached",
        status="complete" if not package.missing_required else "blocked",
        note=("All required documents present."
              if not package.missing_required
              else f"Missing required: {', '.join(package.missing_required)} — referral will be rejected."),
    ))

    items.append(ChecklistItem(
        label="Preferred documents attached",
        status="complete" if not package.missing_preferred else "warning",
        note=("All preferred documents present."
              if not package.missing_preferred
              else f"Missing preferred: {', '.join(package.missing_preferred)} — may delay acceptance."),
    ))

    med_present = universal_status.get("Recent medication list", False)
    items.append(ChecklistItem(
        label="Medication list included",
        status="complete" if med_present else "warning",
        note="Medication list detected in record." if med_present
             else "No medication list detected — confirm before sending.",
    ))

    allergy_present = universal_status.get("Allergy list", False)
    items.append(ChecklistItem(
        label="Allergy list included",
        status="complete" if allergy_present else "warning",
        note="Allergies documented." if allergy_present
             else "No allergy information detected — confirm before sending.",
    ))

    items.append(ChecklistItem(
        label="Referring physician details",
        status="warning",
        note="Placeholders present ([DR. NAME], [CPSO#], [CLINIC], [FAX]) — physician must complete.",
    ))

    is_urgent = profile.urgency.value in {"high", "emergent"}
    items.append(ChecklistItem(
        label="Urgent flag set",
        status="complete" if is_urgent else "not_applicable",
        note=f"Urgency: {profile.urgency.value}." if is_urgent
             else "Routine/low urgency — no urgent flag required.",
    ))

    for req in package.gap_requisitions:
        items.append(ChecklistItem(
            label=f"Requisition drafted: {req.document_name}",
            status="warning",
            note=f"Drafted ({req.urgency}, ~{req.estimated_days} days) — physician must sign before sending.",
        ))

    return items


# ----------------------------------------------------------------------------
# 7. MAIN BUILDER
# ----------------------------------------------------------------------------
def build_referral_package(profile: ExtractedPatientProfile,
                           winning_provider: dict,
                           transcript: str,
                           ehr_data: str,
                           province: str = "Ontario") -> ReferralPackage:
    specialty = winning_provider.get("specialty", "")
    prov = winning_provider.get("province", province) or province

    form = select_form_template(specialty, winning_provider.get("name", ""), prov)
    used_fallback_form = form == FALLBACK_FORM

    completeness = check_document_completeness(profile, winning_provider, ehr_data)
    missing_required = completeness["missing_required"]
    missing_preferred = completeness["missing_preferred"]

    # Auto-draft requisitions for every clinical gap (required first — they're blockers).
    gap_docs = missing_required + missing_preferred
    gap_requisitions = draft_gap_requisitions(gap_docs, profile)

    letter, clinical_question = draft_referral_letter(profile, winning_provider, transcript, ehr_data)

    readiness_score, readiness_label = calculate_readiness(missing_required, missing_preferred, profile)

    package = ReferralPackage(
        referral_letter=letter,
        clinical_question=clinical_question,
        selected_form_template=form,
        included_documents=completeness["included"],
        missing_required=missing_required,
        missing_preferred=missing_preferred,
        gap_requisitions=gap_requisitions,
        readiness_score=readiness_score,
        readiness_label=readiness_label,
        pre_send_checklist=[],
    )
    package.pre_send_checklist = build_checklist(
        package, profile, used_fallback_form, completeness["universal_status"]
    )
    return package
