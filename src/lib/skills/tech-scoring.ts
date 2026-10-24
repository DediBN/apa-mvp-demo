// Pure scoring for the Technology evaluation. No imports, so it runs under plain Node for tests.
//
// Ground truth is fixed once per test set (answer key or independent audit), each issue tagged as correctness or
// format. Every run is judged on its own, blind. Scores are computed here from counts, never asked from the model.

export type IssueKind = "correctness" | "format";

export interface Issue {
  id: string;
  description: string;
  kind: IssueKind;
}

export interface RunJudgement {
  found: string[];
  false_flags: Array<{ item: string; why: string }>;
  unsupported: number;
  total_items: number;
}

export interface RunScore {
  correctness: number; // 60% recall + 30% precision + 10% grounding, on correctness issues only
  format: number | null; // share of format requirements met; null when the test has none
  recall: number;
  precision: number;
  grounding: number;
}

const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n * 100)));

// Scores one repetition of one option across all test sets (issues and judgements concatenated over sets).
export function scoreRun(issues: Issue[], judged: RunJudgement[]): RunScore {
  const ids = new Set(issues.map((i) => i.id));
  const kindOf = new Map(issues.map((i) => [i.id, i.kind]));
  const found = new Set(judged.flatMap((j) => j.found).filter((id) => ids.has(id)));
  const corrIssues = issues.filter((i) => i.kind === "correctness");
  const fmtIssues = issues.filter((i) => i.kind === "format");
  const corrFound = [...found].filter((id) => kindOf.get(id) === "correctness").length;
  const fmtFound = [...found].filter((id) => kindOf.get(id) === "format").length;
  const falseFlags = judged.reduce((s, j) => s + j.false_flags.length, 0);
  const unsupported = judged.reduce((s, j) => s + j.unsupported, 0);
  const totalItems = judged.reduce((s, j) => s + j.total_items, 0);

  const recall = corrIssues.length ? corrFound / corrIssues.length : 0;
  const precision = corrFound + falseFlags ? corrFound / (corrFound + falseFlags) : 0;
  const grounding = totalItems ? 1 - Math.min(unsupported, totalItems) / totalItems : 0;
  return {
    correctness: pct(recall * 0.6 + precision * 0.3 + grounding * 0.1),
    format: fmtIssues.length ? pct(fmtFound / fmtIssues.length) : null,
    recall: pct(recall),
    precision: pct(precision),
    grounding: pct(grounding)
  };
}

export interface Spread {
  mean: number;
  min: number;
  max: number;
  runs: number;
}

export function spread(values: number[]): Spread {
  if (values.length === 0) return { mean: 0, min: 0, max: 0, runs: 0 };
  const mean = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
  return { mean, min: Math.min(...values), max: Math.max(...values), runs: values.length };
}

// Two options are "within noise" when their run ranges overlap, or when there is only one run each and the gap
// is under the noise floor (a single run cannot show its own spread).
export const SINGLE_RUN_NOISE = 10;

export function withinNoise(a: Spread, b: Spread): boolean {
  if (a.runs < 2 || b.runs < 2) return Math.abs(a.mean - b.mean) < SINGLE_RUN_NOISE;
  return a.min <= b.max && b.min <= a.max;
}

// Runs async tasks with a concurrency limit, keeping result order.
export async function pool<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next;
      next += 1;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}
