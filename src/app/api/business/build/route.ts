// Business flow, step 3a: writes the custom skill from the rules the user approved — and nothing else.

import { NextResponse } from "next/server";
import { createAnthropicClient } from "../../../../lib/anthropic-client";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface BuildRequest {
  language?: "he" | "en";
  task_title?: string;
  task_summary?: string;
  rules?: Array<{ text: string; kind: "business" | "format" }>;
  missing?: string[];
  output_format?: string;
  document_text?: string;
  document_name?: string;
  // "data": the business's own records (a spreadsheet), attached every time the skill is used — document_text is
  // then a preview (header and first rows of the sheets the task uses). "reference": a fixed document to embed.
  document_kind?: "data" | "reference";
}

const MODEL_CHAIN = [process.env.APA_SKILLS_MODEL?.trim(), "claude-sonnet-5-5", "claude-sonnet-5", "claude-sonnet-4-6"].filter(
  (m): m is string => Boolean(m)
);

const SYSTEM = `You write a Claude Agent Skill (SKILL.md) for one task of one small business.

Output ONLY the file, starting with YAML frontmatter:
---
name: <English kebab-case, max 64 chars, describing the task>
description: <one sentence in the business's language: what it does and when to use it>
---

Then the instructions, in the business's language, for an AI assistant doing this task for this business:
- Use ONLY the approved rules given. Do not add business rules, prices, policies or defaults that are not listed.
- Order the work: what to collect first, the checks and calculations in order, then the result.
- Business rules first, each stated precisely (numbers and conditions exactly as given).
- What to do when required information is missing: ask for it or mark it as missing; never guess or invent.
- For every OPEN POINT listed, tell the assistant to ask the user about it when it matters.
- The result's format, only as given in the format rules.
- If REFERENCE DATA is given, include it in a section "Reference data" with one line saying to replace it when it changes.
- If a DATA FILE preview is given instead, the business attaches that file every time it uses the skill. Name the
  sheets and columns to use and say exactly how to use them. Do NOT copy its rows or numbers into the skill.
- No scripts, no code to run, no network. Plain Markdown. Under 900 words plus the reference data.`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BuildRequest;
    const rules = (body.rules ?? []).filter((r) => r.text?.trim());
    if (!body.task_summary && rules.length === 0) {
      return NextResponse.json({ error: "task_summary or rules are required" }, { status: 400 });
    }
    const lang = body.language === "en" ? "English" : "Hebrew";
    const reference = (body.document_text || "").trim();
    const user =
      `LANGUAGE: ${lang}\nTASK: ${body.task_title ?? ""}\n${body.task_summary ?? ""}\n\n` +
      `APPROVED BUSINESS RULES:\n${rules.filter((r) => r.kind === "business").map((r) => `- ${r.text}`).join("\n") || "(none)"}\n\n` +
      `APPROVED FORMAT RULES:\n${rules.filter((r) => r.kind === "format").map((r) => `- ${r.text}`).join("\n") || "(none)"}\n` +
      `${body.output_format ? `Expected result: ${body.output_format}\n` : ""}\n` +
      `OPEN POINTS (not answered by the business):\n${(body.missing ?? []).map((m) => `- ${m}`).join("\n") || "(none)"}\n\n` +
      (body.document_kind === "data"
        ? `DATA FILE PREVIEW${body.document_name ? ` (${body.document_name})` : ""}:\n"""${reference.slice(0, 8000)}"""\n\nREFERENCE DATA:\n"""(none)"""`
        : `REFERENCE DATA${body.document_name ? ` (${body.document_name})` : ""}:\n"""${reference.slice(0, 8000) || "(none)"}"""`);

    const anthropic = createAnthropicClient();
    let lastError: unknown;
    for (const model of MODEL_CHAIN) {
      try {
        const response = await anthropic.messages.create({
          model,
          max_tokens: 5000,
          system: SYSTEM,
          messages: [{ role: "user", content: user }]
        });
        const raw = response.content
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("\n")
          .replace(/^```(?:markdown|md|yaml)?\s*$/gim, "")
          .trim();
        if (raw.length < 80) throw new Error("Empty skill");
        const fmStart = raw.search(/^---\s*$/m);
        const fallback = "business-task-skill";
        const text =
          fmStart >= 0 && /^name:/m.test(raw.slice(fmStart))
            ? raw.slice(fmStart)
            : `---\nname: ${fallback}\ndescription: ${(body.task_summary || "").replace(/\s+/g, " ").slice(0, 200)}\n---\n\n${raw}`;
        const name = text.match(/^name:\s*(.+)$/m)?.[1]?.trim() || fallback;
        return NextResponse.json({ skill_md: text, name });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("All models failed");
  } catch (error) {
    console.error("[business/build]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not build the capability. Please try again." }, { status: 500 });
  }
}
