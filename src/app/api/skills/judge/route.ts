// Scores every option's real output on the same data against one ground truth.
// Ground truth = the answer key when provided; otherwise an independent audit of the data by the judge.
// Scores are computed here from counts, not asked from the model.

import { NextResponse } from "next/server";
import { claudeJson } from "../../../../lib/skills/claude-json";
import type { OptionScore } from "../../../../lib/skills/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface OptionOutput {
  key: string;
  name: string;
  summary?: string;
  items: Array<{ label: string; detail: string; reliability: string; reason?: string }>;
}

interface JudgeRequest {
  action_description: string;
  customer_data: string;
  reference_data?: string;
  answer_key?: string;
  outputs: OptionOutput[];
}

interface JudgeModelResult {
  issues: Array<{ id: string; description: string }>;
  options: Array<{
    key: string;
    found: string[];
    false_flags: Array<{ item: string; why: string }>;
    unsupported: number;
    verdict: string;
  }>;
}


const MAX = 18000;

const SYSTEM = `You are an independent auditor scoring several AI runs of the same task on the same business data.

Step 1 — Ground truth. If an ANSWER KEY is given, the ground-truth issues are exactly the issues in the key.
Otherwise, audit the DATA yourself (against the REFERENCE if given) and list every real exception the task asks to find.
Include only issues you can point to in the data. Give each an id "I1", "I2", ...

Step 2 — For each option, read its result items and decide:
- found: ids of ground-truth issues the option clearly identified (same row/invoice and same problem). Partial or vague mentions do not count.
- false_flags: items the option flagged as a problem that are not real issues in the data.
- unsupported: number of items stating facts or numbers that do not appear in or follow from the data.
- verdict: one plain sentence on how the option did.

Be strict and consistent across options. Never reward length.`;

function pct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 100)));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as JudgeRequest;
    if (!body.customer_data || !Array.isArray(body.outputs) || body.outputs.length === 0) {
      return NextResponse.json({ error: "customer_data and outputs are required" }, { status: 400 });
    }

    const outputsText = body.outputs
      .map(
        (o) =>
          `### OPTION key=${o.key} (${o.name})\nSummary: ${o.summary ?? ""}\n` +
          o.items
            .slice(0, 30)
            .map((it, i) => `${i + 1}. [${it.reliability}] ${it.label} — ${it.detail}${it.reason ? ` (${it.reason})` : ""}`)
            .join("\n")
      )
      .join("\n\n");

    const user =
      `TASK\n${body.action_description}\n\n` +
      `DATA\n"""${body.customer_data.slice(0, MAX)}"""\n\n` +
      `REFERENCE\n"""${(body.reference_data || "(none)").slice(0, MAX)}"""\n\n` +
      (body.answer_key?.trim() ? `ANSWER KEY (authoritative ground truth)\n"""${body.answer_key.slice(0, 6000)}"""\n\n` : "") +
      `OPTIONS\n${outputsText}\n\n` +
      'Return {"issues":[{"id":"I1","description":""}],"options":[{"key":"","found":["I1"],"false_flags":[{"item":"","why":""}],"unsupported":0,"verdict":""}]} with one entry per option key.';

    const judged = await claudeJson<JudgeModelResult>(SYSTEM, user, 6000);
    const issueIds = new Set((judged.issues ?? []).map((i) => i.id));

    const scores: OptionScore[] = body.outputs.map((o) => {
      const verdict = judged.options?.find((x) => x.key === o.key);
      const found = Array.from(new Set((verdict?.found ?? []).filter((id) => issueIds.has(id))));
      const falseFlags = verdict?.false_flags ?? [];
      const totalItems = o.items.length;
      const unsupported = Math.min(totalItems, Math.max(0, Number(verdict?.unsupported) || 0));
      const recall = issueIds.size > 0 ? found.length / issueIds.size : 0;
      const flagged = found.length + falseFlags.length;
      const precision = flagged > 0 ? found.length / flagged : 0;
      const grounding = totalItems > 0 ? 1 - unsupported / totalItems : 0;
      return {
        key: o.key,
        name: o.name,
        found,
        missed: Array.from(issueIds).filter((id) => !found.includes(id)),
        false_flags: falseFlags,
        unsupported,
        total_items: totalItems,
        recall: pct(recall),
        precision: pct(precision),
        grounding: pct(grounding),
        composite: pct(recall * 0.6 + precision * 0.3 + grounding * 0.1),
        verdict: verdict?.verdict ?? "Not scored"
      };
    });

    return NextResponse.json({
      ground_truth: body.answer_key?.trim() ? "answer_key" : "independent_audit",
      issues: judged.issues ?? [],
      scores
    });
  } catch (error) {
    console.error("[skills/judge]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Scoring failed. Please run again." }, { status: 500 });
  }
}
