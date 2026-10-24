// Fixes the ground truth for one test set, once, before any output is judged.
// From the answer key when there is one; otherwise an independent audit of the data. Each item is tagged
// "correctness" (what must be right) or "format" (how the result must look), so the two are scored separately.

import { NextResponse } from "next/server";
import { JUDGE_MODEL, pinnedJson } from "../../../../lib/skills/pinned-json";
import type { Issue } from "../../../../lib/skills/tech-scoring";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface Request_ {
  action_description?: string;
  customer_data?: string;
  reference_data?: string;
  answer_key?: string;
}

const MAX = 18000;

const SYSTEM = `You set the ground truth for testing AI runs on one business task.

If an ANSWER KEY is given, the items are exactly its lines (one item per distinct requirement or issue; do not add,
drop or merge meaning). Otherwise audit the DATA yourself (against the REFERENCE if given) and list every real
exception or requirement the task asks for, only things you can point to in the data.

Tag each item:
- "correctness": the substance must be right — a record, number, amount, condition, rule applied, something to
  flag, refuse or ask for.
- "format": only how the result is presented — layout, table, ordering, tone, length, language.
Give ids I1, I2, ...`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Request_;
    if (!body.customer_data) {
      return NextResponse.json({ error: "customer_data is required" }, { status: 400 });
    }
    const result = await pinnedJson<{ issues: Issue[] }>(
      SYSTEM,
      `TASK\n${body.action_description ?? ""}\n\nDATA\n"""${body.customer_data.slice(0, MAX)}"""\n\nREFERENCE\n"""${(body.reference_data || "(none)").slice(0, MAX)}"""\n\n` +
        (body.answer_key?.trim() ? `ANSWER KEY\n"""${body.answer_key.slice(0, 6000)}"""\n\n` : "") +
        'Return {"issues":[{"id":"I1","description":"","kind":"correctness"}]}',
      3000
    );
    const issues = (result.issues ?? [])
      .filter((i) => i.description?.trim())
      .slice(0, 40)
      .map((i, n) => ({ id: `I${n + 1}`, description: i.description.trim(), kind: i.kind === "format" ? "format" : "correctness" }));
    if (issues.length === 0) throw new Error("No ground truth items");
    return NextResponse.json({ issues, source: body.answer_key?.trim() ? "answer_key" : "independent_audit", model: JUDGE_MODEL });
  } catch (error) {
    console.error("[skills/ground-truth]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not set the ground truth for this test. Please run again." }, { status: 500 });
  }
}
