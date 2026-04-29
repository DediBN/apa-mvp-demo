# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server at http://localhost:3000
npm run build      # Production build
npm run lint       # ESLint via Next.js
npm run typecheck  # tsc --noEmit (no test suite exists)
```

Requires `ANTHROPIC_API_KEY` in `.env.local`.

## Architecture

**Next.js 14 App Router** demo of the "Agentic Process Authority" (APA) — a meta-agent Command Center that acquires, evaluates, and deploys AI agents through a 4-step pipeline.

### State Machine (core logic)

`src/lib/state-machine/` — a pure reducer pattern (no external library):

```
IDLE → INTAKE → RESEARCH → EVALUATING → COMPLETE → SCORECARD
         ↓ (CANCEL)↓          (any state → ERROR → IDLE via RESET/FAIL)
        IDLE
```

- `machine.ts` — `reduceAPA()` handles all transitions; `validateStateRequirements()` enforces artifact guards (e.g., ≥3 candidates before EVALUATING, 80% automation coverage before COMPLETE)
- `types.ts` — `APAState`, `APAEvent`, `APAContext`, `RunArtifacts`

The state is owned entirely by `IntakeTerminal` (client component) via `useState`. There is no global store.

### Agent Layers (mock + real API)

Each agent has a `mock.ts` (types + static data) and a `client.ts` (fetches the Next.js API route):

| Agent | Route | Purpose |
|---|---|---|
| Intake | `/api/intake/ajd` | Converts business need → AJD JSON via Claude |
| Research (Sourcing) | `/api/sourcing/scan` | Returns candidate shortlist |
| Evaluation | `/api/evaluation/run` | Runs 40 objection + 30 hallucination scenarios per candidate |

`src/lib/anthropic-client.ts` — server-only singleton that reads `ANTHROPIC_API_KEY`. The intake route uses a model fallback chain starting with `claude-3-5-sonnet-latest`.

### UI Structure

`CommandShell` → tab switcher between two top-level views:
- **Acquisition Pipeline** → `IntakeTerminal` (owns APA state, renders all 4 pipeline steps inline as state advances)
- **Fleet Management** → `FleetManagementDashboard` (read-only view of `ACTIVE_FLEET` mock data)

Pipeline step components rendered sequentially inside `IntakeTerminal`:
1. `IntakeTerminal` (form + AJD JSON viewer + manager approval checkpoint)
2. `SourcingRadar` (candidate search visualization)
3. `EvaluationCommandCenter` (parallel evaluation lanes, live progress)
4. `FinalScorecardDashboard` + `DetailedCandidateScorecard` (deploy gate)

### Styling

Dark command-center theme via Tailwind custom tokens (`command.*` color palette, `shadow-glow`, `animate-pulseLine`, `animate-radarSweep`). IBM Plex Sans/Mono fonts. CSS class utilities are defined in `tailwind.config.ts` and `globals.css`. No CSS modules.

## ROI Calculation Rules

- Base ROI numbers on AJD data only.
- If ROI cannot be calculated → set `monthly_value: null` and `notes: "Insufficient data for ROI calculation"`.
