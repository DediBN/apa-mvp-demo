"use client";

import { useMemo, useState } from "react";
import {
  APAEvent,
  APAStatus,
  canTransition,
  createInitialContext,
  reduceAPA,
  validateStateRequirements
} from "../../lib/state-machine";
import { StatusPill } from "../ui/status-pill";

const flowEvents: APAEvent[] = [
  { type: "START_INTAKE" },
  { type: "SUBMIT_AJD" },
  { type: "SHORTLIST_READY", candidateCount: 4 },
  { type: "EVALUATION_DONE" },
  { type: "GENERATE_SCORECARD" }
];

function toneByState(state: APAStatus["state"]): "neutral" | "pass" | "fail" | "action" {
  if (state === "SCORECARD") {
    return "pass";
  }
  if (state === "ERROR") {
    return "fail";
  }
  if (state === "IDLE") {
    return "neutral";
  }
  return "action";
}

export function StateMachinePanel() {
  const [status, setStatus] = useState<APAStatus>({
    state: "IDLE",
    context: createInitialContext()
  });

  const requirementErrors = useMemo(() => validateStateRequirements(status), [status]);

  const dispatch = (event: APAEvent) => {
    if (!canTransition(status.state, event)) {
      return;
    }
    setStatus((previous) => reduceAPA(previous, event));
  };

  return (
    <section className="command-card-elevated p-6 md:p-7 animate-fadeUp">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-mono text-sm uppercase tracking-[0.18em] text-command-muted">Orchestration State Machine</h2>
          <p className="mt-1 text-lg font-semibold text-command-text">4-Step Flow Controller</p>
        </div>
        <StatusPill label={status.state} tone={toneByState(status.state)} />
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="command-card p-4">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-command-muted">Progress</p>
          <p className="mt-3 text-3xl font-semibold text-command-action">{Math.round(status.context.automationCoverage * 100)}%</p>
          <p className="mt-2 text-sm text-command-muted">Automation coverage target: 80%+</p>
        </div>

        <div className="command-card p-4">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-command-muted">Artifacts</p>
          <ul className="mt-3 space-y-2 text-sm text-command-text">
            <li>AJD generated: {String(status.context.artifacts.ajdGenerated)}</li>
            <li>Candidates: {status.context.artifacts.candidateCount}</li>
            <li>Evaluations persisted: {String(status.context.artifacts.evaluationsPersisted)}</li>
            <li>Scorecard generated: {String(status.context.artifacts.scorecardGenerated)}</li>
          </ul>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {flowEvents.map((event) => (
          <button
            key={event.type}
            type="button"
            onClick={() => dispatch(event)}
            className="rounded-lg border border-command-border bg-command-panel px-4 py-2 text-left text-sm text-command-text transition hover:border-command-action hover:text-command-action disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canTransition(status.state, event)}
          >
            {event.type}
          </button>
        ))}

        <button
          type="button"
          onClick={() => dispatch({ type: "FAIL", reason: "Synthetic adapter timeout" })}
          className="rounded-lg border border-command-fail/40 bg-command-panel px-4 py-2 text-left text-sm text-command-fail transition hover:bg-command-fail/10"
        >
          FAIL
        </button>

        <button
          type="button"
          onClick={() => dispatch({ type: "RESET" })}
          className="rounded-lg border border-command-border bg-command-panel px-4 py-2 text-left text-sm text-command-muted transition hover:border-command-action hover:text-command-action"
        >
          RESET
        </button>
      </div>

      <div className="mt-5 command-card p-4">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-command-muted">Validation</p>
        {requirementErrors.length === 0 ? (
          <p className="mt-2 text-sm text-command-pass">No state requirement violations.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-command-fail">
            {requirementErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
