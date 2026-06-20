# Referral GPS

**The intelligence layer before referral intake.** Referral GPS helps primary-care
doctors send the right patient to the right specialist, with the right documents,
through the **fastest realistic pathway** — and then tracks the referral
closed-loop until the patient is actually seen.

> It doesn't just check "is the referral complete?" — it chooses the best
> **pathway and destination before the referral enters the queue**, optimising for
> **time-to-accepted-care** instead of the shortest advertised wait.

This repo is a full-stack app: a React + TypeScript frontend and a FastAPI
**Clinical Referral Intelligence** backend (in [`backend/`](backend/)). The frontend
runs standalone on dummy data and a simulated AI layer, and — when the backend is
running — the **Draft & Sign** step calls the real API to generate the referral
letter, gap requisitions, readiness score and pre-send checklist.

---

## Quick start

### Frontend only (no backend needed)

```bash
npm install
npm run dev
```

Then open **http://localhost:5173**. The Draft step shows an "Offline sample draft"
badge and uses a local template — the demo never breaks if the API is down.

### Full stack (frontend + live backend)

```bash
npm install
npm run backend:install      # pip install -r backend/requirements.txt
npm run dev:all              # runs the API (:8000) and the web app (:5173) together
```

The backend runs in **offline LLM mode** with no API key (deterministic local
drafting). For real GPT-4o-mini drafting, set `OPENAI_API_KEY` (see
[`backend/.env.example`](backend/.env.example)). The Draft step then shows a
"Live backend draft" badge.

| Script | What it does |
| --- | --- |
| `npm run dev` / `dev:web` | Start the Vite dev server (hot reload) |
| `npm run dev:api` | Start the FastAPI backend on :8000 |
| `npm run dev:all` | Run backend + frontend together (via `concurrently`) |
| `npm run backend:install` | Install backend Python dependencies |
| `npm run backend:test` | Run the backend smoke tests |
| `npm run build` | Type-check (`tsc -b`) and build for production |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |

---

## How the frontend talks to the backend

- The frontend calls a relative base URL `/api` (configurable via
  `VITE_API_BASE_URL`). In dev, Vite proxies `/api` → `BACKEND_URL`
  (`http://localhost:8000` by default) — see [`vite.config.ts`](vite.config.ts) and
  [`.env.example`](.env.example), so there is no CORS setup to manage.
- The typed client lives in [`src/lib/api.ts`](src/lib/api.ts). It maps the wizard's
  current patient, chosen pathway, selected destination and attached documents into a
  `POST /api/draft-package` request and renders the returned `ReferralPackage`.
- The call is defensive (timeout + typed errors); on any failure it falls back to the
  local sample draft. See [`backend/README.md`](backend/README.md) for the full API.

---

## What to try in the demo

1. **Impact** — the landing dashboard makes the case: why referrals are
   healthcare's last broken handoff, and what changes when routing happens before
   intake.
2. **Workbench** — pick a patient (start with **Sarah Chen**) and walk the
   7-step referral wizard:
   - Intent detection → safety/urgency → subspecialty pathway → **live readiness
     score** (click "Order Holter" and watch it recompute) → **ranked
     destinations** with a transparent "why this clinic?" breakdown → AI-drafted
     letter → sign & send.
   - Try **Marcus Webb** to see the red-flag **urgent** branch.
3. **Referral Tracker** — the closed loop: accepted, needs-info (resolve gaps),
   rejected (re-route), and no-response (escalate). Simulate clinic responses.
4. **Role switcher** (top bar) — view the app as a **Physician**, **Clinic
   Admin**, or **Patient**. Each role sees a different slice.

Toggle the **AI streaming** animation from the sidebar.

---

## Architecture

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the agent pipeline, data model,
scoring algorithm, responsible-AI checkpoints, and how to swap the simulated AI
for real Claude calls.

---

## Tech stack

Vite · React 18 · TypeScript · TailwindCSS · framer-motion · zustand · recharts ·
react-router-dom · lucide-react.

> Demo only — all clinical data is fictional. Referral GPS recommends pathways; a
> physician reviews and signs every referral. It does not diagnose.
