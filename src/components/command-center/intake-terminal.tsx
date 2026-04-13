"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { APAStatus, canTransition, createInitialContext, reduceAPA } from "../../lib/state-machine";
import { AJD } from "../../lib/intake-agent/mock";
import { runIntakeAgent } from "../../lib/intake-agent/client";
import { StatusPill } from "../ui/status-pill";
import { SourcingRadar } from "./sourcing-radar";
import { EvaluationCommandCenter } from "./evaluation-command-center";
import { FinalScorecardDashboard } from "./final-scorecard-dashboard";
import { DetailedCandidateScorecard } from "./detailed-candidate-scorecard";
import { Candidate } from "../../lib/research-agent/mock";
import { CandidateEvaluationResult } from "../../lib/evaluation-agent/mock";

const TYPEWRITER_TEXT = "intake-agent> context mapping online... awaiting business need";

function buildTimestamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function IntakeTerminal() {
  const [status, setStatus] = useState<APAStatus>({
    state: "IDLE",
    context: createInitialContext("intake-demo-001")
  });
  const [isClient, setIsClient] = useState(false);
  const [businessNeed, setBusinessNeed] = useState("");
  const [typedPrompt, setTypedPrompt] = useState("");
  const [ajd, setAjd] = useState<AJD | null>(null);
  const [reviewJobTitle, setReviewJobTitle] = useState("");
  const [reviewMission, setReviewMission] = useState("");
  const [reviewKpis, setReviewKpis] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [shortlist, setShortlist] = useState<Candidate[]>([]);
  const [evaluationResults, setEvaluationResults] = useState<CandidateEvaluationResult[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([
    `[${buildTimestamp()}] System ready. State=IDLE`
  ]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setTypedPrompt(TYPEWRITER_TEXT.slice(0, index));
      if (index >= TYPEWRITER_TEXT.length) {
        window.clearInterval(timer);
      }
    }, 23);

    return () => window.clearInterval(timer);
  }, []);

  const canSubmit = businessNeed.trim().length > 0 && !isGenerating && status.state !== "ERROR";
  const canApprove = !!ajd && status.state === "INTAKE" && !isGenerating;

  const stateTrail = useMemo(() => {
    return ["IDLE", "INTAKE", "RESEARCH", "EVALUATING", "COMPLETE", "SCORECARD"].map((node) => {
      const active = node === status.state;
      return { node, active };
    });
  }, [status.state]);

  const addLog = (line: string) => {
    setLogs((prev) => [`[${buildTimestamp()}] ${line}`, ...prev].slice(0, 12));
  };

  const handleShortlistReady = (candidates: Candidate[]) => {
    setShortlist(candidates);
    const candidateCount = candidates.length;
    setStatus((prev) => {
      if (!canTransition(prev.state, { type: "SHORTLIST_READY", candidateCount })) {
        return prev;
      }
      return reduceAPA(prev, { type: "SHORTLIST_READY", candidateCount });
    });
  };

  const handleResearchFail = (reason: string) => {
    setStatus((prev) => reduceAPA(prev, { type: "FAIL", reason }));
  };

  const handleEvaluationDone = (results: CandidateEvaluationResult[]) => {
    setEvaluationResults(results);
    addLog(`Scorecards received for ${results.length} candidates.`);
    setStatus((prev) => {
      if (!canTransition(prev.state, { type: "EVALUATION_DONE" })) {
        return prev;
      }
      return reduceAPA(prev, { type: "EVALUATION_DONE" });
    });
  };

  const handleDeploy = () => {
    setStatus((prev) => {
      if (!canTransition(prev.state, { type: "GENERATE_SCORECARD" })) {
        return prev;
      }
      return reduceAPA(prev, { type: "GENERATE_SCORECARD" });
    });
    addLog("Deploy action confirmed. Transition accepted: COMPLETE -> SCORECARD");
  };

  const handleEvaluationFail = (reason: string) => {
    setStatus((prev) => reduceAPA(prev, { type: "FAIL", reason }));
    addLog(`Evaluation error: ${reason}`);
  };

  const handleCandidateSelection = (candidateId: string) => {
    setSelectedCandidateId(candidateId);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setAjd(null);

    setStatus((prev) => {
      if (!canTransition(prev.state, { type: "START_INTAKE" })) {
        return prev;
      }
      return reduceAPA(prev, { type: "START_INTAKE" });
    });

    addLog("Transition accepted: IDLE -> INTAKE");
    addLog("Intake Agent started. Claude 3.5 Sonnet analysis initiated.");
    setIsGenerating(true);

    const thinkingMessages = [
      "Claude is mapping business domain and mission...",
      "Claude is drafting 3 KPI targets...",
      "Claude is defining 5 technical specifications...",
      "Claude is finalizing AJD JSON schema..."
    ];
    let thinkingIndex = 0;
    const thinkingTimer = window.setInterval(() => {
      addLog(thinkingMessages[thinkingIndex % thinkingMessages.length]);
      thinkingIndex += 1;
    }, 1400);

    try {
      const generated = await runIntakeAgent(businessNeed);
      setAjd(generated);

      setReviewJobTitle(generated.job_title || "");
      setReviewMission(generated.agent_profile?.mission || "");
      setReviewKpis((generated.agent_profile?.kpis || []).map((kpi) => `${kpi.name}: ${kpi.target}`).join("\n"));

      addLog("AJD JSON generated by Claude 3.5 Sonnet.");
      addLog("Manager review required before sourcing can start.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown intake failure";
      setStatus((prev) => reduceAPA(prev, { type: "FAIL", reason }));
      addLog(`Transition accepted: * -> ERROR (${reason})`);
    } finally {
      window.clearInterval(thinkingTimer);
      setIsGenerating(false);
    }
  };

  const handleApproveAndStartSourcing = () => {
    if (!ajd || !canTransition(status.state, { type: "SUBMIT_AJD" })) {
      return;
    }

    const kpiLines = reviewKpis
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const parsedKpis = kpiLines.length > 0
      ? kpiLines.map((line, index) => {
          const separatorIndex = line.indexOf(":");
          if (separatorIndex === -1) {
            return {
              name: `KPI ${index + 1}`,
              target: line
            };
          }

          const name = line.slice(0, separatorIndex).trim();
          const target = line.slice(separatorIndex + 1).trim();

          return {
            name: name || `KPI ${index + 1}`,
            target: target || "TBD"
          };
        })
      : ajd.agent_profile?.kpis || [];

    const approvedAjd: AJD = {
      ...ajd,
      job_title: reviewJobTitle.trim() || ajd.job_title,
      agent_profile: {
        role: ajd.agent_profile?.role || (reviewJobTitle.trim() || ajd.job_title),
        mission: reviewMission.trim() || ajd.agent_profile?.mission || ajd.business_need,
        kpis: parsedKpis,
        tech_specs: ajd.agent_profile?.tech_specs || []
      }
    };

    setAjd(approvedAjd);

    setStatus((prev) => {
      if (!canTransition(prev.state, { type: "SUBMIT_AJD" })) {
        return prev;
      }
      return reduceAPA(prev, { type: "SUBMIT_AJD" });
    });

    addLog("Manager approved AJD edits.");
    addLog("Transition accepted: INTAKE -> RESEARCH");
  };

  const handleReset = () => {
    setStatus((prev) => reduceAPA(prev, { type: "RESET" }));
    setBusinessNeed("");
    setAjd(null);
    setReviewJobTitle("");
    setReviewMission("");
    setReviewKpis("");
    setShortlist([]);
    setEvaluationResults([]);
    setSelectedCandidateId(null);
    addLog("Run reset. State=IDLE");
  };

  return (
    <section className="command-card-elevated p-5 md:p-7 animate-fadeUp">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-mono text-sm uppercase tracking-[0.18em] text-command-muted">Step 01 · Intake Terminal</h2>
          <p className="mt-1 text-lg font-semibold text-command-text">Natural-language business need to AJD JSON</p>
        </div>
        <StatusPill label={status.state} tone={status.state === "ERROR" ? "fail" : "action"} />
      </header>

      <div className="mb-4 rounded-lg border border-command-border bg-command-bg/70 p-3 font-mono text-sm text-command-action shadow-glow">
        <span className="animate-pulseLine">{typedPrompt || " "}</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block font-mono text-xs uppercase tracking-[0.14em] text-command-muted" htmlFor="businessNeed">
          Business Need Input
        </label>
        <textarea
          id="businessNeed"
          value={businessNeed}
          onChange={(event) => setBusinessNeed(event.target.value)}
          placeholder="Example: Automate customer support for tier-1 email inquiries with CRM handoff"
          className="min-h-28 w-full resize-y rounded-lg border border-command-border bg-command-bg px-3 py-3 font-mono text-sm text-command-text outline-none ring-0 placeholder:text-command-muted/80 focus:border-command-action"
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg border border-command-action/60 bg-command-action/10 px-4 py-2 font-mono text-sm font-semibold text-command-action transition hover:bg-command-action/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isGenerating ? "Generating AJD..." : "Run Intake Agent"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg border border-command-border bg-command-panel px-4 py-2 font-mono text-sm text-command-muted transition hover:border-command-action hover:text-command-action"
          >
            Reset Run
          </button>
        </div>
      </form>

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <div className="command-card p-4 lg:col-span-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-command-muted">Transition Trace</p>
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
            {stateTrail.map(({ node, active }) => (
              <div key={node} className="flex items-center gap-2">
                <span className={`rounded-md border px-2 py-1 font-mono text-xs ${active ? "border-command-action text-command-action" : "border-command-border text-command-muted"}`}>
                  {node}
                </span>
                {node !== "SCORECARD" ? <span className="text-command-muted">-&gt;</span> : null}
              </div>
            ))}
          </div>

          <ul className="mt-4 space-y-2 border-t border-command-border pt-3 font-mono text-xs text-command-muted">
            {isClient
              ? logs.map((line) => {
                  const match = line.match(/^(\[[^\]]+\])\s?(.*)$/);
                  const timestamp = match ? match[1] : "";
                  const message = match ? match[2] : line;

                  return (
                    <li key={line}>
                      {timestamp ? <span suppressHydrationWarning={true}>{timestamp}</span> : null}
                      {timestamp ? " " : ""}
                      <span>{message}</span>
                    </li>
                  );
                })
              : null}
          </ul>
        </div>

        <div className="command-card p-4 lg:col-span-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-command-muted">AJD Output JSON</p>
          <pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-command-border bg-command-bg p-3 font-mono text-xs text-command-text">
            {ajd ? JSON.stringify(ajd, null, 2) : "No AJD generated yet. Submit a business need to start intake."}
          </pre>
        </div>
      </div>

      {ajd && status.state === "INTAKE" ? (
        <div className="mt-5 command-card-elevated border border-command-action/40 bg-command-action/5 p-5 md:p-6 animate-fadeUp">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-command-action">Review &amp; Approve</p>
              <p className="mt-1 text-sm text-command-text">Manager checkpoint: confirm AJD before sourcing begins.</p>
            </div>
            <StatusPill label="AWAITING APPROVAL" tone="action" />
          </div>

          <div className="mt-4 grid gap-4">
            <div>
              <label className="block font-mono text-xs uppercase tracking-[0.14em] text-command-muted" htmlFor="review-job-title">
                Job Title
              </label>
              <input
                id="review-job-title"
                type="text"
                value={reviewJobTitle}
                onChange={(event) => setReviewJobTitle(event.target.value)}
                className="mt-2 w-full rounded-lg border border-command-border bg-command-bg px-3 py-2 font-mono text-sm text-command-text outline-none ring-0 focus:border-command-action"
              />
            </div>

            <div>
              <label className="block font-mono text-xs uppercase tracking-[0.14em] text-command-muted" htmlFor="review-mission">
                Mission
              </label>
              <textarea
                id="review-mission"
                value={reviewMission}
                onChange={(event) => setReviewMission(event.target.value)}
                className="mt-2 min-h-24 w-full resize-y rounded-lg border border-command-border bg-command-bg px-3 py-2 font-mono text-sm text-command-text outline-none ring-0 focus:border-command-action"
              />
            </div>

            <div>
              <label className="block font-mono text-xs uppercase tracking-[0.14em] text-command-muted" htmlFor="review-kpis">
                KPIs (one per line: Name: Target)
              </label>
              <textarea
                id="review-kpis"
                value={reviewKpis}
                onChange={(event) => setReviewKpis(event.target.value)}
                className="mt-2 min-h-28 w-full resize-y rounded-lg border border-command-border bg-command-bg px-3 py-2 font-mono text-sm text-command-text outline-none ring-0 focus:border-command-action"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleApproveAndStartSourcing}
                disabled={!canApprove}
                className="rounded-lg border border-command-action bg-command-action px-5 py-2.5 font-mono text-sm font-semibold text-command-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Approve &amp; Start Sourcing
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <SourcingRadar
          status={status}
          ajd={ajd}
          addLog={addLog}
          onShortlistReady={handleShortlistReady}
          onFail={handleResearchFail}
        />
      </div>

      <div className="mt-5">
        <EvaluationCommandCenter
          status={status}
          ajd={ajd}
          candidates={shortlist}
          addLog={addLog}
          onEvaluationDone={handleEvaluationDone}
          onFail={handleEvaluationFail}
          onCandidateSelected={handleCandidateSelection}
        />
      </div>

      <div className="mt-5">
        <FinalScorecardDashboard
          status={status}
          evaluationResults={evaluationResults}
          onDeploy={handleDeploy}
          addLog={addLog}
          onCandidateSelected={handleCandidateSelection}
        />
      </div>

      {selectedCandidateId && evaluationResults.length > 0 ? (
        (() => {
          const selected = evaluationResults.find((r) => r.candidateId === selectedCandidateId);
          return selected ? (
            <DetailedCandidateScorecard
              result={selected}
              onClose={() => setSelectedCandidateId(null)}
            />
          ) : null;
        })()
      ) : null}
    </section>
  );
}
