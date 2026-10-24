// Generates synthetic test scenarios from the AJD, for when the requester has no real data to share.
// Each scenario carries its own answer key so options can be scored on it. The generator never sees any skill,
// so the test is not written to favor one option.

import { NextResponse } from "next/server";
import { claudeJson } from "../../../../lib/skills/claude-json";
import type { GeneratedScenario } from "../../../../lib/skills/types";

// Needs Vercel Fluid compute (Hobby max 300s). Long documents + a skill exceed 60s.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface ScenarioRequest {
  job_title?: string;
  business_need?: string;
  mission?: string;
  kpis?: Array<{ name: string; target: string }>;
  count?: number;
  variant?: "standard" | "hard";
}


const SYSTEM = `You design test scenarios for evaluating AI skills on a business task, like a QA lead writing a test set.

For each scenario produce realistic sample data the business would actually have (rows of records, messages, invoices, logs —
whatever the task works on), in the same language as the business need, plus optional reference data the task checks against
(price list, catalog, policy) when the task implies one.

Then write the answer_key: one checkable expected outcome per line.
- For tasks that find or check things (reconciliation, anomalies, compliance, triage): plant a known set of issues and list
  each one, pointing at the exact record (id / row / date) and the problem. Mix the issues with clean records that must
  NOT be flagged, at least one near-miss that looks suspicious but is fine, and at least one subtle issue that is easy to miss.
- For tasks that produce things (drafting, summarizing, planning, classifying): list each concrete requirement a good
  output must meet given this input (facts it must include, rules it must follow, mistakes it must avoid), including one
  easy-to-miss requirement.
The answer key applies the business's own stated rules literally: where the need says to stop, refuse or ask (for
example when a price is missing), the expected outcome is to stop, refuse or ask as stated — never a guessed or
partial completion the rules do not allow. When a stop rule applies to a case, the expected outcome for that case
is the stop itself — which items are missing, what to ask for, and that nothing is invented — never totals or a
finished deliverable for that case. Every scenario must still have at least one case where nothing triggers a stop. Do not add requirements the business need does not state or clearly imply
(no extra fields, validity dates, legal clauses or wording preferences of your own).
Scenarios must differ from each other in format and difficulty. Keep each customer_data under 3500 characters.`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ScenarioRequest;
    const count = Math.max(1, Math.min(3, body.count ?? 2));
    if (!body.job_title && !body.business_need && !body.mission) {
      return NextResponse.json({ error: "job_title, business_need or mission is required" }, { status: 400 });
    }

    const result = await claudeJson<{ scenarios: GeneratedScenario[] }>(
      SYSTEM,
      `job_title: ${body.job_title ?? ""}\nbusiness_need: ${body.business_need ?? ""}\nmission: ${body.mission ?? ""}\n` +
        `kpis: ${JSON.stringify(body.kpis ?? [])}\n\n` +
        (body.variant === "hard"
          ? "Make this a HARD scenario: messier formatting, more records, subtler issues, and two false-alarm traps.\n"
          : "Make this a STANDARD scenario: typical everyday data with clear structure.\n") +
        `Create ${count} scenario${count === 1 ? "" : "s"}. Return {"scenarios":[{"title":"","customer_data":"","reference_data":"","answer_key":""}]}`,
      count === 1 ? 4500 : 9000
    );

    const scenarios = (result.scenarios ?? [])
      .filter((s) => s.customer_data?.trim() && s.answer_key?.trim())
      .slice(0, count)
      .map((s, i) => ({
        title: s.title?.trim() || `Scenario ${i + 1}`,
        customer_data: s.customer_data.slice(0, 6000),
        reference_data: (s.reference_data || "").slice(0, 4000),
        answer_key: s.answer_key.slice(0, 3000)
      }));

    if (scenarios.length === 0) {
      throw new Error("No usable scenarios generated");
    }
    return NextResponse.json({ scenarios });
  } catch (error) {
    console.error("[skills/scenarios]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not generate test scenarios. Please try again." }, { status: 500 });
  }
}
