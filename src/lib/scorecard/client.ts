import { AJD } from "../intake-agent/mock";
import { CandidateEvaluationResult } from "../evaluation-agent/mock";
import { ScorecardResult } from "../../app/api/scorecard/generate/route";

export type { ScorecardResult };

export async function runScorecardAgent(
  ajd: AJD,
  evaluatedCandidates: CandidateEvaluationResult[]
): Promise<ScorecardResult> {
  const response = await fetch("/api/scorecard/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ajd, evaluatedCandidates })
  });

  const data = (await response.json()) as { scorecard?: ScorecardResult; error?: string };

  if (!response.ok || !data.scorecard) {
    throw new Error(data.error || "Failed to generate scorecard");
  }

  return data.scorecard;
}
