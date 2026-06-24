"use client";

import { useState } from "react";
import { CommandShell } from "./command-shell";
import { StatusPill } from "../ui/status-pill";
import { UIModeProvider, useUIMode } from "./ui-mode-context";
import { LandingScreen, type ScenarioId } from "./landing-screen";

function HeaderModeToggle() {
  const { mode, setMode } = useUIMode();

  return (
    <div className="inline-flex items-center rounded-lg border border-command-border bg-command-panel px-2 py-1.5 font-mono text-xs">
      <button
        type="button"
        onClick={() => setMode("business")}
        aria-pressed={mode === "business"}
        className={`rounded px-2 py-1 uppercase tracking-[0.12em] transition ${
          mode === "business"
            ? "bg-command-panelElevated text-command-action"
            : "text-command-muted hover:text-command-text"
        }`}
      >
        Business
      </button>
      <span className="px-1 text-command-muted" aria-hidden="true">|</span>
      <button
        type="button"
        onClick={() => setMode("technology")}
        aria-pressed={mode === "technology"}
        className={`rounded px-2 py-1 uppercase tracking-[0.12em] transition ${
          mode === "technology"
            ? "bg-command-panelElevated text-command-action"
            : "text-command-muted hover:text-command-text"
        }`}
      >
        Technology
      </button>
    </div>
  );
}

function HomePageContent() {
  const { mode } = useUIMode();
  const [screen, setScreen] = useState<"landing" | "demo">("landing");

  if (screen === "landing") {
    return <LandingScreen onStart={() => setScreen("demo")} />;
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 md:px-8 md:py-10" data-ui-mode={mode}>
      <section className="mb-6 command-card p-5 md:p-6 animate-fadeUp">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-command-action animate-pulseLine">Agentic Process Authority</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-command-text md:text-3xl">Meta-Agent Command Center</h1>
            <p className="mt-2 max-w-2xl text-sm text-command-muted md:text-base">
              Acquisition pipeline and live fleet management for your deployed AI agents.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusPill label="Full Demo Live" tone="action" />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setScreen("landing")}
                className="rounded-lg border border-command-border bg-command-panel px-3 py-1.5 font-mono text-xs text-command-muted transition hover:border-command-action/50 hover:text-command-action"
              >
                ← Scenarios
              </button>
              <HeaderModeToggle />
            </div>
          </div>
        </div>
      </section>

      <div data-ui-mode={mode}>
        <CommandShell />
      </div>
    </main>
  );
}

export function HomePageShell() {
  return (
    <UIModeProvider initialMode="technology">
      <HomePageContent />
    </UIModeProvider>
  );
}
