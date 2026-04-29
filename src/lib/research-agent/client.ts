import { Candidate } from "./mock";

interface ScanInput {
  jobTitle: string;
  mission: string;
  kpis?: Array<{ name: string; target: string }>;
  integrations?: Record<string, string>;
  stack_hint?: string;
  budget_tier?: string;
}

interface ApiCandidate {
  candidate_id?: unknown;
  candidateId?: unknown;
  name?: unknown;
  source?: unknown;
  vendor?: unknown;
  provider?: unknown;
  fit_score_pre_eval?: unknown;
  fitScorePreEval?: unknown;
  reason_codes?: unknown;
  reasonCodes?: unknown;
  risk_flags?: unknown;
  riskFlags?: unknown;
}

function normalizeSource(value: unknown): Candidate["source"] {
  const text = String(value ?? "").toLowerCase();

  if (text.includes("openai")) {
    return "OpenAI";
  }

  if (text.includes("crew")) {
    return "CrewAI";
  }

  return "Hugging Face";
}

function toStringArray(value: unknown, fallback: string): string[] {
  if (!Array.isArray(value)) {
    return [fallback];
  }

  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);

  return normalized.length > 0 ? normalized : [fallback];
}

function mapCandidate(raw: ApiCandidate, index: number): Candidate {
  const name = typeof raw.name === "string" && raw.name.trim().length > 0
    ? raw.name.trim()
    : `Candidate ${index + 1}`;

  const idValue = raw.candidate_id ?? raw.candidateId;
  const candidate_id = typeof idValue === "string" && idValue.trim().length > 0
    ? idValue.trim()
    : `cand_api_${index + 1}`;

  const fitRaw = Number(raw.fit_score_pre_eval ?? raw.fitScorePreEval);
  const fit_score_pre_eval = Number.isFinite(fitRaw)
    ? Math.max(0, Math.min(100, Math.round(fitRaw)))
    : 0;

  return {
    candidate_id,
    name,
    source: normalizeSource(raw.source ?? raw.vendor ?? raw.provider),
    fit_score_pre_eval,
    reason_codes: toStringArray(raw.reason_codes ?? raw.reasonCodes, "Candidate matched AJD criteria"),
    risk_flags: toStringArray(raw.risk_flags ?? raw.riskFlags, "Requires evaluation")
  };
}

export async function runSourcingScan(input: ScanInput): Promise<Candidate[]> {
  const response = await fetch("/api/sourcing/scan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  const data = (await response.json()) as { candidates?: ApiCandidate[]; error?: string };

  if (!response.ok || !Array.isArray(data.candidates)) {
    throw new Error(data.error || "Failed to run sourcing scan");
  }

  return data.candidates.map((candidate, index) => mapCandidate(candidate, index));
}
