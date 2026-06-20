# Referral GPS — Clinical Referral Intelligence Backend

Routes patient referrals to specialists using a 4-step hybrid architecture. The core
insight is **Real Time-to-Accepted-Care** = clinic wait + time to procure missing
prerequisites — which is what differentiates this from naive wait-time routing.

## The problem it solves

Primary-care → specialist referrals get stuck in a **referral rejection loop**: they
bounce back weeks later because of a missing prerequisite test, the wrong form, or a
poor subspecialty match. Referral GPS predicts and pre-empts those bounces *before*
submission, and routes to the clinic that delivers the fastest **real** care, not the
fastest paper wait.

## Architecture

```
POST /route  ->  1. extract   LLM (or offline heuristic)  -> structured profile
                 2. filter    pure Python hard rules       -> eligible providers
                 3. score     pure Python math             -> ranked + audit breakdown
                 4. explain   LLM (or template)            -> plain-English why + actions
                 5. package   LLM (or template)            -> ready-to-send referral package
```

The **LLM is used only in steps 1, 4, and 5** (extraction + prose). All filtering and
scoring is deterministic, pure Python, and auditable via `score_breakdown`.

### Step 5 — referral package (the "zero manual form-filling" payoff)

For the #1 provider, the API returns a `referral_package` so a doctor can review, sign
any gap requisitions, and click send:

- `referral_letter` — a complete, copy-pasteable Canadian-format letter (with
  `[DR. NAME]` / `[CPSO#]` placeholders the physician fills in)
- `clinical_question` — the single focused question to the specialist
- `selected_form_template` — the right form for the clinic's specialty + province
- `included_documents` / `missing_required` / `missing_preferred`
- `gap_requisitions[]` — auto-drafted, signable requisitions for missing tests
  (`document_name`, `requisition_text`, `urgency`, `estimated_days`)
- `readiness_score` (0–100) + `readiness_label`
  ("Ready to send" / "Send with caution" / "Gaps must be resolved first")
- `pre_send_checklist[]` — each item has `label`, `status`
  (`complete` / `warning` / `blocked` / `not_applicable`), and a `note`

Design choice: provider-specific required/preferred docs drive `readiness_score` and the
`missing_*` lists; universal admin docs (med list, allergies, recent labs, referring-MD
details) are surfaced as checklist reminders rather than tanking the score, so a
clinically-complete referral still reads as "Ready to send".

## Run

```bash
pip install -r requirements.txt
uvicorn main:app --reload
# Interactive docs: http://localhost:8000/docs
```

### LLM modes (no key required for the frontend)

- **Live**: set `OPENAI_API_KEY` (copy `.env.example` → `.env`). Steps 1 & 4 call the model.
- **Offline**: no key (or `USE_MOCK_LLM=true`). Deterministic local fallbacks run the full
  pipeline so the frontend can integrate and the demo can run without credentials.

`GET /health` reports the active `llm_mode`.

## Endpoints

| Method | Path             | Purpose |
|--------|------------------|---------|
| GET    | `/health`        | Liveness + `llm_mode`, model, provider count |
| GET    | `/providers`     | The full provider directory |
| GET    | `/demo`          | List demo cases A/B/C with their transcripts |
| POST   | `/demo/{A\|B\|C}` | Run a deterministic demo case (always works offline) |
| POST   | `/route`         | Full pipeline on a free-text transcript + EHR |

### `POST /route` request

```json
{
  "transcript": "Urgent arrhythmia assessment. ECG on file, Holter Monitor needs ordering. Travels up to 25 km.",
  "ehr_data": "Dx: palpitations.",
  "confidence_threshold": 0.7,
  "province": "Ontario"
}
```

### Response shape (stable contract)

```json
{
  "status": "routed | review_required | no_eligible_providers",
  "llm_mode": "live | offline",
  "message": null,
  "patient_profile": { "clinical_intent": "...", "urgency": "high", "available_documents": [], "missing_documents": [], "patient_constraints": {}, "extraction_confidence": 0.92, "extraction_source": "llm|heuristic" },
  "ranked_providers": [
    {
      "provider_id": "clinic_arr_02",
      "name": "Lakeshore Heart Rhythm Centre",
      "address": "...", "phone": "...",
      "total_score": 81.0,
      "score_breakdown": { "clinical_fit": 30, "acceptance_prob": 25, "real_ttc": 1, "feasibility": 10, "equity": 10, "format_match": 5 },
      "nominal_wait_days": 14,
      "prerequisite_days": 0,
      "real_ttc_days": 14,
      "readiness_pct": 100,
      "rejection_risk": "low | moderate | high",
      "rejection_reason": null,
      "equity_flag": null,
      "distance_km": 11,
      "explanation": "…why this ranked #1…",
      "auto_actions": ["Draft Holter Monitor requisition (≈7-day lead time)", "..."]
    }
  ],
  "referral_package": { "referral_letter": "…", "clinical_question": "…", "selected_form_template": "…", "missing_required": [], "missing_preferred": [], "gap_requisitions": [], "readiness_score": 100, "readiness_label": "Ready to send", "pre_send_checklist": [] },
  "filtered_out": 12
}
```

Notes for the frontend:
- Always check `status` first. `review_required` returns a `patient_profile` and `message`
  but no providers (low extraction confidence — show a verify-and-resubmit UI).
- `ranked_providers` is top 3, already sorted. `score_breakdown` always sums to `total_score`.
- `equity_flag` is non-null when an access gap is surfaced — render it as a banner/badge,
  not as a reason the provider was excluded.

## Scoring (total 100, deterministic)

| Dimension        | Pts | Meaning |
|------------------|-----|---------|
| clinical_fit     | 30  | subspecialty token overlap with the clinical intent |
| acceptance_prob  | 25  | predicts the referral rejection loop (missing preferred docs) |
| real_ttc         | 20  | wait + prerequisite procurement, normalized across candidates |
| feasibility      | 10  | language match + within travel range |
| equity           | 10  | access; gaps are **surfaced** via `equity_flag`, never silently subtracted |
| format_match     | 5   | required documents already on file |

`real_ttc_days = nominal_wait_days + prerequisite_days` (e.g. a missing Holter Monitor
adds +7 days). This is the metric that drives the Case B flip.

## Demo cases

- **A — clean routing**: all prerequisites in hand → fastest real-TTC clinic wins.
- **B — real-TTC flip**: a clinic with a *longer* paper wait wins because the faster
  clinic needs a missing Holter Monitor (+7 procurement days + bounce risk).
- **C — equity flag**: the best clinical option is transit-inaccessible. It is still
  recommended #1, but the transit gap is surfaced with an auto-action (arrange transport
  / telehealth) instead of quietly dropping the patient's best option.

```bash
curl -X POST http://localhost:8000/demo/B
```

## Tests

```bash
python test_pipeline.py        # or: python -m pytest test_pipeline.py -v
```

Tests run fully offline (no key/network) and assert the three demo outcomes.

## Files

```
main.py        FastAPI app: CORS, /health, /providers, /demo, /route
config.py      env-driven settings + live/offline mode detection
models.py      Pydantic v2 schemas + the API response contract
extractor.py   Step 1: LLM extraction + deterministic offline heuristic
filter.py      Step 2: hard filter (accepting / distance / subspecialty / docs / urgency)
scorer.py        Step 3: weighted deterministic scoring + real-TTC
explainer.py     Step 4: LLM explanation + concrete auto-actions (template fallback)
referral_builder.py Step 5: form selector, completeness check, gap requisitions,
                 letter drafter, readiness scorer, pre-send checklist (template fallback)
demos.py         Pre-extracted demo cases A/B/C
providers.json   15 mock provider records (incl. specialty + province)
```
