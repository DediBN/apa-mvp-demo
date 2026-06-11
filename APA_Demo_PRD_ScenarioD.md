# PRD v2 — Addendum: Scenario D "Portfolio Table Analysis"

**Add to APA_Demo_PRD_v2.md as the new DEFAULT scenario.** This is the bulk-data scenario — the most visually dramatic and the most realistic CISO fear (an employee pasting an entire client table into an LLM).

---

## Scenario D — Investment Advisory (Bulk Table) 📊

**Workspace:** "Harel Wealth — Private Banking" · **User:** Amit Dahan, Senior Advisor

### The request (left panel)

Amit attaches/pastes a client table AND types:

> "Analyze my client portfolio table. Identify clients over-exposed to tech stocks (>40%), flag anyone whose risk profile no longer matches their allocation, and draft a prioritized call list with talking points for each."

### The attached table (renders in the chat as a real data table)

| Client | Account | Portfolio Value | Tech % | Risk Profile | Last Review |
|--------|---------|----------------|--------|--------------|-------------|
| Rachel Avrahami | 77-203-981 | ₪4,250,000 | 62% | Conservative | 14 months ago |
| Moshe Peretz | 77-481-225 | ₪1,870,000 | 48% | Moderate | 8 months ago |
| Sara Goldman | 77-115-668 | ₪8,900,000 | 71% | Conservative | 19 months ago |
| Eli Navon | 77-339-470 | ₪950,000 | 22% | Aggressive | 3 months ago |
| Tamar Shavit | 77-602-114 | ₪3,400,000 | 55% | Moderate | 11 months ago |
| Yaakov Mizrahi | 77-228-953 | ₪12,300,000 | 44% | Conservative | 22 months ago |

### The INTERCEPT moment (right panel — the upgraded money shot)

The scan sweep runs over the ENTIRE TABLE. Every cell with PII lights up red **cell by cell, fast** (~80ms per cell — rapid-fire, like a Geiger counter): 6 names, 6 account numbers, 6 portfolio values = **18 sensitive entities detected** (counter ticks up live: 1… 7… 18).

Status line: 🔴 "BULK DATA DETECTED — 18 sensitive entities across 6 client records. Without APA, this entire table would have left the organization."

**That line is the kill shot. Display it prominently.**

### Tasks

1. Parse table & compute tech exposure per client — **Local · Qwen 2.5**
2. Cross-check risk profile vs. current allocation — **Local · Qwen 2.5**
3. Rank clients by urgency (exposure × review age × value) — **Local · Llama 3.2**
4. Generate talking points per flagged client — **Cloud · Claude** ⚠ masked
5. Draft prioritized call list narrative — **Cloud · Claude** ⚠ masked

### The MASK stage (upgraded for bulk)

The table re-renders on the right with ALL 18 values flipping to tokens in a fast cascade ([CLIENT_1], [ACCT_1], [VALUE_1], [CLIENT_2]…) while the vault column counts locks: 🔒 ×18. End state:

> "Outbound payload: structure + percentages only. ZERO names, ZERO accounts, ZERO amounts."

Show the actual masked table snippet sent to cloud:

| Client | Tech % | Risk Profile | Review Age |
|--------|--------|--------------|------------|
| [CLIENT_1] | 62% | Conservative | 14 mo |
| [CLIENT_3] | 71% | Conservative | 19 mo |
| … | | | |

### Final answer (left panel)

> **Priority Call List — Portfolio Risk Review**
>
> **🔴 Urgent (this week):**
> **1. Sara Goldman** — ₪8.9M, 71% tech vs. Conservative profile, 19 months since review. *Talking point: recent tech volatility; propose shifting 25–30% to bonds, capital-preservation framing.*
> **2. Rachel Avrahami** — ₪4.25M, 62% tech vs. Conservative, 14 months. *Talking point: rebalancing as "locking in gains."*
>
> **🟡 This month:**
> **3. Yaakov Mizrahi** — ₪12.3M, 44% tech, Conservative, 22 months overdue. *Highest portfolio value — schedule full review.*
> **4. Tamar Shavit** — ₪3.4M, 55% tech vs. Moderate. *Moderate drift; bundle with quarterly check-in.*
>
> **✓ No action:** Moshe Peretz (within tolerance), Eli Navon (aligned, recently reviewed).

Footer chips: 🔒 18 entities masked · 🖥 3 local · ☁ 2 masked · ⏱ 38s

### Audit entries

| TIME | TASK | SENT TO | ENTITIES BLOCKED | STATUS |
|------|------|---------|------------------|--------|
| 10:22:18 | Talking points generation | Claude | 18 entities (6 names, 6 accounts, 6 values) | ✓ Clean |
| 10:22:19 | Call list narrative | Claude | 18 entities | ✓ Clean |

**Banner:** 🛡 *"6 client records analyzed. 18 sensitive entities masked. The full table never left the organization."*

---

## Implementation notes

- Scenario D becomes the **first card** in the picker (📊 Wealth Management) and the default.
- The table in the left chat renders as a real styled table inside the message bubble (this sells "real product").
- The rapid cell-by-cell red highlight + live counter is the new signature animation — invest the animation budget here, even more than the token flip.
- Reuse the existing choreography engine; only the INTERCEPT and MASK stages need the new "table mode" variants.
