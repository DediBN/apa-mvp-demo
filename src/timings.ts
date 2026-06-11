// All choreography timing values in one place — tune pacing here, never in components.
// Times are relative to Send click (milliseconds).

export const TYPING_SPEED_MS = 12; // ms per character (~2s for a 165-char request)

export const STAGE_TIMINGS = {
  INTERCEPT: 0,
  DECOMPOSE: 5_000,
  ROUTE:     10_000,
  MASK:      14_000,
  EXECUTE:   22_000,
  ASSEMBLE:  28_000,
  AUDIT:     32_000,
  ANSWER:    35_000,   // when left panel answer appears
  TOTAL:     40_000,   // full run duration
} as const;

// Session 1 placeholder: simple stagger for dummy gateway stages
export const SESSION1_STAGE_STAGGER_MS = 1_800;

// PII scan reveal: delay between highlighting each entity
export const PII_REVEAL_INTERVAL_MS = 320;

// Task decompose stagger
export const DECOMPOSE_STAGGER_MS = 300;

// Token flip animation duration
export const TOKEN_FLIP_MS = 400;

// Vault lock animation delay per row (after token flip)
export const VAULT_LOCK_DELAY_MS = 80;

// Progress bar durations (override per-task in scenarios.ts if needed)
export const LOCAL_TASK_MS  = 800;
export const CLOUD_TASK_MS  = 3_500;

// Audit row slide-in stagger
export const AUDIT_ROW_STAGGER_MS = 400;
