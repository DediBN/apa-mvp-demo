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
- the business's own rules, stated exactly (prices, thresholds, rates, terms) — never add rules, fields, clauses or
  defaults the business did not ask for
- the steps in order, with the comparison and calculation rules (tolerances, matching keys, rounding, what counts as a duplicate)
- the output: if the process produces something (a quote, a reply, a report), the exact form it must take (e.g. a
  Markdown table with named columns); if it checks things, exceptions first with the evidence row, then a short
  summary of what checked out
- resolving the data before stopping: read the whole thread — a later message updates an earlier one; obvious
  variants of a catalog name (plural, spelling, a descriptive word added) are the same item; one order to one address
  is one delivery. Ask only about what the data truly leaves open, never guess a missing price or fact
- stop only where the business's rules say to stop, and only for the part affected: complete everything that can be
  completed and list each pending point clearly
- no scripts, no code to execute, no network access, no external tools

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
