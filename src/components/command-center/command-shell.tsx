"use client";

import { useState } from "react";
import { IntakeTerminal } from "./intake-terminal";
import { FleetManagementDashboard } from "./fleet-management-dashboard";
import { StatusPill } from "../ui/status-pill";

type Tab = "acquisition" | "fleet";

const TABS: Array<{ id: Tab; label: string; description: string }> = [
  {
    id: "acquisition",
    label: "Acquisition Pipeline",
    description: "4-step agent evaluation flow"
  },
  {
    id: "fleet",
    label: "Fleet Management",
    description: "Active agent monitoring"
  }
];

export function CommandShell() {
  const [activeTab, setActiveTab] = useState<Tab>("acquisition");

  return (
    <>
      {/* Nav tabs */}
      <nav className="mb-5 command-card p-1.5 animate-fadeUp">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 flex-col items-start rounded-lg px-4 py-3 text-left transition-all focus:outline-none ${
                  isActive
                    ? "bg-command-panelElevated shadow-glow"
                    : "hover:bg-command-panel/60"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span
                    className={`font-mono text-xs font-semibold uppercase tracking-[0.16em] ${
                      isActive ? "text-command-action" : "text-command-muted"
                    }`}
                  >
                    {tab.label}
                  </span>
                  {isActive && <StatusPill label="ACTIVE" tone="action" />}
                </div>
                <span className="mt-0.5 text-xs text-command-muted">{tab.description}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Tab content */}
      {activeTab === "acquisition" ? <IntakeTerminal /> : <FleetManagementDashboard />}
    </>
  );
}
