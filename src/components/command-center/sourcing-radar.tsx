"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { APAStatus } from "../../lib/state-machine";
import { AJD } from "../../lib/intake-agent/mock";
import { Candidate } from "../../lib/research-agent/mock";
import { runSourcingScan } from "../../lib/research-agent/client";
import { StatusPill } from "../ui/status-pill";

interface SourcingRadarProps {
  status: APAStatus;
  ajd: AJD | null;
  onShortlistReady: (candidates: Candidate[]) => void;
  onFail: (reason: string) => void;
  addLog: (line: string) => void;
}

const SOURCING_TIMEOUT_MS = 8000;
const API_REPLACE_WINDOW_MS = 4000;

function buildLocalFallbackCandidates(ajd: AJD): Candidate[] {
  return [
    {
      candidate_id: "cand_local_fb_01",
      name: `${ajd.job_title} Copilot`,
      source: "OpenAI",
      fit_score_pre_eval: 84,
      reason_codes: ["Aligned with AJD mission", "Strong instruction-following profile"],
      risk_flags: ["Needs prompt guardrails"]
    },
    {
      candidate_id: "cand_local_fb_02",
      name: `${ajd.domain} Retrieval Agent`,
      source: "Hugging Face",
      fit_score_pre_eval: 79,
      reason_codes: ["Fast retrieval stack", "Good connector ecosystem"],
      risk_flags: ["Requires domain tuning"]
    },
    {
      candidate_id: "cand_local_fb_03",
      name: `${ajd.domain} Orchestrator`,
      source: "CrewAI",
      fit_score_pre_eval: 81,
      reason_codes: ["Strong multi-agent coordination", "Good escalation pathways"],
      risk_flags: ["Higher orchestration complexity"]
    }
  ];
}

function sourceTone(source: Candidate["source"]): string {
  if (source === "OpenAI") {
    return "border-command-action/50 text-command-action";
  }

  if (source === "CrewAI") {
    return "border-command-warning/50 text-command-warning";
  }

  return "border-command-border text-command-muted";
}

export function SourcingRadar({ status, ajd, onShortlistReady, onFail, addLog }: SourcingRadarProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [shortlist, setShortlist] = useState<Candidate[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const hasTransitionedRef = useRef(false);
  const hasRequestedRef = useRef(false);
  const replaceDeadlineRef = useRef<number | null>(null);
  const latestShortlistRef = useRef<Candidate[]>([]);

  useEffect(() => {
    latestShortlistRef.current = shortlist;
  }, [shortlist]);

  useEffect(() => {
    if (status.state === "IDLE" || status.state === "INTAKE") {
      hasTransitionedRef.current = false;
      hasRequestedRef.current = false;
      replaceDeadlineRef.current = null;
      setShortlist([]);
      setVisibleCount(0);
      setIsScanning(false);
    }
  }, [status.state]);

  useEffect(() => {
    if (
      status.state !== "RESEARCH" ||
      !ajd ||
      isScanning ||
      hasTransitionedRef.current ||
      hasRequestedRef.current
    ) {
      return;
    }

    const readyAjd = ajd;
    let canceled = false;
    const fallbackCandidates = buildLocalFallbackCandidates(readyAjd);

    hasRequestedRef.current = true;
    replaceDeadlineRef.current = Date.now() + API_REPLACE_WINDOW_MS;
    setIsScanning(true);
    setVisibleCount(0);
    setShortlist(fallbackCandidates);
    addLog("Sourcing Radar activated. Scanning Hugging Face, OpenAI, CrewAI.");

    const jobTitle = readyAjd.job_title?.trim() || `${readyAjd.domain} Automation Agent`;
    const mission = readyAjd.agent_profile?.mission?.trim() || readyAjd.business_need?.trim() || "Automate core workflows with safe escalation controls";
    addLog(`Radar input prepared: title='${jobTitle}', mission='${mission.slice(0, 48)}...'`);
    const startTime = Date.now();

    Promise.race<Candidate[]>([
      (() => {
        console.log("CALLING API NOW", Date.now());
        return runSourcingScan({
          jobTitle,
          mission,
          kpis: readyAjd.agent_profile?.kpis ?? [],
          integrations: readyAjd.integrations as Record<string, string> ?? {},
          stack_hint: "neutral",
          budget_tier: "smb"
        });
      })(),
      new Promise<Candidate[]>((_, reject) => {
        window.setTimeout(() => reject(new Error("Sourcing API timeout")), SOURCING_TIMEOUT_MS);
      })
    ])
      .then((result) => {
        if (canceled) {
          return;
        }

        const resultPayload = { candidates: result };
        console.log("API RESULT:", resultPayload?.candidates?.length, resultPayload?.candidates?.[0]?.name, Date.now());
        console.log("API response time:", Date.now() - startTime, "ms");
        console.log("API returned:", result?.length, result?.[0]?.name);

        if (!Array.isArray(result) || result.length < 3) {
          addLog("Sourcing API returned fewer than 3 candidates. Using local fallback shortlist.");
          return;
        }

        if (!hasTransitionedRef.current) {
          const normalizedCandidates = result.slice(0, 5);
          setVisibleCount(0);
          setShortlist(normalizedCandidates);
          addLog(`Shortlist upgraded from API: ${normalizedCandidates.length} candidates matched to AJD.`);
        }
      })
      .catch((error) => {
        if (canceled) {
          return;
        }

        const reason = error instanceof Error ? error.message : "Sourcing scan failed";
        addLog(`Sourcing API error/timeout: ${reason}. Keeping local fallback shortlist.`);
      })
      .finally(() => {
        if (!canceled) {
          setIsScanning(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [addLog, ajd, isScanning, onFail, shortlist.length, status.state]);

  useEffect(() => {
    if (shortlist.length === 0) {
      return;
    }

    let transitionTimer: number | null = null;

    const timer = window.setInterval(() => {
      setVisibleCount((prev) => {
        const next = prev + 1;

        if (next >= shortlist.length) {
          window.clearInterval(timer);

          const finalizeTransition = () => {
            if (!hasTransitionedRef.current) {
              hasTransitionedRef.current = true;
              addLog("Radar scan complete. Transition accepted: RESEARCH -> EVALUATING");
              onShortlistReady(latestShortlistRef.current);
            }
          };

          const deadline = replaceDeadlineRef.current;
          const waitMs = deadline ? Math.max(0, deadline - Date.now()) : 0;

          if (waitMs > 0 && isScanning) {
            transitionTimer = window.setTimeout(() => {
              finalizeTransition();
            }, waitMs);
          } else {
            finalizeTransition();
          }
        }

        return Math.min(next, shortlist.length);
      });
    }, 320);

    return () => {
      window.clearInterval(timer);
      if (transitionTimer !== null) {
        window.clearTimeout(transitionTimer);
      }
    };
  }, [addLog, isScanning, onShortlistReady, shortlist]);

  const visibleCandidates = useMemo(() => shortlist.slice(0, visibleCount), [shortlist, visibleCount]);

  return (
    <section className="command-card-elevated p-5 md:p-7 animate-fadeUp">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-mono text-sm uppercase tracking-[0.18em] text-command-muted">Step 02 · Sourcing Radar</h2>
          <p className="mt-1 text-lg font-semibold text-command-text">Research phase market scan and shortlist</p>
        </div>
        <StatusPill label={isScanning ? "SCANNING" : "READY"} tone={isScanning ? "action" : "neutral"} />
      </header>

      <div className="grid gap-4 lg:grid-cols-6">
        <div className="command-card relative overflow-hidden p-4 lg:col-span-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-command-muted">Radar Sweep</p>

          <div className="relative mt-4 aspect-square w-full rounded-full border border-command-border bg-command-bg">
            <div className="absolute inset-3 rounded-full border border-command-border/60" />
            <div className="absolute inset-7 rounded-full border border-command-border/50" />
            <div className="absolute inset-11 rounded-full border border-command-border/40" />
            <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-command-action shadow-glow" />

            <div className={`absolute left-1/2 top-1/2 h-[45%] w-[2px] -translate-x-1/2 -translate-y-full origin-bottom bg-gradient-to-t from-command-action to-transparent ${isScanning ? "animate-radarSweep" : ""}`} />

            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(100,255,218,0.12),transparent_65%)]" />
          </div>

          <p className="mt-3 font-mono text-xs text-command-muted">
            {status.state === "RESEARCH"
              ? isScanning
                ? "Scanning agent catalogs..."
                : shortlist.length > 0
                  ? "Scan complete"
                  : "Awaiting research trigger"
              : "Sourcing starts automatically in RESEARCH"}
          </p>
        </div>

        <div className="command-card p-4 lg:col-span-4">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-command-muted">Candidate Cards</p>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {visibleCandidates.length === 0 ? (
              <p className="font-mono text-xs text-command-muted">No candidates surfaced yet.</p>
            ) : (
              visibleCandidates.map((candidate) => (
                <article key={candidate.candidate_id} className="rounded-lg border border-command-border bg-command-bg/80 p-3 animate-fadeUp shadow-glow hover:border-command-action/50 hover:bg-command-action/5 hover:shadow-lg hover:shadow-command-action/10 transition-all">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-command-text">{candidate.name}</h3>
                    <span className={`rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${sourceTone(candidate.source)}`}>
                      {candidate.source}
                    </span>
                  </div>

                  <p className="mt-2 font-mono text-xs text-command-muted">Score available after evaluation</p>
                  <p className="mt-2 text-xs text-command-muted">{candidate.reason_codes[0]}</p>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
