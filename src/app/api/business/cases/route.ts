// Business flow, step 3b: two realistic test requests built from the approved rules — a regular one and a harder one.
// The generator never sees any skill, so the test is not written to favor one option.
// When the user gave no document the task needs (e.g. a price list), a sample one is generated and marked as such.

import { NextResponse } from "next/server";
import { claudeJson } from "../../../../lib/skills/claude-json";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

interface CasesRequest {
  language?: "he" | "en";
  task_summary?: string;
  rules?: Array<{ text: string; kind: "business" | "format" }>;
  missing?: string[];
  document_text?: string;
}

export interface BusinessCase {
  title: string;
  input: string;
  reference_data: string;
  reference_generated: boolean;
}

const SYSTEM = `You write test requests for checking an AI assistant on one small-business task.

Write exactly 2 cases, in the given language, each the kind of message an employee would really send:
1. A regular, everyday request.
2. A harder one: it must hit at least one threshold or condition from the rules exactly at its edge, and it must
   lack one piece of information the task needs (e.g. an item with no price), so a good answer asks for it
   instead of inventing it.
Each case: title (a few words), input (the employee's message with the details, under 500 characters), reference_data.
When a DOCUMENT is given, it is attached to both cases: the input refers to it ("here is the stock sheet…") and
never retypes its data. For the harder case, pick an edge that really appears in the document.
reference_data: if a DOCUMENT is given, return "" (the business's document is used). If no document is given but
the task clearly needs one (a price list, a policy...), write a short realistic sample consistent with the rules;
otherwise "". Never contradict the rules.`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CasesRequest;
    if (!body.task_summary) {
      return NextResponse.json({ error: "task_summary is required" }, { status: 400 });
    }
    const hasDoc = Boolean(body.document_text?.trim());
    const result = await claudeJson<{ cases: Array<{ title: string; input: string; reference_data: string }> }>(
      SYSTEM,
      `LANGUAGE: ${body.language === "en" ? "English" : "Hebrew"}\nTASK: ${body.task_summary}\n\n` +
        `RULES:\n${(body.rules ?? []).map((r) => `- [${r.kind}] ${r.text}`).join("\n") || "(none)"}\n\n` +
        `OPEN POINTS:\n${(body.missing ?? []).map((m) => `- ${m}`).join("\n") || "(none)"}\n\n` +
        `DOCUMENT:\n"""${hasDoc ? body.document_text!.slice(0, 20000) : "(none)"}"""\n\n` +
        'Return {"cases":[{"title":"","input":"","reference_data":""}]}',
      4000
    );
    const cases: BusinessCase[] = (result.cases ?? [])
      .filter((c) => c.input?.trim())
      .slice(0, 2)
      .map((c, i) => {
        const generated = !hasDoc && Boolean(c.reference_data?.trim());
        return {
          title: c.title?.trim() || `Case ${i + 1}`,
          input: c.input.slice(0, 2000),
          reference_data: hasDoc ? body.document_text!.slice(0, 20000) : (c.reference_data || "").slice(0, 6000),
          reference_generated: generated
        };
      });
    if (cases.length === 0) throw new Error("No cases");
    return NextResponse.json({ cases });
  } catch (error) {
    console.error("[business/cases]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not prepare the test examples. Please try again." }, { status: 500 });
  }
}
