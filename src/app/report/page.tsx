"use client";

import { useEffect, useState } from "react";
import { decodeReport, type SharedReport } from "../../lib/skills/share";

const tone = (n: number) => (n >= 80 ? "text-emerald-400" : n >= 50 ? "text-amber-400" : "text-red-400");

export default function ReportPage() {
  const [report, setReport] = useState<SharedReport | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "bad">("loading");

  useEffect(() => {
    const data = new URLSearchParams(window.location.hash.slice(1)).get("d");
    if (!data) {
      setState("bad");
      return;
    }
    decodeReport(data).then((r) => {
      setReport(r);
      setState(r ? "ok" : "bad");
    });
  }, []);

  if (state === "loading") return <main className="mx-auto max-w-4xl px-4 py-16 font-mono text-sm text-command-muted">Loading report…</main>;
  if (state === "bad" || !report)
    return (
      <main className="mx-auto max-w-4xl px-4 py-16">
        <p className="text-command-text">This report link is incomplete or damaged. Ask the sender for the full link.</p>
        <a href="/" className="mt-4 inline-block text-command-action hover:underline">
          About APA Skills →
        </a>
      </main>
    );

  const rec = report.rows.find((r) => r.recommended);
  const base = report.rows.find((r) => r.kind === "baseline");
  const range = (r: { min: number; max: number }) => (report.runs > 1 ? ` (${r.min}–${r.max})` : "");
  const headline =
    report.verdict === "gain" && rec && base
      ? `${rec.name}: correctness ${rec.correctness} vs ${base.correctness} for Claude with no skill — a clear gain.`
      : report.verdict === "noise" && rec && base
        ? `No clear difference: ${rec.name} ${rec.correctness} vs ${base.correctness} for Claude with no skill — within run-to-run noise.`
        : report.verdict === "baseline_better" && base
          ? `Claude with no skill did as well or better (${base.correctness}) — no skill needed for correctness.`
          : "No skill was eligible for a recommendation.";

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:py-12">
      <a href="/" className="font-mono text-xs uppercase tracking-[0.22em] text-command-action">
        APA Skills
      </a>
      <h1 className="mt-2 text-2xl font-semibold text-command-text md:text-3xl">Skill test report: {report.title}</h1>
      <p className="mt-1 font-mono text-xs text-command-muted">{new Date(report.date).toLocaleDateString("en-GB", { dateStyle: "medium" })}</p>

      <section className="command-card mt-6 p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-command-muted">The need</p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-command-text" dir="auto">
          {report.need}
        </p>
      </section>

      <section className={`mt-4 rounded-lg border p-5 ${report.verdict === "gain" ? "border-emerald-400/40 bg-emerald-400/5" : "border-amber-400/40 bg-amber-400/5"}`}>
        <p className="text-base font-semibold text-command-text">{headline}</p>
        <p className="mt-2 font-mono text-[11px] text-command-muted">
          {report.groundTruth === "generated_scenarios"
            ? "Tested on generated scenarios with planted answers (synthetic)"
            : report.groundTruth === "answer_key"
              ? "Tested on real data against an answer key"
              : "Tested on real data, audited independently"}
          {" · "}
          {report.asked === "everyday" ? "each option got the everyday request only — the business rules had to come from the skill" : "each option got the full instructions"}
          {" · "}
          {report.runs} run{report.runs === 1 ? "" : "s"} per option
        </p>
      </section>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-command-border text-left text-command-muted">
              <th className="py-2 pr-2 font-normal">Option</th>
              <th className="py-2 pr-2 font-normal">Fit</th>
              <th className="py-2 pr-2 font-normal">Correctness</th>
              <th className="py-2 pr-2 font-normal">Format</th>
              <th className="py-2 pr-2 font-normal">Found</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.name} className="border-b border-command-border/60 text-command-text">
                <td className="py-2 pr-2">
                  <span className="font-sans text-sm font-semibold">{r.name}</span>
                  {r.recommended ? <span className="ml-2 text-command-action">★</span> : null}
                  {r.warning ? <span className="ml-2 rounded border border-red-400/50 bg-red-400/10 px-1.5 text-[10px] text-red-300" title={r.warning}>⚠ code</span> : null}
                </td>
                <td className="py-2 pr-2">{r.fit === null ? "—" : <span className={r.fit < 40 ? "text-amber-400" : ""}>{r.fit}{r.fit < 40 ? " weak" : ""}</span>}</td>
                <td className={`py-2 pr-2 text-sm font-semibold ${tone(r.correctness)}`}>
                  {r.correctness}
                  <span className="ml-1 text-[10px] font-normal text-command-muted">{range(r)}</span>
                </td>
                <td className="py-2 pr-2">{r.format === null ? "—" : `${r.format}%`}</td>
                <td className="py-2 pr-2 text-command-muted">
                  {r.found}/{r.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[10px] text-command-muted">
        Correctness = 60% recall + 30% precision + 10% grounding. Each output judged blind by one fixed model. Format is scored separately against the
        required format below.
      </p>

      {report.contract.length > 0 && (
        <section className="command-card mt-6 p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-command-muted">Required output format</p>
          <ol className="mt-2 list-decimal space-y-1 ps-5 text-sm text-command-text" dir="auto">
            {report.contract.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-8 rounded-lg border border-command-action/40 bg-command-action/5 p-5">
        <p className="text-base font-semibold text-command-text">Find out what a skill would do for your process.</p>
        <p className="mt-1 text-sm text-command-muted">Describe the task in plain words — APA Skills finds, writes and tests the right Claude skill, against Claude alone.</p>
        <a href="/" className="mt-3 inline-block rounded bg-command-action px-4 py-2 font-semibold text-command-bg">
          See how it works →
        </a>
      </section>
    </main>
  );
}
