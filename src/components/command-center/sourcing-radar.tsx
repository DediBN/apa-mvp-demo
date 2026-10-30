"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { APAStatus } from "../../lib/state-machine";
import { AJD } from "../../lib/intake-agent/mock";
import { Candidate } from "../../lib/research-agent/mock";
import { runSkillSourcingScan } from "../../lib/research-agent/client";
import { securityWarning } from "../../lib/skills/security";
import { StatusPill } from "../ui/status-pill";
import { MIN_FIT } from "../../lib/business/scoring";

interface SourcingRadarProps {
  status: APAStatus;
  ajd: AJD | null;
  onShortlistReady: (candidates: Candidate[]) => void;
  onFail: (reason: string) => void;
  addLog: (line: string) => void;
}

// Skill sourcing = query planning + 2 directories + SKILL.md retrieval + screening, so allow time for it.
// The scan searches two directories, fetches up to 24 SKILL.md files and screens them: it can take 1-2 minutes.
const SOURCING_TIMEOUT_MS = 150000;
const API_REPLACE_WINDOW_MS = 150000;

function buildLocalFallbackCandidates(ajd: AJD): Candidate[] {
  return [
    {
      candidate_id: "skill_custom_ajd",
      name: `Custom skill: ${ajd.job_title}`,
      source: "Custom Skill",
      fit_score_pre_eval: 70,
      reason_codes: ["Written from the approved Skill Spec", "Used while directory search is unavailable"],
      risk_flags: ["Not yet written — must be authored and tested before deployment"],
      skill: { directory: "Custom", author: "APA" }
    },
    {
      candidate_id: "skill_baseline_none",
      name: "Baseline: Claude with no skill",
      source: "Custom Skill",
      fit_score_pre_eval: 50,
      reason_codes: ["Control group — Claude without any skill", "Every skill must beat this to justify installing it"],
      risk_flags: ["Not a deployable skill"],
      skill: { directory: "Custom", author: "Anthropic (base model)" }
    }
  ];
}

function sourceTone(source: Candidate["source"]): string {
  if (source === "SkillsMP") {
    return "border-command-action/50 text-command-action";
  }

  if (source === "skills.sh") {
    return "border-command-pass/50 text-command-pass";
  }

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
  // Identifies the current scan. Re-renders must not cancel an in-flight scan (the effect re-runs when
  // isScanning flips), only a pipeline reset does.
  const scanRunRef = useRef(0);

  useEffect(() => {
    latestShortlistRef.current = shortlist;
  }, [shortlist]);

  useEffect(() => {
    if (status.state === "IDLE" || status.state === "INTAKE") {
      scanRunRef.current += 1;
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
    const runId = ++scanRunRef.current;
    const isStale = () => runId !== scanRunRef.current;
    const fallbackCandidates = buildLocalFallbackCandidates(readyAjd);

    hasRequestedRef.current = true;
    replaceDeadlineRef.current = Date.now() + API_REPLACE_WINDOW_MS;
    setIsScanning(true);
    setVisibleCount(0);
    setShortlist(fallbackCandidates);
    addLog("Sourcing Radar activated. Scanning skill directories: SkillsMP, skills.sh.");

    const jobTitle = readyAjd.job_title?.trim() || `${readyAjd.domain} Skill`;
    const mission = readyAjd.agent_profile?.mission?.trim() || readyAjd.business_need?.trim() || "Automate core workflows with safe escalation controls";
    addLog(`Radar input prepared: title='${jobTitle}', mission='${mission.slice(0, 48)}...'`);
    const startTime = Date.now();

    Promise.race<Candidate[]>([
      (() => {
        return runSkillSourcingScan({
          jobTitle,
          mission,
          kpis: readyAjd.agent_profile?.kpis ?? []
        }).then(({ candidates, meta }) => {
          if (meta.queries) {
            addLog(`Skill search: "${meta.queries.semantic_query.slice(0, 60)}" + [${meta.queries.keyword_queries.join(", ")}]`);
          }
          if (meta.found) {
            addLog(`Directories: SkillsMP ${meta.found.skillsmp} · skills.sh ${meta.found.skills_sh} · unique ${meta.found.unique} · readable SKILL.md ${meta.readable_skill_md ?? 0}`);
          }
          if (meta.sources_enabled && (!meta.sources_enabled.skillsmp || !meta.sources_enabled.skills_sh)) {
            addLog(`Source keys — SkillsMP: ${meta.sources_enabled.skillsmp ? "on" : "missing"}, skills.sh: ${meta.sources_enabled.skills_sh ? "on" : "missing"}`);
          }
          return candidates;
        });
      })(),
      new Promise<Candidate[]>((_, reject) => {
        window.setTimeout(() => reject(new Error("Sourcing API timeout")), SOURCING_TIMEOUT_MS);
      })
    ])
      .then((result) => {
        if (isStale()) {
          return;
        }

        addLog(`Directory scan finished in ${Math.round((Date.now() - startTime) / 1000)}s.`);

        if (!Array.isArray(result) || result.length < 2) {
          addLog("⚠ The directory scan found fewer than 2 options. Continuing with the custom skill and Claude with no skill.");
          return;
        }

        if (!hasTransitionedRef.current) {
          const normalizedCandidates = result.slice(0, 5);
          setVisibleCount(0);
          setShortlist(normalizedCandidates);
          const libraryCount = normalizedCandidates.filter((c) => c.candidate_id !== "skill_custom_ajd" && c.candidate_id !== "skill_baseline_none").length;
          addLog(
            libraryCount > 0
              ? `Shortlist: ${libraryCount} library skill${libraryCount === 1 ? "" : "s"} that fit the task, plus a skill built for it and Claude alone.`
              : "No library skill fits this need closely enough — the test compares a skill built for it against Claude alone."
          );
        }
      })
      .catch((error) => {
        if (isStale()) {
          return;
        }

        const reason = error instanceof Error ? error.message : "Sourcing scan failed";
        addLog(`⚠ Directory scan failed (${reason}). Continuing with the custom skill and Claude with no skill only.`);
      })
      .finally(() => {
        if (!isStale()) {
          setIsScanning(false);
        }
      });

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
                ? "Scanning skill directories..."
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
                      {candidate.candidate_id === "skill_baseline_none" ? "No skill" : candidate.source}
                    </span>
                  </div>

                  <p className="mt-2 font-mono text-xs text-command-muted">
                    {candidate.source === "Custom Skill"
                      ? "Tested in Step 03"
                      : `Screening fit ${candidate.fit_score_pre_eval}${candidate.fit_score_pre_eval < MIN_FIT ? " · weak fit — tested for comparison, never recommended" : " · tested in Step 03"}`}
                  </p>
                  {securityWarning(candidate.risk_flags) ? (
                    <p className="mt-2 inline-flex items-center gap-1 rounded border border-red-400/50 bg-red-400/10 px-2 py-0.5 text-[11px] font-semibold text-red-300">
                      ⚠ {securityWarning(candidate.risk_flags)}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-command-muted">{candidate.reason_codes[0]}</p>
                  {candidate.reason_codes[1] ? (
                    <p className="mt-1 font-mono text-[10px] text-command-muted">{candidate.reason_codes[1]}</p>
                  ) : null}
                  {candidate.skill?.pageUrl || candidate.skill?.githubUrl ? (
                    <a
                      href={candidate.skill.pageUrl || candidate.skill.githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-command-action hover:underline"
                    >
                      View SKILL.md source ↗
                    </a>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
