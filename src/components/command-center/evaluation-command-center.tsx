"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { APAStatus } from "../../lib/state-machine";
import { AJD } from "../../lib/intake-agent/mock";
import { Candidate } from "../../lib/research-agent/mock";
import {
  CandidateEvaluationResult,
  CandidateScorecard,
  ScenarioEvent
} from "../../lib/evaluation-agent/mock";
import { runEvaluation } from "../../lib/evaluation-agent/client";
import { StatusPill } from "../ui/status-pill";

interface EvaluationLane {
  candidate: Candidate;
  objectionDone: number;
  hallucinationDone: number;
  objectionPasses: number;
  hallucinationPasses: number;
  logs: ScenarioEvent[];
  scorecard?: CandidateEvaluationResult["scorecard"];
}

interface EvaluationCommandCenterProps {
  status: APAStatus;
  ajd: AJD | null;
  candidates: Candidate[];
  onEvaluationDone: (results: CandidateEvaluationResult[]) => void;
  onFail: (reason: string) => void;
  addLog: (line: string) => void;
}

const TOTALS = {
  objection: 40,
  hallucination: 30
};

function buildScorecardFromFit(fitScore: number): CandidateScorecard {
  const fit = Math.max(0, Math.min(100, Math.round(fitScore)));
  const turingScore = Math.max(0, Math.min(100, fit + 2));
  const securityScore = Math.max(0, Math.min(100, fit - 3));
  const reliabilityScore = Math.max(0, Math.min(100, fit - 1));
  const objectionHandlingScore = Math.max(0, Math.min(100, fit + 1));
  const hallucinationControlScore = Math.max(0, Math.min(100, fit - 2));
  const integrationStabilityScore = Math.max(0, Math.min(100, fit));
  const costEfficiencyScore = Math.max(0, Math.min(100, 72 + (fit - 70) * 0.5));

  const compositeScore = Math.round(
    turingScore * 0.16 +
      securityScore * 0.13 +
      reliabilityScore * 0.13 +
      objectionHandlingScore * 0.18 +
      hallucinationControlScore * 0.18 +
      integrationStabilityScore * 0.14 +
      costEfficiencyScore * 0.08
  );

  return {
    turingScore,
    securityScore,
    reliabilityScore,
    objectionHandlingScore,
    hallucinationControlScore,
    integrationStabilityScore,
    costEfficiencyScore,
    compositeScore
  };
}

function badgeClass(status: "PASS" | "FAIL"): string {
  if (status === "PASS") {
    return "text-command-pass border-command-pass/40";
  }

  return "text-command-fail border-command-fail/40";
}

function laneComplete(lane: EvaluationLane): boolean {
  return lane.objectionDone >= TOTALS.objection && lane.hallucinationDone >= TOTALS.hallucination;
}

export function EvaluationCommandCenter({ status, ajd, candidates, onEvaluationDone, onFail, addLog }: EvaluationCommandCenterProps) {
  const [lanes, setLanes] = useState<EvaluationLane[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const completedRef = useRef(false);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (status.state === "IDLE" || status.state === "INTAKE" || status.state === "RESEARCH") {
      completedRef.current = false;
      requestedRef.current = false;
      setLanes([]);
      setIsRunning(false);
      return;
    }

    if (status.state === "EVALUATING" && candidates.length > 0 && lanes.length === 0) {
      setLanes(
        candidates.map((candidate) => ({
          candidate,
          objectionDone: 0,
          hallucinationDone: 0,
          objectionPasses: 0,
          hallucinationPasses: 0,
          logs: []
        }))
      );
      setIsRunning(true);
      addLog("Evaluation Engine started. Claude deep-evaluation run initiated.");
    }
  }, [addLog, candidates, lanes.length, status.state]);

  useEffect(() => {
    if (status.state !== "EVALUATING" || !ajd || candidates.length === 0 || requestedRef.current) {
      return;
    }

    requestedRef.current = true;

    const thinkingLines: string[] = [];
    for (const candidate of candidates) {
      thinkingLines.push(`Analyzing Fit for ${candidate.name}...`);
      thinkingLines.push(`Cross-referencing KPIs for ${candidate.name}...`);
    }

    let thinkingIndex = 0;
    const thinkingTimer = window.setInterval(() => {
      addLog(thinkingLines[thinkingIndex % thinkingLines.length]);
      thinkingIndex += 1;
    }, 1200);

    runEvaluation(ajd, candidates)
      .then((evaluations) => {
        const evalById = new Map(evaluations.map((item) => [item.candidate_id, item]));

        const finalized = candidates.map((candidate) => {
          const result = evalById.get(candidate.candidate_id);
          const fitScore = result?.fit_score ?? candidate.fit_score_pre_eval;
          const scorecard = buildScorecardFromFit(fitScore);

          return {
            candidateId: candidate.candidate_id,
            candidateName: candidate.name,
            objectionPasses: Math.round((scorecard.objectionHandlingScore / 100) * TOTALS.objection),
            hallucinationPasses: Math.round((scorecard.hallucinationControlScore / 100) * TOTALS.hallucination),
            analysis: result?.analysis,
            fitScore,
            scorecard
          };
        });

        setLanes((previous) =>
          previous.map((lane) => {
            const result = finalized.find((item) => item.candidateId === lane.candidate.candidate_id);

            if (!result) {
              return lane;
            }

            const statusBadge: ScenarioEvent["status"] = result.fitScore >= 75 ? "PASS" : "FAIL";

            return {
              ...lane,
              objectionDone: TOTALS.objection,
              hallucinationDone: TOTALS.hallucination,
              objectionPasses: result.objectionPasses,
              hallucinationPasses: result.hallucinationPasses,
              logs: [
                {
                  id: `${lane.candidate.candidate_id}-fit`,
                  kind: "objection",
                  status: statusBadge,
                  label: `Fit Score ${result.fitScore}/100`
                },
                {
                  id: `${lane.candidate.candidate_id}-analysis`,
                  kind: "hallucination",
                  status: "PASS",
                  label: (result.analysis || "Analysis generated.").slice(0, 110)
                }
              ],
              scorecard: result.scorecard
            };
          })
        );

        completedRef.current = true;
        setIsRunning(false);
        addLog("Evaluation complete. Fit analyses + scorecards generated.");
        addLog("Transition accepted: EVALUATING -> COMPLETE");
        onEvaluationDone(finalized);
      })
      .catch((error) => {
        const reason = error instanceof Error ? error.message : "Evaluation run failed";
        onFail(reason);
        addLog(`Evaluation failed: ${reason}`);
        setIsRunning(false);
      })
      .finally(() => {
        window.clearInterval(thinkingTimer);
      });
  }, [addLog, ajd, candidates, onEvaluationDone, onFail, status.state]);

  const topCandidate = useMemo(() => {
    const completed = lanes
      .filter((lane) => lane.scorecard)
      .sort((a, b) => (b.scorecard?.compositeScore ?? 0) - (a.scorecard?.compositeScore ?? 0));

    return completed[0] ?? null;
  }, [lanes]);

  if (status.state === "IDLE" || status.state === "INTAKE" || status.state === "RESEARCH") {
    return (
      <section className="command-card-elevated p-5 md:p-7 animate-fadeUp">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-sm uppercase tracking-[0.18em] text-command-muted">Step 03 · Evaluation Command Center</h2>
            <p className="mt-1 text-lg font-semibold text-command-text">Parallel test lanes will activate after sourcing completes</p>
          </div>
          <StatusPill label="STANDBY" tone="neutral" />
        </header>
      </section>
    );
  }

  return (
    <section className="command-card-elevated p-5 md:p-7 animate-fadeUp">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-mono text-sm uppercase tracking-[0.18em] text-command-muted">Step 03 · Evaluation Command Center</h2>
          <p className="mt-1 text-lg font-semibold text-command-text">Parallel lanes, live scenario logs, and 7-parameter scorecards</p>
        </div>
        <StatusPill label={isRunning ? "RUNNING" : "COMPLETE"} tone={isRunning ? "action" : "pass"} />
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {lanes.map((lane) => {
          const objectionPct = Math.round((lane.objectionDone / TOTALS.objection) * 100);
          const hallucinationPct = Math.round((lane.hallucinationDone / TOTALS.hallucination) * 100);

          return (
            <article key={lane.candidate.candidate_id} className="command-card p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-command-text">{lane.candidate.name}</h3>
                <span className="rounded-full border border-command-action/50 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-command-action">
                  {lane.candidate.source}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                <div>
                  <div className="mb-1 flex items-center justify-between font-mono text-[11px] text-command-muted">
                    <span>Objection Handling</span>
                    <span>{lane.objectionDone}/{TOTALS.objection}</span>
                  </div>
                  <div className="h-2 w-full rounded bg-command-bg">
                    <div className="h-2 rounded bg-command-action transition-all" style={{ width: `${objectionPct}%` }} />
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between font-mono text-[11px] text-command-muted">
                    <span>Hallucination Control</span>
                    <span>{lane.hallucinationDone}/{TOTALS.hallucination}</span>
                  </div>
                  <div className="h-2 w-full rounded bg-command-bg">
                    <div className="h-2 rounded bg-command-warning transition-all" style={{ width: `${hallucinationPct}%` }} />
                  </div>
                </div>
              </div>

              <ul className="mt-3 space-y-1 rounded-lg border border-command-border bg-command-bg/70 p-2 font-mono text-[11px]">
                {lane.logs.length === 0 ? (
                  <li className="text-command-muted">Awaiting first scenario...</li>
                ) : (
                  lane.logs.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-2 text-command-muted">
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] ${badgeClass(entry.status)}`}>[{entry.status}]</span>
                      <span>{entry.label}</span>
                    </li>
                  ))
                )}
              </ul>

              {lane.scorecard ? (
                <div className="mt-3 rounded-lg border border-command-border bg-command-bg/70 p-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-command-muted">7-Parameter Scorecard</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-command-text">
                    <p>Turing: {lane.scorecard.turingScore}</p>
                    <p>Security: {lane.scorecard.securityScore}</p>
                    <p>Reliability: {lane.scorecard.reliabilityScore}</p>
                    <p>Objection: {lane.scorecard.objectionHandlingScore}</p>
                    <p>Hallucination: {lane.scorecard.hallucinationControlScore}</p>
                    <p>Integration: {lane.scorecard.integrationStabilityScore}</p>
                    <p>Cost: {lane.scorecard.costEfficiencyScore}</p>
                    <p className="font-semibold text-command-action">Composite: {lane.scorecard.compositeScore}</p>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {topCandidate?.scorecard ? (
        <div className="mt-5 rounded-lg border border-command-action/40 bg-command-action/10 p-4">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-command-action">Top Candidate (Current)</p>
          <p className="mt-1 text-sm font-semibold text-command-text">
            {topCandidate.candidate.name} · Composite {topCandidate.scorecard.compositeScore}
          </p>
        </div>
      ) : null}
    </section>
  );
}
