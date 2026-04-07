"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { APAStatus, canTransition, createInitialContext, reduceAPA } from "../../lib/state-machine";
import { AJD } from "../../lib/intake-agent/mock";
import { runIntakeAgent } from "../../lib/intake-agent/client";
import { StatusPill } from "../ui/status-pill";
import { SourcingRadar } from "./sourcing-radar";
import { EvaluationCommandCenter } from "./evaluation-command-center";
import { FinalScorecardDashboard } from "./final-scorecard-dashboard";
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [shortlist, setShortlist] = useState<Candidate[]>([]);
  const [evaluationResults, setEvaluationResults] = useState<CandidateEvaluationResult[]>([]);
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

      setStatus((prev) => {
        if (!canTransition(prev.state, { type: "SUBMIT_AJD" })) {
          return prev;
        }
        return reduceAPA(prev, { type: "SUBMIT_AJD" });
      });

      addLog("AJD JSON generated by Claude 3.5 Sonnet.");
      addLog("Transition accepted: INTAKE -> RESEARCH");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown intake failure";
      setStatus((prev) => reduceAPA(prev, { type: "FAIL", reason }));
      addLog(`Transition accepted: * -> ERROR (${reason})`);
    } finally {
      window.clearInterval(thinkingTimer);
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setStatus((prev) => reduceAPA(prev, { type: "RESET" }));
    setBusinessNeed("");
    setAjd(null);
    setShortlist([]);
    setEvaluationResults([]);
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
        />
      </div>

      <div className="mt-5">
        <FinalScorecardDashboard
          status={status}
          evaluationResults={evaluationResults}
          onDeploy={handleDeploy}
          addLog={addLog}
        />
      </div>
    </section>
  );
}
