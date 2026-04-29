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

type SourcingDomain = "support" | "sales" | "operations" | "finance" | "general";

interface RealAgentRecord {
  id?: unknown;
  name?: unknown;
  title?: unknown;
  provider?: unknown;
  source?: unknown;
  vendor?: unknown;
  domain?: unknown;
  description?: unknown;
  capabilities?: unknown;
  tags?: unknown;
  fit_score_pre_eval?: unknown;
  fitScorePreEval?: unknown;
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

function detectDomain(text: string): SourcingDomain {
  const normalized = text.toLowerCase();

  if (normalized.includes("support") || normalized.includes("customer") || normalized.includes("email")) {
    return "support";
  }

  if (normalized.includes("sales") || normalized.includes("lead") || normalized.includes("pipeline")) {
    return "sales";
  }

  if (normalized.includes("operations") || normalized.includes("workflow") || normalized.includes("process")) {
    return "operations";
  }

  if (normalized.includes("finance") || normalized.includes("invoice") || normalized.includes("billing")) {
    return "finance";
  }

  return "general";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function parseRealAgentDataset(): RealAgentRecord[] {
  try {
    const datasetPath = join(process.cwd(), "src/data/real-agents.json");
    const raw = readFileSync(datasetPath, "utf-8").trim();

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return parsed as RealAgentRecord[];
    }

    if (parsed && typeof parsed === "object") {
      const withAgents = parsed as { agents?: unknown; data?: unknown; items?: unknown };
      if (Array.isArray(withAgents.agents)) {
        return withAgents.agents as RealAgentRecord[];
      }
      if (Array.isArray(withAgents.data)) {
        return withAgents.data as RealAgentRecord[];
      }
      if (Array.isArray(withAgents.items)) {
        return withAgents.items as RealAgentRecord[];
      }
    }

    return [];
  } catch {
    return [];
  }
}

function domainScore(record: RealAgentRecord, domain: SourcingDomain): number {
  const textBlob = [
    asString(record.domain),
    asString(record.name),
    asString(record.title),
    asString(record.description),
    ...asStringArray(record.capabilities),
    ...asStringArray(record.tags)
  ]
    .join(" ")
    .toLowerCase();

  if (domain === "general") {
    return 1;
  }

  const synonyms: Record<SourcingDomain, string[]> = {
    support: ["support", "customer", "email", "ticket"],
    sales: ["sales", "lead", "pipeline", "sdr"],
    operations: ["operations", "workflow", "process", "logistics"],
    finance: ["finance", "invoice", "billing", "audit"],
    general: ["general"]
  };

  const directHit = asString(record.domain).toLowerCase() === domain;
  const keywordHits = synonyms[domain].reduce((acc, word) => (textBlob.includes(word) ? acc + 1 : acc), 0);

  return (directHit ? 3 : 0) + keywordHits;
}

function toCandidate(record: RealAgentRecord, index: number, domain: SourcingDomain): Candidate {
  const name = asString(record.name) || asString(record.title) || `Curated Agent ${index + 1}`;
  const providerRaw = asString(record.provider) || asString(record.source) || asString(record.vendor) || "Hugging Face";
  const description = asString(record.description);
  const capabilities = asStringArray(record.capabilities);
  const tags = asStringArray(record.tags);
  const id = asString(record.id) || `cand_real_${domain}_${index + 1}`;
  const providedFit = Number(record.fit_score_pre_eval ?? record.fitScorePreEval);
  const fitScore = Number.isFinite(providedFit)
    ? Math.max(60, Math.min(99, Math.round(providedFit)))
    : Math.max(68, Math.min(94, 72 + domainScore(record, domain) * 4));

  return {
    candidate_id: id,
    name,
    source: normalizeSource(providerRaw),
    fit_score_pre_eval: fitScore,
    reason_codes: [
      description || "Curated from real agent catalog",
      ...(capabilities.length > 0 ? [capabilities[0]] : tags.length > 0 ? [tags[0]] : ["Domain capability match"]) 
    ].slice(0, 2),
    risk_flags: ["Requires sandbox validation before deployment"]
  };
}

function shortlistFromRealAgents(domain: SourcingDomain): Candidate[] {
  const records = parseRealAgentDataset();

  const scored = records
    .map((record, index) => ({
      record,
      index,
      score: domainScore(record, domain)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 5).map((entry, mappedIndex) => toCandidate(entry.record, mappedIndex, domain));
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
    console.log("SCAN ROUTE HIT");
    const body = (await request.json()) as ScanRequest;
    const jobTitle = body.jobTitle?.trim() || "Automation Agent";
    const mission = body.mission?.trim() || "Automate workflows with measurable KPI outcomes";
    const kpis = body.kpis ?? [];
    const integrations = body.integrations ?? {};
    const stackHint = body.stack_hint?.trim() || "neutral";
    const budgetTier = body.budget_tier?.trim() || "smb";

    const detectedDomain = detectDomain(`${jobTitle} ${mission}`);
    const realCandidates = shortlistFromRealAgents(detectedDomain);

    if (realCandidates.length >= 3) {
      const candidates = realCandidates.slice(0, 5);
      console.log("SCAN RETURNING", candidates.length);
      return NextResponse.json({ candidates });
    }

    if (realCandidates.length === 0) {
      const candidates = fallbackCandidates(jobTitle, mission);
      console.log("SCAN RETURNING", candidates.length);
      return NextResponse.json({ candidates });
    }

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
    const scannedCandidates = normalizeCandidates(parsed.candidates, jobTitle, mission);
    const existingIds = new Set(realCandidates.map((candidate) => candidate.candidate_id));
    const toppedUp = scannedCandidates
      .filter((candidate) => !existingIds.has(candidate.candidate_id))
      .slice(0, Math.max(0, 5 - realCandidates.length));

    const candidates = [...realCandidates, ...toppedUp];

    if (candidates.length >= 3) {
      const responseCandidates = candidates.slice(0, 5);
      console.log("SCAN RETURNING", responseCandidates.length);
      return NextResponse.json({ candidates: responseCandidates });
    }

    const fallback = fallbackCandidates(jobTitle, mission)
      .filter((candidate) => !existingIds.has(candidate.candidate_id))
      .slice(0, Math.max(0, 5 - candidates.length));

    const responseCandidates = [...candidates, ...fallback].slice(0, 5);
    console.log("SCAN RETURNING", responseCandidates.length);
    return NextResponse.json({ candidates: responseCandidates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run sourcing scan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
