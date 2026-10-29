// Business flow, step 3d: judges ONE output against the rules the user approved.
// Blind: the judge never sees which option produced the output, and each output is judged on its own call.
// Table rules are then checked structurally in code — text that merely says "table" does not pass.

import { NextResponse } from "next/server";
import { createAnthropicClient } from "../../../../lib/anthropic-client";
import { extractJsonObject } from "../../../../lib/skills/claude-json";
import { applyDeterministicChecks, type JudgedOutput, type Rule, type RuleVerdict } from "../../../../lib/business/scoring";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

interface JudgeRequest {
  task_summary?: string;
  rules?: Rule[];
  input?: string;
  reference_data?: string;
  output?: string;
}

const SYSTEM = `You check one piece of work done by an AI assistant for a small business, against the business's own rules.

For EACH rule decide:
- "met": the work clearly follows the rule (numbers and conditions exactly right).
- "not_met": the rule applies here and the work breaks it, ignores it or gets it wrong.
- "not_applicable": the rule does not apply to this request at all.
Check arithmetic yourself. A rule about asking for missing information is met only if the work asked for it or
clearly marked it missing instead of guessing.
invented: list every fact, price or number in the work that does not appear in, or follow from, the request,
the reference data or the rules. Empty if none.
asked_for_missing: the information the work correctly said is missing.
did_task: true if the work actually produced the requested result (even if it marks some items as missing);
false if it declined, said it cannot do the task, or only explained what would be needed to do it.
Be strict and consistent. Never reward length or style beyond what the rules ask.`;

const VALID: RuleVerdict[] = ["met", "not_met", "not_applicable"];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as JudgeRequest;
    const rules = body.rules ?? [];
    if (!body.output?.trim() || rules.length === 0) {
      return NextResponse.json({ error: "output and rules are required" }, { status: 400 });
    }
    // The part shared by every check in a run (task, rules, reference data) comes first and is cached, so only the
    // first check pays for it in full; the request and the work to check follow.
    const shared =
      `TASK: ${body.task_summary ?? ""}\n\nRULES:\n${rules.map((r) => `${r.id} [${r.kind}] ${r.text}`).join("\n")}\n\n` +
      `REFERENCE DATA:\n"""${(body.reference_data || "(none)").slice(0, 20000)}"""`;
    const own =
      `REQUEST:\n"""${(body.input || "").slice(0, 5000)}"""\n\n` +
      `WORK TO CHECK:\n"""${body.output.slice(0, 12000)}"""\n\n` +
      'Return {"verdicts":{"R1":"met"},"invented":[""],"asked_for_missing":[""],"did_task":true,"note":"one plain sentence"}';

    // One pinned judge model, no fallback chain, so every output in a run is judged the same way.
    const model = process.env.APA_JUDGE_MODEL?.trim() || process.env.APA_SKILLS_MODEL?.trim() || "claude-sonnet-5";
    const anthropic = createAnthropicClient();
    const response = await anthropic.messages.create({
      model,
      max_tokens: 2000,
      system: `${SYSTEM}\nRespond with strict JSON only.`,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: shared, cache_control: { type: "ephemeral" } },
            { type: "text", text: own }
          ]
        }
      ]
    });
    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
    const parsed = extractJsonObject<{ verdicts: Record<string, string>; invented: string[]; asked_for_missing: string[]; did_task?: boolean; note: string }>(text);

    const verdicts: Record<string, RuleVerdict> = {};
    for (const rule of rules) {
      const v = parsed.verdicts?.[rule.id] as RuleVerdict;
      verdicts[rule.id] = VALID.includes(v) ? v : "not_met";
    }
    const judged: JudgedOutput = applyDeterministicChecks(rules, body.output, {
      key: "blind",
      verdicts,
      invented: (parsed.invented ?? []).filter((s) => s?.trim()).slice(0, 10),
      asked_for_missing: (parsed.asked_for_missing ?? []).filter((s) => s?.trim()).slice(0, 10),
      did_task: parsed.did_task !== false
    });
    return NextResponse.json({ ...judged, note: parsed.note?.trim() || "", model });
  } catch (error) {
    console.error("[business/judge]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "The check failed. Please run again." }, { status: 500 });
  }
}
