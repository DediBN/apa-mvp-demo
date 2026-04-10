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
  test_results?: ClaudeEvalTestResult[];
}

interface ClaudeEvalResponse {
  evaluations?: ClaudeEvalItem[];
}

interface ClaudeEvalTestResult {
  test_name?: string;
  status?: "Pass" | "Fail";
  observation?: string;
}

interface NormalizedTestResult {
  test_name: string;
  status: "Pass" | "Fail";
  observation: string;
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

function clampToughRange(value: number): number {
  return Math.max(40, Math.min(95, Math.round(value)));
}

function hashToUnit(seed: string): number {
  let hash = 2166136261;

  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) % 1000) / 1000;
}

function ensureReasonCodeInObservation(candidate: Candidate, observation: string): string {
  const reasonCodes = candidate.reason_codes || [];
  if (reasonCodes.length === 0) {
    return observation;
  }

  const normalizedObservation = observation.toLowerCase();
  const hasReasonReference = reasonCodes.some((code) => normalizedObservation.includes(code.toLowerCase()));

  if (hasReasonReference) {
    return observation;
  }

  return `Reason code reference: ${reasonCodes[0]}. ${observation}`;
}

function deriveDefaultTests(candidate: Candidate, fitScore: number): NormalizedTestResult[] {
  const missionStatus: "Pass" | "Fail" = fitScore >= 72 ? "Pass" : "Fail";
  const kpiStatus: "Pass" | "Fail" = fitScore >= 78 ? "Pass" : "Fail";
  const safetyStatus: "Pass" | "Fail" = fitScore >= 75 ? "Pass" : "Fail";

  return [
    {
      test_name: "Mission Alignment",
      status: missionStatus,
      observation:
        missionStatus === "Pass"
          ? `${candidate.name} demonstrates clear role-fit against the AJD mission.`
          : `${candidate.name} only partially aligns with mission-critical responsibilities.`
    },
    {
      test_name: "KPI Readiness",
      status: kpiStatus,
      observation:
        kpiStatus === "Pass"
          ? `${candidate.name} is likely to hit latency and quality KPI thresholds.`
          : `${candidate.name} shows risk in consistently meeting AJD KPI thresholds.`
    },
    {
      test_name: "Risk & Guardrails",
      status: safetyStatus,
      observation:
        safetyStatus === "Pass"
          ? `${candidate.name} has manageable risk under standard governance controls.`
          : `${candidate.name} needs additional controls before production deployment.`
    }
  ];
}

function normalizeTestResults(
  candidate: Candidate,
  fitScore: number,
  raw: ClaudeEvalTestResult[] | undefined
): NormalizedTestResult[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return deriveDefaultTests(candidate, fitScore);
  }

  const cleaned: NormalizedTestResult[] = raw
    .map((test, index): NormalizedTestResult => {
      const name = (test.test_name || `Test ${index + 1}`).trim();
      const observation = (test.observation || "Observation unavailable.").trim();
      const status: "Pass" | "Fail" = test.status === "Fail" ? "Fail" : "Pass";

      return {
        test_name: name,
        status,
        observation: ensureReasonCodeInObservation(candidate, observation)
      };
    })
    .filter((test) => test.test_name.length > 0 && test.observation.length > 0);

  if (cleaned.length === 0) {
    return deriveDefaultTests(candidate, fitScore);
  }

  return cleaned;
}

function normalizeEvaluations(candidates: Candidate[], raw: ClaudeEvalItem[] | undefined, runSeed: number) {
  const byId = new Map<string, ClaudeEvalItem>();

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item.candidate_id) {
        byId.set(item.candidate_id, item);
      }
    }
  }

  const provisional = candidates.map((candidate) => {
    const item = byId.get(candidate.candidate_id);
    const fitScore = clampToughRange(item?.fit_score ?? (candidate.fit_score_pre_eval ?? 75));

    return {
      candidate,
      item,
      fitScore
    };
  });

  const ranked = [...provisional].sort((a, b) => b.fitScore - a.fitScore);
  const spreadById = new Map<string, number>();

  ranked.forEach((entry, index) => {
    const n = ranked.length;
    const position = n > 1 ? index / (n - 1) : 0.5;
    const baseScore = 95 - position * 55;
    const jitter = (hashToUnit(`${runSeed}:${entry.candidate.candidate_id}:spread`) - 0.5) * 6;
    const spreadScore = clampToughRange(baseScore + jitter);
    spreadById.set(entry.candidate.candidate_id, spreadScore);
  });

  return candidates.map((candidate) => {
    const item = byId.get(candidate.candidate_id);
    const fitScore = spreadById.get(candidate.candidate_id) ?? clampToughRange(candidate.fit_score_pre_eval ?? 75);

    return {
      candidate_id: candidate.candidate_id,
      candidate_name: candidate.name,
      fit_score: fitScore,
      analysis:
        item?.analysis?.trim() ||
        `${candidate.name} aligns with core AJD requirements and shows strong implementation potential. ` +
          `Primary risk centers on integration hardening and governance controls under production load.`,
      test_results: normalizeTestResults(candidate, fitScore, item?.test_results)
    };
  });
}

function buildFallbackEvaluations(candidates: Candidate[]) {
  const runSeed = Math.floor(Math.random() * 1_000_000_000);

  return candidates.map((candidate, index) => {
    const n = Math.max(1, candidates.length);
    const position = n > 1 ? index / (n - 1) : 0.5;
    const baseScore = 95 - position * 55;
    const jitter = (hashToUnit(`${runSeed}:${candidate.candidate_id}:fallback`) - 0.5) * 8;
    const fitScore = clampToughRange(baseScore + jitter);

    return {
      candidate_id: candidate.candidate_id,
      candidate_name: candidate.name,
      fit_score: fitScore,
      analysis:
        `Fallback evaluation generated for ${candidate.name}. ` +
        "Live model evaluation failed, so baseline scoring was used to keep UI operational.",
      test_results: [
        {
          test_name: "Core Logic",
          status: "Pass" as const,
          observation: "Fallback test generated after upstream evaluation failure."
        },
        {
          test_name: "Response Quality",
          status: "Pass" as const,
          observation: "Fallback test generated after upstream evaluation failure."
        },
        {
          test_name: "Latency",
          status: "Pass" as const,
          observation: "Fallback test generated after upstream evaluation failure."
        }
      ]
    };
  });
}

export async function POST(request: Request) {
  let body: EvaluationRequest = {};

  try {
    const runSeed = Math.floor(Math.random() * 1_000_000_000);
    body = (await request.json()) as EvaluationRequest;
    const ajd = body.ajd;
    const candidates = Array.isArray(body.candidates) ? body.candidates : [];

    if (!ajd || candidates.length === 0) {
      return NextResponse.json({ evaluations: buildFallbackEvaluations(candidates) });
    }

    const anthropic = createAnthropicClient();
    const compactAjd = {
      job_title: ajd.job_title,
      mission: (ajd.agent_profile?.mission || ajd.business_need || "").slice(0, 280),
      kpis: (ajd.agent_profile?.kpis || []).slice(0, 3).map((kpi) => ({
        name: kpi.name,
        target: kpi.target
      }))
    };
    const compactCandidates = candidates.slice(0, 6).map((candidate) => ({
      candidate_id: candidate.candidate_id,
      candidate_name: candidate.name,
      source: candidate.source,
      fit_score_pre_eval: candidate.fit_score_pre_eval,
      reason_codes: (candidate.reason_codes || []).slice(0, 2)
    }));

    const requestPayload = {
      max_tokens: 700,
      temperature: 0.2,
      system:
        "You are a tough evaluator. Do not give safe, middle-of-the-road scores. Identify clear winners and losers. " +
        "Use full fit_score range 40-95. Return strict JSON only.",
      messages: [
        {
          role: "user" as const,
          content:
            "Evaluate candidates against AJD mission and KPIs. " +
            "Return JSON: {\"evaluations\":[{\"candidate_id\":\"string\",\"candidate_name\":\"string\",\"analysis\":\"string\",\"fit_score\":85,\"test_results\":[{\"test_name\":\"Mission Alignment\",\"status\":\"Pass\",\"observation\":\"short\"},{\"test_name\":\"KPI Readiness\",\"status\":\"Pass\",\"observation\":\"short\"},{\"test_name\":\"Risk & Guardrails\",\"status\":\"Fail\",\"observation\":\"short\"}]}]}. " +
            "Each candidate must include at least 3 test_results. " +
            "Each test observation must reference at least one specific reason_codes detail from that candidate. " +
            "Do not return tied fit_score values across candidates. " +
            `AJD: ${JSON.stringify(compactAjd)}. ` +
            `Candidates: ${JSON.stringify(compactCandidates)}. ` +
            `run_seed: ${runSeed}.`
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
    const evaluations = normalizeEvaluations(candidates, parsed.evaluations, runSeed);

    return NextResponse.json({ evaluations });
  } catch (error) {
    console.log("SERVER_ERROR:", error);

    const candidates = Array.isArray(body.candidates) ? body.candidates : [];
    const fallbackEvaluations = buildFallbackEvaluations(candidates);

    return NextResponse.json({
      evaluations: fallbackEvaluations,
      degraded: true,
      error: error instanceof Error ? error.message : "Failed to run evaluation"
    });
  }
}
