"use client";

import { useState } from "react";

export type ScenarioId = "live" | "acquisition" | "fleet";

interface Scenario {
  id: ScenarioId;
  icon: string;
  tag: string;
  title: string;
  description: string;
  pills: string[];
  isLive?: boolean;
}

interface LandingScreenProps {
  onStart: (scenario: ScenarioId) => void;
}

const SCENARIOS: Scenario[] = [
  {
    id: "live",
    icon: "⚡",
    tag: "Live Mode",
    title: "Try It Yourself",
    description:
      "Enter any real business need. APA's intake agent, sourcing radar, and evaluation engine run live — powered by Claude.",
    pills: ["Free input", "Real AI", "Full pipeline"],
    isLive: true,
  },
  {
    id: "acquisition",
    icon: "🎯",
    tag: "Acquisition Pipeline",
    title: "Agent Hiring Flow",
    description:
      "Watch APA decompose a business need into an AJD, scan the agent market, evaluate candidates, and produce a final scorecard.",
    pills: ["4-step flow", "Claude-powered", "Manager approval"],
  },
  {
    id: "fleet",
    icon: "🛰️",
    tag: "Fleet Management",
    title: "Active Agent Monitor",
    description:
      "Live dashboard of deployed agents across departments — uptime, task throughput, escalation rates, and drift alerts.",
    pills: ["Real-time", "Multi-agent", "Alerting"],
  },
];

export function LandingScreen({ onStart }: LandingScreenProps) {
  const [selected, setSelected] = useState<ScenarioId | null>(null);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-4 py-16 md:px-8">
      {/* Header */}
      <div className="mb-12 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-command-action animate-pulseLine mb-3">
          Agentic Process Authority
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-command-text md:text-5xl">
          APA<span className="text-command-action">.</span>
        </h1>
        <p className="mt-4 max-w-xl text-base text-command-muted md:text-lg">
          The meta-agent platform for enterprise AI — hire, deploy, and govern
          your AI workforce.
        </p>
      </div>

      {/* Cards */}
      <div className="mb-10 flex w-full flex-wrap justify-center gap-4">
        {SCENARIOS.map((s) => {
          const isSelected = selected === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelected(s.id)}
              className={[
                "relative flex w-72 flex-col gap-3 rounded-xl border p-5 text-left transition-all duration-200 focus:outline-none",
                s.isLive
                  ? isSelected
                    ? "border-command-action bg-command-action/10 shadow-glow"
                    : "border-command-action/40 bg-command-panel hover:border-command-action hover:bg-command-action/5 hover:shadow-glow"
                  : isSelected
                  ? "border-command-action bg-command-panelElevated shadow-glow"
                  : "border-command-border bg-command-panel hover:border-command-action/50 hover:bg-command-panelElevated",
              ].join(" ")}
            >
              {s.isLive && (
                <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-command-action/50 bg-command-action/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-command-action">
                  <span className="h-1.5 w-1.5 animate-pulseLine rounded-full bg-command-action" />
                  LIVE
                </span>
              )}
              <div className="flex items-center gap-2">
                <span className="text-2xl">{s.icon}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-command-muted">
                  {s.tag}
                </span>
              </div>
              <p className="text-base font-semibold text-command-text">{s.title}</p>
              <p className="text-xs leading-relaxed text-command-muted">{s.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {s.pills.map((pill) => (
                  <span
                    key={pill}
                    className={[
                      "rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]",
                      s.isLive
                        ? "border-command-action/30 text-command-action"
                        : "border-command-border text-command-muted",
                    ].join(" ")}
                  >
                    {pill}
                  </span>
                ))}
              </div>
              {isSelected && (
                <span className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full bg-command-action" />
              )}
            </button>
          );
        })}
      </div>

      {/* GO button */}
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && onStart(selected)}
          className={[
            "rounded-xl border px-10 py-3 font-mono text-sm font-semibold uppercase tracking-[0.16em] transition-all duration-200",
            selected
              ? "border-command-action bg-command-action text-command-bg shadow-glow hover:brightness-110"
              : "cursor-not-allowed border-command-border bg-command-panel text-command-muted opacity-50",
          ].join(" ")}
        >
          {selected
            ? selected === "live"
              ? "⚡ Launch Live Mode"
              : `Run ${SCENARIOS.find((s) => s.id === selected)?.tag} →`
            : "Select a Scenario"}
        </button>
        {selected && (
          <p className="font-mono text-xs text-command-muted animate-fadeIn">
            {selected === "live"
              ? "You'll type the business need. APA runs the full pipeline in real time."
              : selected === "acquisition"
              ? "Scripted walkthrough — intake → sourcing → evaluation → scorecard."
              : "Live fleet dashboard — active agents, metrics, and drift alerts."}
          </p>
        )}
      </div>

      <p className="mt-16 font-mono text-[11px] text-command-muted/50">
        demo.apa-ai.com · dedi@apa-ai.com · apa-ai.com
      </p>
    </main>
  );
}
