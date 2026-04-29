"use client";

import { useEffect, useMemo, useState } from "react";

type AgentSource = "OpenAI" | "Hugging Face" | "CrewAI";

interface AgentProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentName: string;
  domainHint?: string;
  source: AgentSource;
  compositeScore: number;
  savingsPercent: number;
}

type DomainProfile = {
  domainLabel: string;
  simpleSentence: string;
  steps: [string, string, string];
  extraIntegrations: string[];
};

type ExpandedDetails = {
  howToWorkWithIt: string[];
  setupTime: string;
  firstResult: string;
  fullRoiTimeline: string;
  outcomes: [string, string, string];
};

function classifyDomain(domainHint: string | undefined): "support" | "sales" | "finance" | "operations" | "general" {
  const normalized = (domainHint || "").toLowerCase();

  if (normalized.includes("support") || normalized.includes("ticket") || normalized.includes("customer")) {
    return "support";
  }

  if (normalized.includes("sales") || normalized.includes("lead") || normalized.includes("pipeline")) {
    return "sales";
  }

  if (normalized.includes("finance") || normalized.includes("invoice") || normalized.includes("billing")) {
    return "finance";
  }

  if (normalized.includes("operations") || normalized.includes("ops")) {
    return "operations";
  }

  return "general";
}

function buildDomainProfile(agentName: string, domainHint: string | undefined): DomainProfile {
  const domain = classifyDomain(domainHint);

  if (domain === "support") {
    return {
      domainLabel: "Customer Support",
      simpleSentence: `${agentName} handles routine customer questions and routes complex issues to your team.`,
      steps: [
        "Connect your help desk and CRM accounts.",
        "Add your approved policy and knowledge content.",
        "Start with a pilot queue and review outcomes daily."
      ],
      extraIntegrations: ["Help Desk", "Knowledge Base"]
    };
  }

  if (domain === "sales") {
    return {
      domainLabel: "Sales Operations",
      simpleSentence: `${agentName} qualifies leads and keeps your pipeline moving with less manual follow-up.`,
      steps: [
        "Connect your CRM and inbound lead channels.",
        "Set your lead scoring and routing rules.",
        "Launch with one segment, then expand by team."
      ],
      extraIntegrations: ["Calendar", "Dialer"]
    };
  }

  if (domain === "finance") {
    return {
      domainLabel: "Finance Operations",
      simpleSentence: `${agentName} speeds up recurring finance tasks while flagging exceptions for human review.`,
      steps: [
        "Connect billing, ERP, and invoice sources.",
        "Set approval and exception thresholds.",
        "Start with one workflow and monitor accuracy."
      ],
      extraIntegrations: ["ERP", "Billing"]
    };
  }

  if (domain === "operations") {
    return {
      domainLabel: "Operations",
      simpleSentence: `${agentName} takes over repetitive operational requests so your team can focus on high-value work.`,
      steps: [
        "Connect your key workflow tools.",
        "Define handoff rules and escalation points.",
        "Run a two-week pilot and tune from feedback."
      ],
      extraIntegrations: ["Ticketing", "Knowledge Base"]
    };
  }

  return {
    domainLabel: "General Operations",
    simpleSentence: `${agentName} automates day-to-day requests and keeps your team focused on priority tasks.`,
    steps: [
      "Connect your core systems and communication tools.",
      "Choose the first repetitive process to automate.",
      "Roll out to one team, then scale across departments."
    ],
    extraIntegrations: ["Ticketing", "Docs"]
  };
}

function sourceIntegration(source: AgentSource): string {
  if (source === "OpenAI") {
    return "OpenAI Platform";
  }
  if (source === "Hugging Face") {
    return "Hugging Face Hub";
  }
  return "CrewAI Orchestrator";
}

function buildExpandedDetails(
  domain: "support" | "sales" | "finance" | "operations" | "general",
  agentName: string,
  estimatedHours: number,
  roundedSavings: number,
  manualWorkReduction: number
): ExpandedDetails {
  if (domain === "support") {
    return {
      howToWorkWithIt: [
        `Share incoming customer requests with ${agentName}.`,
        "The agent replies to routine questions automatically.",
        "It flags sensitive or complex cases for your team.",
        "You get a clear summary of completed and escalated work."
      ],
      setupTime: "Ready in 2-3 days",
      firstResult: "First results within 24 hours",
      fullRoiTimeline: "Full impact visible within 30 days",
      outcomes: [
        `Save about ${estimatedHours} hours each week on repetitive support tasks.`,
        `Lower support operating cost by around ${roundedSavings}%.`,
        `Improve answer consistency while automating about ${manualWorkReduction}% of repeat work.`
      ]
    };
  }

  if (domain === "sales") {
    return {
      howToWorkWithIt: [
        `Send new leads and follow-up tasks to ${agentName}.`,
        "The agent qualifies prospects and drafts next actions.",
        "Your team reviews high-priority deals and exceptions.",
        "Progress updates are shared in plain language each day."
      ],
      setupTime: "Ready in 2-4 days",
      firstResult: "First results within 24-48 hours",
      fullRoiTimeline: "Full impact visible within 30-45 days",
      outcomes: [
        `Free up roughly ${estimatedHours} hours per week from manual lead handling.`,
        `Reduce outreach and qualification cost by around ${roundedSavings}%.`,
        "Improve lead response speed and pipeline quality with consistent follow-through."
      ]
    };
  }

  if (domain === "finance") {
    return {
      howToWorkWithIt: [
        `Route recurring finance tasks to ${agentName}.`,
        "The agent checks records and handles routine validations.",
        "Exceptions are sent to your team with context included.",
        "You review a daily summary of handled and flagged items."
      ],
      setupTime: "Ready in 3-5 days",
      firstResult: "First results within 48 hours",
      fullRoiTimeline: "Full impact visible within 30-60 days",
      outcomes: [
        `Recover about ${estimatedHours} hours each week from repetitive finance workflows.`,
        `Lower processing cost by around ${roundedSavings}% through automation.`,
        "Improve data quality by standardizing routine checks and handoffs."
      ]
    };
  }

  if (domain === "operations") {
    return {
      howToWorkWithIt: [
        `Describe operational tasks once and ${agentName} handles repeats.`,
        "The agent runs routine steps and tracks progress automatically.",
        "Your team only steps in for exceptions or approvals.",
        "You get status updates and outcomes in one simple view."
      ],
      setupTime: "Ready in 2-4 days",
      firstResult: "First results within 24-48 hours",
      fullRoiTimeline: "Full impact visible within 30 days",
      outcomes: [
        `Save about ${estimatedHours} hours each week on repeat operations work.`,
        `Reduce process overhead by around ${roundedSavings}% across common tasks.`,
        "Improve execution quality with clearer handoffs and fewer manual gaps."
      ]
    };
  }

  return {
    howToWorkWithIt: [
      `Tell ${agentName} what you need done in plain language.`,
      "The agent handles repetitive steps automatically.",
      "Your team reviews exceptions and final approvals.",
      "You receive clear summaries on completed work and impact."
    ],
    setupTime: "Ready in 2-3 days",
    firstResult: "First results within 24 hours",
    fullRoiTimeline: "Full impact visible within 30 days",
    outcomes: [
      `Save around ${estimatedHours} hours per week on routine tasks.`,
      `Lower recurring operating cost by about ${roundedSavings}%.`,
      `Improve consistency while automating about ${manualWorkReduction}% of repetitive work.`
    ]
  };
}

function MetricCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-command-border bg-command-bg/70 p-3">
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-command-muted">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-command-action/40 bg-command-action/10 text-command-action">
          {icon}
        </span>
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-command-text">{value}</p>
    </div>
  );
}

export function AgentProfileModal({
  isOpen,
  onClose,
  agentName,
  domainHint,
  source,
  compositeScore,
  savingsPercent
}: AgentProfileModalProps) {
  const profile = useMemo(() => buildDomainProfile(agentName, domainHint), [agentName, domainHint]);
  const [isExpanded, setIsExpanded] = useState(false);

  const roundedSavings = Math.max(10, Math.min(95, Math.round(savingsPercent)));
  const estimatedHours = Math.max(6, Math.min(22, Math.round(compositeScore / 7)));
  const manualWorkReduction = Math.max(35, Math.min(90, Math.round(compositeScore * 0.9)));
  const domain = useMemo(() => classifyDomain(domainHint), [domainHint]);

  const expandedDetails = useMemo(
    () => buildExpandedDetails(domain, agentName, estimatedHours, roundedSavings, manualWorkReduction),
    [agentName, domain, estimatedHours, manualWorkReduction, roundedSavings]
  );

  const integrations = useMemo(
    () => ["CRM", "Email", "Slack", "API", ...profile.extraIntegrations, sourceIntegration(source)],
    [profile.extraIntegrations, source]
  );

  useEffect(() => {
    if (!isOpen) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setIsExpanded(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-command-border bg-command-panel shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg border border-command-border bg-command-bg/80 px-2 py-1 text-sm font-bold text-command-muted transition hover:border-command-action hover:text-command-action"
          aria-label="Close agent profile"
        >
          X
        </button>

        <div className="border-b border-command-border/40 px-5 py-4 md:px-7 md:py-5">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-command-action">Agent Profile</p>
          <h3 className="mt-2 text-xl font-bold text-command-text md:text-2xl">{agentName}</h3>
          <p className="mt-1 text-sm text-command-muted">{profile.domainLabel}</p>
        </div>

        <div className="space-y-5 px-5 py-5 md:px-7 md:py-6">
          <section className="rounded-xl border border-command-border bg-command-bg/50 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-command-muted">What It Does</p>
            <p className="mt-2 text-sm leading-relaxed text-command-text">{profile.simpleSentence}</p>
          </section>

          <section className="rounded-xl border border-command-border bg-command-bg/50 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-command-muted">What It Saves You</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <MetricCard icon="T" label="Time Saved" value={`Saves ~${estimatedHours} hours/week`} />
              <MetricCard icon="$" label="Cost Reduction" value={`Reduces cost by ${roundedSavings}%`} />
              <MetricCard icon="A" label="Manual Work" value={`Automates ${manualWorkReduction}% of repetitive tasks`} />
            </div>
          </section>

          <section className="rounded-xl border border-command-border bg-command-bg/50 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-command-muted">How To Get Started</p>
            <ol className="mt-3 space-y-2 text-sm text-command-text">
              {profile.steps.map((step, index) => (
                <li key={step} className="flex gap-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-command-action/50 bg-command-action/10 font-mono text-[11px] text-command-action">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-xl border border-command-border bg-command-bg/50 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-command-muted">Integrations</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {integrations.map((integration) => (
                <span
                  key={integration}
                  className="inline-flex items-center gap-1 rounded-full border border-command-action/40 bg-command-action/10 px-3 py-1.5 text-xs font-medium text-command-text"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-command-action" />
                  {integration}
                </span>
              ))}
            </div>
          </section>

          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-expanded={isExpanded}
              className="rounded-lg border border-command-action/50 bg-command-action/10 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-command-action transition hover:bg-command-action/20"
            >
              {isExpanded ? "Show Less" : "Read More"}
            </button>
          </div>

          <div
            className={`overflow-hidden transition-all duration-300 ease-out ${
              isExpanded ? "max-h-[1400px] opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className={`space-y-5 pt-2 transition-transform duration-300 ${isExpanded ? "translate-y-0" : "-translate-y-2"}`}>
              <section className="rounded-xl border border-command-border bg-command-bg/50 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-command-muted">How To Work With It</p>
                <ul className="mt-3 space-y-2 text-sm text-command-text">
                  {expandedDetails.howToWorkWithIt.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-command-action" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-xl border border-command-border bg-command-bg/50 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-command-muted">How Long Does It Take</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <MetricCard icon="1" label="Setup Time" value={expandedDetails.setupTime} />
                  <MetricCard icon="2" label="First Result" value={expandedDetails.firstResult} />
                  <MetricCard icon="3" label="Full ROI" value={expandedDetails.fullRoiTimeline} />
                </div>
              </section>

              <section className="rounded-xl border border-command-border bg-command-bg/50 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-command-muted">How To Connect To Your Systems</p>
                <ol className="mt-3 space-y-2 text-sm text-command-text">
                  <li className="flex gap-2">
                    <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-command-action/50 bg-command-action/10 font-mono text-[11px] text-command-action">1</span>
                    <span>Connect your existing tools (CRM, Email, Slack, and others).</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-command-action/50 bg-command-action/10 font-mono text-[11px] text-command-action">2</span>
                    <span>Define what the agent should do in day-to-day work.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-command-action/50 bg-command-action/10 font-mono text-[11px] text-command-action">3</span>
                    <span>Run a short test with real tasks and review the output.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-command-action/50 bg-command-action/10 font-mono text-[11px] text-command-action">4</span>
                    <span>Go live and track outcomes with your team.</span>
                  </li>
                </ol>
              </section>

              <section className="rounded-xl border border-command-border bg-command-bg/50 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-command-muted">What You Get Out Of It</p>
                <ul className="mt-3 space-y-2 text-sm text-command-text">
                  {expandedDetails.outcomes.map((outcome) => (
                    <li key={outcome} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-command-action" />
                      <span>{outcome}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
