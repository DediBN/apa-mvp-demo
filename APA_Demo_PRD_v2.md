# PRD v2 — APA Live Demo Console

**Version:** 2.0 · June 2026 · **REPLACES PRD v1 entirely**
**Owner:** Dedi Ben-Natan, CEO

---

## 1. Concept (changed from v1)

This is NOT a step-by-step presentation. It is a **simulation of the APA product itself** — a live console that *feels real*.

**Split-screen layout:**

```
┌──────────────────────────┬──────────────────────────────┐
│  LEFT — APA CONSOLE      │  RIGHT — BEHIND THE GATEWAY  │
│  (what the employee sees)│  (what APA does, live)       │
│                          │                              │
│  Scenario picker         │  ● PII Detection             │
│  Chat-style request      │  ● Task Decomposition        │
│  [Send]                  │  ● Model Routing             │
│  "Working..." indicator  │  ● Masking + Vault           │
│  → Final answer message  │  ● Parallel Execution        │
│                          │  ● Assembly                  │
│                          │  ● Audit entry               │
└──────────────────────────┴──────────────────────────────┘
```

The presenter picks a scenario, clicks **Send**, and for ~40 seconds the right side comes alive — stages appear, animate, and complete in sequence — while the left side shows a realistic "processing" state. The final answer appears on the left **exactly when** the right side finishes assembly. One continuous, live, real-feeling run.

**The feeling to create:** the audience is watching a real enterprise product process a real request — with X-ray vision into its security layer.

---

## 2. Layout & Visual Design

- **Left panel (~42% width) — "APA Console":** light theme (white/mist), looks like a polished enterprise chat product. Top: APA logo + workspace name (e.g., "Goldfarb & Co. — Legal Workspace"). Scenario selector (3 cards or dropdown). Chat area. Input field with the scenario's request pre-filled (editable-looking but content is fixed). Gold **Send** button.
- **Right panel (~58% width) — "Behind the Gateway":** dark ink theme (#0B1220), terminal/console aesthetic. Header: "LIVE — Zero-Trust Gateway" + green pulse dot. Stages stack vertically and auto-scroll as they activate.
- **Brand:** identical to investor OP — Space Grotesk (headings), Inter (body), IBM Plex Mono (tokens, logs, timestamps), gold #C9962E / #E8B54A accents, red #B03A2E for PII.
- The contrast between the light "innocent" product side and the dark "machinery" side IS the visual story: *simple for the user, serious underneath.*

---

## 3. The Three Scenarios

Scenario picker shows 3 cards: ⚖ Law Firm · 🏦 Bank · 🛡 Insurance. Each card sets the workspace name, the request text, the PII map, tasks, models, and final answer.

### Scenario A — Law Firm (default; lead with this for law-firm meetings)
**Workspace:** "Goldfarb & Co. — Legal Workspace" · **User:** Adv. Dana Goldfarb

**Request:**
> "Prepare a settlement recommendation for our client **David Stern**, case **4421/24**. The opposing party's latest offer is **₪850,000**. Review the medical records summary and liability assessment, find supporting precedents, and draft a counter-offer letter at **₪1,150,000**."

**PII map:** David Stern → [CLIENT_NAME] · 4421/24 → [CASE_ID] · ₪850,000 → [OFFER_AMOUNT] · ₪1,150,000 → [COUNTER_AMOUNT] · medical records → [MEDICAL_REF]

**Tasks:**
1. Retrieve case file & liability assessment — **Local · Llama 3.2**
2. Summarize medical records (privileged) — **Local · Qwen 2.5**
3. Compute settlement range from case history — **Local · Qwen 2.5**
4. Search supporting precedents — **Cloud · GPT-4o** ⚠ masked
5. Draft counter-offer letter — **Cloud · Claude** ⚠ masked

**Final answer (left panel):**
> **Settlement Recommendation — David Stern, Case 4421/24**
> Based on the liability assessment and medical summary, the recommended counter-offer is **₪1,150,000**, supported by three comparable precedents (CA 3912/19, CA 7741/21, CA 1186/23) with awards 28–41% above the current offer. Draft counter-offer letter attached. Probability-weighted settlement range: ₪980,000–₪1,210,000.

**Audit entries:** 2 outbound (GPT-4o: precedents — blocked CLIENT_NAME, CASE_ID; Claude: letter — blocked all 5 entities). Banner: *"3 tasks ran locally — privileged material never left the firm."*

### Scenario B — Bank
**Workspace:** "Leumit Bank — Retail Credit" · **User:** Yael Baruch, Credit Officer

**Request:**
> "Prepare a mortgage refinance proposal for **Yossi Cohen**, account **88-392-114**. Current loan **₪1.2M** at 5.1%, monthly income **₪38,000**, excellent credit history. Benchmark against current market rates and draft a personalized offer."

**PII map:** Yossi Cohen → [CLIENT_NAME] · 88-392-114 → [ACCOUNT_ID] · ₪1.2M → [LOAN_AMOUNT] · ₪38,000 → [INCOME] · 5.1% → [CURRENT_RATE]

**Tasks:**
1. Retrieve account profile & history — **Local · Llama 3.2**
2. Compute debt-to-income & eligibility — **Local · Qwen 2.5**
3. Apply internal credit policy rules — **Local · Qwen 2.5**
4. Benchmark current market refinance rates — **Cloud · GPT-4o** ⚠ masked
5. Draft personalized refinance offer — **Cloud · Claude** ⚠ masked

**Final answer:**
> **Refinance Proposal — Yossi Cohen, Account 88-392-114**
> Eligible for refinance at **4.35%** (vs. current 5.1%), saving **₪68,400 over the loan term**. Debt-to-income ratio 31% — well within policy. Market benchmark confirms our rate is 0.2% below the leading competitor. Personalized offer letter ready for review.

**Banner:** *"3 tasks ran locally — account data never left the bank."*

### Scenario C — Insurance (from original PPT)
**Workspace:** "Shamir Insurance — Renewals" · **User:** Noa Shapiro
Content exactly as PPT: Miriam Levi, IL-2847, ₪45,000 / ₪12,000 claims, 14% loyalty discount, final premium ₪8,240/year — full text in v1 PRD section 2, reuse verbatim.

---

## 4. The Live Run — Right Panel Choreography

When **Send** is clicked, the right panel executes this sequence (total ≈ 40s, every stage timestamped with mono clock, auto-scrolls):

**T+0s — STAGE: INTERCEPT**
"Request intercepted at gateway" — the request text appears in the right panel, then a scan sweep highlights PII in red one-by-one (~300ms apart). Counter: "5 sensitive entities detected".

**T+5s — STAGE: DECOMPOSE**
"Local orchestrator — task decomposition" — 5 task rows stagger in with Local/Cloud badges.

**T+10s — STAGE: ROUTE**
Model badges attach to each task. Cloud rows get ⚠ MASKED tag in gold.

**T+14s — STAGE: MASK** *(the money shot)*
Split mini-view inside the stage: the cloud-bound prompt with each red PII value **flipping** into a gray mono token chip (400ms each), while a vault column on the right locks each real value with 🔒 (synchronized). End state: "Outbound prompt contains ZERO real data".

**T+22s — STAGE: EXECUTE**
5 progress bars run in parallel. Local bars complete ~1s, cloud bars ~4s. Left panel meanwhile shows subtle "Working — 3 local · 2 cloud (masked)" status.

**T+28s — STAGE: ASSEMBLE**
"Reconstructing on-premises" — tokens flip back to real values in blue. Progress: "Response assembled · 0 plaintext exposures".

**T+32s — STAGE: AUDIT**
One audit table row per outbound call slides in (time, task, destination, entities blocked, ✓ Clean). Banner with the scenario's closing line.

**T+35s — LEFT PANEL: answer message materializes** in the chat with a subtle fade, formatted as a real product answer card. Below it, small footer chips: 🔒 Zero PII leaked · 🖥 3 local · ☁ 2 masked.

**Replay / switch scenario** buttons appear under the answer.

---

## 5. Interaction Model

- Presenter picks scenario card → request auto-fills the input (with a fast typing animation, ~2s, to feel alive) → presenter clicks **Send** (or Enter).
- During the run: no interaction needed. `Space` = pause/resume the choreography (for talking over a moment). `R` = reset.
- After the run: Replay, or pick another scenario.
- A subtle "DEMO MODE" mono tag bottom-right (honest, and removable later).

---

## 6. Technical Notes

- Same stack as v1: Vite + React, zero backend, all scripted in `scenarios.ts` (one object per scenario: workspace, user, request, piiMap, tasks, finalAnswer, auditRows, banner).
- The choreography engine: a single async timeline runner that dispatches stage events; ALL timing values in one `timings.ts` so pacing can be tuned in seconds.
- Auto-scroll right panel with `scrollIntoView` smooth as each stage activates.
- Desktop only, min 1280px. Optimized for full-screen Chrome on a projector.
- Deploy: Netlify → demo.apa-ai.com.

## 7. Build Plan (Claude Code sessions)

**Session 1:** Scaffold + split layout + brand tokens + scenario picker + chat input with typing fill + dummy right panel. Deploy skeleton.
**Session 2:** Choreography engine + Stages INTERCEPT, DECOMPOSE, ROUTE.
**Session 3:** Stage MASK (token flip + vault) — invest the most here — plus EXECUTE progress bars.
**Session 4:** ASSEMBLE, AUDIT, left-panel answer delivery, replay/switch.
**Session 5:** Scenarios B & C content pass, autopacing polish, pause/resume, full-screen projector test, Netlify deploy.

## 8. Definition of Done

- [ ] All 3 scenarios run end-to-end from Send to answer in ≈40s
- [ ] The MASK stage is legible and impressive from 3 meters on a projector
- [ ] Left panel reads as a believable enterprise product, not a mockup
- [ ] Pause/resume works mid-run for presenter narration
- [ ] Brand-identical to the investor one-pager
- [ ] Live at demo.apa-ai.com
