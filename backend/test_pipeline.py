"""Offline smoke tests for the Referral GPS pipeline.

Run:  python -m pytest test_pipeline.py -v
or:   python test_pipeline.py
These force USE_MOCK_LLM=true so they never need an API key or network.
"""
import os

os.environ["USE_MOCK_LLM"] = "true"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def test_health_offline():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["llm_mode"] == "offline"
    assert body["provider_count"] == 15


def test_case_a_clean_routing():
    r = client.post("/demo/A")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "routed"
    top = body["ranked_providers"][0]
    assert top["name"] == "Downtown Cardiac EP Institute"
    assert top["rejection_risk"] == "low"
    assert top["equity_flag"] is None
    assert top["explanation"]  # Step 4 populated


def test_case_b_real_ttc_flip():
    r = client.post("/demo/B")
    body = r.json()
    assert body["status"] == "routed"
    ranked = {p["name"]: p for p in body["ranked_providers"]}
    winner = body["ranked_providers"][0]
    riverside = ranked["Riverside Arrhythmia Clinic"]
    # The slower-on-paper clinic wins: Lakeshore (14d nominal) over Riverside (8d nominal).
    assert winner["name"] == "Lakeshore Heart Rhythm Centre"
    assert winner["nominal_wait_days"] > riverside["nominal_wait_days"]
    # ...because Riverside's missing Holter inflates its REAL time-to-care + bounce risk.
    assert winner["real_ttc_days"] <= riverside["real_ttc_days"]
    assert riverside["rejection_risk"] in {"moderate", "high"}
    assert winner["rejection_risk"] == "low"


def test_case_c_equity_flag_on_top_result():
    r = client.post("/demo/C")
    body = r.json()
    assert body["status"] == "routed"
    top = body["ranked_providers"][0]
    # Best clinical option is transit-inaccessible — surfaced, not silently dropped.
    assert top["name"] == "Downtown Cardiac EP Institute"
    assert top["equity_flag"] is not None
    assert "transit" in top["equity_flag"]
    assert any("transport" in a.lower() or "telehealth" in a.lower() for a in top["auto_actions"])


def test_route_heuristic_extraction():
    r = client.post("/route", json={
        "transcript": "Urgent arrhythmia assessment. ECG on file, Holter Monitor still needs to be ordered. "
                      "Patient can travel up to 25 km and drives.",
        "ehr_data": "Dx: palpitations.",
    })
    body = r.json()
    assert body["status"] in {"routed", "review_required"}
    assert body["patient_profile"]["clinical_intent"] == "arrhythmia assessment"
    assert "ECG" in body["patient_profile"]["available_documents"]
    assert "Holter Monitor" in body["patient_profile"]["missing_documents"]


def test_review_required_gate():
    r = client.post("/route", json={
        "transcript": "patient",  # almost no signal -> low confidence
        "ehr_data": "",
        "confidence_threshold": 0.9,
    })
    body = r.json()
    assert body["status"] == "review_required"


def test_step5_package_clean_case():
    body = client.post("/demo/A").json()
    pkg = body["referral_package"]
    assert pkg is not None
    assert pkg["selected_form_template"] == "Ontario Cardiac Care Network eReferral Form"
    assert pkg["missing_required"] == []
    assert pkg["readiness_label"] == "Ready to send"
    assert pkg["readiness_score"] == 100
    assert "[DR. NAME]" in pkg["referral_letter"]
    assert pkg["clinical_question"].strip()
    # checklist sanity: required docs item is complete, physician details is a warning
    statuses = {i["label"]: i["status"] for i in pkg["pre_send_checklist"]}
    assert statuses["Required documents attached"] == "complete"
    assert statuses["Referring physician details"] == "warning"


def test_step5_package_present_for_equity_case():
    body = client.post("/demo/C").json()
    pkg = body["referral_package"]
    assert pkg is not None
    # Winning clinic (Downtown Cardiac EP) has its required ECG on file -> sendable.
    assert pkg["missing_required"] == []
    assert pkg["readiness_label"] == "Ready to send"


def test_step5_gap_requisition_drafted():
    # Routes to Metro Neurology (requires MRI [present], prefers EEG [missing]).
    r = client.post("/route", json={
        "transcript": "Moderate-urgency neurology referral for new seizures. MRI on file. "
                      "EEG still needs to be ordered. Patient travels up to 30 km.",
        "ehr_data": "Dx: new-onset seizures. Allergies: NKDA. Medications: none.",
    })
    body = r.json()
    assert body["status"] == "routed"
    pkg = body["referral_package"]
    assert "EEG" in pkg["missing_preferred"]
    gap_docs = [g["document_name"] for g in pkg["gap_requisitions"]]
    assert "EEG" in gap_docs
    eeg_req = next(g for g in pkg["gap_requisitions"] if g["document_name"] == "EEG")
    assert eeg_req["estimated_days"] == 12
    assert eeg_req["requisition_text"].strip()
    # soft gap -> still sendable but flagged
    assert pkg["readiness_label"] in {"Ready to send", "Send with caution"}
    labels = [i["label"] for i in pkg["pre_send_checklist"]]
    assert "Requisition drafted: EEG" in labels


def test_draft_package_endpoint():
    # Frontend-driven draft for a caller-chosen provider with a missing prerequisite.
    r = client.post("/draft-package", json={
        "clinical_intent": "cardiology arrhythmia assessment",
        "urgency": "high",
        "available_documents": ["12-lead ECG", "Medication list"],
        "missing_documents": ["48-hour Holter monitor"],
        "patient_constraints": {"max_distance_km": 50, "requires_transit": True, "language": "english"},
        "transcript": "Cardiology referral. Palpitations worsening on exertion.",
        "ehr_data": "Dx: palpitations. On file: 12-lead ECG, Medication list.",
        "province": "Ontario",
        "provider": {
            "name": "Heart Rhythm Clinic B",
            "specialty": "cardiology",
            "province": "Ontario",
            "required_documents": ["12-lead ECG"],
            "preferred_documents": ["48-hour Holter monitor"],
        },
    })
    assert r.status_code == 200
    body = r.json()
    pkg = body["referral_package"]
    assert body["patient_profile"]["extraction_source"] == "frontend"
    assert pkg["selected_form_template"] == "Ontario Cardiac Care Network eReferral Form"
    assert "Heart Rhythm Clinic B" in pkg["referral_letter"]
    # The missing preferred doc should produce a gap requisition + an equity transit note.
    assert "48-hour Holter monitor" in pkg["missing_preferred"]
    gap_docs = [g["document_name"] for g in pkg["gap_requisitions"]]
    assert "48-hour Holter monitor" in gap_docs
    assert pkg["pre_send_checklist"]


if __name__ == "__main__":
    test_health_offline()
    test_case_a_clean_routing()
    test_case_b_real_ttc_flip()
    test_case_c_equity_flag_on_top_result()
    test_route_heuristic_extraction()
    test_review_required_gate()
    test_step5_package_clean_case()
    test_step5_package_present_for_equity_case()
    test_step5_gap_requisition_drafted()
    test_draft_package_endpoint()
    print("All smoke tests passed.")
