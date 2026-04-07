export type APAState =
  | "IDLE"
  | "INTAKE"
  | "RESEARCH"
  | "EVALUATING"
  | "COMPLETE"
  | "SCORECARD"
  | "ERROR";

export type APAEvent =
  | { type: "START_INTAKE" }
  | { type: "SUBMIT_AJD" }
  | { type: "SHORTLIST_READY"; candidateCount: number }
  | { type: "EVALUATION_DONE" }
  | { type: "GENERATE_SCORECARD" }
  | { type: "RESET" }
  | { type: "CANCEL" }
  | { type: "FAIL"; reason: string };

export interface RunArtifacts {
  ajdGenerated: boolean;
  candidateCount: number;
  evaluationsPersisted: boolean;
  scorecardGenerated: boolean;
}

export interface APAContext {
  runId: string;
  errors: string[];
  automationCoverage: number;
  artifacts: RunArtifacts;
}

export interface APAStatus {
  state: APAState;
  context: APAContext;
}
