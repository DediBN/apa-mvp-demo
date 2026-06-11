# PRD v3 — APA Demo: LIVE MODE

**Version:** 3.0 · June 2026 · **Extends PRD v2 — does not replace it.**
The scripted scenarios stay exactly as they are. Live Mode is added alongside them.

---

## 1. Concept

A new mode where the presenter (or the customer!) types **any free-text prompt**, clicks Send — and APA analyzes it for real:

- Real PII detection (Claude API)
- Real task decomposition & routing (Claude API)
- Real masking (deterministic, client-side)
- Real cloud execution with the MASKED prompt (Claude API)
- Real reconstruction (deterministic, client-side)

The right-panel choreography stays identical — same stages, same animations — but the content is now generated live from the actual input.

**The pitch moment this enables:** handing the keyboard to the CISO and saying *"type something from your world."*

---

## 2. Mode Selection

- Scenario picker gets a 4th card: **⚡ Live Mode — type your own**
- In Live Mode the chat input is empty and fully editable, placeholder: *"Describe a task involving client data — names, accounts, amounts…"*
- A small mono tag in the right panel header switches from `DEMO SCRIPT` to `LIVE ANALYSIS`.
- Scripted scenarios behave exactly as before (zero API calls).

---

## 3. Architecture

```
Browser (React app)
   │
   ├─ POST /.netlify/functions/apa-analyze     (step 1: detect + decompose)
   ├─ POST /.netlify/functions/apa-execute     (step 2: run masked cloud tasks)
   │
Netlify Functions (API key lives ONLY here, env var ANTHROPIC_API_KEY)
   │
   └─ api.anthropic.com  (claude-sonnet-4-20250514)
```

- **Masking and reconstruction are CLIENT-SIDE string replacement** — deterministic, no AI. This is important: it mirrors APA's real architecture (the vault never goes to the cloud) and it's trivially reliable.
- "Local model" tasks remain simulated with progress-bar timing (the story stays true: those wouldn't leave the org anyway).

---

## 4. Function 1 — `apa-analyze`

**Input:** `{ prompt: string }`
**One Claude call** with a system prompt that returns STRICT JSON:

```json
{
  "entities": [
    { "value": "Miriam Levi", "type": "PERSON_NAME", "token": "[CLIENT_NAME]" },
    { "value": "IL-2847",     "type": "ACCOUNT_ID",  "token": "[POLICY_ID]" }
  ],
  "tasks": [
    { "id": 1, "title": "Retrieve client profile", "destination": "local",
      "model": "Llama 3.2", "needsCloud": false },
    { "id": 4, "title": "Draft renewal letter", "destination": "cloud",
      "model": "Claude", "needsCloud": true,
      "cloudPrompt": "Draft a renewal letter for [CLIENT_NAME]..." }
  ]
}
```

**System prompt requirements (write carefully in implementation):**
- Detect ALL sensitive entities: names, IDs/account numbers, monetary amounts, dates of birth, addresses, medical references, percentages tied to a person.
- Generate semantic tokens ([CLIENT_NAME], [ACCOUNT_ID], [AMOUNT_1]…) — numbered when multiple of same type.
- Decompose into 3–6 tasks; classify each local vs cloud using the rule: *data retrieval / computation / policy = local; creative drafting / external knowledge = cloud*.
- For cloud tasks, write `cloudPrompt` USING THE TOKENS — never the real values.
- Respond ONLY with JSON. Temperature 0.
- Use tool-use / forced JSON schema if simpler than prompt-parsing.

**Client then animates:** scan sweep highlights the returned entities in the original text (string match) → DECOMPOSE stage renders the returned tasks → ROUTE renders models → MASK stage flips each entity to its token and locks vault rows. All existing components reused — only the data source changes.

## 5. Function 2 — `apa-execute`

**Input:** `{ tasks: [{ id, cloudPrompt }] }` (cloud tasks only, already masked)
**Behavior:** runs the cloud prompts against Claude **in parallel** (Promise.all), max_tokens ~700 each, returns `{ id, response }[]`.
**Hard guard inside the function:** reject any request whose prompt matches common PII patterns (Israeli ID regex, IBAN, etc.) — belt-and-suspenders proof that plaintext can't pass. Log nothing.

**Client then:** EXECUTE stage drives real progress (local bars simulated ~1s; cloud bars complete when fetch resolves) → ASSEMBLE flips tokens back to real values inside the returned text → final answer renders in the left chat → AUDIT rows generated from the actual run (timestamps, models, entity counts).

## 6. Fallback & Resilience (critical for meetings)

- **Silent fallback:** if any function call fails or exceeds 15s, the run seamlessly switches to the closest scripted scenario content. A tiny mono `OFFLINE REPLAY` tag appears in the corner — visible to the presenter, invisible to everyone else.
- **Kill switch:** `?mode=scripted` URL param forces scripted-only (for high-stakes meetings with bad Wi-Fi).
- Loading states between stages must feel intentional (the existing stage pacing absorbs latency: run apa-analyze DURING the INTERCEPT scan animation; run apa-execute DURING the EXECUTE stage).

## 7. Cost & Limits

- ~3–6 Claude calls per live run ≈ a few cents.
- Netlify Function: add simple rate limit (max 10 runs/hour per IP) — the demo URL is public.
- `ANTHROPIC_API_KEY` set in Netlify env vars only. Never in client bundle. Verify with a grep of dist/ after build.

## 8. Build Plan (Claude Code — single day)

**Session 1:** Netlify Functions scaffold (`netlify/functions/apa-analyze.ts`, `apa-execute.ts`), local dev with `netlify dev`, env var wiring, the analyze system prompt + JSON schema, unit-test with 3 sample prompts.
**Session 2:** Live Mode card + editable input + wire analyze response into existing INTERCEPT/DECOMPOSE/ROUTE/MASK components (data-driven instead of fixture-driven).
**Session 3:** apa-execute wiring → EXECUTE/ASSEMBLE/AUDIT from real results + client-side reconstruction.
**Session 4:** Silent fallback, kill switch, rate limit, latency masking inside animations, deploy to demo.apa-ai.com, grep-check the bundle for the key.

## 9. Definition of Done

- [ ] Free-text prompt with Hebrew or English names/amounts → correct detection, masking, real answer
- [ ] The masked cloudPrompt visibly contains tokens only (shown in MASK stage)
- [ ] Wi-Fi off → run completes via silent fallback without visual breakage
- [ ] API key absent from client bundle (verified)
- [ ] Live run total time ≤ 60s
