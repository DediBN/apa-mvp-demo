import { formatCurrency } from "../../lib/scorecard/roi";

interface ResultSummaryCardProps {
  selectedAgentName: string;
  roiValue: number;
  estimatedSavings: number;
  performanceImprovement?: number;
  useCaseSummary?: string;
}

export function ResultSummaryCard({
  selectedAgentName,
  roiValue,
  estimatedSavings,
  performanceImprovement,
  useCaseSummary
}: ResultSummaryCardProps) {
  // Build a concise, human-readable mirror of the raw input.
  // Lowercases the first character, trims trailing punctuation, and caps at ~12 words.
  const intentMirror = (() => {
    if (!useCaseSummary) return null;
    const raw = useCaseSummary.trim().replace(/[.!?]+$/, "");
    const words = raw.split(/\s+/);
    const clipped = words.slice(0, 12).join(" ") + (words.length > 12 ? "…" : "");
    return clipped.charAt(0).toLowerCase() + clipped.slice(1);
  })();

  const summarizedNeed = intentMirror ?? "your business priority";

  return (
    <section className="relative overflow-hidden rounded-2xl border border-command-action/50 bg-gradient-to-b from-command-panelElevated via-command-panelElevated to-command-bg p-8 md:p-10 shadow-glow animate-fadeUp">
      {/* Background glow accents */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-command-action/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-command-action/8 blur-3xl" />

      {/* User intent mirror */}
      {intentMirror ? (
        <p className="relative mb-6 text-center font-mono text-xs text-command-muted">
          You wanted to:{" "}
          <span className="text-command-text">{intentMirror}.</span>
        </p>
      ) : null}

      {/* Decision title */}
      <div className="relative text-center">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-command-action animate-pulseLine">
          Best Agent for This
        </p>
        <h3 className="mt-3 text-3xl font-bold tracking-tight text-command-text md:text-4xl">
          {selectedAgentName}
        </h3>
        <p className="mx-auto mt-3 max-w-xl text-sm text-command-muted md:text-base">
          This agent delivers the highest ROI and operational efficiency for that problem.
          Expected to significantly reduce manual workload within the first weeks of deployment.
        </p>
      </div>

      {/* ROI — dominant element */}
      <div className="relative mt-8 flex flex-col items-center gap-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-command-action">
          Annual Return on Investment
        </p>
        <p className="mt-1 text-6xl font-bold leading-none tracking-tight text-command-text md:text-7xl"
           style={{ textShadow: "0 0 40px rgba(100,255,218,0.35)" }}>
          {formatCurrency(roiValue)}
        </p>
        <p className="mt-1 font-mono text-xs text-command-muted">projected annual savings</p>
      </div>

      {/* Deploy button */}
      <div className="relative mt-8 flex justify-center">
        <button
          type="button"
          className="min-w-[220px] rounded-xl border border-command-action bg-command-action px-8 py-3.5 font-mono text-base font-bold tracking-wide text-command-bg shadow-glow transition hover:brightness-110 active:scale-[0.98]"
        >
          Deploy this agent
        </button>
      </div>

      {/* Supporting metrics */}
      <div className="relative mt-8 grid gap-3 border-t border-command-border/40 pt-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-command-border bg-command-bg/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-command-muted">Selected Agent</p>
          <p className="mt-2 text-lg font-semibold text-command-text">{selectedAgentName}</p>
        </div>

        <div className="rounded-xl border border-command-border bg-command-bg/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-command-muted">Monthly Savings</p>
          <p className="mt-2 text-2xl font-bold text-command-text">{formatCurrency(estimatedSavings)}</p>
        </div>

        {typeof performanceImprovement === "number" ? (
          <div className="rounded-xl border border-command-border bg-command-bg/60 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-command-muted">Cost Reduction</p>
            <p className="mt-2 text-2xl font-bold text-command-action">{performanceImprovement}%</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
