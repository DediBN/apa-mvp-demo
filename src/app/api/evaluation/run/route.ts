import { NextResponse } from "next/server";
import { createAnthropicClient } from "../../../../lib/anthropic-client";
import { AJD } from "../../../../lib/intake-agent/mock";
import { Candidate } from "../../../../lib/research-agent/mock";

interface EvaluationRequest {
  ajd?: AJD;
  candidates?: Candidate[];
}

interface ClaudeEvalItem {
  candidate_id?: string;
  candidate_name?: string;
  analysis?: string;
  fit_score?: number;
}

interface ClaudeEvalResponse {
  evaluations?: ClaudeEvalItem[];
}

function extractJson(text: string): ClaudeEvalResponse {
  const direct = text.trim();

  try {
    return JSON.parse(direct) as ClaudeEvalResponse;
  } catch {
    const start = direct.indexOf("{");
    const end = direct.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(direct.slice(start, end + 1)) as ClaudeEvalResponse;
    }

    throw new Error("Claude evaluation did not return valid JSON.");
  }
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeEvaluations(candidates: Candidate[], raw: ClaudeEvalItem[] | undefined) {
  const byId = new Map<string, ClaudeEvalItem>();

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item.candidate_id) {
        byId.set(item.candidate_id, item);
      }
    }
  }

  return candidates.map((candidate) => {
    const item = byId.get(candidate.candidate_id);
    const fitScore = clampScore(item?.fit_score ?? candidate.fit_score_pre_eval ?? 75);

    return {
      candidate_id: candidate.candidate_id,
      candidate_name: candidate.name,
      fit_score: fitScore,
      analysis:
        item?.analysis?.trim() ||
        `${candidate.name} aligns with core AJD requirements and shows strong implementation potential. ` +
          `Primary risk centers on integration hardening and governance controls under production load.`
    };
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as EvaluationRequest;
    const ajd = body.ajd;
    const candidates = Array.isArray(body.candidates) ? body.candidates : [];

    if (!ajd || candidates.length === 0) {
      return NextResponse.json({ error: "ajd and candidates are required" }, { status: 400 });
    }

    const anthropic = createAnthropicClient();

    const requestPayload = {
      max_tokens: 1200,
      temperature: 0.2,
      system:
        "You are an AI evaluation analyst. Return strict JSON only. No markdown, no prose outside JSON.",
      messages: [
        {
          role: "user" as const,
          content:
            "Evaluate each AI candidate against the AJD mission and KPIs. " +
            "For each candidate, return 2-3 sentences in 'analysis' and a 'fit_score' between 0 and 100. " +
            "Return JSON with exact shape: {\"evaluations\":[{\"candidate_id\":\"string\",\"candidate_name\":\"string\",\"analysis\":\"string\",\"fit_score\":85}]}. " +
            `AJD: ${JSON.stringify({
              job_title: ajd.job_title,
              mission: ajd.agent_profile?.mission || ajd.business_need,
              kpis: ajd.agent_profile?.kpis || []
            })}. ` +
            `Candidates: ${JSON.stringify(
              candidates.map((c) => ({
                candidate_id: c.candidate_id,
                candidate_name: c.name,
                source: c.source,
                fit_score_pre_eval: c.fit_score_pre_eval,
                reason_codes: c.reason_codes,
                risk_flags: c.risk_flags
              }))
            )}`
        }
      ]
    };

    const modelFallbackChain = [
      "claude-3-5-sonnet-latest",
      "claude-3-opus-latest",
      "claude-sonnet-4-6",
      "claude-opus-4-6",
      "claude-sonnet-4-20250514"
    ];

    let response;
    let lastError: unknown;

    for (const model of modelFallbackChain) {
      try {
        response = await anthropic.messages.create({ model, ...requestPayload });
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!response) {
      throw lastError instanceof Error ? lastError : new Error("All Anthropic models failed for evaluation run.");
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const parsed = extractJson(text);
    const evaluations = normalizeEvaluations(candidates, parsed.evaluations);

    return NextResponse.json({ evaluations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run evaluation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
