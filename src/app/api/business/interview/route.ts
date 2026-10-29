// Business flow, step 2a: from a short request (and an optional document) to the few questions needed to do the job.
// Only rules the user actually stated, or that appear in their document, are returned as known rules.
// Anything else is a question; a suggested default is only a suggestion the user must approve.

import { NextResponse } from "next/server";
import { claudeJson } from "../../../../lib/skills/claude-json";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

interface InterviewRequest {
  request?: string;
  document_text?: string;
  ui_language?: "en" | "he";
}

export interface InterviewQuestion {
  id: string;
  question: string;
  why: string;
  options: string[];
  suggested_default: string;
}

export interface InterviewResponse {
  language: "he" | "en";
  task_title: string;
  task_summary: string;
  known_rules: Array<{ id: string; text: string; kind: "business" | "format"; source: "user" | "document" }>;
  questions: InterviewQuestion[];
  // Can a skill do this with what the business gives it? "not_possible": needs live outside data or access to
  // systems a skill cannot provide. "needs_file": needs the business's own data, and no document was attached.
  feasibility: { status: "ok" | "needs_file" | "not_possible"; reason: string; needs: string };
}

const SYSTEM = `You help a small-business employee who is not technical turn a short request into a precise work procedure for an AI assistant.

Read the REQUEST and the optional DOCUMENT (a price list, policy, example, template...).

1. language: the language of the REQUEST ("he" for Hebrew, else "en"). Write everything in that language.
2. task_title: 3-6 words. task_summary: one plain sentence of what the AI will do.
3. known_rules: ONLY rules the user explicitly stated in the REQUEST, or that are explicitly written in the DOCUMENT
   (e.g. prices, discount thresholds, payment terms, tone, required fields, layout). Quote them faithfully, concisely.
   kind "business" = what must be right (amounts, conditions, policy, what to refuse); kind "format" = how it looks.
   source = "user" or "document". NEVER add a rule that is not stated. If nothing is stated, return an empty list.
4. questions: the 3 to 5 most important things you must know to do this task correctly for THIS business that are
   not already answered. Plain everyday words, no technical terms, one short question each. For each:
   - why: half a sentence on why it matters.
   - options: 2-4 short typical answers the user can click (may be empty for free text).
   - suggested_default: a common choice to offer, or "" if there is no sensible default. It is only a suggestion.
   Always include, when relevant, what to do when information is missing (e.g. a product without a price).
   Never ask for things already answered by the request or the document.
5. feasibility: can an AI assistant with a written skill do this task using ONLY what the business gives it (the
   request, the attached DOCUMENT, files it pastes later) and general knowledge? A skill is written instructions:
   it cannot browse the web, fetch live data, or read or send anything in other systems.
   - status "not_possible": the task needs live or current outside information that the business does not have in
     its own files (today's prices or schedules of other businesses, availability, news, web search), or needs to
     act in another system (send emails or messages, update a calendar, a website or a bank).
   - status "needs_file": the task is about the business's own records (its stock, clients, appointments,
     invoices, price list...) and no DOCUMENT was attached.
   - status "ok": otherwise (including writing, drafting, calculating or checking from what the user will paste).
   reason: one plain sentence, what is missing ("" when ok). needs: one plain sentence, what would make it work
   (e.g. "Attach your stock sheet" or "A tool connected to the cinemas' websites, not a skill") ("" when ok).`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as InterviewRequest;
    const req = body.request?.trim();
    if (!req) {
      return NextResponse.json({ error: "request is required" }, { status: 400 });
    }
    const result = await claudeJson<InterviewResponse>(
      SYSTEM,
      `REQUEST:\n"""${req.slice(0, 4000)}"""\n\nDOCUMENT:\n"""${(body.document_text || "(none)").slice(0, 15000)}"""\n\n` +
        'Return {"language":"he","task_title":"","task_summary":"","known_rules":[{"id":"K1","text":"","kind":"business","source":"user"}],' +
        '"questions":[{"id":"Q1","question":"","why":"","options":[""],"suggested_default":""}],' +
        '"feasibility":{"status":"ok","reason":"","needs":""}}',
      2500
    );
    const language = result.language === "en" ? "en" : "he";
    return NextResponse.json({
      language,
      task_title: result.task_title?.trim() || req.slice(0, 60),
      task_summary: result.task_summary?.trim() || req,
      known_rules: (result.known_rules ?? [])
        .filter((r) => r.text?.trim())
        .slice(0, 20)
        .map((r, i) => ({
          id: `K${i + 1}`,
          text: r.text.trim(),
          kind: r.kind === "format" ? "format" : "business",
          source: r.source === "document" ? "document" : "user"
        })),
      questions: (result.questions ?? [])
        .filter((q) => q.question?.trim())
        .slice(0, 5)
        .map((q, i) => ({
          id: `Q${i + 1}`,
          question: q.question.trim(),
          why: q.why?.trim() || "",
          options: (q.options ?? []).filter((o) => o?.trim()).slice(0, 4),
          suggested_default: q.suggested_default?.trim() || ""
        })),
      feasibility: {
        status: (["ok", "needs_file", "not_possible"] as const).includes(result.feasibility?.status) ? result.feasibility.status : "ok",
        reason: result.feasibility?.reason?.trim() || "",
        needs: result.feasibility?.needs?.trim() || ""
      }
    } satisfies InterviewResponse);
  } catch (error) {
    console.error("[business/interview]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not prepare the questions. Please try again." }, { status: 500 });
  }
}
