// Pure scoring and recommendation logic for the Business flow. No imports, so it can be unit-tested with plain Node.
//
// Ground truth is the list of rules the user approved — never an answer key we invented.
// Each output is judged rule by rule; scores are computed here from those verdicts, never asked from the model.

export type RuleKind = "business" | "format";
export type RuleSource = "user" | "document" | "approved_default";

export interface Rule {
  id: string;
  text: string;
  kind: RuleKind;
  source: RuleSource;
}

export type RuleVerdict = "met" | "not_met" | "not_applicable";

export interface JudgedOutput {
  key: string;
  verdicts: Record<string, RuleVerdict>; // rule id -> verdict
  invented: string[]; // facts or numbers stated that are not in the data or the rules
  asked_for_missing: string[]; // information the output correctly said is missing
  did_task?: boolean; // false when the output declined or only explained why it cannot do the task
}

// Share of judged outputs that actually did the task (null when the judge did not say).
export function doneShare(judged: JudgedOutput[]): number | null {
  const known = judged.filter((j) => typeof j.did_task === "boolean");
  return known.length ? known.filter((j) => j.did_task).length / known.length : null;
}

export interface OptionResult {
  key: string;
  kind: "custom" | "directory" | "baseline";
  fit: number; // screening fit 0-100 (custom = 100, baseline = 0)
  correctness: number | null; // % of applicable business rules met
  format: number | null; // % of applicable format rules met
  invented: number;
  cases: number;
  // share of test cases (0-1) in which the option actually did the task; null/undefined when not measured
  done?: number | null;
}

export interface Recommendation {
  key: string | null;
  // what the comparison shows against the baseline, in plain terms
  improvement: "correctness" | "format" | "both" | "none";
  reason: "best_score" | "tie_custom" | "tie_fit" | "only_eligible" | "custom_preferred" | "no_eligible" | "not_done";
}

export const TABLE_WORDS = /טבלה|טבלא|table|tabular|columns?\b|עמודות/i;

// A real markdown table: a header row, a separator row (|---|---|) and at least one data row.
export function hasMarkdownTable(text: string): boolean {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  for (let i = 0; i + 2 < lines.length; i += 1) {
    const header = lines[i];
    const sep = lines[i + 1];
    const row = lines[i + 2];
    const isRow = (l: string) => l.startsWith("|") && l.endsWith("|") && l.split("|").length >= 4;
    const isSep = /^\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{0,}:?\s*\|?$/.test(sep);
    if (isRow(header) && isSep && isRow(row)) return true;
  }
  return false;
}

export function isTableRule(rule: Rule): boolean {
  return rule.kind === "format" && TABLE_WORDS.test(rule.text);
}

// The judge's verdict on a table rule is overridden by a structural check: text that merely says "table" is not a table.
export function applyDeterministicChecks(rules: Rule[], output: string, judged: JudgedOutput): JudgedOutput {
  const verdicts = { ...judged.verdicts };
  for (const rule of rules) {
    if (isTableRule(rule) && verdicts[rule.id] !== "not_applicable") {
      verdicts[rule.id] = hasMarkdownTable(output) ? "met" : "not_met";
    }
  }
  return { ...judged, verdicts };
}

function pct(met: number, applicable: number): number | null {
  return applicable === 0 ? null : Math.round((met / applicable) * 100);
}

// Aggregates one option's judged outputs (one per test case) into its scores.
export function scoreOption(rules: Rule[], judged: JudgedOutput[]): { correctness: number | null; format: number | null; invented: number } {
  let bMet = 0;
  let bApp = 0;
  let fMet = 0;
  let fApp = 0;
  let invented = 0;
  for (const j of judged) {
    for (const rule of rules) {
      const v = j.verdicts[rule.id] ?? "not_met"; // a rule the judge skipped counts as not met
      if (v === "not_applicable") continue;
      if (rule.kind === "business") {
        bApp += 1;
        if (v === "met") bMet += 1;
      } else {
        fApp += 1;
        if (v === "met") fMet += 1;
      }
    }
    invented += j.invented.length;
  }
  // Inventing facts is a correctness failure: each invented fact counts as one more unmet business check.
  return { correctness: pct(bMet, bApp + invented), format: pct(fMet, fApp), invented };
}

// Screening fit a library skill needs to be recommended at all: "same task type" or better (see the screening
// anchors in /api/sourcing/skills). Below it, the skill only shares words or a sub-step with the job.
export const MIN_FIT = 60;
const CLEAR_GAIN = 10; // percentage points needed to call it an improvement over the baseline
// Share of test cases in which an option must have actually done the task (not declined or only explained why
// it cannot) to count. A run that refuses is not a win, however "correct" the refusal is.
export const MIN_DONE = 0.5;

export function didTheTask(option: OptionResult): boolean {
  return option.done === null || option.done === undefined || option.done >= MIN_DONE;
}

export function isEligible(option: OptionResult): boolean {
  if (option.kind === "baseline") return false;
  if (!didTheTask(option)) return false;
  return option.kind === "custom" || option.fit >= MIN_FIT;
}

// Documented rule:
// 1. Fit first. Only the custom skill, or a library skill whose screening fit is "same task type" or better
//    (fit >= MIN_FIT), can be recommended. A library skill is preferred over the custom skill only when it is
//    clearly better (CLEAR_GAIN points of correctness); otherwise the custom skill, built for this request, wins.
// 2. A refusal is not a win. An option that did not actually do the task in most test cases cannot be recommended.
//    When no option did the task, there is no recommendation (reason "not_done").
// 3. Rank by correctness, then format. A tie goes to the custom skill, then to the better screening fit.
// 4. The improvement over the baseline is reported separately for correctness and format; less than
//    CLEAR_GAIN points is reported as no clear improvement.
export function recommend(options: OptionResult[]): Recommendation {
  const baseline = options.find((o) => o.kind === "baseline");
  const eligible = options.filter(isEligible);
  if (eligible.length === 0) {
    // "not_done" only when options were actually measured and none of them did the task; no scores at all is a failure.
    const tried = options.filter((o) => o.kind !== "baseline");
    const noneDone = tried.length > 0 && tried.every((o) => !didTheTask(o));
    return { key: null, improvement: "none", reason: noneDone ? "not_done" : "no_eligible" };
  }

  const val = (n: number | null) => (n === null ? -1 : n);
  const sorted = [...eligible].sort(
    (a, b) =>
      val(b.correctness) - val(a.correctness) ||
      val(b.format) - val(a.format) ||
      Number(b.kind === "custom") - Number(a.kind === "custom") ||
      b.fit - a.fit
  );
  let best = sorted[0];
  let reason: Recommendation["reason"] = "best_score";
  const custom = eligible.find((o) => o.kind === "custom");
  if (best.kind === "directory" && custom && val(best.correctness) - val(custom.correctness) < CLEAR_GAIN) {
    best = custom;
    reason = "custom_preferred";
  } else if (eligible.length === 1) reason = "only_eligible";
  else {
    const second = sorted[1];
    const tied = val(best.correctness) === val(second.correctness) && val(best.format) === val(second.format);
    if (tied) reason = best.kind === "custom" && second.kind !== "custom" ? "tie_custom" : "tie_fit";
  }

  const gain = (a: number | null, b: number | null) => (a !== null && b !== null ? a - b : 0);
  const cGain = baseline ? gain(best.correctness, baseline.correctness) : 0;
  const fGain = baseline ? gain(best.format, baseline.format) : 0;
  const improvement =
    cGain >= CLEAR_GAIN && fGain >= CLEAR_GAIN ? "both" : cGain >= CLEAR_GAIN ? "correctness" : fGain >= CLEAR_GAIN ? "format" : "none";

  return { key: best.key, improvement, reason };
}
