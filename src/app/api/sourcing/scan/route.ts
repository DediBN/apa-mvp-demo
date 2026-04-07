import { NextResponse } from "next/server";
import { createAnthropicClient } from "../../../../lib/anthropic-client";
import { Candidate } from "../../../../lib/research-agent/mock";

interface ScanRequest {
  jobTitle?: string;
  mission?: string;
}

interface ClaudeCandidate {
  name: string;
  source: string;
  fit_score_pre_eval: number;
  reason_codes: string[];
  risk_flags: string[];
}

interface ClaudeScanResult {
  candidates: ClaudeCandidate[];
}

function extractJson(text: string): ClaudeScanResult {
  const direct = text.trim();

  try {
    return JSON.parse(direct) as ClaudeScanResult;
  } catch {
    const start = direct.indexOf("{");
    const end = direct.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(direct.slice(start, end + 1)) as ClaudeScanResult;
    }

    throw new Error("Claude scan did not return valid JSON.");
  }
}

function normalizeSource(source: string): Candidate["source"] {
  const normalized = source.toLowerCase();

  if (normalized.includes("openai")) {
    return "OpenAI";
  }

  if (normalized.includes("crew")) {
    return "CrewAI";
  }

  return "Hugging Face";
}

function fallbackCandidates(jobTitle: string, mission: string): Candidate[] {
  return [
    {
      candidate_id: "cand_scan_fb_01",
      name: `${jobTitle} Copilot`,
      source: "OpenAI",
      fit_score_pre_eval: 85,
      reason_codes: ["Strong agent planning", `Aligned with mission: ${mission.slice(0, 60)}`],
      risk_flags: ["Requires prompt guardrails"]
    },
    {
      candidate_id: "cand_scan_fb_02",
      name: `${jobTitle} Retrieval Agent`,
      source: "Hugging Face",
      fit_score_pre_eval: 80,
      reason_codes: ["Fast retrieval stack", "Good connector ecosystem"],
      risk_flags: ["Needs tuning for tone consistency"]
    },
    {
      candidate_id: "cand_scan_fb_03",
      name: `${jobTitle} Orchestrator`,
      source: "CrewAI",
      fit_score_pre_eval: 82,
      reason_codes: ["Multi-agent orchestration", "Good escalation pathways"],
      risk_flags: ["Higher orchestration complexity"]
    }
  ];
}

function normalizeCandidates(raw: ClaudeCandidate[] | undefined, jobTitle: string, mission: string): Candidate[] {
  const list = Array.isArray(raw) ? raw.slice(0, 5) : [];

  const normalized = list
    .map((candidate, index) => ({
      candidate_id: `cand_scan_${index + 1}`,
      name: candidate.name?.trim() || `${jobTitle} Candidate ${index + 1}`,
      source: normalizeSource(candidate.source || "Hugging Face"),
      fit_score_pre_eval: Math.max(60, Math.min(99, Math.round(candidate.fit_score_pre_eval || 75))),
      reason_codes: Array.isArray(candidate.reason_codes) && candidate.reason_codes.length > 0
        ? candidate.reason_codes.slice(0, 2)
        : ["Capability fit inferred from AJD", "Mission alignment estimated"],
      risk_flags: Array.isArray(candidate.risk_flags) && candidate.risk_flags.length > 0
        ? candidate.risk_flags.slice(0, 2)
        : ["Requires sandbox evaluation"]
    }))
    .filter((candidate) => Boolean(candidate.name));

  if (normalized.length >= 3) {
    return normalized;
  }

  return fallbackCandidates(jobTitle, mission);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ScanRequest;
    const jobTitle = body.jobTitle?.trim() || "Automation Agent";
    const mission = body.mission?.trim() || "Automate workflows with measurable KPI outcomes";

    // Keep this endpoint resilient for demo mode even when mission is partially missing.

    const anthropic = createAnthropicClient();

    const requestPayload = {
      max_tokens: 900,
      temperature: 0.3,
      system:
        "You simulate an AI agent marketplace analyst. Return strict JSON only. No markdown, no prose.",
      messages: [
        {
          role: "user" as const,
          content:
            "Simulate a market scan and return 3 to 5 AI agent candidates for this AJD. " +
            "Return JSON only using this exact shape: " +
            '{"candidates":[{"name":"string","source":"Hugging Face|OpenAI|CrewAI","fit_score_pre_eval":85,"reason_codes":["string","string"],"risk_flags":["string"]}]}. ' +
            `AJD job title: ${jobTitle}. AJD mission: ${mission}.`
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
        response = await anthropic.messages.create({
          model,
          ...requestPayload
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!response) {
      throw lastError instanceof Error ? lastError : new Error("All Anthropic models failed for sourcing scan.");
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const parsed = extractJson(text);
    const candidates = normalizeCandidates(parsed.candidates, jobTitle, mission);

    return NextResponse.json({ candidates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run sourcing scan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
