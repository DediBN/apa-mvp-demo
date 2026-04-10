"use client";

import { useState } from "react";
import { ActiveAgent, AgentHealthStatus, ACTIVE_FLEET, OrchestrationLink, OptimizationAlert } from "../../lib/fleet/mock";
import { StatusPill } from "../ui/status-pill";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value}`;
}

function sourceTone(source: string): string {
  if (source === "OpenAI") return "border-command-action/50 text-command-action";
  if (source === "CrewAI") return "border-command-warning/50 text-command-warning";
  return "border-command-border text-command-muted";
}

function healthToneClass(status: AgentHealthStatus): string {
  if (status === "ONLINE") return "bg-command-pass";
  if (status === "DEGRADED") return "bg-command-warning";
  return "bg-command-fail";
}

function healthPillTone(status: AgentHealthStatus): "pass" | "fail" | "neutral" {
  if (status === "ONLINE") return "pass";
  if (status === "DEGRADED") return "neutral";
  return "fail";
}

function linkTypeIcon(type: OrchestrationLink["targetType"]): string {
  if (type === "CRM") return "CRM";
  if (type === "ERP") return "ERP";
  if (type === "KNOWLEDGE_BASE") return "KB";
  if (type === "TICKETING") return "TKT";
  return "AGT";
}

function linkTypeTone(type: OrchestrationLink["targetType"]): string {
  if (type === "AGENT") return "border-command-action/40 text-command-action bg-command-action/5";
  if (type === "CRM") return "border-command-warning/40 text-command-warning bg-command-warning/5";
  return "border-command-border text-command-muted bg-command-panel";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HealthPulse({ status }: { status: AgentHealthStatus }) {
  const dotClass = healthToneClass(status);
  return (
    <div className="relative flex h-3 w-3 flex-shrink-0 items-center justify-center">
      {status !== "OFFLINE" && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dotClass} opacity-50`}
        />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${dotClass}`} />
    </div>
  );
}

function OrchestrationLinks({ links }: { links: OrchestrationLink[] }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-command-muted">
        Orchestration Links
      </p>
      <div className="mt-2 space-y-2">
        {links.map((link) => (
          <div key={link.targetName} className="flex items-center gap-2">
            {/* Agent-side dot */}
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-command-action" />
            {/* Animated connector line */}
            <div className="relative flex-1 overflow-hidden">
              <div className="h-px w-full bg-command-border" />
              <div className="absolute inset-y-0 left-0 h-px w-8 animate-[radarSweep_2s_linear_infinite] bg-gradient-to-r from-transparent via-command-action to-transparent opacity-70" />
            </div>
            {/* Target badge */}
            <span
              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${linkTypeTone(link.targetType)}`}
            >
              {linkTypeIcon(link.targetType)}
            </span>
            <span className="min-w-0 truncate text-xs text-command-text">
              {link.targetName}
            </span>
            {/* Message rate */}
            <span className="flex-shrink-0 font-mono text-[10px] text-command-muted">
              {link.messagesPerHour}/hr
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OptimizationAlertBadge({ alert }: { alert: OptimizationAlert }) {
  return (
    <div className="rounded-lg border border-command-warning/50 bg-command-warning/8 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-px text-command-warning">⚡</span>
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-command-warning">
            New Alternative Found
          </p>
          <p className="mt-1 text-xs text-command-muted">
            A{" "}
            <span className="text-command-text">{alert.suggestedSource}</span> agent scores{" "}
            <span className="font-semibold text-command-warning">{alert.alternativeScore}/100</span>{" "}
            composite —{" "}
            <span className="font-semibold text-command-pass">
              +{formatCurrency(alert.roiGainPerYear)}/yr
            </span>{" "}
            ROI potential.
          </p>
        </div>
        <button
          type="button"
          className="ml-auto flex-shrink-0 rounded border border-command-warning/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-command-warning transition hover:bg-command-warning/10"
        >
          Review
        </button>
      </div>
    </div>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-command-border bg-command-bg/60 px-3 py-2 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-command-muted">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold text-command-text">{value}</p>
    </div>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: ActiveAgent }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="command-card-elevated flex flex-col gap-4 p-5 animate-fadeUp">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <HealthPulse status={agent.status} />
          <div>
            <h3 className="text-sm font-semibold text-command-text">{agent.name}</h3>
            <p className="mt-0.5 font-mono text-xs text-command-muted">{agent.domain}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${sourceTone(agent.source)}`}
          >
            {agent.source}
          </span>
          <StatusPill
            label={agent.status}
            tone={healthPillTone(agent.status)}
          />
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricChip label="Composite" value={`${agent.compositeScore}`} />
        <MetricChip label="Uptime" value={`${agent.uptimePercent}%`} />
        <MetricChip label="Tasks" value={agent.tasksProcessed.toLocaleString()} />
        <MetricChip label="Monthly ROI" value={formatCurrency(agent.monthlyROI)} />
      </div>

      {/* Orchestration links */}
      <OrchestrationLinks links={agent.orchestrationLinks} />

      {/* Optimization alert */}
      {agent.alert ? <OptimizationAlertBadge alert={agent.alert} /> : null}

      {/* Expandable detail footer */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="mt-auto border-t border-command-border pt-3 text-left font-mono text-[11px] text-command-muted transition hover:text-command-action"
      >
        {expanded ? "▲ Hide details" : "▼ Show details"}
      </button>

      {expanded ? (
        <div className="grid grid-cols-2 gap-2 text-xs text-command-muted animate-fadeUp">
          <p>
            <span className="text-command-text">Deployed:</span> {agent.deployedAt}
          </p>
          <p>
            <span className="text-command-text">Avg Latency:</span> {agent.avgLatencyMs.toLocaleString()} ms
          </p>
          <p>
            <span className="text-command-text">Source:</span> {agent.source}
          </p>
          <p>
            <span className="text-command-text">Agent ID:</span>{" "}
            <span className="font-mono">{agent.id}</span>
          </p>
        </div>
      ) : null}
    </article>
  );
}

// ─── Fleet Summary Bar ────────────────────────────────────────────────────────

function FleetSummaryBar({ agents }: { agents: ActiveAgent[] }) {
  const online = agents.filter((a) => a.status === "ONLINE").length;
  const degraded = agents.filter((a) => a.status === "DEGRADED").length;
  const totalROI = agents.reduce((acc, a) => acc + a.monthlyROI, 0);
  const alerts = agents.filter((a) => a.alert !== null).length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="command-card p-4 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-command-muted">Total Agents</p>
        <p className="mt-1 text-2xl font-bold text-command-text">{agents.length}</p>
      </div>
      <div className="command-card p-4 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-command-muted">Online</p>
        <p className="mt-1 text-2xl font-bold text-command-pass">{online}</p>
      </div>
      <div className="command-card p-4 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-command-muted">Alerts</p>
        <p className={`mt-1 text-2xl font-bold ${alerts > 0 ? "text-command-warning" : "text-command-pass"}`}>
          {alerts}
        </p>
      </div>
      <div className="command-card p-4 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-command-muted">Monthly ROI</p>
        <p className="mt-1 text-2xl font-bold text-command-action">{formatCurrency(totalROI)}</p>
      </div>
      {degraded > 0 && (
        <p className="col-span-full font-mono text-xs text-command-warning">
          ⚠ {degraded} agent{degraded > 1 ? "s" : ""} operating in DEGRADED state — review recommended.
        </p>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function FleetManagementDashboard() {
  return (
    <section className="space-y-5 animate-fadeUp">
      {/* Section header */}
      <div className="command-card-elevated p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-command-muted">
              Fleet Management
            </p>
            <h2 className="mt-1 text-lg font-semibold text-command-text">
              Active Agent Registry
            </h2>
            <p className="mt-1 text-sm text-command-muted">
              Live monitoring, orchestration links, and optimization recommendations.
            </p>
          </div>
          <StatusPill label="LIVE" tone="pass" />
        </div>
      </div>

      {/* Summary bar */}
      <FleetSummaryBar agents={ACTIVE_FLEET} />

      {/* Agent cards grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {ACTIVE_FLEET.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </section>
  );
}
