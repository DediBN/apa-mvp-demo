// Authors a custom SKILL.md from the approved AJD, so the "Custom skill" option can be tested like any other.

import { NextResponse } from "next/server";
import { createAnthropicClient } from "../../../../lib/anthropic-client";

// Needs Vercel Fluid compute (Hobby max 300s). Long documents + a skill exceed 60s.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface AuthorRequest {
  job_title?: string;
  business_need?: string;
  mission?: string;
  kpis?: Array<{ name: string; target: string }>;
}

const MODEL_CHAIN = [process.env.APA_SKILLS_MODEL?.trim(), "claude-sonnet-5-5", "claude-sonnet-5", "claude-sonnet-4-6"].filter(
  (m): m is string => Boolean(m)
);

const SYSTEM = `You write Claude Agent Skills (SKILL.md files) for one specific business process.

Output ONLY the SKILL.md file content, starting with YAML frontmatter:
---
name: <kebab-case, max 64 chars>
description: <one sentence: what it does and when Claude should use it>
---

Then concise Markdown instructions that a capable model follows on the business's own data:
- the exact checks to perform, in order, with the comparison rules (tolerances, matching keys, what counts as a duplicate)
- how to present results: exceptions first, each with the evidence row/line, then a short summary of what checked out
- what to do when data is missing or ambiguous: say so, never guess
- no scripts, no code to execute, no network access, no external tools
- keep the requested output focused: the most important findings first, no exhaustive line-by-line commentary

Write for the process described, not a generic template. Keep it under 900 words. No preamble, no code fences around the file.`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AuthorRequest;
    if (!body.job_title && !body.business_need && !body.mission) {
      return NextResponse.json({ error: "job_title, business_need or mission is required" }, { status: 400 });
    }

    const user =
      `job_title: ${body.job_title ?? ""}\n` +
      `business_need: ${body.business_need ?? ""}\n` +
      `mission: ${body.mission ?? ""}\n` +
      `kpis: ${JSON.stringify(body.kpis ?? [])}`;

    const anthropic = createAnthropicClient();
    let lastError: unknown;
    for (const model of MODEL_CHAIN) {
      try {
        const response = await anthropic.messages.create({
          model,
          max_tokens: 2500,
          system: SYSTEM,
          messages: [{ role: "user", content: user }]
        });
        const raw = response.content
          .map((block) => (block.type === "text" ? block.text : ""))
          .join("\n")
          .replace(/```(?:markdown|md|yaml)?/gi, "")
          .trim();
        if (raw.length < 80) {
          throw new Error("Authored skill is empty");
        }
        // Models sometimes add a preamble or drop the frontmatter: start at the frontmatter if present, else add one.
        const fmStart = raw.search(/^---\s*$/m);
        const fallbackName = (body.job_title || "custom-skill").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "custom-skill";
        const text =
          fmStart >= 0 && /^name:/m.test(raw.slice(fmStart))
            ? raw.slice(fmStart)
            : `---\nname: ${fallbackName}\ndescription: ${(body.mission || body.business_need || body.job_title || "").replace(/\s+/g, " ").slice(0, 200)}\n---\n\n${raw}`;
        const name = text.match(/^name:\s*(.+)$/m)?.[1]?.trim() || fallbackName;
        return NextResponse.json({ skill_md: text, name });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("All models failed");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not author the skill";
    console.error("[skills/author]", message);
    return NextResponse.json({ error: `Could not write the custom skill (${message.slice(0, 120)}). Please try again.` }, { status: 500 });
  }
}
