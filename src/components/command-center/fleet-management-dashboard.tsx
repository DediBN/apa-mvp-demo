"use client";

import { useState } from "react";
import { ActiveAgent, AgentHealthStatus, ACTIVE_FLEET, OrchestrationLink, OptimizationAlert } from "../../lib/fleet/mock";
import { StatusPill } from "../ui/status-pill";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConflictState {
  active: boolean;
  agentAId: string;
  agentBId: string;
  description: string;
  agentAPosition: string;
  agentBPosition: string;
  resolved: boolean;
  resolutionMessage?: string;
}

interface UpgradeModalState {
  active: boolean;
  agentId: string;
  isUpgrading: boolean;
  upgradeProgress: number;
  upgraded: boolean;
}

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

function OptimizationAlertBadge({ alert, onViewComparison }: { alert: OptimizationAlert; onViewComparison: () => void }) {
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
          onClick={onViewComparison}
          className="ml-auto flex-shrink-0 rounded border border-command-warning/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-command-warning transition hover:bg-command-warning/10"
        >
          View Comparison
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

function AgentCard({ agent, isInConflict, conflictResolved, onViewUpgrade }: { agent: ActiveAgent; isInConflict: boolean; conflictResolved: boolean; onViewUpgrade: (agentId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  
  const borderClass = isInConflict && !conflictResolved
    ? "border-command-fail"
    : conflictResolved
    ? "border-command-pass animate-pulse"
    : "border-command-border";

  return (
    <article className={`command-card-elevated flex flex-col gap-4 p-5 animate-fadeUp border-2 ${borderClass} transition-all`}>
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
      {agent.alert ? <OptimizationAlertBadge alert={agent.alert} onViewComparison={() => onViewUpgrade(agent.id)} /> : null}

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

// ─── Upgrade Comparison Modal ────────────────────────────────────────────────

function UpgradeComparisonModal({
  agent,
  alert,
  isOpen,
  isUpgrading,
  upgradeProgress,
  onApprove,
  onClose
}: {
  agent: ActiveAgent;
  alert: OptimizationAlert;
  isOpen: boolean;
  isUpgrading: boolean;
  upgradeProgress: number;
  onApprove: () => void;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  const annualSavingsGain = alert.roiGainPerYear;
  const currentMonthlyROI = agent.monthlyROI;
  const newMonthlyROI = Math.round(currentMonthlyROI * 1.15);
  const newCompositeScore = Math.round(agent.compositeScore * 1.1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-command-bg/80 backdrop-blur-sm animate-fadeUp">
      <div className="w-full max-w-2xl rounded-xl border border-command-border bg-command-panelElevated p-6 shadow-glow">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-command-text">Smart Replacement Analysis</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isUpgrading}
            className="text-command-muted transition hover:text-command-action disabled:opacity-45"
          >
            ✕
          </button>
        </div>

        {!isUpgrading ? (
          <>
            {/* Side-by-side comparison */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Current agent */}
              <div className="rounded-lg border border-command-border bg-command-bg/60 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.12em] text-command-muted">Current Agent</p>
                <p className="mt-2 text-sm font-semibold text-command-text">{agent.name}</p>
                <div className="mt-4 space-y-2 text-xs">
                  <p>
                    <span className="text-command-muted">Source:</span>{" "}
                    <span className="text-command-text">{agent.source}</span>
                  </p>
                  <p>
                    <span className="text-command-muted">Composite:</span>{" "}
                    <span className="text-command-text font-mono">{agent.compositeScore}/100</span>
                  </p>
                  <p>
                    <span className="text-command-muted">Monthly ROI:</span>{" "}
                    <span className="text-command-text font-mono">{formatCurrency(currentMonthlyROI)}</span>
                  </p>
                  <p>
                    <span className="text-command-muted">Latency:</span>{" "}
                    <span className="text-command-text font-mono">{agent.avgLatencyMs}ms</span>
                  </p>
                </div>
              </div>

              {/* New candidate */}
              <div className="rounded-lg border border-command-pass/40 bg-command-pass/5 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.12em] text-command-pass">New Candidate</p>
                <p className="mt-2 text-sm font-semibold text-command-text">{alert.suggestedSource} Agent (Optimized)</p>
                <div className="mt-4 space-y-2 text-xs">
                  <p>
                    <span className="text-command-muted">Source:</span>{" "}
                    <span className="text-command-pass">{alert.suggestedSource}</span>
                  </p>
                  <p>
                    <span className="text-command-muted">Composite:</span>{" "}
                    <span className="text-command-pass font-mono">{newCompositeScore}/100</span>
                    <span className="text-command-pass ml-1 text-[10px]">
                      (+{newCompositeScore - agent.compositeScore})
                    </span>
                  </p>
                  <p>
                    <span className="text-command-muted">Monthly ROI:</span>{" "}
                    <span className="text-command-pass font-mono">{formatCurrency(newMonthlyROI)}</span>
                    <span className="text-command-pass ml-1 text-[10px]">
                      (+{formatCurrency(newMonthlyROI - currentMonthlyROI)})
                    </span>
                  </p>
                  <p>
                    <span className="text-command-muted">Latency:</span>{" "}
                    <span className="text-command-pass font-mono">~950ms</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Annual savings gain highlight */}
            <div className="rounded-lg border border-command-action/40 bg-command-action/10 p-4 mb-6">
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-command-action">Annual Savings Gain</p>
              <p className="mt-2 text-2xl font-bold text-command-action">
                {formatCurrency(annualSavingsGain)}/year
              </p>
              <p className="mt-1 text-xs text-command-muted">
                By switching to {alert.suggestedSource}, you'll save an additional{" "}
                <span className="text-command-action font-semibold">{formatCurrency(annualSavingsGain)}</span> annually through improved ROI and lower API costs.
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-command-border bg-command-panel px-4 py-2 font-mono text-sm text-command-muted transition hover:border-command-action hover:text-command-action"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onApprove}
                className="flex-1 rounded-lg border border-command-action bg-command-action/10 px-4 py-2 font-mono text-sm font-semibold text-command-action transition hover:bg-command-action/20"
              >
                Approve Upgrade
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Upgrade progress */}
            <div className="space-y-4">
              <p className="text-sm text-command-muted">
                Deploying new model and transferring state...
              </p>
              <div className="overflow-hidden rounded-lg border border-command-border bg-command-bg">
                <div
                  className="h-2 bg-gradient-to-r from-command-action via-command-action to-command-pass transition-all duration-300"
                  style={{ width: `${upgradeProgress}%` }}
                />
              </div>
              <p className="text-center font-mono text-xs text-command-muted">
                {upgradeProgress}%
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Conflict Detection Panel ────────────────────────────────────────────────

function ConflictDetectionPanel({ conflict, onResolve }: { conflict: ConflictState; onResolve: () => void }) {
  const agentA = ACTIVE_FLEET.find((a) => a.id === conflict.agentAId);
  const agentB = ACTIVE_FLEET.find((a) => a.id === conflict.agentBId);

  if (!agentA || !agentB) return null;

  if (conflict.resolved && conflict.resolutionMessage) {
    return (
      <div className="rounded-lg border border-command-pass/50 bg-command-pass/10 p-4 animate-fadeUp">
        <div className="flex items-start gap-3">
          <span className="text-lg">✓</span>
          <div className="flex-1">
            <p className="font-mono text-sm font-semibold uppercase tracking-[0.12em] text-command-pass">
              {conflict.resolutionMessage}
            </p>
            <p className="mt-2 text-xs text-command-text">
              Shared context updated. Both agents now operating under unified policy constraints.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-command-fail/50 bg-command-fail/10 p-4 animate-fadeUp">
      <div className="space-y-4">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-command-fail">
            ⚠ Urgent: Conflict Detected
          </p>
          <p className="mt-1 text-sm text-command-text">{conflict.description}</p>
        </div>

        {/* Agent positions */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded border border-command-fail/30 bg-command-fail/5 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-command-muted">
              Agent A
            </p>
            <p className="mt-1 text-xs font-semibold text-command-text">{agentA.name}</p>
            <p className="mt-2 text-xs text-command-text">{conflict.agentAPosition}</p>
          </div>
          <div className="rounded border border-command-fail/30 bg-command-fail/5 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-command-muted">
              Agent B
            </p>
            <p className="mt-1 text-xs font-semibold text-command-text">{agentB.name}</p>
            <p className="mt-2 text-xs text-command-text">{conflict.agentBPosition}</p>
          </div>
        </div>

        {/* Resolution button */}
        <button
          type="button"
          onClick={onResolve}
          className="w-full rounded-lg border border-command-action bg-command-action/10 px-3 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-command-action transition hover:bg-command-action/20"
        >
          Apply Priority: Service Agent Policy
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function FleetManagementDashboard() {
  const [conflict, setConflict] = useState<ConflictState>({
    active: false,
    agentAId: "",
    agentBId: "",
    description: "",
    agentAPosition: "",
    agentBPosition: "",
    resolved: false
  });

  const [upgradeModal, setUpgradeModal] = useState<UpgradeModalState>({
    active: false,
    agentId: "",
    isUpgrading: false,
    upgradeProgress: 0,
    upgraded: false
  });

  const [upgradedAgents, setUpgradedAgents] = useState<Set<string>>(new Set());

  const handleSimulateConflict = () => {
    setConflict({
      active: true,
      agentAId: "agent_prod_002",
      agentBId: "agent_prod_001",
      description: "Pricing Policy Overlap - Conflicting discount authority",
      agentAPosition: "Wants to grant 20% customer discount for strategic account",
      agentBPosition: "Enforcing 10% maximum discount limit per policy",
      resolved: false
    });
  };

  const handleResolveConflict = () => {
    setTimeout(() => {
      setConflict((prev) => ({
        ...prev,
        resolved: true,
        resolutionMessage: "Shared Context Updated. Orchestration Restored."
      }));
      setTimeout(() => {
        setConflict({
          active: false,
          agentAId: "",
          agentBId: "",
          description: "",
          agentAPosition: "",
          agentBPosition: "",
          resolved: false
        });
      }, 3500);
    }, 800);
  };

  const handleViewUpgrade = (agentId: string) => {
    setUpgradeModal({
      active: true,
      agentId,
      isUpgrading: false,
      upgradeProgress: 0,
      upgraded: false
    });
  };

  const handleApproveUpgrade = () => {
    const agentIdToUpgrade = upgradeModal.agentId;
    setUpgradeModal((prev) => ({ ...prev, isUpgrading: true, upgradeProgress: 0 }));

    const progressInterval = setInterval(() => {
      setUpgradeModal((prev) => {
        const newProgress = prev.upgradeProgress + Math.random() * 25;
        if (newProgress >= 100) {
          clearInterval(progressInterval);
          setUpgradedAgents((prevSet) => new Set(prevSet).add(agentIdToUpgrade));
          setTimeout(() => {
            setUpgradeModal((p) => ({ ...p, upgraded: true }));
            setTimeout(() => {
              setUpgradeModal({ active: false, agentId: "", isUpgrading: false, upgradeProgress: 0, upgraded: false });
            }, 1500);
          }, 300);
          return { ...prev, upgradeProgress: 100 };
        }
        return { ...prev, upgradeProgress: newProgress };
      });
    }, 400);
  };

  const handleCloseUpgradeModal = () => {
    if (!upgradeModal.isUpgrading) {
      setUpgradeModal({ active: false, agentId: "", isUpgrading: false, upgradeProgress: 0, upgraded: false });
    }
  };

  const currentAgent = ACTIVE_FLEET.find((a) => a.id === upgradeModal.agentId);
  const currentAlert = currentAgent?.alert;

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
              Live monitoring, orchestration links, and conflict resolution.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSimulateConflict}
              disabled={conflict.active}
              className="rounded-lg border border-command-warning/60 bg-command-warning/10 px-3 py-2 font-mono text-xs font-semibold text-command-warning transition hover:bg-command-warning/20 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {conflict.active ? "Conflict Active" : "↻ Simulate Conflict"}
            </button>
            <StatusPill label="LIVE" tone="pass" />
          </div>
        </div>
      </div>

      {/* Conflict detection (if active) */}
      {conflict.active ? (
        <ConflictDetectionPanel conflict={conflict} onResolve={handleResolveConflict} />
      ) : null}

      {/* Upgrade comparison modal */}
      {currentAgent && currentAlert ? (
        <UpgradeComparisonModal
          agent={currentAgent}
          alert={currentAlert}
          isOpen={upgradeModal.active}
          isUpgrading={upgradeModal.isUpgrading}
          upgradeProgress={upgradeModal.upgradeProgress}
          onApprove={handleApproveUpgrade}
          onClose={handleCloseUpgradeModal}
        />
      ) : null}

      {/* Summary bar */}
      <FleetSummaryBar agents={ACTIVE_FLEET} />

      {/* Agent cards grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {ACTIVE_FLEET.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            isInConflict={conflict.active && (conflict.agentAId === agent.id || conflict.agentBId === agent.id)}
            conflictResolved={conflict.resolved && (conflict.agentAId === agent.id || conflict.agentBId === agent.id)}
            onViewUpgrade={handleViewUpgrade}
          />
        ))}
      </div>
    </section>
  );
}
