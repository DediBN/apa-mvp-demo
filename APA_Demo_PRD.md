# PRD — APA Interactive Demo ("APA in Action")

**Version:** 1.0 · June 2026
**Owner:** Dedi Ben-Natan, CEO
**Purpose:** A polished, interactive web demo that shows APA's core value in 3 minutes — for Design Partner meetings (law firms, banks) and investor meetings. The demo simulates the full APA pipeline; it does NOT require the real product to exist.

---

## 1. Goal & Success Criteria

**Goal:** When a CISO, managing partner, or angel investor watches this demo, they should think: *"I understand exactly what APA does, I can see it working, and it looks like a real enterprise product."*

**Success criteria:**
- Full story lands in under 3 minutes, presenter-driven
- Looks like a production security product (Wiz / CrowdStrike quality), not a slideshow
- Zero backend required — runs as a static site on Netlify (apa-ai.com subdomain, e.g. demo.apa-ai.com)
- Works flawlessly on a laptop in a conference room and on a shared screen in Zoom

**Non-goals (v1):**
- No real LLM calls (everything simulated with scripted timing)
- No authentication, no persistence, no mobile optimization (desktop/laptop only, min-width 1200px)
- No Hebrew version (English only for v1)

---

## 2. The Demo Narrative (8 steps)

The demo tells one story: **an insurance agent gets a complete AI-powered answer, and zero client data ever leaves the organization.**

Persona: **Noa Shapiro**, insurance agent. Client: **Miriam Levi**, policy IL-2847.

### Step 1 — REQUEST
Noa types (animated typing effect) a complex request:

> "Prepare a renewal offer for **Miriam Levi**, policy **IL-2847**. She's been a client for 12 years and had 2 claims last year — car accident in March (**₪45,000**) and water damage in October (**₪12,000**). Apply our loyalty tier discount, benchmark against competitor rates, and draft a personalized renewal letter she'll actually want to accept."

As the text completes, APA scans it (animated scan line sweep) and **highlights PII in red, live**: Miriam Levi, IL-2847, ₪45,000, ₪12,000.

Status chip appears: 🔍 *"APA detected: 12 years of org context available for this request"*

### Step 2 — ORCHESTRATE
A local orchestrator decomposes the request into 5 sub-tasks. Tasks appear one by one (staggered animation, ~300ms apart), each with a Local/Cloud badge:

| # | Task | Destination |
|---|------|-------------|
| 1 | Retrieve client profile and full claims history | **Local** |
| 2 | Determine loyalty tier and applicable discount rate | **Local** |
| 3 | Calculate risk adjustment for 2 claims in 12 months | **Local** |
| 4 | Draft personalized renewal letter with pricing | **Cloud** |
| 5 | Benchmark renewal rate against competitor market data | **Cloud** |

Subtitle: *"A lightweight local model identifies what needs to be done — before any data leaves the org."*

### Step 3 — ROUTE
Each task gets assigned a model (animated connection lines or badge reveal):

| # | Task | Model |
|---|------|-------|
| 1 | Client profile & claims | **Llama 3.2 — local** 🖥 |
| 2 | Loyalty tier & discount | **Qwen 2.5 — local** 🖥 |
| 3 | Risk adjustment | **Qwen 2.5 — local** 🖥 |
| 4 | Renewal letter draft | **Claude — cloud** ☁ ⚠ anonymized |
| 5 | Competitor benchmark | **GPT-4o — cloud** ☁ ⚠ anonymized |

Key message: *"Sensitive or structured tasks stay local. Creative reasoning goes to cloud — anonymized."*

### Step 4 — MASK (the WOW moment — invest the most animation effort here)
Split screen:

**Left — "SENT TO CLOUD (MASKED)":** the prompt with PII replaced by tokens, with a visual "swap" animation where each red-highlighted value flips into a gray token:

> "Draft renewal letter for **[CLIENT_NAME]**, policy **[POLICY_ID]**. Client has **[TENURE]** years tenure, Gold loyalty tier. Claims last year: **[CLAIM_1_AMOUNT]** and **[CLAIM_2_AMOUNT]**. Apply **[DISCOUNT_RATE]**% discount."

**Right — "ENCRYPTED VAULT — STAYS ON-PREMISES":** a vault panel with rows, each animating a 🔒 lock click:

| Token | Real value | |
|-------|-----------|---|
| [CLIENT_NAME] | Miriam Levi | 🔒 encrypted |
| [POLICY_ID] | IL-2847 | 🔒 encrypted |
| [CLAIM_1_AMOUNT] | ₪45,000 | 🔒 encrypted |
| [CLAIM_2_AMOUNT] | ₪12,000 | 🔒 encrypted |
| [DISCOUNT_RATE] | 14% | 🔒 encrypted |
| [TENURE] | 12 years | 🔒 encrypted |

### Step 5 — EXECUTE
All 5 tasks run in parallel — animated progress bars. Local tasks finish fast (~600ms), cloud tasks slower (~2s) to show realistic asymmetry:

- 🖥 Llama 3.2 — local · Client profile & claims retrieval → ✓ complete
- 🖥 Qwen 2.5 — local · Loyalty tier & discount → ✓ complete
- 🖥 Qwen 2.5 — local · Risk adjustment → ✓ complete
- ☁ Claude — cloud (masked) · Renewal letter drafting → ✓ response received
- ☁ GPT-4o — cloud (masked) · Competitor benchmarking → ✓ response received

### Step 6 — ASSEMBLE
Final answer materializes with tokens flipping BACK to real values (reverse of step 4 — gray tokens flip to blue real values):

> **Renewal Offer — Miriam Levi**
>
> Dear Miriam,
> As a valued Gold-tier client since 2013, we're pleased to present your renewal for policy IL-2847. Given your 12-year relationship with us, you qualify for a 14% loyalty discount. Following our actuarial review of your 2024 claims (₪57,000 total), your adjusted premium is **₪8,240/year** — still 11% below the market average for comparable coverage in your area.

Footer strip: *↑ Local: profile, tier, risk · ☁ Cloud: letter drafting (masked), market benchmark · 🔒 Reassembled on-premises*

### Step 7 — AUDIT
Audit trail table (rows slide in):

| TIME | TASK | SENT TO | ENTITIES BLOCKED | STATUS |
|------|------|---------|------------------|--------|
| 09:14:32 | Renewal letter drafting | Claude | CLIENT_NAME, POLICY_ID, CLAIM_1, CLAIM_2, DISCOUNT | ✓ Clean |
| 09:14:33 | Competitor benchmarking | GPT-4o | CLIENT_NAME, POLICY_ID | ✓ Clean |

Banner: 🛡 *"3 tasks ran locally — zero outbound traffic. Only 2 masked requests left the org today."*

### Step 8 — SUMMARY (closing slide)
Three statements, large type, sequential reveal:
1. **Noa got a complete, personalized renewal offer.**
2. **No client data left the building.**
3. **The system got smarter with every interaction.**

Four icon badges: 🔒 Zero PII Leaked · 🔀 Smart Orchestration · 🗝 Org Holds the Keys · 🧠 Org Memory Grows

Pipeline strip at bottom: Request → Orchestrate → Route → Mask → Execute → Assemble → Audit → Learn

---

## 3. UX & Interaction Model

**Presenter-controlled, with autoplay option.**

- **Navigation:** Right arrow / Space / on-screen "Next" advances. Left arrow goes back. Number keys 1–8 jump to a step.
- **Step progress rail:** thin horizontal rail at top showing the 8 pipeline stages; current stage highlighted in gold. Clicking a stage jumps to it.
- **Autoplay mode:** a ▶ button runs the entire demo hands-free (~2.5 min) with the right pacing — for sending as a link ("watch this") or playing during investor calls.
- **Replay:** at step 8, a "Replay demo" button.
- **Animations trigger on step entry** — every step has an entrance choreography (~1.5–3s) and then rests in a stable readable state.
- **Presenter shortcuts:** `R` restarts, `A` toggles autoplay.

---

## 4. Visual Design System

Match the APA brand established in the investor one-pager (this is critical — the demo and the one-pager must look like the same company):

```
--ink:        #0B1220   (near-black navy — primary background)
--steel:      #1B3A66   (deep institutional blue)
--gold:       #C9962E   (refined gold — accents, current step)
--gold-bright:#E8B54A   (gold highlights on dark)
--red:        #B03A2E   (PII highlights — slightly brighter than print red for screen)
--mist:       #F4F6F9   (light panels)
--line:       #E2E7EE
```

- **Fonts:** Space Grotesk (headlines, numbers), Inter (body), IBM Plex Mono (tokens, audit log, metadata, timestamps)
- **Theme:** DARK. The demo runs on the dark ink background — it's a product demo, and security products demo dark. Light panels used inside (e.g., the letter in step 6 on white "paper").
- **Tokens** ([CLIENT_NAME] etc.): IBM Plex Mono, gray chip background with border.
- **PII highlights:** red underline + red tint background.
- **Animation style:** precise and mechanical, not bouncy. ease-out cubic, 200–400ms micro-interactions, no spring physics. The feeling: a machine doing exact work.
- **Top bar:** APA logo (Space Grotesk, gold dot) + "LIVE DEMO" mono label + step counter "STEP 4 / 8".

---

## 5. Technical Architecture

- **Stack:** Single-page React app (Vite), no backend. All data hardcoded in a `demoScript.ts` fixtures file.
- **Deployment:** Static build → Netlify (drag & drop dist folder, same account as apa-ai.com). Target URL: demo.apa-ai.com.
- **No external API calls at runtime.** All "model responses" are pre-scripted with setTimeout-based choreography.
- **State:** one reducer — `currentStep`, `stepPhase` (entering/idle), `autoplay` boolean.
- **Animations:** CSS transitions + a tiny sequencing helper (async/await with delays). No heavy animation libraries; framer-motion allowed if it speeds development.
- **All step content lives in one fixtures file** so copy edits never require touching components.
- **File structure:**

```
src/
  App.tsx                 — shell, top bar, progress rail, keyboard handling
  demoScript.ts           — ALL text content, timings, table data
  steps/
    Step1Request.tsx
    Step2Orchestrate.tsx
    Step3Route.tsx
    Step4Mask.tsx
    Step5Execute.tsx
    Step6Assemble.tsx
    Step7Audit.tsx
    Step8Summary.tsx
  components/
    TypeWriter.tsx        — animated typing
    PiiHighlight.tsx      — red PII marking with scan reveal
    TokenChip.tsx         — [TOKEN] chips with flip animation
    VaultRow.tsx          — vault entry with lock animation
    ProgressTask.tsx      — task progress bar (step 5)
    StepRail.tsx          — top pipeline navigation
```

---

## 6. Step-by-Step Animation Spec (build order)

| Step | Entrance choreography | Key animation |
|------|----------------------|---------------|
| 1 | Chat input appears → typing effect (~8s, skippable with Next) → scan sweep → PII turns red one by one | Typing + scan line |
| 2 | Tasks stagger in 300ms apart, Local/Cloud badges pop after | Stagger reveal |
| 3 | Model badges slide in next to each task; cloud rows get ⚠ anonymized tag | Badge assignment |
| 4 | Prompt shows with red PII → each value FLIPS to token chip (one by one, 400ms) → vault rows lock 🔒 in sync on the right | **Token flip + vault lock — the money shot** |
| 5 | 5 progress bars start simultaneously; local complete at ~0.6s, cloud at ~2s; checkmarks pop | Parallel progress |
| 6 | Letter fades in with tokens, then tokens flip BACK to real values in blue | Reverse token flip |
| 7 | Audit rows slide in; blocked-entity chips count up; green banner slides up last | Table build |
| 8 | Three statements reveal sequentially (800ms apart), then 4 badges, then pipeline strip | Sequential reveal |

---

## 7. Content Fixtures (single source of truth)

All copy exactly as specified in section 2. PII entities and their tokens:

```ts
const PII = [
  { value: "Miriam Levi",  token: "[CLIENT_NAME]" },
  { value: "IL-2847",      token: "[POLICY_ID]" },
  { value: "₪45,000",      token: "[CLAIM_1_AMOUNT]" },
  { value: "₪12,000",      token: "[CLAIM_2_AMOUNT]" },
  { value: "14%",          token: "[DISCOUNT_RATE]" },
  { value: "12 years",     token: "[TENURE]" },
];
```

---

## 8. Build Plan (Claude Code sessions)

**Session 1 — Skeleton:** Vite + React scaffold, design tokens CSS, App shell with top bar + step rail + keyboard nav + step routing. Steps as placeholder panels. Deploy to Netlify to verify pipeline.

**Session 2 — Steps 1–3:** TypeWriter, PII scan/highlight, orchestrator stagger, routing badges.

**Session 3 — Step 4 (the money shot) + Step 5:** token flip animation, vault lock choreography, parallel progress bars.

**Session 4 — Steps 6–8:** assemble with reverse flip, audit table, summary reveal.

**Session 5 — Polish:** autoplay mode with full timing pass, replay, performance check on projector resolution (1366×768 minimum), final Netlify deploy to demo.apa-ai.com.

---

## 9. Definition of Done

- [ ] All 8 steps work with keyboard + click navigation
- [ ] Autoplay runs the full story in ≤3 minutes without interaction
- [ ] Step 4 token-flip animation is smooth and legible from 3 meters away on a projector
- [ ] Brand-consistent with the investor one-pager (same fonts, same gold, same ink)
- [ ] Deployed and reachable at a stable URL
- [ ] Tested in Chrome full-screen (F11) — the presentation environment
