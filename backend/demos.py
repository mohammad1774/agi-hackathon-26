"""Three deterministic demo cases for Referral GPS.

Each case carries the raw transcript/EHR (so a frontend can show the input and a
LIVE backend can re-extract) AND a pre-extracted profile so the demo is fully
deterministic offline regardless of LLM availability.

  A — clean routing:   all prerequisites in hand, fastest real-TTC clinic wins.
  B — real-TTC flip:   a slower-on-paper clinic wins because a faster clinic needs
                       a missing Holter Monitor (+7 procurement days + bounce risk).
  C — equity flag:     the best clinical option is transit-inaccessible; the system
                       still recommends it but SURFACES the access gap + an action.
"""
from models import ExtractedPatientProfile, PatientConstraints, Urgency

DEMO_CASES: dict[str, dict] = {
    "A": {
        "title": "Clean routing — all prerequisites in hand",
        "transcript": (
            "55-year-old with documented palpitations needs an arrhythmia assessment. "
            "Moderate urgency. Patient drives, lives within 30 km, English-speaking. "
            "We already have a recent ECG and a completed Holter Monitor study."
        ),
        "ehr_data": "Dx: palpitations. On file: ECG (2 wks ago), Holter Monitor (10 days ago).",
        "profile": ExtractedPatientProfile(
            clinical_intent="arrhythmia assessment",
            urgency=Urgency.moderate,
            available_documents=["ECG", "Holter Monitor"],
            missing_documents=[],
            patient_constraints=PatientConstraints(
                max_distance_km=30, requires_transit=False, language="english"
            ),
            extraction_confidence=0.95,
            extraction_source="llm",
        ),
    },
    "B": {
        "title": "Real time-to-care flip — slower clinic wins on zero prerequisite gap",
        "transcript": (
            "Urgent arrhythmia assessment for a patient with an ECG on file but NO Holter "
            "Monitor yet — it still needs to be ordered. Patient drives, can travel up to 14 km."
        ),
        "ehr_data": "Dx: suspected arrhythmia. On file: ECG. Missing: Holter Monitor (to be ordered).",
        "profile": ExtractedPatientProfile(
            clinical_intent="arrhythmia assessment",
            urgency=Urgency.high,
            available_documents=["ECG"],
            missing_documents=["Holter Monitor"],
            patient_constraints=PatientConstraints(
                max_distance_km=14, requires_transit=False, language="english"
            ),
            extraction_confidence=0.92,
            extraction_source="llm",
        ),
    },
    "C": {
        "title": "Equity flag — best clinical option is transit-inaccessible",
        "transcript": (
            "High-priority arrhythmia assessment. Patient relies on public transit (no car) "
            "and can travel up to 30 km. ECG, Holter Monitor and Echocardiogram are all on file."
        ),
        "ehr_data": (
            "Dx: arrhythmia. On file: ECG, Holter Monitor, Echocardiogram. "
            "Social: transit-dependent, no vehicle."
        ),
        "profile": ExtractedPatientProfile(
            clinical_intent="arrhythmia assessment",
            urgency=Urgency.high,
            available_documents=["ECG", "Holter Monitor", "Echocardiogram"],
            missing_documents=[],
            patient_constraints=PatientConstraints(
                max_distance_km=30, requires_transit=True, language="english"
            ),
            extraction_confidence=0.90,
            extraction_source="llm",
        ),
    },
}
