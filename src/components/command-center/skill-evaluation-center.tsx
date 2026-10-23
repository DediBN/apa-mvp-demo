"use client";

import { useCallback, useMemo, useState } from "react";
import { APAStatus } from "../../lib/state-machine";
import { AJD } from "../../lib/intake-agent/mock";
import { readUploadAsText, UPLOAD_ACCEPT } from "../../lib/files/read-upload";
import { Candidate } from "../../lib/research-agent/mock";
import { CandidateEvaluationResult } from "../../lib/evaluation-agent/mock";
import type { GeneratedScenario, JudgeResponse, OptionScore } from "../../lib/skills/types";
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
  const [mode, setMode] = useState<"scenarios" | "data">("scenarios");
  const [scenarios, setScenarios] = useState<GeneratedScenario[]>([]);
  const [stage, setStage] = useState<"input" | "generating" | "running" | "judging" | "done">("input");
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [judge, setJudge] = useState<JudgeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  const visible = status.state === "EVALUATING" || status.state === "COMPLETE" || status.state === "SCORECARD";

  const plannedLanes = useMemo<Lane[]>(
    () =>
      candidates
        .map((candidate) => ({ candidate, kind: laneKind(candidate), skillMd: candidate.skill?.content, state: "queued" as LaneState }))
        .filter((lane) => lane.kind !== "directory" || Boolean(lane.skillMd?.trim()))
        .filter((lane) => lane.kind !== "custom" || authorCustom),
    [candidates, authorCustom]
  );

  const [fileStatus, setFileStatus] = useState<string | null>(null);

  const readFile = useCallback(async (file: File, setter: (v: string) => void) => {
    setError(null);
    setFileStatus(`Reading ${file.name}…`);
    try {
      const { text, note } = await readUploadAsText(file, MAX_CHARS);
      setter(text);
      setFileStatus(note ? `${file.name}: ${note}` : `${file.name} loaded.`);
    } catch (e) {
      setFileStatus(null);
      setError(e instanceof Error ? e.message : "Could not read that file — paste the content instead.");
    }
  }, []);

  const updateLane = (id: string, patch: Partial<Lane>) =>
    setLanes((prev) => prev.map((lane) => (lane.candidate.candidate_id === id ? { ...lane, ...patch } : lane)));

  async function runEvaluation() {
    if (!ajd) return;
    if (mode === "data" && !customerData.trim()) {
      setError("Upload or paste at least one real data sample, or switch to generated scenarios.");
      return;
    }
    setError(null);
    setJudge(null);
    setOpenKey(null);
    setLanes(plannedLanes);

    const actionDescription = buildActionDescription(ajd);
    const ajdBody = {
      job_title: ajd.job_title,
      business_need: ajd.business_need,
      mission: ajd.agent_profile?.mission,
      kpis: ajd.agent_profile?.kpis
    };

    // 1. Test sets: the user's data, or scenarios generated from the AJD (generator never sees any skill).
    let sets: Array<{ id: string; label: string; customer: string; reference: string; answerKey?: string }>;
    if (mode === "data") {
      sets = [{ id: "D", label: "Your data", customer: customerData, reference: referenceData, answerKey: answerKey.trim() || undefined }];
    } else {
      setStage("generating");
      addLog("Generating test scenarios from the Skill Spec (no real data provided).");
      try {
        // Two independent calls in parallel (standard + hard) keep each request well inside the function time limit.
        const settled = await Promise.allSettled(
          (["standard", "hard"] as const).map((variant) =>
            postJson<{ scenarios: GeneratedScenario[] }>("/api/skills/scenarios", { ...ajdBody, count: 1, variant })
          )
        );
        const generated = {
          scenarios: settled.flatMap((r) => (r.status === "fulfilled" ? r.value.scenarios : []))
        };
        if (generated.scenarios.length === 0) {
          throw new Error("Could not generate test scenarios. Please try again.");
        }
        setScenarios(generated.scenarios);
        sets = generated.scenarios.map((sc, i) => ({
          id: `S${i + 1}`,
          label: sc.title,
          customer: sc.customer_data,
          reference: sc.reference_data,
          answerKey: sc.answer_key
        }));
        addLog(`Scenarios ready: ${generated.scenarios.map((sc) => sc.title).join(" · ")}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not generate scenarios.");
        setStage("input");
        return;
      }
    }

    setStage("running");
    addLog(`Skill evaluation: ${plannedLanes.length} options × ${sets.length} test set${sets.length === 1 ? "" : "s"}.`);

    // 2. Author the custom skill once, before any run.
    const skillByLane = new Map<string, string | undefined>();
    for (const lane of plannedLanes) {
      skillByLane.set(lane.candidate.candidate_id, lane.kind === "baseline" ? undefined : lane.skillMd);
    }
    const customLane = plannedLanes.find((lane) => lane.kind === "custom");
    if (customLane) {
      const id = customLane.candidate.candidate_id;
      updateLane(id, { state: "authoring" });
      try {
        const authored = await postJson<{ skill_md: string; name: string }>("/api/skills/author", ajdBody);
        skillByLane.set(id, authored.skill_md);
        updateLane(id, { skillMd: authored.skill_md, state: "queued" });
        addLog(`Custom skill written from the Skill Spec: ${authored.name}`);
      } catch (e) {
        updateLane(id, { state: "error", error: e instanceof Error ? e.message : "Authoring failed" });
      }
    }

    // 3. Every runnable option × every test set, in parallel.
    const runnable = plannedLanes.filter((lane) => lane.kind !== "custom" || skillByLane.get(lane.candidate.candidate_id));
    runnable.forEach((lane) => updateLane(lane.candidate.candidate_id, { state: "running" }));
    const runs = await Promise.all(
      runnable.flatMap((lane) =>
        sets.map(async (set) => {
          try {
            const result = await postJson<RunResult>("/api/concierge-demo", {
              action_description: actionDescription,
              customer_data: set.customer.slice(0, MAX_CHARS),
              reference_data: set.reference.slice(0, MAX_CHARS),
              skill_md: skillByLane.get(lane.candidate.candidate_id),
              skill_name: lane.kind === "baseline" ? undefined : lane.candidate.name
            });
            return { laneId: lane.candidate.candidate_id, setId: set.id, result };
          } catch (e) {
            return { laneId: lane.candidate.candidate_id, setId: set.id, error: e instanceof Error ? e.message : "Run failed" };
          }
        })
      )
    );

    const finished: Lane[] = plannedLanes.map((lane) => {
      const id = lane.candidate.candidate_id;
      const mine = runs.filter((r) => r.laneId === id);
      const ok = mine.filter((r) => r.result);
      const skillMd = skillByLane.get(id) ?? lane.skillMd;
      if (ok.length === 0) {
        const message = mine.find((r) => r.error)?.error || "Not run";
        updateLane(id, { state: "error", error: message, skillMd });
        return { ...lane, skillMd, state: "error", error: message };
      }
      const merged: RunResult = {
        summary: ok.map((r) => `${sets.length > 1 ? `[${r.setId}] ` : ""}${r.result?.summary ?? ""}`).join("\n"),
        items: ok.flatMap((r) => (r.result?.items ?? []).map((it) => (sets.length > 1 ? { ...it, label: `[${r.setId}] ${it.label}` } : it)))
      };
      updateLane(id, { state: "done", result: merged, skillMd });
      return { ...lane, skillMd, state: "done", result: merged };
    });

    if (!runs.some((r) => r.result)) {
      setError("None of the runs completed. Try again.");
      setStage("input");
      return;
    }

    // 4. Judge each test set against its own ground truth, then aggregate counts across sets.
    setStage("judging");
    addLog("All runs finished. Scoring every output against one ground truth per test set.");
    try {
      const judgedSets = await Promise.all(
        sets.map(async (set) => {
          const outputs = runs
            .filter((r) => r.setId === set.id && r.result)
            .map((r) => {
              const lane = plannedLanes.find((l) => l.candidate.candidate_id === r.laneId)!;
              return { key: r.laneId, name: lane.candidate.name, summary: r.result?.summary, items: r.result?.items ?? [] };
            });
          const judged = await postJson<JudgeResponse>("/api/skills/judge", {
            action_description: actionDescription,
            customer_data: set.customer.slice(0, MAX_CHARS),
            reference_data: set.reference.slice(0, MAX_CHARS),
            answer_key: set.answerKey,
            outputs
          });
          return { set, judged };
        })
      );

      const multi = sets.length > 1;
      const prefix = (setId: string, id: string) => (multi ? `${setId}·${id}` : id);
      const issues = judgedSets.flatMap(({ set, judged }) =>
        judged.issues.map((issue) => ({ id: prefix(set.id, issue.id), description: multi ? `[${set.id}] ${issue.description}` : issue.description }))
      );
      const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n * 100)));
      const scores: OptionScore[] = finished
        .filter((lane) => lane.result)
        .map((lane) => {
          const per = judgedSets
            .map(({ set, judged }) => ({ set, score: judged.scores.find((sc) => sc.key === lane.candidate.candidate_id) }))
            .filter((x): x is { set: typeof x.set; score: OptionScore } => Boolean(x.score));
          const found = per.flatMap(({ set, score }) => score.found.map((id) => prefix(set.id, id)));
          const missed = issues.map((i) => i.id).filter((id) => !found.includes(id));
          const falseFlags = per.flatMap(({ set, score }) => score.false_flags.map((f) => ({ ...f, item: multi ? `[${set.id}] ${f.item}` : f.item })));
          const unsupported = per.reduce((sum, { score }) => sum + score.unsupported, 0);
          const totalItems = per.reduce((sum, { score }) => sum + score.total_items, 0);
          const recall = issues.length ? found.length / issues.length : 0;
          const flagged = found.length + falseFlags.length;
          const precision = flagged ? found.length / flagged : 0;
          const grounding = totalItems ? 1 - unsupported / totalItems : 0;
          return {
            key: lane.candidate.candidate_id,
            name: lane.candidate.name,
            found,
            missed,
            false_flags: falseFlags,
            unsupported,
            total_items: totalItems,
            recall: pct(recall),
            precision: pct(precision),
            grounding: pct(grounding),
            composite: pct(recall * 0.6 + precision * 0.3 + grounding * 0.1),
            verdict: per.map(({ set, score }) => `${multi ? `[${set.id}] ` : ""}${score.verdict}`).join(" ")
          };
        });

      const groundTruth: JudgeResponse["ground_truth"] =
        mode === "scenarios" ? "generated_scenarios" : answerKey.trim() ? "answer_key" : "independent_audit";
      const aggregated: JudgeResponse = { ground_truth: groundTruth, issues, scores };
      setJudge(aggregated);
      setStage("done");
      const ranked = [...scores].sort((a, b) => b.composite - a.composite);
      addLog(`Scoring done. Top: ${ranked[0]?.name} · ${ranked[0]?.composite}`);
      onEvaluationDone(finished.map((lane) => toEvaluationResult(lane, scores.find((sc) => sc.key === lane.candidate.candidate_id))));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scoring failed.");
      setStage("input");
    }
  }

  function downloadSkill(lane: Lane) {
    if (!lane.skillMd) return;
    const folder = skillFolderName(lane.skillMd, lane.candidate.name);
    // Claude rejects uploads whose folder name doesn't match the skill's frontmatter name, so align them.
    const content = /^---[\s\S]*?^name:/m.test(lane.skillMd)
      ? lane.skillMd.replace(/^name:.*$/m, `name: ${folder}`)
      : `---\nname: ${folder}\ndescription: ${lane.candidate.name}\n---\n\n${lane.skillMd}`;
    const blob = buildZip([{ path: `${folder}/SKILL.md`, content }]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${folder}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    addLog(`Downloaded ${folder}.zip — see "Install in Claude" for the steps.`);
    setShowInstall(true);
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
          label={stage === "done" ? "COMPLETE" : stage === "judging" ? "SCORING" : stage === "running" ? "RUNNING" : stage === "generating" ? "BUILDING TESTS" : "READY"}
          tone={stage === "done" ? "pass" : stage === "input" ? "neutral" : "action"}
        />
      </header>

      {stage === "input" && (
        <div className="space-y-4">
          <div className="inline-flex rounded-lg border border-command-border p-1 font-mono text-xs">
            <button
              type="button"
              onClick={() => setMode("scenarios")}
              className={`rounded px-3 py-1.5 ${mode === "scenarios" ? "bg-command-action text-command-bg" : "text-command-muted hover:text-command-text"}`}
            >
              No data — generate test scenarios
            </button>
            <button
              type="button"
              onClick={() => setMode("data")}
              className={`rounded px-3 py-1.5 ${mode === "data" ? "bg-command-action text-command-bg" : "text-command-muted hover:text-command-text"}`}
            >
              Test on my real data
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {mode === "scenarios" ? (
              <div className="command-card space-y-2 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-command-muted">Generated scenarios</p>
                <p className="text-sm text-command-text">
                  We write 2 realistic test cases from the Skill Spec — sample data with known answers, clean records, a false-alarm trap
                  and an easy-to-miss case. Every option runs on both and is scored against those answers.
                </p>
                <p className="text-xs text-command-muted">
                  The scenario writer never sees any skill. Results are synthetic: they show which skill is most likely to help, not proof on
                  your data. The custom skill and the scenarios both come from the Skill Spec, so its lead may be overstated.
                </p>
              </div>
            ) : (
              <div className="command-card space-y-3 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-command-muted">Real data</p>
                <textarea
                  rows={6}
                  value={customerData}
                  onChange={(e) => setCustomerData(e.target.value)}
                  placeholder="Paste records, or upload a .csv / .txt file"
                  className="w-full rounded border border-command-border bg-command-bg p-2 font-mono text-xs text-command-text"
                />
                <input type="file" accept={UPLOAD_ACCEPT} onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0], setCustomerData)} className="text-xs text-command-muted" />

                <p className="pt-2 font-mono text-xs uppercase tracking-[0.14em] text-command-muted">Reference (optional) — price list, catalog, policy</p>
                <textarea
                  rows={3}
                  value={referenceData}
                  onChange={(e) => setReferenceData(e.target.value)}
                  className="w-full rounded border border-command-border bg-command-bg p-2 font-mono text-xs text-command-text"
                />
                <input type="file" accept={UPLOAD_ACCEPT} onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0], setReferenceData)} className="text-xs text-command-muted" />

                <p className="pt-2 font-mono text-xs uppercase tracking-[0.14em] text-command-muted">Answer key (optional, for testing)</p>
                <p className="text-xs text-command-muted">
                  What you know is in the data. With a key, scores are measured against it; without one, the judge audits the data independently.
                </p>
                <textarea
                  rows={3}
                  value={answerKey}
                  onChange={(e) => setAnswerKey(e.target.value)}
                  className="w-full rounded border border-command-border bg-command-bg p-2 font-mono text-xs text-command-text"
                />
                <input type="file" accept={UPLOAD_ACCEPT} onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0], setAnswerKey)} className="text-xs text-command-muted" />
              </div>
            )}

            <div className="command-card space-y-3 p-4">
              <label className="flex items-center gap-2 text-sm text-command-text">
                <input type="checkbox" checked={authorCustom} onChange={(e) => setAuthorCustom(e.target.checked)} />
                Write a custom skill from the Skill Spec and include it
              </label>

              <div className="rounded border border-command-border/60 p-2 font-mono text-[11px] text-command-muted">
                Options to run ({plannedLanes.length}):
                {plannedLanes.map((lane) => (
                  <div key={lane.candidate.candidate_id}>· {lane.candidate.name}</div>
                ))}
              </div>

              {fileStatus && <p className="font-mono text-xs text-command-action">{fileStatus}</p>}
              {error && <p className="text-sm text-red-400">{error}</p>}

              <button
                type="button"
                onClick={runEvaluation}
                className="w-full rounded-lg border border-command-action bg-command-action py-2.5 font-mono text-sm font-semibold text-command-bg transition hover:brightness-110"
              >
                {mode === "scenarios" ? "▶ Build tests and run all options" : "▶ Run all options on this data"}
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === "generating" && (
        <p className="font-mono text-xs text-command-action">Writing test scenarios from the Skill Spec — realistic sample data with known answers…</p>
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
              Ground truth: {judge.ground_truth === "answer_key"
                ? "your answer key"
                : judge.ground_truth === "generated_scenarios"
                  ? `${scenarios.length} generated scenarios with planted answer keys (synthetic — confirm on real data before relying on it)`
                  : "independent audit of the data (indicative)"} · {judge.issues.length} issues
            </p>
          </div>

          {judge.ground_truth === "generated_scenarios" && scenarios.length > 0 && (
            <details className="command-card p-3">
              <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.14em] text-command-muted">
                Test scenarios used ({scenarios.length})
              </summary>
              <div className="mt-2 space-y-3">
                {scenarios.map((sc, i) => (
                  <div key={i}>
                    <p className="text-sm font-semibold text-command-text">S{i + 1} · {sc.title}</p>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-command-border bg-command-bg p-2 text-[11px] text-command-text">{sc.customer_data}</pre>
                    {sc.reference_data ? (
                      <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded border border-command-border bg-command-bg p-2 text-[11px] text-command-muted">{sc.reference_data}</pre>
                    ) : null}
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-command-muted">Answer key</p>
                    <pre className="whitespace-pre-wrap text-[11px] text-command-muted">{sc.answer_key}</pre>
                  </div>
                ))}
              </div>
            </details>
          )}

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
              ▶ Run again
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

          <div className="command-card p-4">
            <button
              type="button"
              onClick={() => setShowInstall((v) => !v)}
              className="flex w-full items-center justify-between font-mono text-xs uppercase tracking-[0.14em] text-command-action"
            >
              <span>Install in Claude — step by step</span>
              <span>{showInstall ? "−" : "+"}</span>
            </button>
            {showInstall && <InstallGuide />}
          </div>
        </div>
      )}
    </section>
  );
}

function InstallGuide() {
  return (
    <div className="mt-3 space-y-4 text-sm text-command-text">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-command-muted">1 · Turn on code execution (one time)</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-command-muted">
          <li>
            <span className="text-command-text">Free, Pro, Max:</span> Settings → Capabilities → turn on “Code execution and file creation”.
          </li>
          <li>
            <span className="text-command-text">Team:</span> already on by default.
          </li>
          <li>
            <span className="text-command-text">Enterprise:</span> an owner turns on “Code execution and file creation” and “Skills” in Organization
            settings → Plugins &amp; skills → Policy.
          </li>
        </ul>
      </div>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-command-muted">2 · Upload the skill</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-command-muted">
          <li>In Claude, go to Customize → Skills.</li>
          <li>Click “+”, then “+ Create skill”, then “Upload a skill”.</li>
          <li>Choose the .zip you downloaded here — upload it as is, don’t unzip it.</li>
          <li>The skill appears in your list. Make sure its toggle is on.</li>
        </ol>
      </div>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-command-muted">3 · Use it</p>
        <p className="mt-1 text-command-muted">
          Claude uses the skill on its own when a request fits it. If it doesn’t, name the skill in your message. Uploaded skills are private to you
          until you share them.
        </p>
      </div>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-command-muted">For a whole team (Team / Enterprise owners)</p>
        <p className="mt-1 text-command-muted">
          Organization settings → Plugins &amp; skills → Add → Upload a skill. It is provisioned to everyone at once; each person can still turn it off.
        </p>
      </div>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-command-muted">Claude Code</p>
        <p className="mt-1 text-command-muted">
          Nothing extra: skills in your Claude account sync to Claude Code when you sign in with the same account. Run /skills to see them.
        </p>
      </div>
      <a
        href="https://support.claude.com/en/articles/12512180-use-skills-in-claude"
        target="_blank"
        rel="noreferrer"
        className="inline-block font-mono text-[11px] uppercase tracking-[0.14em] text-command-action hover:underline"
      >
        Official guide: Use skills in Claude ↗
      </a>
    </div>
  );
}
