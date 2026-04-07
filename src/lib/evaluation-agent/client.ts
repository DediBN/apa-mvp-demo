import { AJD } from "../intake-agent/mock";
import { Candidate } from "../research-agent/mock";

export interface EvaluationApiResult {
  candidate_id: string;
  candidate_name: string;
  analysis: string;
  fit_score: number;
}

export async function runEvaluation(ajd: AJD, candidates: Candidate[]): Promise<EvaluationApiResult[]> {
  const response = await fetch("/api/evaluation/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ajd, candidates })
  });

  const data = (await response.json()) as { evaluations?: EvaluationApiResult[]; error?: string };

  if (!response.ok || !Array.isArray(data.evaluations)) {
    throw new Error(data.error || "Failed to run evaluation");
  }

  return data.evaluations;
}
