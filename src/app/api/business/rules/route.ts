// Business flow, step 2b: turns the known rules and the user's answers into one clean, editable rule list.
// Every rule must trace back to a known rule or an answer (checked in code); unanswered questions become "missing".

import { NextResponse } from "next/server";
import { claudeJson } from "../../../../lib/skills/claude-json";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

interface RulesRequest {
  request?: string;
  language?: "he" | "en";
  known_rules?: Array<{ id: string; text: string; kind: "business" | "format"; source: "user" | "document" }>;
  answers?: Array<{ id: string; question: string; answer: string; from_default?: boolean }>;
}

interface ModelRule {
  text: string;
  kind: "business" | "format";
  from: string[];
}

const SYSTEM = `You consolidate a small business's instructions into a short, clear rule list for an AI assistant.

Inputs: the original REQUEST, KNOWN RULES (ids K1..) and ANSWERS to questions (ids Q1..).
- Write each rule as one short, concrete sentence in the given language, in plain words.
- Each rule must come ONLY from the known rules and answers. List the ids it comes from in "from".
- Merge duplicates, split rules that mix two things, keep numbers and conditions exactly as given.
- kind "business" = must be right (amounts, conditions, policy, what to refuse or ask); kind "format" = how it looks.
- Do NOT add rules, defaults or best practices that were not given. Do not soften or change a stated rule.
- output_format: one sentence describing the expected result's form, only from what was given ("" if nothing was given).`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RulesRequest;
    const known = body.known_rules ?? [];
    const answers = (body.answers ?? []).filter((a) => a.answer?.trim());
    const skipped = (body.answers ?? []).filter((a) => !a.answer?.trim()).map((a) => a.question);
    if (known.length === 0 && answers.length === 0) {
      return NextResponse.json({ rules: [], missing: skipped, output_format: "" });
    }

    const lang = body.language === "en" ? "English" : "Hebrew";
    const result = await claudeJson<{ rules: ModelRule[]; output_format: string }>(
      SYSTEM,
      `LANGUAGE: ${lang}\nREQUEST:\n"""${(body.request || "").slice(0, 3000)}"""\n\n` +
        `KNOWN RULES:\n${known.map((k) => `${k.id} [${k.kind}] ${k.text}`).join("\n") || "(none)"}\n\n` +
        `ANSWERS:\n${answers.map((a) => `${a.id} Q: ${a.question}\n   A: ${a.answer}`).join("\n") || "(none)"}\n\n` +
        'Return {"rules":[{"text":"","kind":"business","from":["K1"]}],"output_format":""}',
      2500
    );

    const validIds = new Set([...known.map((k) => k.id), ...answers.map((a) => a.id)]);
    const defaultIds = new Set(answers.filter((a) => a.from_default).map((a) => a.id));
    const documentIds = new Set(known.filter((k) => k.source === "document").map((k) => k.id));

    const rules = (result.rules ?? [])
      .filter((r) => r.text?.trim() && (r.from ?? []).some((id) => validIds.has(id)))
      .slice(0, 25)
      .map((r, i) => {
        const from = r.from.filter((id) => validIds.has(id));
        const source = from.every((id) => defaultIds.has(id))
          ? "approved_default"
          : from.every((id) => documentIds.has(id))
            ? "document"
            : "user";
        return { id: `R${i + 1}`, text: r.text.trim(), kind: r.kind === "format" ? "format" : "business", source };
      });

    return NextResponse.json({ rules, missing: skipped, output_format: result.output_format?.trim() || "" });
  } catch (error) {
    console.error("[business/rules]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not summarize the rules. Please try again." }, { status: 500 });
  }
}
