import { readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import { createAnthropicClient } from "../../../../lib/anthropic-client";
import { Candidate } from "../../../../lib/research-agent/mock";

interface ScanRequest {
  jobTitle?: string;
  mission?: string;
  kpis?: Array<{ name: string; target: string }>;
  integrations?: Record<string, string>;
  stack_hint?: string;
  budget_tier?: string;
}

interface ClaudeCandidate {
  name: string;
  vendor: string;
  source_url: string;
  source_tier: number;
  fit_score_prelim: number;
  fit_reason: string;
  integration_match: string[];
  pricing_model: string;
  red_flags: string;
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
    .filter((candidate) => Boolean(candidate.source_url))
    .map((candidate, index) => ({
      candidate_id: `cand_scan_${index + 1}`,
      name: candidate.name?.trim() || `${jobTitle} Candidate ${index + 1}`,
      source: normalizeSource(candidate.vendor || "Hugging Face"),
      fit_score_pre_eval: Math.max(60, Math.min(99, Math.round(candidate.fit_score_prelim || 75))),
      reason_codes: candidate.fit_reason
        ? [candidate.fit_reason, candidate.pricing_model || "Pricing available"].slice(0, 2)
        : ["Capability fit inferred from AJD", "Mission alignment estimated"],
      risk_flags: candidate.red_flags
        ? [candidate.red_flags]
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
    const kpis = body.kpis ?? [];
    const integrations = body.integrations ?? {};
    const stackHint = body.stack_hint?.trim() || "neutral";
    const budgetTier = body.budget_tier?.trim() || "smb";

    const agentPrompt = readFileSync(
      join(process.cwd(), ".claude/prompts/research-agent.md"),
      "utf-8"
    );

    const anthropic = createAnthropicClient();

    const requestPayload = {
      max_tokens: 900,
      temperature: 0.3,
      system: agentPrompt + "\nReturn strict JSON only. No markdown, no prose.",
      messages: [
        {
          role: "user" as const,
          content:
            "Run a sourcing scan for this AJD and return JSON only.\n" +
            `job_title: ${jobTitle}\n` +
            `business_need: ${mission}\n` +
            `kpis: ${JSON.stringify(kpis)}\n` +
            `integrations: ${JSON.stringify(integrations)}\n` +
            `stack_hint: ${stackHint}\n` +
            `budget_tier: ${budgetTier}\n` +
            "Return JSON with this exact shape: " +
            '{"candidates":[{"name":"","vendor":"","source_url":"","source_tier":1,"fit_score_prelim":0,"fit_reason":"","integration_match":[],"pricing_model":"","red_flags":""}]}'
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
