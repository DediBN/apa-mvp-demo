// Judges ONE run, blind: the judge never sees which option produced it, and each run gets its own call,
// against the ground truth fixed beforehand. Counts only — scores are computed in the client from these counts.

import { NextResponse } from "next/server";
import { JUDGE_MODEL, pinnedJson } from "../../../../lib/skills/pinned-json";
import type { Issue } from "../../../../lib/skills/tech-scoring";
import { hasMarkdownTable, TABLE_WORDS } from "../../../../lib/business/scoring";
import { runCheck } from "../../../../lib/skills/format-contract";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

interface Request_ {
  action_description?: string;
  customer_data?: string;
  reference_data?: string;
  issues?: Issue[];
  output?: { summary?: string; deliverable?: string; items: Array<{ label: string; detail: string; reliability: string; reason?: string }> };
}

const MAX = 18000;

const SYSTEM = `You are an independent auditor checking one AI run on a business task against a fixed ground truth.

- found: ids of ground-truth items the run clearly got right (the same record and the same problem, or the
  requirement clearly met). Partial or vague mentions do not count. A format item counts only if the run's
  result really has that form (text that merely says "table" is not a table). The DELIVERABLE is what would be
  handed over; judge format items on it.
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
        .join("\n") +
      (body.output?.deliverable?.trim() ? `\n\nDELIVERABLE (exactly as handed over)\n"""${body.output.deliverable.slice(0, MAX)}"""` : "\n\nDELIVERABLE: none produced");
    const result = await pinnedJson<{ found: string[]; false_flags: Array<{ item: string; why: string }>; unsupported: number; verdict: string }>(
      SYSTEM,
      `TASK\n${body.action_description ?? ""}\n\nDATA\n"""${body.customer_data.slice(0, MAX)}"""\n\nREFERENCE\n"""${(body.reference_data || "(none)").slice(0, MAX)}"""\n\n` +
        `GROUND TRUTH\n${issues.map((i) => `${i.id} [${i.kind}] ${i.description}`).join("\n")}\n\nRUN\n${run}\n\n` +
        "Submit found, false_flags, unsupported and verdict.",
      2000,
      {
        type: "object",
        properties: {
          found: { type: "array", items: { type: "string" }, description: "Ground-truth ids the run got right" },
          false_flags: {
            type: "array",
            items: { type: "object", properties: { item: { type: "string" }, why: { type: "string" } }, required: ["item", "why"] }
          },
          unsupported: { type: "integer", minimum: 0 },
          verdict: { type: "string" }
        },
        required: ["found", "false_flags", "unsupported", "verdict"]
      }
    );
    const ids = new Set(issues.map((i) => i.id));
    const found = new Set((result.found ?? []).filter((id) => ids.has(id)));
    // Deterministic check: a format item that requires a table cannot be met without a real Markdown table
    // in the deliverable (the judge still decides whether an existing table meets the rest of the item).
    const deliverable = body.output?.deliverable ?? "";
    if (!hasMarkdownTable(deliverable)) {
      for (const issue of issues) if (issue.kind === "format" && !issue.check && TABLE_WORDS.test(issue.description)) found.delete(issue.id);
    }
    // Format requirements with a mechanical check are decided by the check alone, never by the model.
    for (const issue of issues) {
      if (issue.check) {
        if (runCheck(issue.check, deliverable)) found.add(issue.id);
        else found.delete(issue.id);
      }
    }
    return NextResponse.json({
      found: Array.from(found),
      false_flags: (result.false_flags ?? []).filter((f) => f?.item?.trim()),
      unsupported: Math.min(items.length, Math.max(0, Number(result.unsupported) || 0)),
      total_items: items.length,
      // Strip any markup the model leaked into the text (e.g. a stray closing tag).
      verdict: (result.verdict ?? "").replace(/<\/?[a-z_]+[^>]*>/gi, "").trim(),
      model: JUDGE_MODEL
    });
  } catch (error) {
    console.error("[skills/judge-one]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Scoring this run failed." }, { status: 500 });
  }
}
