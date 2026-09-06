// src/app/api/concierge-demo/route.ts
// NEW, ADDITIVE ROUTE — does not touch apa-analyze or any existing endpoint.
// Implements only the two surviving principles from the PRD:
// 1. "Moment of experience" — one concrete action, run on real customer data.
// 2. Reliability classification — every result line gets exactly one tag:
//    found_in_data | inferred | needs_approval | missing_info | cannot_demonstrate

import { NextRequest, NextResponse } from "next/server";
import { createAnthropicClient } from "../../../lib/anthropic-client";

type ConciergeRequest = {
  action_description: string; // free text: the ONE action the team picked manually
  customer_data: string;      // real customer data, pasted as text (message, invoice text, etc.)
  reference_data?: string;    // optional: catalog / price list / policy the data is checked against
};

const SYSTEM_PROMPT = `You are running a single, manually-scoped demo action for one business's real data — not a generic multi-purpose agent.

You will be given:
1. action_description — the ONE concrete action a human already decided to demonstrate (e.g. "match WhatsApp order lines to inventory", "flag price changes across supplier invoices").
2. customer_data — real data from that business.
3. reference_data — optional data to check against (a catalog, price list, policy).

Perform exactly that action on that data. Do not expand scope, do not invent additional capabilities, do not fabricate information that isn't supported by the data.

For EVERY discrete result item, classify it into exactly one of these five categories:
- "found_in_data": directly present and unambiguous in the data.
- "inferred": not stated directly but a high-confidence inference from what's there.
- "needs_approval": plausible but uncertain enough that a human should confirm before acting.
- "missing_info": cannot be completed because required information is absent.
- "cannot_demonstrate": this part of the action_description cannot be shown with the data provided at all.

Never present a confidence or savings number that isn't grounded in what was actually given.

Respond ONLY with JSON (no markdown fences, no preamble):
{
  "items": [
    {
      "label": "short description of this result item",
      "detail": "the actual result — the answer, match, or flag",
      "reliability": "found_in_data | inferred | needs_approval | missing_info | cannot_demonstrate",
      "reason": "one line explaining the classification, especially for anything not found_in_data"
    }
  ],
  "summary": "2-3 sentence plain-language summary of what this demonstrates and what it doesn't"
}`;

export async function POST(req: NextRequest) {
  try {
    const { action_description, customer_data, reference_data } =
      (await req.json()) as ConciergeRequest;

    if (!action_description || !customer_data) {
      return NextResponse.json(
        { error: "action_description and customer_data are required" },
        { status: 400 }
      );
    }

    const userContent = `ACTION TO DEMONSTRATE:\n${action_description}\n\nCUSTOMER DATA:\n"""${customer_data}"""\n\nREFERENCE DATA:\n"""${reference_data || "(none provided)"}"""`;

    const anthropic = createAnthropicClient();

    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const rawText = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { items: [], summary: "Could not parse model output", raw: rawText };
    }

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[concierge-demo] request failed:", message);
    return NextResponse.json(
      { error: "Could not complete the readiness check. Please try again." },
      { status: 500 }
    );
  }
}