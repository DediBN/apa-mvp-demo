// Fixes the format contract once, from the Skill Spec: the exact form the deliverable must take, as atomic,
// checkable requirements. It is the business's standard format — the custom skill carries it verbatim, every test
// set is scored on it, and it is shown to the user. It never sees any skill or any output.

import { NextResponse } from "next/server";
import { pinnedJson } from "../../../../lib/skills/pinned-json";
import type { FormatCheck, FormatRequirement } from "../../../../lib/skills/format-contract";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

interface Request_ {
  job_title?: string;
  business_need?: string;
  mission?: string;
}

const SYSTEM = `You define the output format a business wants for one recurring deliverable, as a short checklist.

Write 5 to 8 atomic format requirements — each one checks a single thing about how the deliverable looks, never
whether its numbers or facts are right. Start from what the business said (language, table, sections, terms). Where
it is silent, fill in the standard professional layout for this kind of document in this market, so the format is
complete enough to be applied the same way every time. Nothing that depends on data the business may not have
(no registration numbers, signatures or logos).

Give each requirement a mechanical check when one fits:
- {"type":"markdown_table"} — the deliverable contains a real table
- {"type":"table_columns","names":["..."]} — a table whose header has these columns (use the exact column names)
- {"type":"contains_any","phrases":["...","..."]} — a required line or label appears (give 2-4 natural variants)
- {"type":"hebrew_text"} — the deliverable is written in Hebrew
Use no check only when none fits. Write descriptions in the business's language.`;

const SCHEMA = {
  type: "object",
  properties: {
    requirements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          check: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["markdown_table", "table_columns", "contains_any", "hebrew_text"] },
              names: { type: "array", items: { type: "string" } },
              phrases: { type: "array", items: { type: "string" } }
            },
            required: ["type"]
          }
        },
        required: ["description"]
      }
    }
  },
  required: ["requirements"]
};

function cleanCheck(c: unknown): FormatCheck | undefined {
  const check = c as { type?: string; names?: unknown; phrases?: unknown } | undefined;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 8) : []);
  switch (check?.type) {
    case "markdown_table":
      return { type: "markdown_table" };
    case "hebrew_text":
      return { type: "hebrew_text" };
    case "table_columns": {
      const names = strings(check.names);
      return names.length ? { type: "table_columns", names } : undefined;
    }
    case "contains_any": {
      const phrases = strings(check.phrases);
      return phrases.length ? { type: "contains_any", phrases } : undefined;
    }
    default:
      return undefined;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Request_;
    if (!body.business_need && !body.job_title) {
      return NextResponse.json({ error: "business_need or job_title is required" }, { status: 400 });
    }
    const result = await pinnedJson<{ requirements: Array<{ description: string; check?: unknown }> }>(
      SYSTEM,
      `job_title: ${body.job_title ?? ""}\nbusiness_need: ${body.business_need ?? ""}\nmission: ${body.mission ?? ""}\n\nSubmit the requirements.`,
      2000,
      SCHEMA
    );
    const requirements: FormatRequirement[] = (Array.isArray(result.requirements) ? result.requirements : [])
      .filter((r) => r?.description?.trim())
      .slice(0, 8)
      .map((r, i) => ({ id: `F${i + 1}`, description: r.description.trim(), check: cleanCheck(r.check) }));
    if (requirements.length === 0) throw new Error(`No format requirements: ${JSON.stringify(result).slice(0, 300)}`);
    return NextResponse.json({ requirements });
  } catch (error) {
    console.error("[skills/format-contract]", error instanceof Error ? error.message : error);
    const detail = error instanceof Error ? error.message.slice(0, 160) : "unknown";
    return NextResponse.json({ error: `Could not define the output format (${detail}). Please run again.` }, { status: 500 });
  }
}
