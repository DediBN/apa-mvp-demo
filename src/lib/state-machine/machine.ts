import { APAContext, APAEvent, APAState, APAStatus } from "./types";

const REQUIRED_AUTOMATION_COVERAGE = 0.8;

export function createInitialContext(runId = "demo-run-001"): APAContext {
  return {
    runId,
    errors: [],
    automationCoverage: 0,
    artifacts: {
      ajdGenerated: false,
      candidateCount: 0,
      evaluationsPersisted: false,
      scorecardGenerated: false
    }
  };
}

export function reduceAPA(status: APAStatus, event: APAEvent): APAStatus {
  const { state, context } = status;

  if (event.type === "FAIL") {
    return {
      state: "ERROR",
      context: {
        ...context,
        errors: [...context.errors, event.reason]
      }
    };
  }

  switch (state) {
    case "IDLE": {
      if (event.type === "START_INTAKE") {
        return {
          state: "INTAKE",
          context: {
            ...context,
            automationCoverage: 0.2
          }
        };
      }
      return status;
    }

    case "INTAKE": {
      if (event.type === "SUBMIT_AJD") {
        return {
          state: "RESEARCH",
          context: {
            ...context,
            automationCoverage: 0.4,
            artifacts: {
              ...context.artifacts,
              ajdGenerated: true
            }
          }
        };
      }
      if (event.type === "CANCEL") {
        return {
          state: "IDLE",
          context: createInitialContext(context.runId)
        };
      }
      return status;
    }

    case "RESEARCH": {
      if (event.type === "SHORTLIST_READY") {
        return {
          state: "EVALUATING",
          context: {
            ...context,
            automationCoverage: 0.6,
            artifacts: {
              ...context.artifacts,
              candidateCount: event.candidateCount
            }
          }
        };
      }
      return status;
    }

    case "EVALUATING": {
      if (event.type === "EVALUATION_DONE") {
        return {
          state: "COMPLETE",
          context: {
            ...context,
            automationCoverage: 0.85,
            artifacts: {
              ...context.artifacts,
              evaluationsPersisted: true
            }
          }
        };
      }
      return status;
    }

    case "COMPLETE": {
      if (event.type === "GENERATE_SCORECARD") {
        return {
          state: "SCORECARD",
          context: {
            ...context,
            artifacts: {
              ...context.artifacts,
              scorecardGenerated: true
            }
          }
        };
      }
      return status;
    }

    case "SCORECARD": {
      if (event.type === "RESET") {
        return {
          state: "IDLE",
          context: createInitialContext(context.runId)
        };
      }
      return status;
    }

    case "ERROR": {
      if (event.type === "RESET") {
        return {
          state: "IDLE",
          context: createInitialContext(context.runId)
        };
      }
      return status;
    }

    default:
      return status;
  }
}

export function canTransition(state: APAState, event: APAEvent): boolean {
  if (event.type === "FAIL") {
    return true;
  }

  const allowed: Record<APAState, APAEvent["type"][]> = {
    IDLE: ["START_INTAKE"],
    INTAKE: ["SUBMIT_AJD", "CANCEL"],
    RESEARCH: ["SHORTLIST_READY"],
    EVALUATING: ["EVALUATION_DONE"],
    COMPLETE: ["GENERATE_SCORECARD"],
    SCORECARD: ["RESET"],
    ERROR: ["RESET"]
  };

  return allowed[state].includes(event.type);
}

export function validateStateRequirements(status: APAStatus): string[] {
  const errors: string[] = [];
  const { state, context } = status;

  if ((state === "RESEARCH" || state === "EVALUATING" || state === "COMPLETE" || state === "SCORECARD") && !context.artifacts.ajdGenerated) {
    errors.push("AJD must be generated before leaving INTAKE.");
  }

  if ((state === "EVALUATING" || state === "COMPLETE" || state === "SCORECARD") && context.artifacts.candidateCount < 3) {
    errors.push("At least 3 candidates are required before EVALUATING.");
  }

  if ((state === "COMPLETE" || state === "SCORECARD") && !context.artifacts.evaluationsPersisted) {
    errors.push("Evaluations must be persisted before COMPLETE.");
  }

  if (state === "SCORECARD" && !context.artifacts.scorecardGenerated) {
    errors.push("Scorecard artifact is missing.");
  }

  if (state === "COMPLETE" && context.automationCoverage < REQUIRED_AUTOMATION_COVERAGE) {
    errors.push("Automation coverage is below 80% threshold.");
  }

  return errors;
}
