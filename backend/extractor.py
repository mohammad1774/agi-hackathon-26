"""Step 1: turn an unstructured transcript + EHR blob into a structured profile.

LLM is used here (and only here + Step 4). When no API key is configured the
module falls back to a deterministic keyword heuristic so the pipeline still runs
end-to-end offline. The result records `extraction_source` for auditing.
"""
import json
import re

from config import get_settings
from models import ExtractedPatientProfile, PatientConstraints, Urgency

SYSTEM_PROMPT = """
You are a clinical data extraction engine. Given a doctor-patient transcript and EHR data,
extract a structured JSON object. Return ONLY valid JSON matching this exact schema — no
preamble, no explanation, no markdown fences.

Schema:
{
  "clinical_intent": "string — the specific clinical question (e.g. 'arrhythmia assessment')",
  "urgency": "low | moderate | high | emergent",
  "available_documents": ["list of tests/documents the patient already has"],
  "missing_documents": ["tests commonly required for this referral that are absent"],
  "patient_constraints": {
    "max_distance_km": float,
    "requires_transit": bool,
    "language": "string",
    "mobility_limited": bool
  },
  "extraction_confidence": float between 0.0 and 1.0
}

Set extraction_confidence below 0.7 if: urgency is ambiguous, the transcript is unclear
about document availability, or distance constraints were not explicitly stated.
"""

# Known clinical documents and common spelling variants.
DOC_VOCAB = {
    "ECG": ["ecg", "ekg", "electrocardiogram"],
    "Holter Monitor": ["holter"],
    "Echocardiogram": ["echocardiogram", "echo"],
    "Stress Test": ["stress test", "treadmill test"],
    "MRI": ["mri"],
    "CT Scan": ["ct scan", "ct ", "cat scan"],
    "EEG": ["eeg"],
    "X-Ray": ["x-ray", "xray", "radiograph"],
    "Bloodwork": ["bloodwork", "blood work", "blood panel", "lab work"],
    "Colonoscopy": ["colonoscopy"],
    "Spirometry": ["spirometry", "pft", "pulmonary function"],
    "Sleep Study": ["sleep study", "polysomnography"],
    "Ultrasound": ["ultrasound", "sonogram"],
}

# Maps complaint keywords -> normalized clinical intent (drives subspecialty matching).
INTENT_KEYWORDS = [
    (["arrhythmia", "palpitation", "irregular heart", "atrial fibrillation", "afib", "svt"], "arrhythmia assessment"),
    (["heart failure", "reduced ejection", "chf"], "heart failure assessment"),
    (["chest pain", "angina", "coronary"], "cardiology assessment"),
    (["seizure", "epilepsy"], "epilepsy assessment"),
    (["tremor", "parkinson", "movement disorder"], "movement disorders assessment"),
    (["headache", "migraine", "neurolog"], "neurology assessment"),
    (["reflux", "ibd", "crohn", "colitis", "gi ", "gastro"], "gastroenterology assessment"),
    (["knee", "shoulder", "fracture", "sports injury", "ortho"], "orthopedics assessment"),
    (["rash", "lesion", "derm", "skin"], "dermatology assessment"),
    (["diabetes", "thyroid", "endocrin"], "endocrinology assessment"),
    (["sleep apnea", "copd", "asthma", "pulmon"], "pulmonology assessment"),
    (["kidney", "renal", "nephro"], "nephrology assessment"),
]

NEGATION_CUES = [
    "missing", "without", "pending", "needs", "need ", "order", "ordered", "awaiting",
    "to be done", "not yet", "no ", "lacks", "lacking", "required", "requires", "obtain",
]

URGENCY_KEYWORDS = {
    Urgency.emergent: ["emergent", "emergency", "stat", "immediately", "life-threatening"],
    Urgency.high: ["urgent", "high priority", "asap", "expedite", "rapidly", "severe"],
    Urgency.moderate: ["moderate", "soon", "semi-urgent", "within weeks"],
    Urgency.low: ["routine", "non-urgent", "elective", "stable", "low priority"],
}

LANGUAGE_KEYWORDS = {
    "french": ["french", "francophone", "speaks french"],
    "spanish": ["spanish", "hispanohablante", "speaks spanish"],
}


def _normalize_intent(text: str) -> tuple[str, bool]:
    for keywords, intent in INTENT_KEYWORDS:
        if any(k in text for k in keywords):
            return intent, True
    return "general specialist assessment", False


def _segment_for(text: str, variants: list[str]) -> str | None:
    """Return the clause (comma/period/newline-delimited) that first mentions the
    document, so negation cues are evaluated within the doc's own clause only."""
    segments = re.split(r"[.;,\n]", text)
    for seg in segments:
        if any(v in seg for v in variants):
            return seg
    return None


def heuristic_extract(transcript: str, ehr_data: str) -> ExtractedPatientProfile:
    text = f"{transcript}\n{ehr_data}".lower()
    signals = 0

    intent, intent_found = _normalize_intent(text)
    if intent_found:
        signals += 1

    available, missing = [], []
    for canonical, variants in DOC_VOCAB.items():
        segment = _segment_for(text, variants)
        if segment is not None:
            signals += 1
            if any(cue in segment for cue in NEGATION_CUES):
                missing.append(canonical)
            else:
                available.append(canonical)

    urgency = Urgency.moderate
    urgency_found = False
    for level, words in URGENCY_KEYWORDS.items():
        if any(w in text for w in words):
            urgency = level
            urgency_found = True
            break
    if urgency_found:
        signals += 1

    language = "english"
    for lang, words in LANGUAGE_KEYWORDS.items():
        if any(w in text for w in words):
            language = lang
            break

    requires_transit = any(
        w in text for w in ["no car", "public transit", "takes the bus", "relies on transit",
                             "no vehicle", "transit-dependent", "cannot drive"]
    )
    mobility_limited = any(
        w in text for w in ["wheelchair", "mobility limited", "limited mobility", "uses a walker"]
    )

    max_distance = 50.0
    distance_found = False
    m = re.search(r"(\d{1,3})\s*km", text)
    if m:
        max_distance = float(m.group(1))
        distance_found = True

    # Confidence reflects how much we could actually pin down.
    confidence = 0.4
    confidence += 0.2 if intent_found else 0.0
    confidence += 0.15 if urgency_found else 0.0
    confidence += 0.1 if (available or missing) else 0.0
    confidence += 0.1 if distance_found else 0.0
    confidence = round(min(confidence, 0.9), 2)  # heuristic never claims full certainty

    return ExtractedPatientProfile(
        clinical_intent=intent,
        urgency=urgency,
        available_documents=available,
        missing_documents=missing,
        patient_constraints=PatientConstraints(
            max_distance_km=max_distance,
            requires_transit=requires_transit,
            language=language,
            mobility_limited=mobility_limited,
        ),
        extraction_confidence=confidence,
        extraction_source="heuristic",
    )


def _llm_extract(transcript: str, ehr_data: str) -> ExtractedPatientProfile:
    from openai import OpenAI

    settings = get_settings()
    client = OpenAI(api_key=settings.openai_api_key)
    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"TRANSCRIPT:\n{transcript}\n\nEHR:\n{ehr_data}"},
        ],
        temperature=settings.extraction_temperature,
        response_format={"type": "json_object"},
    )
    raw = response.choices[0].message.content
    data = json.loads(raw)
    data["extraction_source"] = "llm"
    return ExtractedPatientProfile(**data)


def extract_patient_profile(transcript: str, ehr_data: str) -> ExtractedPatientProfile:
    settings = get_settings()
    if settings.use_mock_llm:
        return heuristic_extract(transcript, ehr_data)
    try:
        return _llm_extract(transcript, ehr_data)
    except Exception:
        # Never crash the pipeline on an LLM/parse error: degrade to the heuristic
        # and cap confidence so the validation gate can flag it for human review.
        profile = heuristic_extract(transcript, ehr_data)
        profile.extraction_confidence = min(profile.extraction_confidence, 0.6)
        return profile
