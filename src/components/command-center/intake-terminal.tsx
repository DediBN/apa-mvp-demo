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
import { ResultSummaryCard } from "./result-summary-card";
import { AgentReadinessCheck } from "./agent-readiness-check";
import { SkillEvaluationCenter } from "./skill-evaluation-center";
import { takeHandoff } from "../../lib/handoff";

const SHOW_AGENT_SCORECARD = false;
import { Candidate } from "../../lib/research-agent/mock";
import { CandidateEvaluationResult } from "../../lib/evaluation-agent/mock";
import { buildDefaultAssumptions, calculateROI } from "../../lib/scorecard/roi";

// One-click examples, so a first-time visitor never faces an empty box. The tool then generates its own test cases.
const EXAMPLE_NEEDS = [
  {
    label: "הצעות מחיר",
    text: 'אני צריך סקיל שמכין הצעות מחיר בעברית ללקוחות של חברת ריהוט משרדי: לפי המחירון המאושר בלבד (כיסא 300 ש"ח, שולחן 1,200 ש"ח), הנחת כמות 10% על כיסאות מ-10 יחידות, משלוח 250 ש"ח להזמנה, מע"מ 18%, תנאי תשלום שוטף 30. אם פריט לא במחירון – לעצור ולבקש מחיר. התוצאה בטבלה.'
  },
  {
    label: "בדיקת חשבוניות ספקים",
    text: 'אני צריך סקיל שבודק חשבוניות של ספקים מול המחירון המוסכם: כל שורה שהמחיר בה גבוה מהמוסכם ביותר מ-2%, פריט שלא קיים בהסכם, וחיוב כפול של אותה שורה. התוצאה: טבלת חריגים עם מספר החשבונית, השורה, המחיר המוסכם והמחיר בפועל, ואחריה סיכום של כמה שורות תקינות.'
  },
  {
    label: "Customer replies",
    text: "I need a skill that drafts replies to customer complaints for our online shop: apologize once, never promise a refund above our policy (full refund within 30 days, store credit after that), offer a replacement when the item is in stock, ask for the order number if it is missing, and keep the reply under 120 words in the customer's language."
  }
];
import { useUIMode } from "./ui-mode-context";

const TYPEWRITER_TEXT = "skill-intake> context mapping online... awaiting business need";

function buildTimestamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// What the Skill Spec panel shows: the parts Claude actually wrote, without the agent-era placeholder fields.
function specView(ajd: AJD) {
  return {
    skill: ajd.job_title,
    business_need: ajd.business_need,
    domain: ajd.domain,
    mission: ajd.agent_profile?.mission,
    kpis: ajd.agent_profile?.kpis,
    tech_specs: ajd.agent_profile?.tech_specs,
    feasibility: ajd.feasibility
  };
}

function getModeLabel(label: string, isBusinessMode: boolean): string {
  if (!isBusinessMode) {
    return label;
  }

  if (label === "Skill Spec JSON") {
    return "Skill Definition";
  }

  if (label === "Transition Trace") {
    return "Decision Flow";
  }

  if (label === "EVALUATING") {
    return "Analyzing Options";
  }

  return label;
}

export function IntakeTerminal() {
  const { mode } = useUIMode();
  const isBusinessMode = mode === "business";
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
  const [readinessAjd, setReadinessAjd] = useState<AJD | null>(null);
  // A file handed over from the landing page goes to Step 03 as the real data to test on.
  const [handoffFile, setHandoffFile] = useState<File | null>(null);
  const [gateOverride, setGateOverride] = useState(false);
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
  const gate = ajd?.feasibility?.status ?? "ok";

  const stateTrail = useMemo(() => {
    return ["IDLE", "INTAKE", "RESEARCH", "EVALUATING", "COMPLETE", "SCORECARD"].map((node) => {
      const active = node === status.state;
      return { node, active, label: getModeLabel(node, isBusinessMode) };
    });
  }, [isBusinessMode, status.state]);

  const summaryData = useMemo(() => {
    if (evaluationResults.length === 0) {
      return null;
    }

    const winner = [...evaluationResults].sort(
      (a, b) => b.scorecard.compositeScore - a.scorecard.compositeScore
    )[0];

    if (!winner) {
      return null;
    }

    const roi = calculateROI(buildDefaultAssumptions(
      winner.scorecard.compositeScore,
      businessNeed,
      winner.candidateSource
    ));

    return {
      selectedAgentName: winner.candidateName,
      roiValue: roi.annualValue,
      estimatedSavings: roi.monthlyValue,
      performanceImprovement: roi.savingsPercent,
      domainHint: `${ajd?.domain || ""} ${businessNeed || ""}`.trim(),
      selectedAgentSource: winner.candidateSource,
      compositeScore: winner.scorecard.compositeScore,
      savingsPercent: roi.savingsPercent
    };
  }, [evaluationResults]);

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
    await startIntake(businessNeed);
  };

  // Coming from the landing page: the need (and a file) are already given, so define the skill right away.
  // The manager-approval checkpoint stays: only the intake starts on its own.
  useEffect(() => {
    const h = takeHandoff();
    if (!h) return;
    setBusinessNeed(h.request);
    if (h.file) setHandoffFile(h.file);
    void startIntake(h.request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startIntake = async (need: string) => {
    setAjd(null);
    setGateOverride(false);

    setStatus((prev) => {
      if (!canTransition(prev.state, { type: "START_INTAKE" })) {
        return prev;
      }
      return reduceAPA(prev, { type: "START_INTAKE" });
    });

    addLog("Transition accepted: IDLE -> INTAKE");
    addLog("Skill intake started. Claude is analyzing the business need.");
    setIsGenerating(true);

    const thinkingMessages = [
      "Claude is mapping business domain and mission...",
      "Claude is drafting 3 KPI targets...",
      "Claude is defining 5 technical specifications...",
      "Claude is finalizing the Skill Spec..."
    ];
    let thinkingIndex = 0;
    const thinkingTimer = window.setInterval(() => {
      addLog(thinkingMessages[thinkingIndex % thinkingMessages.length]);
      thinkingIndex += 1;
    }, 1400);

    try {
      const generated = await runIntakeAgent(need);
      setAjd(generated);

      setReviewJobTitle(generated.job_title || "");
      setReviewMission(generated.agent_profile?.mission || "");
      setReviewKpis((generated.agent_profile?.kpis || []).map((kpi) => `${kpi.name}: ${kpi.target}`).join("\n"));

      addLog("Skill Spec generated by Claude.");
      if (generated.feasibility?.status === "not_possible") addLog("Feasibility check: a skill alone cannot do this request. Sourcing is held.");
      else if (generated.feasibility?.status === "needs_file") addLog("Feasibility check: this runs on the business's own file — attach it in Step 03.");
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

  const buildApprovedAjd = (source: AJD): AJD => {
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
      : source.agent_profile?.kpis || [];

    return {
      ...source,
      job_title: reviewJobTitle.trim() || source.job_title,
      agent_profile: {
        role: source.agent_profile?.role || (reviewJobTitle.trim() || source.job_title),
        mission: reviewMission.trim() || source.agent_profile?.mission || source.business_need,
        kpis: parsedKpis,
        tech_specs: source.agent_profile?.tech_specs || []
      }
    };
  };

  const handleApproveAndStartSourcing = () => {
    if (!ajd || !canTransition(status.state, { type: "SUBMIT_AJD" })) {
      return;
    }

    const approvedAjd = buildApprovedAjd(ajd);

    setAjd(approvedAjd);

    setStatus((prev) => {
      if (!canTransition(prev.state, { type: "SUBMIT_AJD" })) {
        return prev;
      }
      return reduceAPA(prev, { type: "SUBMIT_AJD" });
    });

    addLog("Manager approved the Skill Spec.");
    addLog("Transition accepted: INTAKE -> RESEARCH");
  };

  const handleTestOnRealData = () => {
    if (!ajd) {
      return;
    }

    setReadinessAjd(buildApprovedAjd(ajd));
    addLog("Opened readiness check on the approved Skill Spec. No state transition.");
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
          <p className="mt-1 text-lg font-semibold text-command-text">Natural-language business need to Skill Spec</p>
        </div>
        <StatusPill label={getModeLabel(status.state, isBusinessMode)} tone={status.state === "ERROR" ? "fail" : "action"} />
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
          placeholder="Example: I need a skill that checks supplier invoices against our agreed price list"
          className="min-h-28 w-full resize-y rounded-lg border border-command-border bg-command-bg px-3 py-3 font-mono text-sm text-command-text outline-none ring-0 placeholder:text-command-muted/80 focus:border-command-action"
        />

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-command-muted">Try an example:</span>
          {EXAMPLE_NEEDS.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => setBusinessNeed(ex.text)}
              className="rounded-full border border-command-border px-3 py-1 text-xs text-command-text transition hover:border-command-action hover:text-command-action"
            >
              {ex.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg border border-command-action/60 bg-command-action/10 px-4 py-2 font-mono text-sm font-semibold text-command-action transition hover:bg-command-action/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isGenerating ? "Generating Skill Spec..." : "Define the Skill"}
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

      {SHOW_AGENT_SCORECARD && summaryData ? (
        <div className="mt-6">
          <ResultSummaryCard
            selectedAgentName={summaryData.selectedAgentName}
            roiValue={summaryData.roiValue}
            estimatedSavings={summaryData.estimatedSavings}
            performanceImprovement={summaryData.performanceImprovement}
            useCaseSummary={businessNeed}
            domainHint={summaryData.domainHint}
            selectedAgentSource={summaryData.selectedAgentSource}
            compositeScore={summaryData.compositeScore}
            savingsPercent={summaryData.savingsPercent}
          />
        </div>
      ) : null}

      {!isBusinessMode ? (
      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <div className="command-card p-4 lg:col-span-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-command-muted">{getModeLabel("Transition Trace", isBusinessMode)}</p>
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
            {stateTrail.map(({ node, active, label }) => (
              <div key={node} className="flex items-center gap-2">
                <span className={`rounded-md border px-2 py-1 font-mono text-xs ${active ? "border-command-action text-command-action" : "border-command-border text-command-muted"}`}>
                  {label}
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
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-command-muted">{getModeLabel("Skill Spec JSON", isBusinessMode)}</p>
          <pre dir="auto" className="mt-3 max-h-80 overflow-auto rounded-lg border border-command-border bg-command-bg p-3 font-mono text-xs text-command-text" style={{ unicodeBidi: "plaintext" }}>
            {ajd ? JSON.stringify(specView(ajd), null, 2) : "No Skill Spec generated yet. Describe the business need to start."}
          </pre>
        </div>
      </div>
      ) : null}

      {ajd && status.state === "INTAKE" ? (
        <div className="mt-5 command-card-elevated border border-command-action/40 bg-command-action/5 p-5 md:p-6 animate-fadeUp">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-command-action">Review &amp; Approve</p>
              <p className="mt-1 text-sm text-command-text">Manager checkpoint: confirm the Skill Spec before sourcing begins.</p>
            </div>
            <StatusPill label="AWAITING APPROVAL" tone="action" />
          </div>

          <div className="mt-4 grid gap-4">
            <div>
              <label className="block font-mono text-xs uppercase tracking-[0.14em] text-command-muted" htmlFor="review-job-title">
                Skill Name
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

            {gate !== "ok" ? (
              <div className={`rounded-lg border p-4 ${gate === "not_possible" ? "border-red-400/50 bg-red-400/10" : "border-amber-400/50 bg-amber-400/10"}`}>
                <p className={`font-mono text-xs uppercase tracking-[0.14em] ${gate === "not_possible" ? "text-red-300" : "text-amber-300"}`}>
                  Feasibility check · {gate === "not_possible" ? "a skill alone cannot do this" : "runs on your own file"}
                </p>
                {ajd.feasibility?.reason ? <p className="mt-2 text-sm text-command-text">{ajd.feasibility.reason}</p> : null}
                {ajd.feasibility?.needs ? (
                  <p className="mt-1 text-sm text-command-muted">
                    <span className="font-semibold text-command-text">What would make it work:</span> {ajd.feasibility.needs}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-command-muted">
                  {gate === "not_possible"
                    ? "A skill is written instructions: it cannot browse the web or fetch live data, so testing it would only measure refusals. Change the need, or override to run anyway."
                    : "Approve, then attach the business's file in Step 03 (Excel is fine). Generated scenarios would only show how the skill works on made-up data."}
                </p>
                {gate === "not_possible" && !gateOverride ? (
                  <button type="button" onClick={() => setGateOverride(true)} className="mt-2 font-mono text-xs text-command-muted underline hover:text-command-text">
                    Override and allow sourcing anyway
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={handleTestOnRealData}
                disabled={!canApprove}
                className="rounded-lg border border-command-border bg-transparent px-5 py-2.5 font-mono text-sm font-semibold text-command-text transition hover:border-command-action hover:text-command-action disabled:cursor-not-allowed disabled:opacity-45"
              >
                Test on Real Data
              </button>
              <button
                type="button"
                onClick={handleApproveAndStartSourcing}
                disabled={!canApprove || (gate === "not_possible" && !gateOverride)}
                className="rounded-lg border border-command-action bg-command-action px-5 py-2.5 font-mono text-sm font-semibold text-command-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Approve &amp; Start Sourcing
              </button>
            </div>

            {readinessAjd ? (
              <AgentReadinessCheck ajd={readinessAjd} onClose={() => setReadinessAjd(null)} />
            ) : null}
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
        <SkillEvaluationCenter
          status={status}
          ajd={ajd ? buildApprovedAjd(ajd) : null}
          candidates={shortlist}
          addLog={addLog}
          onEvaluationDone={handleEvaluationDone}
          initialFile={handoffFile}
          preferData={ajd?.feasibility?.status === "needs_file" || Boolean(handoffFile)}
        />
      </div>

      {/* Agent-era scorecard (simulated parameters) is not shown in skill mode — Step 03 holds the measured results. */}
      {SHOW_AGENT_SCORECARD ? (
      <div className="mt-5">
        <FinalScorecardDashboard
          status={status}
          ajd={ajd}
          evaluationResults={evaluationResults}
          onDeploy={handleDeploy}
          addLog={addLog}
          onCandidateSelected={handleCandidateSelection}
        />
      </div>
      ) : null}

      {SHOW_AGENT_SCORECARD && selectedCandidateId && evaluationResults.length > 0 ? (
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
