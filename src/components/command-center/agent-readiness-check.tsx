

"use client";

import { useState, useCallback } from "react";
import { AJD } from "../../lib/intake-agent/mock";
import { Candidate } from "../../lib/research-agent/mock";

export interface AgentReadinessCheckProps {
  ajd: AJD;
  onClose: () => void;
  // Skill mode: run every shortlisted skill that has a SKILL.md, plus a no-skill baseline, on the same data.
  candidates?: Candidate[];
}

type ReliabilityTag =
  | "found_in_data"
  | "inferred"
  | "needs_approval"
  | "missing_info"
  | "cannot_demonstrate";

type ResultItem = {
  label: string;
  detail: string;
  reliability: ReliabilityTag;
  reason?: string;
};

const TAG_META: Record<ReliabilityTag, { text: string; className: string }> = {
  found_in_data: { text: "FOUND IN DATA", className: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10" },
  inferred: { text: "INFERRED", className: "text-violet-400 border-violet-400/40 bg-violet-400/10" },
  needs_approval: { text: "NEEDS APPROVAL", className: "text-amber-400 border-amber-400/40 bg-amber-400/10" },
  missing_info: { text: "MISSING INFO", className: "text-red-400 border-red-400/40 bg-red-400/10" },
  cannot_demonstrate: { text: "CAN'T DEMONSTRATE", className: "text-slate-400 border-slate-400/40 bg-slate-400/10" },
};

const MAX_CHARS = 20000; // guard: no human moderates input size on this path

type RunResult = { items: ResultItem[]; summary: string };

type ComparisonRow = {
  key: string;
  name: string;
  source: string;
  isBaseline: boolean;
  result?: RunResult;
  error?: string;
};

function countFound(result?: RunResult): number {
  return result?.items.filter((i) => i.reliability === "found_in_data").length ?? 0;
}

function countByTag(result: RunResult | undefined, tag: ReliabilityTag): number {
  return result?.items.filter((i) => i.reliability === tag).length ?? 0;
}

export function AgentReadinessCheck({ ajd, onClose, candidates }: AgentReadinessCheckProps) {
  const skillMode = Array.isArray(candidates);
  const runnableSkills = (candidates ?? []).filter((c) => Boolean(c.skill?.content?.trim()));
  const [comparison, setComparison] = useState<ComparisonRow[]>([]);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [stage, setStage] = useState<"ask" | "collecting" | "running" | "done">("ask");
  const [customerData, setCustomerData] = useState("");
  const [referenceData, setReferenceData] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ items: ResultItem[]; summary: string } | null>(null);

  const readTextFile = useCallback((file: File, setter: (v: string) => void) => {
    if (file.size > 2_000_000) {
      setError("File too large (max 2MB for this preview). Try a smaller sample.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setter(String(reader.result || "").slice(0, MAX_CHARS));
    reader.onerror = () => setError("Could not read that file — try pasting the content as text instead.");
    reader.readAsText(file);
  }, []);

  async function runCheck() {
    if (!customerData.trim()) {
      setError("Please provide at least one real example before running.");
      return;
    }
    setError(null);
    setStage("running");

    const kpiLines = ajd.agent_profile?.kpis?.length
      ? ajd.agent_profile.kpis.map((k) => `${k.name}: ${k.target}`).join("; ")
      : "";

    const actionDescription = [
      `Agent title: ${ajd.job_title}`,
      `Business need: ${ajd.business_need}`,
      ajd.agent_profile?.mission ? `Mission: ${ajd.agent_profile.mission}` : "",
      kpiLines ? `Target KPIs: ${kpiLines}` : "",
      "Perform exactly this mission on the real data provided below.",
    ]
      .filter(Boolean)
      .join("\n");

    if (skillMode) {
      const runs: Array<{ key: string; name: string; source: string; isBaseline: boolean; skill_md?: string }> = [
        { key: "baseline", name: "Baseline: Claude with no skill", source: "Control", isBaseline: true },
        ...runnableSkills.map((c) => ({
          key: c.candidate_id,
          name: c.name,
          source: c.source,
          isBaseline: false,
          skill_md: c.skill?.content
        }))
      ];
      const rows = await Promise.all(
        runs.map(async (run): Promise<ComparisonRow> => {
          try {
            const res = await fetch("/api/concierge-demo", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action_description: actionDescription,
                customer_data: customerData.slice(0, MAX_CHARS),
                reference_data: referenceData.slice(0, MAX_CHARS),
                skill_md: run.skill_md,
                skill_name: run.isBaseline ? undefined : run.name
              })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !Array.isArray(data?.items)) {
              throw new Error(data?.error || `Run failed (${res.status})`);
            }
            return { key: run.key, name: run.name, source: run.source, isBaseline: run.isBaseline, result: data as RunResult };
          } catch (e: unknown) {
            return { key: run.key, name: run.name, source: run.source, isBaseline: run.isBaseline, error: e instanceof Error ? e.message : "Run failed" };
          }
        })
      );
      if (rows.every((r) => r.error)) {
        setError("None of the runs completed. Try a shorter or clearer sample.");
        setStage("collecting");
        return;
      }
      setComparison(rows);
      setStage("done");
      return;
    }

    try {
      const res = await fetch("/api/concierge-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_description: actionDescription,
          customer_data: customerData.slice(0, MAX_CHARS),
          reference_data: referenceData.slice(0, MAX_CHARS),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Something went wrong (${res.status}). Please try again.`);
      }
      const data = await res.json();
      if (!data || !Array.isArray(data.items)) {
        throw new Error("The agent couldn't produce a readable result from this data. Try a shorter or clearer sample.");
      }
      setResult(data);
      setStage("done");
    } catch (e: any) {
      setError(e.message || "Something went wrong. Please try again with a smaller sample.");
      setStage("collecting");
    }
  }

  const okCount = result?.items.filter((i) => i.reliability === "found_in_data").length ?? 0;
  const flagCount = result?.items.filter((i) => i.reliability !== "found_in_data").length ?? 0;

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

      {stage === "ask" && (
        <div className="mt-3">
          <p className="font-mono text-sm text-command-text">
            {skillMode
              ? `Test ${runnableSkills.length} shortlisted skill${runnableSkills.length === 1 ? "" : "s"} against Claude with no skill, on your own data?`
              : "Want to test this agent on your own real data?"}
          </p>
          <p className="mt-2 text-sm text-command-muted">
            No connection to any of your systems — you paste or upload a real
            example, we run this exact agent on it, and show you what it got
            right and where it needs a human.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setStage("collecting")}
              className="rounded border border-emerald-400/50 bg-emerald-400/10 px-3 py-1.5 font-mono text-xs text-emerald-400 transition hover:bg-emerald-400/20"
            >
              Yes, test it on my data
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-command-border px-3 py-1.5 font-mono text-xs text-command-muted transition hover:text-command-text"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

      {stage === "collecting" && (
        <div className="mt-3 space-y-3">
          <div>
            <label className="font-mono text-xs uppercase tracking-[0.1em] text-command-muted">
              Your real data — paste or upload a text/CSV file
            </label>
            <textarea
              rows={5}
              value={customerData}
              onChange={(e) => setCustomerData(e.target.value)}
              placeholder="e.g. a real message, a row of records, an invoice's text..."
              className="mt-1 w-full rounded border border-command-border bg-command-bg p-2 text-sm text-command-text"
            />
            <input
              type="file"
              accept=".txt,.csv,.md"
              onChange={(e) => e.target.files?.[0] && readTextFile(e.target.files[0], setCustomerData)}
              className="mt-1 text-xs text-command-muted"
            />
          </div>

          <div>
            <label className="font-mono text-xs uppercase tracking-[0.1em] text-command-muted">
              Optional — reference list to check against (catalog, price list, policy)
            </label>
            <textarea
              rows={4}
              value={referenceData}
              onChange={(e) => setReferenceData(e.target.value)}
              className="mt-1 w-full rounded border border-command-border bg-command-bg p-2 text-sm text-command-text"
            />
            <input
              type="file"
              accept=".txt,.csv,.md"
              onChange={(e) => e.target.files?.[0] && readTextFile(e.target.files[0], setReferenceData)}
              className="mt-1 text-xs text-command-muted"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="button"
            onClick={runCheck}
            className="w-full rounded border border-emerald-400/50 bg-emerald-400/10 py-2 font-mono text-xs text-emerald-400 transition hover:bg-emerald-400/20"
          >
            ▶ Run on this data
          </button>
        </div>
      )}

      {stage === "running" && (
        <div className="mt-3 flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
          <p className="text-sm text-command-muted">{skillMode ? `Running ${runnableSkills.length + 1} options on your data in parallel…` : "Reading your data and checking the agent against it…"}</p>
        </div>
      )}

      {stage === "done" && skillMode && comparison.length > 0 && (
        <div className="mt-3">
          <p className="text-sm text-command-muted">
            Same data, same task. Each skill runs as installed in Claude; the baseline runs with no skill. A skill earns its place only if it beats the baseline.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-command-border text-left text-command-muted">
                  <th className="py-2 pr-2 font-normal">Option</th>
                  <th className="py-2 pr-2 font-normal text-emerald-400">Found</th>
                  <th className="py-2 pr-2 font-normal text-violet-400">Inferred</th>
                  <th className="py-2 pr-2 font-normal text-amber-400">Approval</th>
                  <th className="py-2 pr-2 font-normal text-red-400">Missing</th>
                  <th className="py-2 pr-2 font-normal">vs baseline</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => {
                  const baseline = comparison.find((r) => r.isBaseline);
                  const delta = row.isBaseline || !row.result || !baseline?.result ? null : countFound(row.result) - countFound(baseline.result);
                  return (
                    <tr
                      key={row.key}
                      onClick={() => setOpenRow(openRow === row.key ? null : row.key)}
                      className="cursor-pointer border-b border-command-border/60 text-command-text hover:bg-command-action/5"
                    >
                      <td className="py-2 pr-2">
                        <span className="font-sans text-sm font-semibold">{row.name}</span>
                        <span className="ml-2 text-[10px] uppercase tracking-[0.12em] text-command-muted">{row.source}</span>
                      </td>
                      {row.error ? (
                        <td colSpan={5} className="py-2 pr-2 text-red-400">{row.error}</td>
                      ) : (
                        <>
                          <td className="py-2 pr-2">{countByTag(row.result, "found_in_data")}</td>
                          <td className="py-2 pr-2">{countByTag(row.result, "inferred")}</td>
                          <td className="py-2 pr-2">{countByTag(row.result, "needs_approval")}</td>
                          <td className="py-2 pr-2">{countByTag(row.result, "missing_info") + countByTag(row.result, "cannot_demonstrate")}</td>
                          <td className={`py-2 pr-2 ${delta === null ? "text-command-muted" : delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-command-muted"}`}>
                            {delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta} found`}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {runnableSkills.length === 0 && (
            <p className="mt-2 text-xs text-amber-400">No shortlisted skill had a readable SKILL.md, so only the baseline ran.</p>
          )}
          {(() => {
            const row = comparison.find((r) => r.key === openRow);
            if (!row?.result) {
              return <p className="mt-2 text-xs text-command-muted">Click a row to see its line-by-line results.</p>;
            }
            return (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-command-text">{row.result.summary}</p>
                {row.result.items.map((item, i) => {
                  const meta = TAG_META[item.reliability] ?? TAG_META.cannot_demonstrate;
                  return (
                    <div key={i} className="rounded border border-command-border bg-command-bg/60 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-command-text">{item.label}</span>
                        <span className={`rounded border px-2 py-0.5 font-mono text-[10px] ${meta.className}`}>{meta.text}</span>
                      </div>
                      <p className="mt-1 text-sm text-command-text">{item.detail}</p>
                      {item.reason && <p className="mt-0.5 text-xs text-command-muted">{item.reason}</p>}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <button
            type="button"
            onClick={() => {
              setStage("collecting");
              setComparison([]);
              setOpenRow(null);
            }}
            className="mt-3 w-full rounded border border-command-border py-2 font-mono text-xs text-command-muted transition hover:text-command-text"
          >
            ▶ Try another example
          </button>
        </div>
      )}

      {stage === "done" && result && (
        <div className="mt-3">
          <p className="text-sm text-command-text">{result.summary}</p>
          <div className="mt-2 flex gap-4 font-mono text-xs">
            <span className="text-emerald-400">{okCount} found in data</span>
            <span className="text-amber-400">{flagCount} flagged for a human</span>
          </div>
          <div className="mt-3 space-y-2">
            {result.items.map((item, i) => {
              const meta = TAG_META[item.reliability];
              return (
                <div key={i} className="rounded border border-command-border bg-command-bg/60 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-command-text">{item.label}</span>
                    <span className={`rounded border px-2 py-0.5 font-mono text-[10px] ${meta.className}`}>
                      {meta.text}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-command-text">{item.detail}</p>
                  {item.reason && <p className="mt-0.5 text-xs text-command-muted">{item.reason}</p>}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              setStage("collecting");
              setResult(null);
            }}
            className="mt-3 w-full rounded border border-command-border py-2 font-mono text-xs text-command-muted transition hover:text-command-text"
          >
            ▶ Try another example
          </button>
        </div>
      )}
    </div>
  );
}