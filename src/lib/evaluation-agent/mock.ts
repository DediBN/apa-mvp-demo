import { Candidate } from "../research-agent/mock";

export type ScenarioKind = "objection" | "hallucination";
export type ScenarioStatus = "PASS" | "FAIL";

export interface ScenarioEvent {
  id: string;
  label: string;
  kind: ScenarioKind;
  status: ScenarioStatus;
}

export interface CandidateScorecard {
  turingScore: number;
  securityScore: number;
  reliabilityScore: number;
  objectionHandlingScore: number;
  hallucinationControlScore: number;
  integrationStabilityScore: number;
  costEfficiencyScore: number;
  domainExpertiseScore: number;
  compositeScore: number;
}

export interface CandidateEvaluationResult {
  candidateId: string;
  candidateName: string;
  candidateSource: "OpenAI" | "Hugging Face" | "CrewAI";
  objectionPasses: number;
  hallucinationPasses: number;
  scorecard: CandidateScorecard;
}

export interface LaneSnapshot {
  candidate: Candidate;
  objectionDone: number;
  hallucinationDone: number;
  objectionPasses: number;
  hallucinationPasses: number;
}

const OBJECTION_TOTAL = 40;
const HALLUCINATION_TOTAL = 30;

export function totals() {
  return {
    objection: OBJECTION_TOTAL,
    hallucination: HALLUCINATION_TOTAL
  };
}

function hashToUnit(seed: string): number {
  let hash = 2166136261;

  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) % 1000) / 1000;
}

export function nextScenarioEvent(snapshot: LaneSnapshot): ScenarioEvent | null {
  const { candidate, objectionDone, hallucinationDone } = snapshot;

  if (objectionDone < OBJECTION_TOTAL) {
    const index = objectionDone + 1;
    const qualityBoost = candidate.fit_score_pre_eval / 220;
    const threshold = 0.33 + qualityBoost;
    const roll = hashToUnit(`${candidate.candidate_id}:objection:${index}`);
    const status: ScenarioStatus = roll > threshold ? "FAIL" : "PASS";

    return {
      id: `${candidate.candidate_id}-obj-${index}`,
      kind: "objection",
      status,
      label: `Objection scenario ${index}/${OBJECTION_TOTAL}`
    };
  }

  if (hallucinationDone < HALLUCINATION_TOTAL) {
    const index = hallucinationDone + 1;
    const qualityBoost = candidate.fit_score_pre_eval / 250;
    const threshold = 0.30 + qualityBoost;
    const roll = hashToUnit(`${candidate.candidate_id}:hallucination:${index}`);
    const status: ScenarioStatus = roll > threshold ? "FAIL" : "PASS";

    return {
      id: `${candidate.candidate_id}-hal-${index}`,
      kind: "hallucination",
      status,
      label: `Hallucination check ${index}/${HALLUCINATION_TOTAL}`
    };
  }

  return null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildScorecard(input: {
  candidate: Candidate;
  objectionPasses: number;
  hallucinationPasses: number;
}): CandidateScorecard {
  const objectionRate = input.objectionPasses / OBJECTION_TOTAL;
  const hallucinationRate = input.hallucinationPasses / HALLUCINATION_TOTAL;
  const fit = input.candidate.fit_score_pre_eval;

  const turingScore = clamp(40 + fit * 0.5 + objectionRate * 20);
  const securityScore = clamp(50 + hallucinationRate * 30 + fit * 0.15);
  const reliabilityScore = clamp(42 + objectionRate * 28 + hallucinationRate * 20);
  const objectionHandlingScore = clamp(objectionRate * 100);
  const hallucinationControlScore = clamp(hallucinationRate * 100);
  const integrationStabilityScore = clamp(45 + fit * 0.4 + objectionRate * 18);
  const costEfficiencyScore = clamp(90 - fit * 0.25 + hallucinationRate * 10);
  const domainExpertiseScore = clamp(38 + fit * 0.45 + hallucinationRate * 22);

  const compositeScore = clamp(
    turingScore * 0.15 +
      securityScore * 0.10 +
      reliabilityScore * 0.10 +
      objectionHandlingScore * 0.20 +
      hallucinationControlScore * 0.20 +
      integrationStabilityScore * 0.15 +
      costEfficiencyScore * 0.05 +
      domainExpertiseScore * 0.05
  );

  return {
    turingScore,
    securityScore,
    reliabilityScore,
    objectionHandlingScore,
    hallucinationControlScore,
    integrationStabilityScore,
    costEfficiencyScore,
    domainExpertiseScore,
    compositeScore
  };
}
