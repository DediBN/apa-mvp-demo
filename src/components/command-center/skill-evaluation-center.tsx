"use client";

import { useCallback, useMemo, useState } from "react";
import { APAStatus } from "../../lib/state-machine";
import { AJD } from "../../lib/intake-agent/mock";
import { Candidate } from "../../lib/research-agent/mock";
import { CandidateEvaluationResult } from "../../lib/evaluation-agent/mock";
import type { JudgeResponse, OptionScore } from "../../lib/skills/types";
import { buildZip, skillFolderName } from "../../lib/skills/zip";
import { StatusPill } from "../ui/status-pill";

// Step 03 in skill mode: every option runs the real task on the customer's real data, then one judge scores all
// outputs against the same ground truth. No simulated scenarios, no formula-generated parameters.

interface SkillEvaluationCenterProps {
  status: APAStatus;
  ajd: AJD | null;
  candidates: Candidate[];
  onEvaluationDone: (results: CandidateEvaluationResult[]) => void;
  addLog: (line: string) => void;
}

type ReliabilityTag = "found_in_data" | "inferred" | "needs_approval" | "missing_info" | "cannot_demonstrate";
type ResultItem = { label: string; detail: string; reliability: ReliabilityTag; reason?: string };
type RunResult = { items: ResultItem[]; summary: string };

type LaneState = "queued" | "authoring" | "running" | "done" | "error";

interface Lane {
  candidate: Candidate;
  kind: "directory" | "custom" | "baseline";
  skillMd?: string;
  state: LaneState;
  result?: RunResult;
  error?: string;
}

const MAX_CHARS = 20000;

const TAG_META: Record<ReliabilityTag, { text: string; className: string }> = {
  found_in_data: { text: "FOUND IN DATA", className: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10" },
  inferred: { text: "INFERRED", className: "text-violet-400 border-violet-400/40 bg-violet-400/10" },
  needs_approval: { text: "NEEDS APPROVAL", className: "text-amber-400 border-amber-400/40 bg-amber-400/10" },
  missing_info: { text: "MISSING INFO", className: "text-red-400 border-red-400/40 bg-red-400/10" },
  cannot_demonstrate: { text: "CAN'T DEMONSTRATE", className: "text-slate-400 border-slate-400/40 bg-slate-400/10" }
};

function laneKind(candidate: Candidate): Lane["kind"] {
  if (candidate.candidate_id === "skill_baseline_none") return "baseline";
  if (candidate.candidate_id === "skill_custom_ajd") return "custom";
  return "directory";
}

function buildActionDescription(ajd: AJD): string {
  const kpis = ajd.agent_profile?.kpis?.length ? ajd.agent_profile.kpis.map((k) => `${k.name}: ${k.target}`).join("; ") : "";
  return [
    `Task title: ${ajd.job_title}`,
    `Business need: ${ajd.business_need}`,
    ajd.agent_profile?.mission ? `Mission: ${ajd.agent_profile.mission}` : "",
    kpis ? `Target KPIs: ${kpis}` : "",
    "Perform exactly this task on the real data provided below."
  ]
    .filter(Boolean)
    .join("\n");
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

function scoreTone(value: number): string {
  if (value >= 80) return "text-emerald-400";
  if (value >= 50) return "text-amber-400";
  return "text-red-400";
}

function toEvaluationResult(lane: Lane, score: OptionScore | undefined): CandidateEvaluationResult {
  const composite = score?.composite ?? 0;
  // Only measured dimensions carry values; the agent-era dimensions are not measured in skill mode and stay 0.
  return {
    candidateId: lane.candidate.candidate_id,
    candidateName: lane.candidate.name,
    candidateSource: lane.candidate.source,
    objectionPasses: score?.found.length ?? 0,
    hallucinationPasses: score ? score.total_items - score.unsupported : 0,
    scorecard: {
      turingScore: 0,
      securityScore: 0,
      reliabilityScore: score?.precision ?? 0,
      objectionHandlingScore: 0,
      hallucinationControlScore: score?.grounding ?? 0,
      integrationStabilityScore: 0,
      costEfficiencyScore: 0,
      domainExpertiseScore: score?.recall ?? 0,
      compositeScore: composite
    }
  };
}

export function SkillEvaluationCenter({ status, ajd, candidates, onEvaluationDone, addLog }: SkillEvaluationCenterProps) {
  const [customerData, setCustomerData] = useState("");
  const [referenceData, setReferenceData] = useState("");
  const [answerKey, setAnswerKey] = useState("");
  const [authorCustom, setAuthorCustom] = useState(true);
  const [stage, setStage] = useState<"input" | "running" | "judging" | "done">("input");
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [judge, setJudge] = useState<JudgeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const visible = status.state === "EVALUATING" || status.state === "COMPLETE" || status.state === "SCORECARD";

  const plannedLanes = useMemo<Lane[]>(
    () =>
      candidates
        .map((candidate) => ({ candidate, kind: laneKind(candidate), skillMd: candidate.skill?.content, state: "queued" as LaneState }))
        .filter((lane) => lane.kind !== "directory" || Boolean(lane.skillMd?.trim()))
        .filter((lane) => lane.kind !== "custom" || authorCustom),
    [candidates, authorCustom]
  );

  const readFile = useCallback((file: File, setter: (v: string) => void) => {
    if (file.size > 2_000_000) {
      setError("File too large (max 2MB). Try a smaller sample.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setter(String(reader.result || "").slice(0, MAX_CHARS));
    reader.onerror = () => setError("Could not read that file — paste the content instead.");
    reader.readAsText(file);
  }, []);

  const updateLane = (id: string, patch: Partial<Lane>) =>
    setLanes((prev) => prev.map((lane) => (lane.candidate.candidate_id === id ? { ...lane, ...patch } : lane)));

  async function runEvaluation() {
    if (!ajd) return;
    if (!customerData.trim()) {
      setError("Upload or paste at least one real data sample.");
      return;
    }
    setError(null);
    setJudge(null);
    setStage("running");
    setLanes(plannedLanes);
    addLog(`Skill evaluation started: ${plannedLanes.length} options on the same real data.`);

    const actionDescription = buildActionDescription(ajd);

    const finished = await Promise.all(
      plannedLanes.map(async (lane): Promise<Lane> => {
        const id = lane.candidate.candidate_id;
        let skillMd = lane.kind === "baseline" ? undefined : lane.skillMd;
        try {
          if (lane.kind === "custom") {
            updateLane(id, { state: "authoring" });
            const authored = await postJson<{ skill_md: string; name: string }>("/api/skills/author", {
              job_title: ajd.job_title,
              business_need: ajd.business_need,
              mission: ajd.agent_profile?.mission,
              kpis: ajd.agent_profile?.kpis
            });
            skillMd = authored.skill_md;
            updateLane(id, { skillMd });
            addLog(`Custom skill authored from the AJD: ${authored.name}`);
          }
          updateLane(id, { state: "running" });
          const result = await postJson<RunResult>("/api/concierge-demo", {
            action_description: actionDescription,
            customer_data: customerData.slice(0, MAX_CHARS),
            reference_data: referenceData.slice(0, MAX_CHARS),
            skill_md: skillMd,
            skill_name: lane.kind === "baseline" ? undefined : lane.candidate.name
          });
          updateLane(id, { state: "done", result });
          return { ...lane, skillMd, state: "done", result };
        } catch (e) {
          const message = e instanceof Error ? e.message : "Run failed";
          updateLane(id, { state: "error", error: message });
          addLog(`Run failed for ${lane.candidate.name}: ${message}`);
          return { ...lane, skillMd, state: "error", error: message };
        }
      })
    );

    const completed = finished.filter((lane) => lane.result);
    if (completed.length === 0) {
      setError("None of the runs completed. Try a shorter sample and run again.");
      setStage("input");
      return;
    }

    setStage("judging");
    addLog("All runs finished. Scoring every output against one ground truth.");
    try {
      const judged = await postJson<JudgeResponse>("/api/skills/judge", {
        action_description: actionDescription,
        customer_data: customerData.slice(0, MAX_CHARS),
        reference_data: referenceData.slice(0, MAX_CHARS),
        answer_key: answerKey.trim() || undefined,
        outputs: completed.map((lane) => ({
          key: lane.candidate.candidate_id,
          name: lane.candidate.name,
          summary: lane.result?.summary,
          items: lane.result?.items ?? []
        }))
      });
      setJudge(judged);
      setStage("done");
      const ranked = [...judged.scores].sort((a, b) => b.composite - a.composite);
      addLog(`Scoring done (${judged.ground_truth === "answer_key" ? "answer key" : "independent audit"}). Top: ${ranked[0]?.name} · ${ranked[0]?.composite}`);
      onEvaluationDone(finished.map((lane) => toEvaluationResult(lane, judged.scores.find((s) => s.key === lane.candidate.candidate_id))));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scoring failed.");
      setStage("input");
    }
  }

  function downloadSkill(lane: Lane) {
    if (!lane.skillMd) return;
    const folder = skillFolderName(lane.skillMd, lane.candidate.name);
    const blob = buildZip([{ path: `${folder}/SKILL.md`, content: lane.skillMd }]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${folder}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    addLog(`Downloaded ${folder}.zip — upload it to Claude as a skill.`);
  }

  if (!visible || !ajd) {
    return (
      <section className="command-card-elevated p-5 md:p-7">
        <h2 className="font-mono text-sm uppercase tracking-[0.18em] text-command-muted">Step 03 · Skill Evaluation</h2>
        <p className="mt-1 text-sm text-command-muted">Starts after sourcing: every shortlisted skill runs on your real data.</p>
      </section>
    );
  }

  const ranked = judge ? [...judge.scores].sort((a, b) => b.composite - a.composite) : [];
  const baselineScore = judge?.scores.find((s) => s.key === "skill_baseline_none");
  const winner = ranked.find((s) => s.key !== "skill_baseline_none");
  const winnerLane = lanes.find((l) => l.candidate.candidate_id === winner?.key);
  const winnerBeatsBaseline = Boolean(winner && (!baselineScore || winner.composite > baselineScore.composite));
  const issueText = (id: string) => judge?.issues.find((i) => i.id === id)?.description ?? id;

  return (
    <section className="command-card-elevated p-5 md:p-7 animate-fadeUp">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-mono text-sm uppercase tracking-[0.18em] text-command-muted">Step 03 · Skill Evaluation</h2>
          <p className="mt-1 text-lg font-semibold text-command-text">Every option runs the real task on your real data</p>
        </div>
        <StatusPill
          label={stage === "done" ? "COMPLETE" : stage === "judging" ? "SCORING" : stage === "running" ? "RUNNING" : "AWAITING DATA"}
          tone={stage === "done" ? "pass" : stage === "input" ? "neutral" : "action"}
        />
      </header>

      {stage === "input" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="command-card space-y-3 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-command-muted">Real data</p>
            <textarea
              rows={6}
              value={customerData}
              onChange={(e) => setCustomerData(e.target.value)}
              placeholder="Paste records, or upload a .csv / .txt file"
              className="w-full rounded border border-command-border bg-command-bg p-2 font-mono text-xs text-command-text"
            />
            <input type="file" accept=".txt,.csv,.md" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0], setCustomerData)} className="text-xs text-command-muted" />

            <p className="pt-2 font-mono text-xs uppercase tracking-[0.14em] text-command-muted">Reference (optional) — price list, catalog, policy</p>
            <textarea
              rows={3}
              value={referenceData}
              onChange={(e) => setReferenceData(e.target.value)}
              className="w-full rounded border border-command-border bg-command-bg p-2 font-mono text-xs text-command-text"
            />
            <input type="file" accept=".txt,.csv,.md" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0], setReferenceData)} className="text-xs text-command-muted" />
          </div>

          <div className="command-card space-y-3 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-command-muted">Answer key (optional, for testing)</p>
            <p className="text-xs text-command-muted">
              The issues you know are in the data. With a key, scores are measured against it. Without one, the judge audits the data
              independently — treat those scores as indicative.
            </p>
            <textarea
              rows={4}
              value={answerKey}
              onChange={(e) => setAnswerKey(e.target.value)}
              className="w-full rounded border border-command-border bg-command-bg p-2 font-mono text-xs text-command-text"
            />
            <input type="file" accept=".txt,.csv,.md" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0], setAnswerKey)} className="text-xs text-command-muted" />

            <label className="flex items-center gap-2 pt-2 text-sm text-command-text">
              <input type="checkbox" checked={authorCustom} onChange={(e) => setAuthorCustom(e.target.checked)} />
              Author a custom skill from the AJD and include it
            </label>

            <div className="rounded border border-command-border/60 p-2 font-mono text-[11px] text-command-muted">
              Options to run ({plannedLanes.length}):
              {plannedLanes.map((lane) => (
                <div key={lane.candidate.candidate_id}>· {lane.candidate.name}</div>
              ))}
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="button"
              onClick={runEvaluation}
              className="w-full rounded-lg border border-command-action bg-command-action py-2.5 font-mono text-sm font-semibold text-command-bg transition hover:brightness-110"
            >
              ▶ Run all options on this data
            </button>
          </div>
        </div>
      )}

      {(stage === "running" || stage === "judging") && (
        <div className="grid gap-3 md:grid-cols-2">
          {lanes.map((lane) => (
            <div key={lane.candidate.candidate_id} className="command-card flex items-center justify-between gap-3 p-3">
              <div>
                <p className="text-sm font-semibold text-command-text">{lane.candidate.name}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-command-muted">{lane.candidate.source}</p>
              </div>
              <span
                className={`font-mono text-xs ${
                  lane.state === "done" ? "text-emerald-400" : lane.state === "error" ? "text-red-400" : "text-command-action"
                }`}
              >
                {lane.state === "authoring" ? "writing skill…" : lane.state === "running" ? "running…" : lane.state === "error" ? lane.error : lane.state}
              </span>
            </div>
          ))}
          {stage === "judging" && <p className="font-mono text-xs text-command-action md:col-span-2">Scoring all outputs against one ground truth…</p>}
        </div>
      )}

      {stage === "done" && judge && (
        <div className="space-y-4">
          <div className={`rounded-lg border p-4 ${winnerBeatsBaseline ? "border-emerald-400/40 bg-emerald-400/5" : "border-amber-400/40 bg-amber-400/5"}`}>
            {winner && winnerBeatsBaseline ? (
              <p className="text-sm text-command-text">
                <span className="font-semibold">{winner.name}</span> scored {winner.composite}
                {baselineScore ? ` vs ${baselineScore.composite} for Claude with no skill` : ""} — it found {winner.found.length} of {judge.issues.length} issues
                {winner.false_flags.length ? ` with ${winner.false_flags.length} false flag${winner.false_flags.length === 1 ? "" : "s"}` : " with no false flags"}.
              </p>
            ) : (
              <p className="text-sm text-command-text">
                No skill beat Claude with no skill on this data. Installing one would not add value for this task as tested.
              </p>
            )}
            <p className="mt-1 font-mono text-[11px] text-command-muted">
              Ground truth: {judge.ground_truth === "answer_key" ? "your answer key" : "independent audit of the data (indicative)"} · {judge.issues.length} issues
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-command-border text-left text-command-muted">
                  <th className="py-2 pr-2 font-normal">#</th>
                  <th className="py-2 pr-2 font-normal">Option</th>
                  <th className="py-2 pr-2 font-normal" title="Share of real issues found">Recall</th>
                  <th className="py-2 pr-2 font-normal" title="Share of flags that were real issues">Precision</th>
                  <th className="py-2 pr-2 font-normal" title="Share of items grounded in the data">Grounding</th>
                  <th className="py-2 pr-2 font-normal">Score</th>
                  <th className="py-2 pr-2 font-normal">Found</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((s, i) => (
                  <tr
                    key={s.key}
                    onClick={() => setOpenKey(openKey === s.key ? null : s.key)}
                    className={`cursor-pointer border-b border-command-border/60 text-command-text hover:bg-command-action/5 ${openKey === s.key ? "bg-command-action/5" : ""}`}
                  >
                    <td className="py-2 pr-2 text-command-muted">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <span className="font-sans text-sm font-semibold">{s.name}</span>
                    </td>
                    <td className={`py-2 pr-2 ${scoreTone(s.recall)}`}>{s.recall}%</td>
                    <td className={`py-2 pr-2 ${scoreTone(s.precision)}`}>{s.precision}%</td>
                    <td className={`py-2 pr-2 ${scoreTone(s.grounding)}`}>{s.grounding}%</td>
                    <td className={`py-2 pr-2 text-sm font-semibold ${scoreTone(s.composite)}`}>{s.composite}</td>
                    <td className="py-2 pr-2">
                      {s.found.length}/{judge.issues.length}
                      {s.false_flags.length ? <span className="text-red-400"> · {s.false_flags.length} false</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 font-mono text-[10px] text-command-muted">Score = 60% recall + 30% precision + 10% grounding. Click a row for details.</p>
          </div>

          {(() => {
            const s = judge.scores.find((x) => x.key === openKey);
            const lane = lanes.find((l) => l.candidate.candidate_id === openKey);
            if (!s || !lane) return null;
            return (
              <div className="command-card space-y-3 p-4">
                <p className="text-sm text-command-text">{s.verdict}</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-emerald-400">Found</p>
                    {s.found.length ? s.found.map((id) => <p key={id} className="text-xs text-command-text">✓ {issueText(id)}</p>) : <p className="text-xs text-command-muted">None</p>}
                  </div>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-red-400">Missed</p>
                    {s.missed.length ? s.missed.map((id) => <p key={id} className="text-xs text-command-text">✗ {issueText(id)}</p>) : <p className="text-xs text-command-muted">None</p>}
                  </div>
                </div>
                {s.false_flags.length > 0 && (
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-amber-400">False flags</p>
                    {s.false_flags.map((f, i) => (
                      <p key={i} className="text-xs text-command-text">! {f.item} — {f.why}</p>
                    ))}
                  </div>
                )}
                <details>
                  <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.14em] text-command-muted">Raw output ({lane.result?.items.length ?? 0} items)</summary>
                  <div className="mt-2 space-y-2">
                    {lane.result?.items.map((item, i) => {
                      const meta = TAG_META[item.reliability] ?? TAG_META.cannot_demonstrate;
                      return (
                        <div key={i} className="rounded border border-command-border bg-command-bg/60 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-command-text">{item.label}</span>
                            <span className={`rounded border px-2 py-0.5 font-mono text-[10px] ${meta.className}`}>{meta.text}</span>
                          </div>
                          <p className="mt-1 text-xs text-command-text">{item.detail}</p>
                        </div>
                      );
                    })}
                  </div>
                </details>
                {lane.skillMd && (
                  <details>
                    <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.14em] text-command-muted">SKILL.md</summary>
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded border border-command-border bg-command-bg p-2 text-[11px] text-command-text">{lane.skillMd}</pre>
                  </details>
                )}
                {lane.skillMd && (
                  <button
                    type="button"
                    onClick={() => downloadSkill(lane)}
                    className="rounded border border-command-border px-3 py-1.5 font-mono text-xs text-command-text transition hover:border-command-action hover:text-command-action"
                  >
                    ⬇ Download this skill (.zip)
                  </button>
                )}
              </div>
            );
          })()}

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setStage("input");
                setOpenKey(null);
              }}
              className="rounded-lg border border-command-border px-5 py-2.5 font-mono text-sm text-command-muted transition hover:text-command-text"
            >
              ▶ Run again on other data
            </button>
            {winnerBeatsBaseline && winnerLane?.skillMd ? (
              <button
                type="button"
                onClick={() => downloadSkill(winnerLane)}
                className="rounded-lg border border-command-action bg-command-action px-5 py-2.5 font-mono text-sm font-semibold text-command-bg transition hover:brightness-110"
              >
                ⬇ Download winning skill for Claude
              </button>
            ) : null}
          </div>
          {winnerLane && winnerLane.kind === "directory" && winnerBeatsBaseline ? (
            <p className="text-right font-mono text-[10px] text-command-muted">
              Only SKILL.md is packaged. Any scripts in the original repository are not included and were not run.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
