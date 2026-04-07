# APA MVP Specification

## 1. Vision and Core Concept

APA (Agentic Process Authority) is a Meta-Agent platform that manages the full lifecycle of AI agents, from intake to recommendation.

The MVP addresses the "PoC Graveyard" problem by replacing marketing-led agent selection with measurable, data-driven digital worker hiring.

### Primary Goal
Demonstrate an automated 4-step operational flow that transforms a business need into a tested, low-risk, production-ready agent recommendation.

### MVP Outcome
At the end of one run, the user receives:
- A structured Agent Job Description (AJD)
- An Integration Readiness Score for the client stack
- A ranked shortlist of candidate agents
- A quantitative scorecard and ROI projection
- One definitive winner labeled "APA Recommended"

## 2. Product Scope

### In Scope (MVP)
- End-to-end orchestration of the 4-step flow
- Simulated integrations and test environments
- Parallel candidate evaluation
- Quantitative score aggregation and winner selection
- Dark-mode command-center style interface
- Zero-PII masked logs

### Out of Scope (MVP)
- Direct production deployment into client systems
- Real billing integration with third-party model catalogs
- Human resource workflows (approvals, procurement)
- Full multi-tenant enterprise IAM

## 3. Success Metrics

- Automation coverage: 80% or higher of process steps executed by Meta-Agent without manual intervention
- Throughput: complete one full run in under 20 minutes in demo mode
- Determinism: repeated runs with same inputs produce stable rankings (+/- 5%)
- Explainability: every recommendation includes traceable reason codes
- Safety: 100% of sensitive fields masked in logs and UI telemetry

## 4. 4-Step Operational Flow (Back-End Logic)

## Step 01: Intake and Job Description (Decision Layer)

### User Action
User submits a business need in natural language.
Example: "Automate customer support for tier-1 email inquiries."

### Meta-Agent Behavior
- Intake Agent asks 3 to 5 clarifying questions
- Captures stack context (CRM, ERP, ticketing, KB, IAM)
- Captures constraints (latency, escalation policy, compliance)
- Captures KPI targets (deflection, CSAT impact, handle time)

### Deliverables
- AJD JSON (structured role spec)
- Integration Readiness Score (0 to 100)

### Acceptance Criteria
- At least 3 clarifying questions completed
- AJD JSON includes required fields
- Readiness score includes transparent factor breakdown

## Step 02: Research and Shortlist (Sourcing Engine)

### Meta-Agent Behavior
- Scans configured sources (for demo: mocked feeds representing Hugging Face, GPT Store, and internal registry)
- Filters candidates by AJD capability and integration fit
- Produces top 3 to 5 candidates

### Deliverables
- Candidate shortlist with structured rationale per candidate
- Recommended "best initial fit" prior to sandbox testing

### Acceptance Criteria
- Minimum of 3 candidates returned when available
- Every candidate has capability-fit and risk notes

## Step 03: Sandbox Evaluation (Evaluation Engine)

### Meta-Agent Behavior
Runs shortlisted candidates in parallel in an isolated simulation environment.

### Scorecard v1 Tests
- Objection Handling: 40 difficult customer scenarios
- Hallucination Rate: 30 no-answer prompts, scored on abstain-vs-fabricate behavior
- Integration Stability: 8-hour synthetic load simulation against CRM sandbox

### Deliverables
- Per-candidate test logs
- Pass/fail states for each scenario group
- Numerical test metrics normalized to 0 to 100

### Acceptance Criteria
- All candidates evaluated against same dataset and rubric
- Test artifacts persisted for audit
- Failures include explicit reason codes

## Step 04: Final Scorecard (Decision)

### Meta-Agent Behavior
Aggregates evaluation data and business assumptions into final ranking.

### ROI Formula
Value = (Tm x Ch x Ef) - (Capi + Cinfra + Cgov)

Where:
- Tm = Time saved per month
- Ch = Cost per hour of current process
- Ef = Efficiency factor (0 to 1)
- Capi = API/model costs
- Cinfra = Infrastructure costs
- Cgov = Governance and oversight costs

### Deliverables
- Side-by-side comparison table
- ROI projection chart
- Final winner with "APA Recommended" badge

### Acceptance Criteria
- Ranking includes weighted score contributions
- Winner explanation includes at least 3 factors

## 5. State Machine (Required)

Primary flow:
- IDLE -> INTAKE -> RESEARCH -> EVALUATING -> COMPLETE -> SCORECARD

Supporting transitions:
- Any state -> ERROR (on hard failure)
- ERROR -> IDLE (manual reset)
- INTAKE -> IDLE (user cancel)

State requirements:
- INTAKE must produce AJD JSON before transition
- RESEARCH must produce 3 to 5 candidates or "insufficient market" flag
- EVALUATING must persist per-candidate results before COMPLETE
- SCORECARD must include ranking and ROI output

## 6. Core Data Contracts

### AJD JSON (MVP shape)
```json
{
	"job_title": "Tier-1 Support Automation Agent",
	"business_need": "Automate customer support",
	"domain": "Customer Support",
	"required_capabilities": ["email triage", "policy-grounded responses", "handoff to human"],
	"integrations": {
		"crm": "Salesforce",
		"erp": "NetSuite",
		"knowledge_base": "Confluence",
		"ticketing": "Zendesk"
	},
	"kpis": {
		"deflection_rate_target": 0.35,
		"max_response_latency_ms": 2500,
		"hallucination_tolerance": 0.02
	},
	"constraints": {
		"compliance": ["SOC2"],
		"languages": ["en"],
		"human_escalation_required": true
	},
	"boundary_map": {
		"can_access": ["ticket metadata", "approved KB"],
		"cannot_access": ["payment credentials", "PII raw fields"]
	}
}
```

### Candidate Record
```json
{
	"candidate_id": "cand_001",
	"name": "SupportAgent-X",
	"source": "Hugging Face",
	"fit_score_pre_eval": 78,
	"reason_codes": ["strong support benchmark", "CRM connector available"],
	"risk_flags": ["limited multilingual support"]
}
```

### Evaluation Result
```json
{
	"candidate_id": "cand_001",
	"objection_handling_score": 82,
	"hallucination_score": 91,
	"integration_stability_score": 76,
	"composite_score": 84,
	"status": "pass",
	"fail_reasons": []
}
```

## 7. Scoring Model

Recommended MVP weighting:
- Objection Handling: 40%
- Hallucination Control: 35%
- Integration Stability: 25%

Composite score:
- score = 0.40 * objection + 0.35 * hallucination + 0.25 * integration

Decision policy:
- Candidates below 70 composite score are ineligible unless no candidate exceeds threshold
- Tie-breakers: lower hallucination rate, then higher integration stability

## 8. GUI and User Experience (Face of APA)

## Design Principles
- Theme: dark mode using deep navy/slate base with electric blue highlight (#64FFDA) for AI actions
- Vibe: authority and certainty, data-dense, professional, minimal ornament
- Interaction style: command-center with clear progression and confidence indicators

## Screen Architecture

### A. Intake Terminal
- Central chat/command interface for business need input
- Real-time context mapping panel updates entities (systems, KPIs, constraints)

### B. AJD Blueprint
- Technical specification sheet
- KPI cards and boundary map visualization (allowed vs blocked access)

### C. Sourcing Radar
- Radar-like scan animation over source catalog
- Candidate cards with source tags and fit indicators

### D. Evaluation Command Center
- Split-screen live logs for parallel candidate tests
- Scenario streams with green/red status indicators

### E. Final Scorecard Dashboard
- Side-by-side candidate comparison table
- ROI chart
- Winner highlight with APA badge

## 9. Technical Architecture (Prompt-Driven, Modular)

### Frontend
- React with Next.js app structure
- Feature modules per flow state:
	- intake
	- research
	- evaluation
	- scorecard

### Backend
- Orchestrator service implementing state machine
- Agent adapters for intake/research/evaluation tasks
- Simulation engine for benchmark scenarios
- Scoring service for normalization, weighting, ROI

### Storage
- Run store: state transitions, artifacts, timestamps
- Candidate store: metadata and shortlist snapshots
- Audit store: masked logs and decision traces

## 10. Zero-PII Security Guardrails

- Mask all direct identifiers in logs and telemetry
- Never render raw PII in UI tables or traces
- Use tokenized placeholders in simulation payloads
- Enforce boundary map checks before tool/integration calls
- Retain audit logs with masked values only

Masking examples:
- email -> u***@example.com
- phone -> ***-***-1234
- customer_id -> cust_[hash]

## 11. API-Level Contract (MVP)

Required endpoints:
- POST /runs
	- Input: business_need
	- Output: run_id, state=INTAKE
- POST /runs/{id}/intake
	- Input: clarifications
	- Output: ajd, readiness_score, next_state=RESEARCH
- POST /runs/{id}/research
	- Output: candidates[], next_state=EVALUATING
- POST /runs/{id}/evaluate
	- Output: evaluation_results[], next_state=COMPLETE
- POST /runs/{id}/scorecard
	- Input: roi_assumptions
	- Output: rankings, roi_projection, recommended_candidate
- GET /runs/{id}
	- Output: full state + artifacts

## 12. Non-Functional Requirements

- Reliability: recoverable from transient adapter failures
- Observability: every state transition timestamped and queryable
- Performance: support at least 5 parallel candidate evaluations in demo mode
- Explainability: all recommendations include human-readable rationale

## 13. Demo Script (Happy Path)

1. User enters business need in Intake Terminal
2. Intake Agent asks 4 clarifying questions
3. AJD Blueprint appears with readiness score
4. Sourcing Radar produces 4 candidates
5. Evaluation Command Center runs parallel tests
6. Scorecard Dashboard shows ranking and ROI
7. Winner receives APA Recommended badge

## 14. MVP Acceptance Checklist

- End-to-end state machine completes without manual backend intervention
- Automation coverage is 80% or higher
- Each stage outputs required artifact
- Final recommendation is data-backed and reproducible
- Zero-PII masking verified in logs and UI

## 15. Risks and Mitigations

- Risk: synthetic benchmarks may not reflect all real-world edge cases
	- Mitigation: include confidence bands and clearly label simulated conditions
- Risk: source catalog quality varies by provider
	- Mitigation: enforce minimum metadata standards before evaluation
- Risk: score weighting can bias outcomes
	- Mitigation: expose and version weights in config with audit trail

## 16. Build-Ready Notes

- Keep modules decoupled by state and artifact contract
- Prefer config-driven scoring and test set definitions
- Keep all orchestration decisions auditable and reproducible
- Avoid embedding provider-specific assumptions in core orchestrator
 
