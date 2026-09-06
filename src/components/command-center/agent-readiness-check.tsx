"use client";

import { AJD } from "../../lib/intake-agent/mock";

// PLACEHOLDER — awaiting the real implementation to be pasted in.
// Only the props contract below is relied on by IntakeTerminal.

export interface AgentReadinessCheckProps {
  ajd: AJD;
  onClose: () => void;
}

export function AgentReadinessCheck({ ajd, onClose }: AgentReadinessCheckProps) {
  return (
    <div className="mt-4 rounded-lg border border-command-border bg-command-bg p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-mono text-xs uppercase tracking-[0.14em] text-command-muted">
          Readiness Check · {ajd.job_title}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-command-border px-3 py-1 font-mono text-xs text-command-muted transition hover:text-command-text"
        >
          Close
        </button>
      </div>
      <p className="mt-3 font-mono text-sm text-command-muted">
        Placeholder component. Replace with the real readiness check.
      </p>
    </div>
  );
}
