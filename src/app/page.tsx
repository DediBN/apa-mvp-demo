import { IntakeTerminal } from "../components/command-center/intake-terminal";
import { StatusPill } from "../components/ui/status-pill";

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 md:px-8 md:py-10">
      <section className="mb-6 command-card p-5 md:p-6 animate-fadeUp">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-command-action animate-pulseLine">Agentic Process Authority</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-command-text md:text-3xl">Meta-Agent Command Center</h1>
            <p className="mt-2 max-w-2xl text-sm text-command-muted md:text-base">4-step automated flow: Intake → Sourcing Radar → Evaluation → Final Scorecard with ROI projection.</p>
          </div>
          <StatusPill label="Full Demo Live" tone="action" />
        </div>
      </section>

      <IntakeTerminal />
    </main>
  );
}
