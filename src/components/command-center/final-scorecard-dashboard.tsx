"use client";

import { useMemo } from "react";
import { APAStatus } from "../../lib/state-machine";
import { CandidateEvaluationResult, CandidateScorecard } from "../../lib/evaluation-agent/mock";
import { buildDefaultAssumptions, calculateROI, formatCurrency } from "../../lib/scorecard/roi";
import { StatusPill } from "../ui/status-pill";

// ─── Radar Chart ────────────────────────────────────────────────────────────

const PARAM_DEFS: Array<{ key: keyof CandidateScorecard; label: string; short: string }> = [
  { key: "turingScore",              label: "Turing Score",           short: "Turing"   },
  { key: "securityScore",            label: "Security",               short: "Security" },
  { key: "reliabilityScore",         label: "Reliability",            short: "Reliab."  },
  { key: "objectionHandlingScore",   label: "Objection Handling",     short: "Object."  },
  { key: "hallucinationControlScore",label: "Hallucination Control",  short: "Halluc."  },
  { key: "integrationStabilityScore",label: "Integration Stability",  short: "Integr."  },
  { key: "costEfficiencyScore",      label: "Cost Efficiency",        short: "Cost Eff."},
];

const N   = PARAM_DEFS.length;
const CX  = 112;
const CY  = 108;
const MAX_R = 74;

const CANDIDATE_STROKES = ["#64FFDA", "#FFC857", "#8DA9BF", "#FF6B6B"];
const CANDIDATE_FILLS   = [
  "rgba(100,255,218,0.12)",
  "rgba(255,200,87,0.10)",
  "rgba(141,169,191,0.10)",
  "rgba(255,107,107,0.10)",
];

function axisAngle(i: number): number {
  return -Math.PI / 2 + (2 * Math.PI * i) / N;
}

function toXY(i: number, score: number): string {
  const a = axisAngle(i);
  const r = (score / 100) * MAX_R;
  return `${(CX + r * Math.cos(a)).toFixed(1)},${(CY + r * Math.sin(a)).toFixed(1)}`;
}

function gridRing(fraction: number): string {
  return Array.from({ length: N }, (_, i) => {
    const a = axisAngle(i);
    const r = fraction * MAX_R;
    return `${(CX + r * Math.cos(a)).toFixed(1)},${(CY + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

function labelXY(i: number): { x: number; y: number } {
  const a = axisAngle(i);
  const r = MAX_R + 18;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function RadarChart({ results }: { results: CandidateEvaluationResult[] }) {
  return (
    <svg viewBox="0 0 224 220" className="mx-auto w-full max-w-[280px]" aria-label="Candidate radar chart">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={gridRing(f)} fill="none" stroke="#1F3B51" strokeWidth="1" />
      ))}

      {Array.from({ length: N }, (_, i) => {
        const a = axisAngle(i);
        return (
          <line
            key={i}
            x1={CX} y1={CY}
            x2={(CX + MAX_R * Math.cos(a)).toFixed(1)}
            y2={(CY + MAX_R * Math.sin(a)).toFixed(1)}
            stroke="#1F3B51" strokeWidth="1"
          />
        );
      })}

      {results.map((r, idx) => (
        <polygon
          key={r.candidateId}
          points={PARAM_DEFS.map((p, i) => toXY(i, r.scorecard[p.key])).join(" ")}
          fill={CANDIDATE_FILLS[idx % CANDIDATE_FILLS.length]}
          stroke={CANDIDATE_STROKES[idx % CANDIDATE_STROKES.length]}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      ))}

      {PARAM_DEFS.map((p, i) => {
        const { x, y } = labelXY(i);
        return (
          <text
            key={p.key}
            x={x.toFixed(1)} y={y.toFixed(1)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="7.5" fill="#8DA9BF" fontFamily="monospace"
          >
            {p.short}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Legend ──────────────────────────────────────────────────────────────────

function RadarLegend({ results }: { results: CandidateEvaluationResult[] }) {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-3">
      {results.map((r, idx) => (
        <div key={r.candidateId} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: CANDIDATE_STROKES[idx % CANDIDATE_STROKES.length] }}
          />
          <span className="font-mono text-[11px] text-command-muted">{r.candidateName}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Score Bar ───────────────────────────────────────────────────────────────

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between font-mono text-[10px] text-command-muted">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-command-bg">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface FinalScorecardDashboardProps {
  status: APAStatus;
  evaluationResults: CandidateEvaluationResult[];
  onDeploy: () => void;
  addLog: (line: string) => void;
}

export function FinalScorecardDashboard({
  status,
  evaluationResults,
  onDeploy,
  addLog: _addLog,
}: FinalScorecardDashboardProps) {
  const isVisible =
    status.state === "COMPLETE" || status.state === "SCORECARD";

  if (!isVisible) {
    return (
      <section className="command-card-elevated p-5 md:p-7 animate-fadeUp">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-sm uppercase tracking-[0.18em] text-command-muted">
              Step 04 · Final Scorecard
            </h2>
            <p className="mt-1 text-lg font-semibold text-command-text">
              Dashboard activates after evaluation completes
            </p>
          </div>
          <StatusPill label="STANDBY" tone="neutral" />
        </header>
      </section>
    );
  }

  const isDeployed = status.state === "SCORECARD";

  const rankedResults = useMemo(
    () =>
      [...evaluationResults].sort(
        (a, b) => b.scorecard.compositeScore - a.scorecard.compositeScore
      ),
    [evaluationResults]
  );

  const winner = rankedResults[0];

  const roi = useMemo(() => {
    if (!winner) return null;
    return calculateROI(buildDefaultAssumptions(winner.scorecard.compositeScore));
  }, [winner]);

  if (!winner || !roi) return null;

  return (
    <section className="command-card-elevated p-5 md:p-7 animate-fadeUp space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-mono text-sm uppercase tracking-[0.18em] text-command-muted">
            Step 04 · Final Scorecard
          </h2>
          <p className="mt-1 text-lg font-semibold text-command-text">
            APA Recommendation and ROI Projection
          </p>
        </div>
        <StatusPill label={isDeployed ? "DEPLOYED" : "READY"} tone={isDeployed ? "pass" : "action"} />
      </header>

      {/* ── Winner Banner ── */}
      <div className="relative overflow-hidden rounded-xl border border-command-action/40 bg-command-action/10 p-5 shadow-glow">
        <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-command-action/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-command-action animate-pulseLine">
              APA Recommended
            </p>
            <h3 className="mt-1 text-2xl font-bold tracking-tight text-command-text">
              {winner.candidateName}
            </h3>
            <p className="mt-1 font-mono text-sm text-command-muted">
              Composite Score:{" "}
              <span className="font-semibold text-command-action">
                {winner.scorecard.compositeScore} / 100
              </span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-command-action/50 bg-command-action/10 px-3 py-1 font-mono text-xs text-command-action">
                Objection {winner.scorecard.objectionHandlingScore}
              </span>
              <span className="rounded-full border border-command-action/50 bg-command-action/10 px-3 py-1 font-mono text-xs text-command-action">
                Hallucination {winner.scorecard.hallucinationControlScore}
              </span>
              <span className="rounded-full border border-command-action/50 bg-command-action/10 px-3 py-1 font-mono text-xs text-command-action">
                Integration {winner.scorecard.integrationStabilityScore}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-command-action/30 bg-command-action/10 px-6 py-4 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-command-action">
              Annual ROI
            </p>
            <p className="mt-1 text-3xl font-bold text-command-text">
              {formatCurrency(roi.annualValue)}
            </p>
            <p className="mt-1 font-mono text-xs text-command-muted">projected savings</p>
          </div>
        </div>
      </div>

      {/* ── Radar + Ranked List ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="command-card p-4">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-command-muted">
            7-Parameter Radar
          </p>
          <div className="mt-4">
            <RadarChart results={rankedResults} />
            <RadarLegend results={rankedResults} />
          </div>
        </div>

        <div className="command-card p-4">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-command-muted">
            Ranked Candidates
          </p>
          <div className="mt-3 space-y-3">
            {rankedResults.map((result, idx) => {
              const color = CANDIDATE_STROKES[idx % CANDIDATE_STROKES.length];
              return (
                <div
                  key={result.candidateId}
                  className={`rounded-lg border p-3 ${
                    idx === 0
                      ? "border-command-action/40 bg-command-action/5"
                      : "border-command-border bg-command-bg/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-bold"
                        style={{ background: color + "25", color }}
                      >
                        {idx + 1}
                      </span>
                      <span className="text-sm font-semibold text-command-text">
                        {result.candidateName}
                      </span>
                      {idx === 0 && (
                        <span className="rounded-full border border-command-action/50 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-command-action">
                          ★ Winner
                        </span>
                      )}
                    </div>
                    <span
                      className="font-mono text-lg font-bold"
                      style={{ color }}
                    >
                      {result.scorecard.compositeScore}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {PARAM_DEFS.slice(0, 4).map((p) => (
                      <ScoreBar
                        key={p.key}
                        label={p.short}
                        value={result.scorecard[p.key]}
                        color={color}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── ROI Projection ── */}
      <div className="command-card p-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-command-muted">
          ROI Projection
        </p>
        <p className="mt-2 rounded-lg border border-command-border bg-command-bg px-3 py-2 font-mono text-xs text-command-action">
          Value = (Tm × Ch × Ef) − (Capi + Cinfra + Cgov)
        </p>
        <p className="mt-2 rounded-lg border border-command-border bg-command-bg px-3 py-2 font-mono text-xs text-command-muted">
          {roi.formulaDisplay}
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-command-border bg-command-bg/70 p-4 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-command-muted">
              Monthly Savings
            </p>
            <p className="mt-2 text-2xl font-bold text-command-text">
              {formatCurrency(roi.monthlyValue)}
            </p>
          </div>

          <div className="rounded-lg border border-command-action/30 bg-command-action/8 p-4 text-center shadow-glow">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-command-action">
              Annual Savings
            </p>
            <p className="mt-2 text-2xl font-bold text-command-text">
              {formatCurrency(roi.annualValue)}
            </p>
          </div>

          <div className="rounded-lg border border-command-border bg-command-bg/70 p-4 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-command-muted">
              Resolution Cost
            </p>
            <p className="mt-2 text-lg font-bold text-command-text">
              <span className="line-through text-command-muted">
                ${roi.costPerResolutionHuman}
              </span>
              {" → "}
              <span className="text-command-pass">${roi.costPerResolutionAgent}</span>
            </p>
            <p className="mt-1 font-mono text-xs text-command-pass">
              {roi.savingsPercent}% reduction
            </p>
          </div>
        </div>
      </div>

      {/* ── Deploy Button ── */}
      <div className="rounded-xl border border-command-border bg-command-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-command-text">
              {isDeployed ? "Agent deployment confirmed" : "Finalize hiring decision"}
            </p>
            <p className="mt-1 text-xs text-command-muted">
              {isDeployed
                ? `${winner.candidateName} is now live in your environment.`
                : `Deploy ${winner.candidateName} as your APA-vetted digital worker.`}
            </p>
          </div>

          <button
            type="button"
            disabled={isDeployed}
            onClick={onDeploy}
            className={`min-w-[160px] rounded-xl px-6 py-3 font-mono text-sm font-bold tracking-wide transition ${
              isDeployed
                ? "cursor-not-allowed border border-command-pass/40 bg-command-pass/10 text-command-pass"
                : "border border-command-action bg-command-action text-command-bg hover:bg-command-action/85 shadow-glow"
            }`}
          >
            {isDeployed ? "✓ DEPLOYED" : "▶ Deploy Agent"}
          </button>
        </div>
      </div>
    </section>
  );
}
