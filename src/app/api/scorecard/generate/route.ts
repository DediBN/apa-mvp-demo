import { readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import { createAnthropicClient } from "../../../../lib/anthropic-client";
import { AJD } from "../../../../lib/intake-agent/mock";
import { CandidateEvaluationResult } from "../../../../lib/evaluation-agent/mock";

interface ScorecardRequest {
  ajd?: AJD;
  evaluatedCandidates?: CandidateEvaluationResult[];
}

export interface ScorecardRecommendation {
  name: string;
  vendor: string;
  composite_score: number;
  deploy_verdict: "DEPLOY" | "HOLD" | "REJECT";
  verdict_reason: string;
}

export interface ScorecardROI {
  monthly_value: number | null;
  annual_value: number | null;
  implementation_cost: number | null;
  formula_shown: string;
}

export interface ScorecardRankedCandidate {
  rank: number;
  name: string;
  composite_score: number;
  top_strength: string;
  top_weakness: string;
}

export interface ScorecardResult {
  recommendation: ScorecardRecommendation;
  roi: ScorecardROI;
  ranked_candidates: ScorecardRankedCandidate[];
  deploy_ready: boolean;
  human_approval_required: true;
  notes: string;
}

interface ClaudeScorecardResponse {
  recommendation?: Partial<ScorecardRecommendation>;
  roi?: Partial<ScorecardROI>;
  ranked_candidates?: Partial<ScorecardRankedCandidate>[];
  deploy_ready?: boolean;
  human_approval_required?: boolean;
  notes?: string;
}

function extractJson(text: string): ClaudeScorecardResponse {
  const direct = text.trim();
  try {
    return JSON.parse(direct) as ClaudeScorecardResponse;
  } catch {
    const start = direct.indexOf("{");
    const end = direct.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(direct.slice(start, end + 1)) as ClaudeScorecardResponse;
    }
    throw new Error("Claude scorecard did not return valid JSON.");
  }
}

function buildFallback(candidates: CandidateEvaluationResult[]): ScorecardResult {
  const ranked = [...candidates].sort(
    (a, b) => b.scorecard.compositeScore - a.scorecard.compositeScore
  );
  const winner = ranked[0];
  const verdict: ScorecardRecommendation["deploy_verdict"] =
    winner.scorecard.compositeScore >= 70 ? "DEPLOY" : "HOLD";

  return {
    recommendation: {
      name: winner.candidateName,
      vendor: winner.candidateSource,
      composite_score: winner.scorecard.compositeScore,
      deploy_verdict: verdict,
      verdict_reason:
        verdict === "DEPLOY"
          ? "Highest composite score with acceptable risk profile."
          : "Composite score below 70 threshold — human review required."
    },
    roi: {
      monthly_value: null,
      annual_value: null,
      implementation_cost: null,
      formula_shown: "Insufficient data for ROI calculation"
    },
    ranked_candidates: ranked.map((r, i) => ({
      rank: i + 1,
      name: r.candidateName,
      composite_score: r.scorecard.compositeScore,
      top_strength: r.candidateSource,
      top_weakness: "Requires sandbox validation"
    })),
    deploy_ready: verdict === "DEPLOY",
    human_approval_required: true,
    notes: "Fallback scorecard — Claude API unavailable."
  };
}

export async function POST(request: Request) {
  let body: ScorecardRequest = {};

  try {
    body = (await request.json()) as ScorecardRequest;
    const ajd = body.ajd;
    const evaluatedCandidates = Array.isArray(body.evaluatedCandidates)
      ? body.evaluatedCandidates
      : [];

    if (!ajd || evaluatedCandidates.length === 0) {
      return NextResponse.json(
        { error: "ajd and evaluatedCandidates are required" },
        { status: 400 }
      );
    }

    const agentPrompt = readFileSync(
      join(process.cwd(), ".claude/prompts/scorecard-agent.md"),
      "utf-8"
    );

    const compactAjd = {
      job_title: ajd.job_title,
      business_need: ajd.business_need,
      kpis: ajd.agent_profile?.kpis ?? [],
      integrations: ajd.integrations
    };

    const compactCandidates = evaluatedCandidates.map((r) => ({
      name: r.candidateName,
      vendor: r.candidateSource,
      composite_score: r.scorecard.compositeScore,
      p3_hallucination_pass: r.scorecard.hallucinationControlScore >= 90,
      p6_security_pass: r.scorecard.securityScore >= 70,
      p4_integration: r.scorecard.integrationStabilityScore,
      top_strength: r.scorecard.compositeScore >= 80 ? "High composite score" : "Competitive pricing",
      top_weakness: r.scorecard.reliabilityScore < 70 ? "Reliability risk" : "Requires governance tuning"
    }));

    const anthropic = createAnthropicClient();

    const requestPayload = {
      max_tokens: 1000,
      temperature: 0.2,
      system: agentPrompt + "\nReturn strict JSON only. No markdown, no prose.",
      messages: [
        {
          role: "user" as const,
          content:
            "Generate the final scorecard for this APA run. " +
            "Return JSON with this exact shape: " +
            "{\"recommendation\":{\"name\":\"\",\"vendor\":\"\",\"composite_score\":0,\"deploy_verdict\":\"DEPLOY\",\"verdict_reason\":\"\"}," +
            "\"roi\":{\"monthly_value\":0,\"annual_value\":0,\"implementation_cost\":0,\"formula_shown\":\"\"}," +
            "\"ranked_candidates\":[{\"rank\":1,\"name\":\"\",\"composite_score\":0,\"top_strength\":\"\",\"top_weakness\":\"\"}]," +
            "\"deploy_ready\":true,\"human_approval_required\":true,\"notes\":\"\"}. " +
            "Set monthly_value to null and notes to \"Insufficient data for ROI calculation\" if AJD KPIs do not provide enough data. " +
            `AJD: ${JSON.stringify(compactAjd)}. ` +
            `Evaluated candidates: ${JSON.stringify(compactCandidates)}.`
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
      throw lastError instanceof Error ? lastError : new Error("All Anthropic models failed for scorecard.");
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const parsed = extractJson(text);

    const result: ScorecardResult = {
      recommendation: {
        name: parsed.recommendation?.name ?? evaluatedCandidates[0]?.candidateName ?? "",
        vendor: parsed.recommendation?.vendor ?? "",
        composite_score: parsed.recommendation?.composite_score ?? 0,
        deploy_verdict: parsed.recommendation?.deploy_verdict ?? "HOLD",
        verdict_reason: parsed.recommendation?.verdict_reason ?? ""
      },
      roi: {
        monthly_value: parsed.roi?.monthly_value ?? null,
        annual_value: parsed.roi?.annual_value ?? null,
        implementation_cost: parsed.roi?.implementation_cost ?? null,
        formula_shown: parsed.roi?.formula_shown ?? "Insufficient data for ROI calculation"
      },
      ranked_candidates: Array.isArray(parsed.ranked_candidates)
        ? parsed.ranked_candidates.map((c, i) => ({
            rank: c.rank ?? i + 1,
            name: c.name ?? "",
            composite_score: c.composite_score ?? 0,
            top_strength: c.top_strength ?? "",
            top_weakness: c.top_weakness ?? ""
          }))
        : [],
      deploy_ready: parsed.deploy_ready ?? false,
      human_approval_required: true,
      notes: parsed.notes ?? ""
    };

    return NextResponse.json({ scorecard: result });
  } catch (error) {
    const candidates = Array.isArray(body.evaluatedCandidates) ? body.evaluatedCandidates : [];

    if (candidates.length > 0) {
      return NextResponse.json({ scorecard: buildFallback(candidates), degraded: true });
    }

    const message = error instanceof Error ? error.message : "Failed to generate scorecard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
