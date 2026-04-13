"use client";

import { CandidateEvaluationResult, CandidateScorecard } from "../../lib/evaluation-agent/mock";

interface DetailedCandidateScorecardProps {
  result: CandidateEvaluationResult;
  onClose: () => void;
}

// ─── Parameter Radar for Single Candidate ───────────────────────────────────

const PARAM_DEFS: Array<{ key: keyof CandidateScorecard; label: string }> = [
  { key: "turingScore", label: "Turing Score (LLM Quality)" },
  { key: "securityScore", label: "Security (Data Protection)" },
  { key: "reliabilityScore", label: "Reliability (Uptime)" },
  { key: "objectionHandlingScore", label: "Objection Handling (User Support)" },
  { key: "hallucinationControlScore", label: "Hallucination Control (Accuracy)" },
  { key: "integrationStabilityScore", label: "Integration Stability (Deployment)" },
  { key: "costEfficiencyScore", label: "Cost Efficiency (ROI)" },
];

const N = PARAM_DEFS.length;
const CX = 150;
const CY = 150;
const MAX_R = 100;

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
  const r = MAX_R + 26;
  return {
    x: CX + r * Math.cos(a),
    y: CY + r * Math.sin(a)
  };
}

function SingleCandidateRadar({ scorecard }: { scorecard: CandidateScorecard }) {
  const points = Array.from({ length: N }, (_, i) => toXY(i, scorecard[PARAM_DEFS[i].key])).join(" ");

  return (
    <svg
      viewBox="0 0 300 300"
      className="mx-auto w-full max-w-[320px]"
      aria-label={`Radar chart for ${N}-parameter evaluation`}
    >
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={gridRing(f)} fill="none" stroke="#1F3B51" strokeWidth="1" />
      ))}

      {/* Axis lines */}
      {Array.from({ length: N }, (_, i) => {
        const a = axisAngle(i);
        return (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={(CX + MAX_R * Math.cos(a)).toFixed(1)}
            y2={(CY + MAX_R * Math.sin(a)).toFixed(1)}
            stroke="#1F3B51"
            strokeWidth="1"
          />
        );
      })}

      {/* Data polygon */}
      <polygon points={points} fill="rgba(100,255,218,0.15)" stroke="#64FFDA" strokeWidth="2" />

      {/* Labels */}
      {PARAM_DEFS.map((param, i) => {
        const pos = labelXY(i);
        return (
          <text
            key={param.key}
            x={pos.x}
            y={pos.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="font-mono text-[10px] fill-command-muted"
          >
            {param.key.replace("Score", "").slice(0, 6)}
          </text>
        );
      })}

      {/* Score values on polygon */}
      {PARAM_DEFS.map((param, i) => {
        const pos = {
          x: parseFloat(toXY(i, scorecard[param.key]).split(",")[0]),
          y: parseFloat(toXY(i, scorecard[param.key]).split(",")[1])
        };
        return (
          <circle
            key={`dot-${param.key}`}
            cx={pos.x}
            cy={pos.y}
            r="3.5"
            fill="#64FFDA"
            stroke="#0A1B24"
            strokeWidth="1.5"
          />
        );
      })}
    </svg>
  );
}

// ─── Score Card Detail ───────────────────────────────────────────────────────

function ScoreRow({ label, value, color = "#64FFDA" }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-command-border/30 bg-command-bg/50 px-3 py-2.5">
      <span className="text-xs font-semibold text-command-text">{label}</span>
      <div className="flex items-center gap-2">
        <div className="h-2 w-24 rounded-full border border-command-border/40 bg-command-panel overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${value}%`,
              backgroundColor: color,
              boxShadow: `0 0 8px ${color}60`
            }}
          />
        </div>
        <span className="font-mono text-sm font-bold" style={{ color, textShadow: `0 0 6px ${color}40` }}>
          {value}
        </span>
      </div>
    </div>
  );
}

// ─── Deployment & Source Mapping ────────────────────────────────────────────

function getSourceInfo(source: "OpenAI" | "Hugging Face" | "CrewAI"): { label: string; url: string } {
  switch (source) {
    case "OpenAI":
      return {
        label: "Source: OpenAI GPT Store",
        url: "https://chatgpt.com/gpts"
      };
    case "Hugging Face":
      return {
        label: "Source: Hugging Face Hub",
        url: "https://huggingface.co/models"
      };
    case "CrewAI":
      return {
        label: "Source: CrewAI Marketplace",
        url: "https://crewai.io"
      };
  }
}

function handleDeployment(candidateName: string, source: "OpenAI" | "Hugging Face" | "CrewAI") {
  // In a real implementation, this would trigger the APA integration
  const sourceInfo = getSourceInfo(source);
  alert(
    `Deploying "${candidateName}" via APA Integration\n\n` +
    `Source: ${sourceInfo.label}\n` +
    `Integration endpoint initiated...`
  );
  // Here you would call an API endpoint to trigger actual deployment
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DetailedCandidateScorecard({ result, onClose }: DetailedCandidateScorecardProps) {
  const { candidateName, candidateSource, scorecard, objectionPasses, hallucinationPasses } = result;
  const sourceInfo = getSourceInfo(candidateSource);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-command-action/40 bg-command-bg shadow-2xl animate-slideUp">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-2 hover:bg-command-border/50 transition text-command-muted hover:text-command-text"
          aria-label="Close scorecard"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="border-b border-command-border/40 bg-command-action/5 px-6 py-5 md:px-8 md:py-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-command-action">
            Evaluation Detail
          </p>
          <h2 className="mt-2 text-2xl md:text-3xl font-bold text-command-text">{candidateName}</h2>
          <p className="mt-2 text-command-muted text-sm">
            Expert-grade 7-factor analysis justifying the fit assessment
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-5 md:px-8 md:py-6 space-y-6">
          {/* Composite Score Banner */}
          <div className="rounded-xl border border-command-action/40 bg-command-action/10 p-5">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-command-action">
              Composite Fit Score
            </p>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-5xl font-bold text-command-action">{scorecard.compositeScore}</span>
              <span className="text-command-muted">/100</span>
            </div>
            <p className="mt-3 text-xs text-command-muted">
              This candidate has demonstrated strong alignment with your requirements across all evaluation parameters.
            </p>
          </div>

          {/* 7-Parameter Radar */}
          <div className="rounded-lg border border-command-border/40 bg-command-panel/40 p-5 md:p-6">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-command-muted">
              7-Parameter Evaluation Radar
            </p>
            <div className="mt-4">
              <SingleCandidateRadar scorecard={scorecard} />
            </div>
          </div>

          {/* Individual Scores */}
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-command-muted mb-3">
              Detailed Scores
            </p>
            <div className="space-y-2">
              <ScoreRow label="Turing Score (LLM Quality)" value={scorecard.turingScore} />
              <ScoreRow label="Security (Data Protection)" value={scorecard.securityScore} />
              <ScoreRow label="Reliability (Uptime)" value={scorecard.reliabilityScore} />
              <ScoreRow label="Objection Handling (User Support)" value={scorecard.objectionHandlingScore} />
              <ScoreRow label="Hallucination Control (Accuracy)" value={scorecard.hallucinationControlScore} />
              <ScoreRow label="Integration Stability (Deployment)" value={scorecard.integrationStabilityScore} />
              <ScoreRow label="Cost Efficiency (ROI)" value={scorecard.costEfficiencyScore} />
            </div>
          </div>

          {/* Test Results Summary */}
          <div className="rounded-lg border border-command-border/40 bg-command-panel/40 p-4 md:p-5">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-command-muted mb-3">
              Test Results Summary
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded border border-command-border/50 bg-command-bg/70 p-3">
                <p className="text-xs font-semibold text-command-muted">Objection Handling Tests</p>
                <p className="mt-2 text-2xl font-bold text-command-action">
                  {objectionPasses}
                  <span className="text-sm text-command-muted ml-1">/40</span>
                </p>
                <p className="mt-1 text-[11px] text-command-muted">
                  {Math.round((objectionPasses / 40) * 100)}% pass rate
                </p>
              </div>

              <div className="rounded border border-command-border/50 bg-command-bg/70 p-3">
                <p className="text-xs font-semibold text-command-muted">Hallucination Control Tests</p>
                <p className="mt-2 text-2xl font-bold text-command-success">
                  {hallucinationPasses}
                  <span className="text-sm text-command-muted ml-1">/30</span>
                </p>
                <p className="mt-1 text-[11px] text-command-muted">
                  {Math.round((hallucinationPasses / 30) * 100)}% pass rate
                </p>
              </div>
            </div>
          </div>

          {/* Deployment & Source */}
          <div className="rounded-lg border border-command-action/30 bg-command-action/8 p-4 md:p-5">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-command-action mb-3">
              Deployment & Source
            </p>
            <div className="flex items-center justify-between gap-4 mb-4 rounded border border-command-border/50 bg-command-bg/70 p-3">
              <div>
                <p className="text-xs font-semibold text-command-muted">Agent Marketplace</p>
                <p className="mt-1 text-sm text-command-text">{sourceInfo.label}</p>
              </div>
              <a
                href={sourceInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 text-command-action hover:text-command-action/80 transition font-mono text-xs underline"
              >
                View →
              </a>
            </div>
            <p className="text-xs text-command-muted mb-3">
              APA serves as the Broker of Authority, integrating verified agents from multiple marketplaces directly into your enterprise infrastructure.
            </p>
          </div>

          {/* Deployment Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => handleDeployment(candidateName, candidateSource)}
              className="flex-1 rounded-xl border border-command-action bg-command-action text-command-bg hover:bg-command-action/85 transition px-4 py-3 font-mono text-sm font-semibold shadow-glow"
            >
              ▶ Deploy via APA Integration
            </button>
            <a
              href={sourceInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-xl border border-command-border bg-command-bg hover:bg-command-panel transition px-4 py-3 font-mono text-sm font-semibold text-command-text text-center"
            >
              View Original Listing
            </a>
          </div>

          {/* Close Action */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-command-border bg-command-bg hover:bg-command-panel transition px-4 py-3 font-mono text-sm font-semibold text-command-text"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
