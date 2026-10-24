// Judges ONE run, blind: the judge never sees which option produced it, and each run gets its own call,
// against the ground truth fixed beforehand. Counts only — scores are computed in the client from these counts.

import { NextResponse } from "next/server";
import { JUDGE_MODEL, pinnedJson } from "../../../../lib/skills/pinned-json";
import type { Issue } from "../../../../lib/skills/tech-scoring";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

interface Request_ {
  action_description?: string;
  customer_data?: string;
  reference_data?: string;
  issues?: Issue[];
  output?: { summary?: string; items: Array<{ label: string; detail: string; reliability: string; reason?: string }> };
}

const MAX = 18000;

const SYSTEM = `You are an independent auditor checking one AI run on a business task against a fixed ground truth.

- found: ids of ground-truth items the run clearly got right (the same record and the same problem, or the
  requirement clearly met). Partial or vague mentions do not count. A format item counts only if the run's
  result really has that form (text that merely says "table" is not a table).
- false_flags: items where the run flagged a problem that is not real, or asserted something wrong about the data.
- unsupported: number of result items stating facts or numbers that do not appear in or follow from the data.
- verdict: one plain sentence.
Judge only this run. Be strict and consistent. Never reward length.`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Request_;
    const issues = body.issues ?? [];
    const items = body.output?.items ?? [];
    if (!body.customer_data || issues.length === 0) {
      return NextResponse.json({ error: "customer_data and issues are required" }, { status: 400 });
    }
    const run =
      `Summary: ${body.output?.summary ?? ""}\n` +
      items
        .slice(0, 40)
        .map((it, i) => `${i + 1}. [${it.reliability}] ${it.label} — ${it.detail}${it.reason ? ` (${it.reason})` : ""}`)
        .join("\n");
    const result = await pinnedJson<{ found: string[]; false_flags: Array<{ item: string; why: string }>; unsupported: number; verdict: string }>(
      SYSTEM,
      `TASK\n${body.action_description ?? ""}\n\nDATA\n"""${body.customer_data.slice(0, MAX)}"""\n\nREFERENCE\n"""${(body.reference_data || "(none)").slice(0, MAX)}"""\n\n` +
        `GROUND TRUTH\n${issues.map((i) => `${i.id} [${i.kind}] ${i.description}`).join("\n")}\n\nRUN\n${run}\n\n` +
        'Return {"found":["I1"],"false_flags":[{"item":"","why":""}],"unsupported":0,"verdict":""}',
      2000
    );
    const ids = new Set(issues.map((i) => i.id));
    return NextResponse.json({
      found: Array.from(new Set((result.found ?? []).filter((id) => ids.has(id)))),
      false_flags: (result.false_flags ?? []).filter((f) => f?.item?.trim()),
      unsupported: Math.min(items.length, Math.max(0, Number(result.unsupported) || 0)),
      total_items: items.length,
      verdict: result.verdict?.trim() || "",
      model: JUDGE_MODEL
    });
  } catch (error) {
    console.error("[skills/judge-one]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Scoring this run failed." }, { status: 500 });
  }
}
