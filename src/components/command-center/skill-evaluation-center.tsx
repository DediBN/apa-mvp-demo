"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { APAStatus } from "../../lib/state-machine";
import { AJD } from "../../lib/intake-agent/mock";
import { readUploadAsText, UPLOAD_ACCEPT } from "../../lib/files/read-upload";
import { pickSheets, readSheets, SHEET_EXTENSIONS, sheetsText, type Sheet } from "../../lib/files/sheets";
import { Candidate } from "../../lib/research-agent/mock";
import { CandidateEvaluationResult } from "../../lib/evaluation-agent/mock";
import type { GeneratedScenario, JudgeResponse, OptionScore } from "../../lib/skills/types";
import { buildZip, skillFolderName } from "../../lib/skills/zip";
import { StatusPill } from "../ui/status-pill";
import { pool, scoreRun, spread, withinNoise, type Issue, type RunJudgement } from "../../lib/skills/tech-scoring";
import { MIN_FIT, recommend, type OptionResult } from "../../lib/business/scoring";
import { Markdown } from "../business/markdown";
import { securityWarning } from "../../lib/skills/security";
import { encodeReport, type SharedReport } from "../../lib/skills/share";
import type { FormatRequirement } from "../../lib/skills/format-contract";

// Step 03 in skill mode: every option runs the real task on the customer's real data, then one judge scores all
// outputs against the same ground truth. No simulated scenarios, no formula-generated parameters.

interface SkillEvaluationCenterProps {
  status: APAStatus;
  ajd: AJD | null;
  candidates: Candidate[];
  onEvaluationDone: (results: CandidateEvaluationResult[]) => void;
  addLog: (line: string) => void;
  initialFile?: File | null; // handed over from the landing page: used as the real data
  initialAnswerKey?: string; // known answers for a demo example file
  preferData?: boolean; // the task runs on the business's own file: open on "Test on my real data"
}

// Picks the sheets a task is about: a sheet whose name shares a word with the Skill Spec, plus small lookup sheets.
// The user can change the choice; when nothing matches, all sheets are used.
function guessSheets(sheets: Sheet[], ajd: AJD | null): string[] {
  const spec = [ajd?.business_need, ajd?.job_title, ajd?.agent_profile?.mission, ...(ajd?.agent_profile?.kpis ?? []).map((k) => k.name), ...(ajd?.agent_profile?.tech_specs ?? [])]
    .join(" ")
    .toLowerCase();
  // A sheet word matches when the spec contains it, or its stem without a Hebrew plural ending (ספקים → ספק).
  const matches = (w: string) => w.length >= 3 && (spec.includes(w) || spec.includes(w.replace(/(ים|ות)$/, "")));
  const hits = sheets.filter((sh) => sh.name.toLowerCase().split(/[^\p{L}\p{N}]+/u).some(matches));
  if (hits.length === 0) return sheets.map((sh) => sh.name);
  const small = sheets.filter((sh) => sh.csv.length <= 1500 && !hits.includes(sh));
  return [...hits, ...small].map((sh) => sh.name);
}

type ReliabilityTag = "found_in_data" | "inferred" | "needs_approval" | "missing_info" | "cannot_demonstrate";
type ResultItem = { label: string; detail: string; reliability: ReliabilityTag; reason?: string };
type RunResult = { items: ResultItem[]; summary: string; deliverable?: string };

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

// What an employee actually types, day to day: the task, without restating the business's rules. This is what every
// option receives in the realistic test — the rules have to come from the skill, which is the point of installing one.
function buildEverydayRequest(ajd: AJD): string {
  return [
    `Task: ${ajd.job_title}.`,
    "Handle the request in the data below and produce the finished result, ready to send.",
    "Write it in the language of the data."
  ].join("\n");
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

// Ranking: correctness first, then format.
function byScore(a: OptionScore, b: OptionScore): number {
  return (b.correctness ?? b.composite) - (a.correctness ?? a.composite) || (b.format ?? -1) - (a.format ?? -1);
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

export function SkillEvaluationCenter({ status, ajd, candidates, onEvaluationDone, addLog, initialFile, initialAnswerKey, preferData }: SkillEvaluationCenterProps) {
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
  // Which option's output is shown next to Claude alone in the result card (default: the best skill).
  const [compareKey, setCompareKey] = useState<string | null>(null);
  const [repeats, setRepeats] = useState(1);
  const [unscoredRuns, setUnscoredRuns] = useState(0);
  const [contract, setContract] = useState<FormatRequirement[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  // "everyday": options get the short request an employee would type; "full": every run gets the whole Skill Spec.
  const [requestMode, setRequestMode] = useState<"everyday" | "full">("everyday");
  const [ranWith, setRanWith] = useState<"everyday" | "full">("everyday");

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
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [usedSheets, setUsedSheets] = useState<string[]>([]);

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

  // A spreadsheet is read in the browser; only the sheets the task is about are sent, each in full up to the limit.
  const readCustomerFile = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!SHEET_EXTENSIONS.includes(ext)) {
        setSheets(null);
        return readFile(file, setCustomerData);
      }
      setError(null);
      setFileStatus(`Reading ${file.name}…`);
      try {
        const all = await readSheets(file);
        const chosen = guessSheets(all, ajd);
        setSheets(all);
        setUsedSheets(chosen);
        setFileStatus(`${file.name}: ${all.length} sheet${all.length === 1 ? "" : "s"} read in the browser — using ${chosen.join(", ")}.`);
      } catch (e) {
        setFileStatus(null);
        setError(e instanceof Error ? e.message : "Could not read that file.");
      }
    },
    [ajd, readFile]
  );

  useEffect(() => {
    if (!sheets) return;
    const { text, cut } = sheetsText(pickSheets(sheets, usedSheets), MAX_CHARS);
    setCustomerData(text);
    if (cut) setFileStatus(`The chosen sheets are longer than ${MAX_CHARS.toLocaleString()} characters — only the first part is used. Remove a sheet the task does not need.`);
  }, [sheets, usedSheets]);

  useEffect(() => {
    if (preferData) setMode("data");
  }, [preferData]);

  const [initialRead, setInitialRead] = useState(false);
  useEffect(() => {
    if (!initialFile || initialRead || !ajd) return;
    setInitialRead(true);
    setMode("data");
    if (initialAnswerKey) setAnswerKey(initialAnswerKey);
    void readCustomerFile(initialFile);
  }, [initialFile, initialRead, ajd, readCustomerFile, initialAnswerKey]);

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
    setUnscoredRuns(0);
    setContract([]);
    setShareUrl(null);
    setShareCopied(false);
    setOpenKey(null);
    setCompareKey(null);
    setLanes(plannedLanes);

    const actionDescription = buildActionDescription(ajd);
    const everydayRequest = buildEverydayRequest(ajd);
    setRanWith(requestMode);
    const ajdBody = {
      job_title: ajd.job_title,
      business_need: ajd.business_need,
      mission: ajd.agent_profile?.mission,
      kpis: ajd.agent_profile?.kpis
    };
    // The format contract is fixed first, from the Skill Spec alone (no skill, no output): the custom skill carries it
    // and every test set is scored on it, so "format" means the business's own format, the same way every time.
    const fetchContract = () => postJson<{ requirements: FormatRequirement[] }>("/api/skills/format-contract", ajdBody).then((r) => r.requirements);
    const contractP = fetchContract()
      .catch(fetchContract)
      .catch(() => {
        addLog("Could not set the required output format — format is scored on the test sets' own items this time.");
        return [] as FormatRequirement[];
      });

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
        const dropped = settled.filter((r) => r.status === "rejected").length;
        if (dropped > 0 && generated.scenarios.length > 0) addLog(`One test set could not be generated — continuing with ${generated.scenarios.length}.`);
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
        const authored = await postJson<{ skill_md: string; name: string }>("/api/skills/author", { ...ajdBody, format_contract: await contractP });
        skillByLane.set(id, authored.skill_md);
        updateLane(id, { skillMd: authored.skill_md, state: "queued" });
        addLog(`Custom skill written from the Skill Spec: ${authored.name}`);
      } catch (e) {
        updateLane(id, { state: "error", error: e instanceof Error ? e.message : "Authoring failed" });
      }
    }

    // 3. Ground truth is fixed once per test set, before any output exists (and in parallel with the runs).
    // Each set's ground truth is retried once; a set whose ground truth still fails is left out of scoring (its runs
    // are not thrown away with the rest).
    const truthFor = (set: (typeof sets)[number]) => {
      const body = {
        action_description: actionDescription,
        customer_data: set.customer.slice(0, MAX_CHARS),
        reference_data: set.reference.slice(0, MAX_CHARS),
        answer_key: set.answerKey
      };
      type Truth = { issues: Issue[]; source: string; finished_deliverable_expected?: boolean };
      return postJson<Truth>("/api/skills/ground-truth", body).catch(() => postJson<Truth>("/api/skills/ground-truth", body));
    };
    const truthP = Promise.allSettled(
      sets.map((set) =>
        truthFor(set).then(async (r) => {
          const fmt = await contractP;
          // With a contract, format is scored on the contract only; the set's own items keep the substance. When the
          // rules say this case must stop (e.g. a price is missing), there is no finished deliverable to check the format of.
          const issues: Issue[] = fmt.length
            ? [
                ...r.issues.filter((i) => i.kind === "correctness"),
                ...(r.finished_deliverable_expected === false
                  ? []
                  : fmt.map((f) => ({ id: f.id, description: f.description, kind: "format" as const, check: f.check })))
              ]
            : r.issues;
          return { setId: set.id, issues };
        })
      )
    );

    // 4. Every runnable option × every test set × every repetition, a few at a time.
    const runnable = plannedLanes.filter((lane) => lane.kind !== "custom" || skillByLane.get(lane.candidate.candidate_id));
    runnable.forEach((lane) => updateLane(lane.candidate.candidate_id, { state: "running" }));
    const reps = Array.from({ length: repeats }, (_, i) => i);
    const runs = await pool(
      runnable.flatMap((lane) =>
        sets.flatMap((set) =>
          reps.map((rep) => async () => {
            const body = {
              action_description: requestMode === "everyday" ? everydayRequest : actionDescription,
              customer_data: set.customer.slice(0, MAX_CHARS),
              // Everyday test on generated scenarios: only the customer's request, as it arrives. The business's own
              // prices and rules are not handed over — knowing them is the skill's job. (Your own uploaded reference is kept.)
              reference_data: requestMode === "everyday" && mode === "scenarios" ? "" : set.reference.slice(0, MAX_CHARS),
              skill_md: skillByLane.get(lane.candidate.candidate_id),
              skill_name: lane.kind === "baseline" ? undefined : lane.candidate.name
            };
            // One retry: a single transient failure should not knock a run out of the comparison.
            let lastError = "Run failed";
            for (let attempt = 0; attempt < 2; attempt += 1) {
              try {
                const result = await postJson<RunResult>("/api/concierge-demo", body);
                return { laneId: lane.candidate.candidate_id, setId: set.id, rep, result };
              } catch (e) {
                lastError = e instanceof Error ? e.message : "Run failed";
              }
            }
            return { laneId: lane.candidate.candidate_id, setId: set.id, rep, error: lastError };
          })
        )
      ),
      8
    );

    const finished: Lane[] = plannedLanes.map((lane) => {
      const id = lane.candidate.candidate_id;
      const mine = runs.filter((r) => r.laneId === id);
      // The output shown is the first repetition; every repetition is scored.
      const ok = mine.filter((r) => r.result && r.rep === 0);
      const skillMd = skillByLane.get(id) ?? lane.skillMd;
      if (ok.length === 0) {
        const message = mine.find((r) => r.error)?.error || "Not run";
        updateLane(id, { state: "error", error: message, skillMd });
        return { ...lane, skillMd, state: "error", error: message };
      }
      const merged: RunResult = {
        summary: ok.map((r) => `${sets.length > 1 ? `[${r.setId}] ` : ""}${r.result?.summary ?? ""}`).join("\n"),
        items: ok.flatMap((r) => (r.result?.items ?? []).map((it) => (sets.length > 1 ? { ...it, label: `[${r.setId}] ${it.label}` } : it))),
        deliverable:
          ok
            .filter((r) => r.result?.deliverable?.trim())
            .map((r) => `${sets.length > 1 ? `### ${r.setId}\n\n` : ""}${r.result!.deliverable!.trim()}`)
            .join("\n\n") || undefined
      };
      updateLane(id, { state: "done", result: merged, skillMd });
      return { ...lane, skillMd, state: "done", result: merged };
    });

    if (!runs.some((r) => r.result)) {
      setError("None of the runs completed. Try again.");
      setStage("input");
      return;
    }

    // 5. Judge every run on its own, blind, against its set's fixed ground truth; then aggregate per option.
    setStage("judging");
    addLog(`All runs finished. Scoring each of ${runs.filter((r) => r.result).length} runs blind against a fixed ground truth.`);
    try {
      const settledTruths = await truthP;
      const truths = settledTruths.flatMap((t) => (t.status === "fulfilled" ? [t.value] : []));
      if (truths.length === 0) throw new Error("Could not set the ground truth for any test set. Please run again.");
      if (truths.length < sets.length) addLog(`Ground truth failed for ${sets.length - truths.length} test set(s) — those runs are left out of scoring.`);
      setContract(await contractP);
      const truthBySet = new Map(truths.map((t) => [t.setId, t.issues]));
      const judgeTasks = runs
          .filter((r) => r.result && truthBySet.has(r.setId))
          .map((r) => async () => {
            const set = sets.find((s) => s.id === r.setId)!;
            const body = {
              action_description: actionDescription,
              customer_data: set.customer.slice(0, MAX_CHARS),
              reference_data: set.reference.slice(0, MAX_CHARS),
              issues: truthBySet.get(r.setId) ?? [],
              output: { summary: r.result?.summary, items: r.result?.items ?? [], deliverable: r.result?.deliverable }
            };
            // A failed judgement is retried once, and never counted as a zero.
            for (let attempt = 0; attempt < 2; attempt += 1) {
              try {
                const j = await postJson<RunJudgement & { verdict: string; did_task?: boolean }>("/api/skills/judge-one", body);
                return { ...r, judgement: j };
              } catch {
                if (attempt === 0) await new Promise((res) => setTimeout(res, 2000));
              }
            }
            return { ...r, judgement: null };
          });
      // The first judgement of each test set runs alone, so it stores the set's shared prefix (data + ground truth) in
      // the cache; the rest of the set then reads it instead of paying for it again.
      const toJudge = runs.filter((r) => r.result && truthBySet.has(r.setId));
      const firstIdx = new Set(Array.from(truthBySet.keys()).map((setId) => toJudge.findIndex((r) => r.setId === setId)).filter((i) => i >= 0));
      const firsts = await Promise.all(judgeTasks.filter((_, i) => firstIdx.has(i)).map((task) => task()));
      const rest = await pool(judgeTasks.filter((_, i) => !firstIdx.has(i)), 6);
      const judgements = [...firsts, ...rest];
      const unscored = judgements.filter((j) => !j.judgement).length;
      if (unscored > 0) addLog(`${unscored} run(s) could not be scored and were left out — they are not counted as zero.`);
      setUnscoredRuns(unscored);

      const multi = sets.length > 1;
      const prefix = (setId: string, id: string) => (multi ? `${setId}·${id}` : id);
      const issues: Issue[] = truths.flatMap(({ setId, issues: list }) =>
        list.map((issue) => ({ ...issue, id: prefix(setId, issue.id), description: multi ? `[${setId}] ${issue.description}` : issue.description }))
      );

      const scores: OptionScore[] = [];
      for (const lane of finished.filter((l) => l.result)) {
        const id = lane.candidate.candidate_id;
        const judgedAll = judgements.filter((j) => j.laneId === id && j.judgement);
        // Score a repetition only when every test set in it was judged; a partial one would read as misses.
        const completeReps = reps.filter((rep) => judgedAll.filter((j) => j.rep === rep).length >= truths.length);
        const mine = judgedAll.filter((j) => completeReps.includes(j.rep));
        const repScores = completeReps.map((rep) =>
          scoreRun(
            issues,
            mine.filter((j) => j.rep === rep).map((j) => ({ ...j.judgement!, found: j.judgement!.found.map((f) => prefix(j.setId, f)) }))
          )
        );
        if (repScores.length === 0) continue;
        const corr = spread(repScores.map((s) => s.correctness));
        const fmtValues = repScores.map((s) => s.format).filter((f): f is number => f !== null);
        const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
        // An issue counts as found when most repetitions found it.
        const foundCount = new Map<string, number>();
        mine.forEach((j) => j.judgement!.found.forEach((f) => foundCount.set(prefix(j.setId, f), (foundCount.get(prefix(j.setId, f)) ?? 0) + 1)));
        const found = issues.map((i) => i.id).filter((iid) => (foundCount.get(iid) ?? 0) * 2 >= repScores.length && (foundCount.get(iid) ?? 0) > 0);
        const first = mine.filter((j) => j.rep === completeReps[0]);
        scores.push({
          key: id,
          name: lane.candidate.name,
          found,
          missed: issues.map((i) => i.id).filter((iid) => !found.includes(iid)),
          false_flags: first.flatMap((j) => j.judgement!.false_flags.map((f) => ({ ...f, item: multi ? `[${j.setId}] ${f.item}` : f.item }))),
          unsupported: first.reduce((s, j) => s + j.judgement!.unsupported, 0),
          total_items: first.reduce((s, j) => s + j.judgement!.total_items, 0),
          recall: mean(repScores.map((s) => s.recall)),
          precision: mean(repScores.map((s) => s.precision)),
          grounding: mean(repScores.map((s) => s.grounding)),
          composite: corr.mean,
          correctness: corr.mean,
          correctness_min: corr.min,
          correctness_max: corr.max,
          format: fmtValues.length ? mean(fmtValues) : null,
          runs: repScores.length,
          done: (() => {
            const known = mine.filter((j) => typeof (j.judgement as { did_task?: boolean }).did_task === "boolean");
            return known.length ? known.filter((j) => (j.judgement as { did_task?: boolean }).did_task).length / known.length : null;
          })(),
          verdict: first.map((j) => `${multi ? `[${j.setId}] ` : ""}${j.judgement!.verdict}`).join(" ")
        });
      }

      const groundTruth: JudgeResponse["ground_truth"] =
        mode === "scenarios" ? "generated_scenarios" : answerKey.trim() ? "answer_key" : "independent_audit";
      const aggregated: JudgeResponse = { ground_truth: groundTruth, issues, scores };
      setJudge(aggregated);
      const ranked = [...scores].sort(byScore);
      setOpenKey(ranked[0]?.key ?? null);
      setStage("done");
      addLog(`Scoring done. Top: ${ranked[0]?.name} · correctness ${ranked[0]?.correctness} (${ranked[0]?.correctness_min}–${ranked[0]?.correctness_max})`);
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
  }

  if (!visible || !ajd) {
    return (
      <section className="command-card-elevated p-5 md:p-7">
        <h2 className="font-mono text-sm uppercase tracking-[0.18em] text-command-muted">Step 03 · Skill Evaluation</h2>
        <p className="mt-1 text-sm text-command-muted">Starts after sourcing: every shortlisted skill runs on your real data.</p>
      </section>
    );
  }

  const ranked = judge ? [...judge.scores].sort(byScore) : [];
  const baselineScore = judge?.scores.find((s) => s.key === "skill_baseline_none");
  const laneFor = (key: string) => lanes.find((l) => l.candidate.candidate_id === key);
  const fitOf = (key: string) => {
    const lane = laneFor(key);
    return lane?.kind === "custom" ? 100 : lane?.kind === "baseline" ? 0 : lane?.candidate.fit_score_pre_eval ?? 0;
  };
  // Recommendation (shared, unit-tested rule in lib/business/scoring): fit first (custom skill, or a directory skill
  // with fit >= MIN_FIT), only options that actually did the task, and a directory skill replaces the custom one
  // only when clearly better. No option did the task → no recommendation.
  const rec = judge
    ? recommend(
        judge.scores.map(
          (s): OptionResult => ({
            key: s.key,
            kind: laneFor(s.key)?.kind ?? "directory",
            fit: fitOf(s.key),
            correctness: s.correctness ?? s.composite,
            format: s.format ?? null,
            invented: s.unsupported,
            cases: s.runs ?? 1,
            done: s.done ?? null
          })
        )
      )
    : null;
  const recommendedScore = judge?.scores.find((s) => s.key === rec?.key);
  const sp = (s?: OptionScore) => ({ mean: s?.correctness ?? s?.composite ?? 0, min: s?.correctness_min ?? s?.composite ?? 0, max: s?.correctness_max ?? s?.composite ?? 0, runs: s?.runs ?? 1 });
  const inNoise = Boolean(recommendedScore && baselineScore && withinNoise(sp(recommendedScore), sp(baselineScore)));
  const winner = recommendedScore;
  const winnerBeatsBaseline = Boolean(winner && (!baselineScore || (!inNoise && (winner.correctness ?? 0) > (baselineScore.correctness ?? 0))));
  const range = (s: OptionScore) => ((s.runs ?? 1) > 1 ? `${s.correctness_min}–${s.correctness_max}` : "");
  const notDone = rec?.reason === "not_done";
  // Never fall back to a library skill that was not recommended; with no option that did the task, nothing is offered.
  const recommendedLane = notDone
    ? undefined
    : lanes.find((l) => l.candidate.candidate_id === recommendedScore?.key && l.skillMd) ?? lanes.find((l) => l.kind === "custom" && l.skillMd);
  // Options that failed to run, or ran but could not be scored, are listed — never silently dropped.
  const failedLanes = lanes
    .filter((lane) => lane.state === "error" || !lane.result || (judge && !judge.scores.some((sc) => sc.key === lane.candidate.candidate_id)))
    .map((lane) => (lane.state !== "error" && lane.result ? { ...lane, error: "ran, but scoring failed — press Run again" } : lane));
  const directoryCandidateCount = candidates.filter((c) => laneKind(c) === "directory" && c.skill?.content?.trim()).length;
  async function shareResults() {
    if (!judge || !ajd) return;
    const verdict: SharedReport["verdict"] = !winner ? "none" : winnerBeatsBaseline ? "gain" : inNoise ? "noise" : "baseline_better";
    const report: SharedReport = {
      v: 1,
      title: ajd.job_title,
      need: ajd.business_need.slice(0, 1200),
      date: new Date().toISOString(),
      groundTruth: judge.ground_truth as SharedReport["groundTruth"],
      asked: ranWith,
      runs: Math.max(...judge.scores.map((sc) => sc.runs ?? 1)),
      verdict,
      contract: contract.map((c) => c.description),
      rows: ranked.map((sc) => {
        const kind = laneFor(sc.key)?.kind ?? "directory";
        return {
          name: sc.name,
          kind,
          fit: kind === "directory" ? fitOf(sc.key) : null,
          correctness: sc.correctness ?? sc.composite,
          min: sc.correctness_min ?? sc.composite,
          max: sc.correctness_max ?? sc.composite,
          format: sc.format ?? null,
          found: sc.found.length,
          total: judge.issues.length,
          recommended: sc.key === rec?.key && (winnerBeatsBaseline || inNoise),
          warning: kind === "directory" ? securityWarning(laneFor(sc.key)?.candidate.risk_flags) : null
        };
      })
    };
    const url = `${window.location.origin}/report#d=${await encodeReport(report)}`;
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
    } catch {
      setShareCopied(false);
    }
  }
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
          {preferData && mode === "data" && !customerData.trim() ? (
            <div className="rounded-lg border border-amber-400/50 bg-amber-400/10 p-3 text-sm text-command-text">
              This skill works on the business&apos;s own file. Attach it below (Excel is fine) for a real test — or switch to{" "}
              <button type="button" onClick={() => setMode("scenarios")} className="font-semibold text-command-action underline">
                generated test scenarios
              </button>{" "}
              to see how it works on made-up data.
            </div>
          ) : null}
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
                  onChange={(e) => {
                    setSheets(null);
                    setCustomerData(e.target.value);
                  }}
                  dir="auto"
                  placeholder="Paste records, or upload an Excel, .csv or .txt file"
                  className="w-full rounded border border-command-border bg-command-bg p-2 font-mono text-xs text-command-text"
                />
                <input type="file" accept={UPLOAD_ACCEPT} onChange={(e) => e.target.files?.[0] && readCustomerFile(e.target.files[0])} className="text-xs text-command-muted" />
                {sheets && sheets.length > 1 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-command-muted">Sheets sent:</span>
                    {sheets.map((sh) => {
                      const on = usedSheets.includes(sh.name);
                      return (
                        <button
                          key={sh.name}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setUsedSheets(on ? usedSheets.filter((n) => n !== sh.name) : [...usedSheets, sh.name])}
                          className={`rounded-full border px-3 py-1 text-xs ${on ? "border-command-action bg-command-action/15 text-command-text" : "border-command-border text-command-muted line-through"}`}
                        >
                          {sh.name} · {sh.rows}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

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
              <label className="flex items-center gap-2 text-sm text-command-text">
                Runs per option
                <select
                  value={repeats}
                  onChange={(e) => setRepeats(Number(e.target.value))}
                  className="rounded border border-command-border bg-command-bg px-2 py-1 font-mono text-xs"
                >
                  <option value={1}>1 (fast — about 4 minutes)</option>
                  <option value={3}>3 (firmer answer, shows run-to-run range — about 10 minutes)</option>
                </select>
              </label>

              <fieldset className="space-y-1 text-sm text-command-text">
                <legend className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-command-muted">What each option is asked</legend>
                <label className="flex items-start gap-2">
                  <input type="radio" className="mt-1" checked={requestMode === "everyday"} onChange={() => setRequestMode("everyday")} />
                  <span>
                    The everyday request (realistic) — the task and the customer&apos;s message, the way an employee asks. Your prices and rules
                    must come from the skill.
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="radio" className="mt-1" checked={requestMode === "full"} onChange={() => setRequestMode("full")} />
                  <span>Full instructions every time — every option, including Claude alone, gets your whole Skill Spec.</span>
                </label>
              </fieldset>

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
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-command-muted">{lane.kind === "baseline" ? "No skill" : lane.candidate.source}</p>
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
          {/* The answer first: one sentence, three numbers, and the two results side by side. Everything else is under
              "Technical details" for whoever wants the method. */}
          {(() => {
            // With no recommendation (e.g. no option qualified), still show the best-scoring skill against Claude alone.
            const best = winner ?? ranked.find((sc) => sc.key !== "skill_baseline_none");
            const base = baselineScore;
            const total = judge.issues.length;
            const wrong = (sc?: OptionScore) => (sc ? sc.false_flags.length + sc.unsupported : 0);
            const shownKey = compareKey && judge.scores.some((sc) => sc.key === compareKey) ? compareKey : best?.key;
            const shownScore = judge.scores.find((sc) => sc.key === shownKey);
            const bestLane = best ? laneFor(best.key) : undefined;
            const shownLane = shownKey ? laneFor(shownKey) : undefined;
            const baseLane = laneFor("skill_baseline_none");
            const headline = notDone
              ? "No option actually did the task — so nothing is recommended."
              : !best
                ? "No skill could be compared on this run."
                : !winner
                  ? `No skill qualified for a recommendation. Best skill: ${best.found.length} of ${total} checks right; Claude alone: ${base ? base.found.length : "—"} of ${total}.`
                  : winnerBeatsBaseline
                  ? `With the skill: ${best.found.length} of ${total} checks right. Claude alone: ${base ? base.found.length : "—"} of ${total}.`
                  : inNoise
                    ? `No clear difference: ${best.found.length} of ${total} with the skill, ${base ? base.found.length : "—"} of ${total} without.`
                    : `Claude alone did better on this test: ${base ? base.found.length : "—"} of ${total}, against ${best.found.length} of ${total} with the best skill.`;
            const tone = winnerBeatsBaseline ? "border-emerald-400/50 bg-emerald-400/5" : "border-amber-400/50 bg-amber-400/5";
            const tile = (label: string, a: string | number, b: string | number, good: "high" | "low") => {
              const na = Number(a);
              const nb = Number(b);
              const better = Number.isFinite(na) && Number.isFinite(nb) && (good === "high" ? na > nb : na < nb);
              return (
                <div className="rounded-lg border border-command-border bg-command-bg/60 p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-command-muted">{label}</p>
                  <p className="mt-1 text-3xl font-semibold text-command-text">
                    <span className={better ? "text-emerald-400" : ""}>{a}</span>
                    <span className="ml-2 text-base font-normal text-command-muted">vs {b} without a skill</span>
                  </p>
                </div>
              );
            };
            return (
              <div className={`rounded-xl border p-5 ${tone}`}>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-command-muted">Result</p>
                <p className="mt-1 text-xl font-semibold text-command-text md:text-2xl">{headline}</p>
                {best && !notDone ? (
                  <>
                    <p className="mt-1 text-sm text-command-muted">
                      {winner && winnerBeatsBaseline ? "Recommended" : winner ? "Best skill" : "Best-scoring skill (not recommended — see Technical details)"}:{" "}
                      <span className="font-semibold text-command-text">{best.name}</span>
                      {bestLane?.kind === "custom" ? " — written for this need" : bestLane?.kind === "directory" ? ` — from ${bestLane.candidate.source}` : ""}.
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {tile("Checks right", best.found.length, base ? base.found.length : "—", "high")}
                      {tile("Missed", best.missed.length, base ? base.missed.length : "—", "low")}
                      {tile("Wrong or made up", wrong(best), base ? wrong(base) : "—", "low")}
                    </div>
                    {/* Every option that competed, on one scale. Click a row to see its result below. */}
                    <div className="mt-4 rounded-lg border border-command-border bg-command-bg/60 p-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-command-muted">
                        All {ranked.length} options, same test · click one to see its result
                      </p>
                      <ol className="mt-2 space-y-1.5">
                        {[...ranked]
                          .sort((a, b) => b.found.length - a.found.length || wrong(a) - wrong(b))
                          .map((sc, i) => {
                            const ln = laneFor(sc.key);
                            const kind = ln?.kind === "baseline" ? "Claude alone, no skill" : ln?.kind === "custom" ? "Built for this need" : `Library · ${ln?.candidate.source ?? ""}`;
                            const isRec = sc.key === rec?.key && Boolean(winner);
                            const weak = ln?.kind === "directory" && fitOf(sc.key) < MIN_FIT;
                            const shown = (compareKey ?? best.key) === sc.key;
                            const pct = total ? Math.round((sc.found.length / total) * 100) : 0;
                            return (
                              <li key={sc.key}>
                                <button
                                  type="button"
                                  onClick={() => ln?.kind !== "baseline" && setCompareKey(sc.key)}
                                  className={`grid w-full grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-3 rounded px-2 py-1.5 text-start ${shown ? "bg-command-action/10" : "hover:bg-command-action/5"}`}
                                >
                                  <span className="font-mono text-xs text-command-muted">{i + 1}</span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold text-command-text">{sc.name.replace(/^Custom skill: |^Baseline: /, "")}</span>
                                    <span className="block font-mono text-[10px] text-command-muted">
                                      {kind}
                                      {isRec ? <span className="ml-2 text-emerald-400">★ recommended</span> : null}
                                      {weak ? <span className="ml-2 text-amber-400">weak fit · never recommended</span> : null}
                                    </span>
                                  </span>
                                  <span className="flex items-center gap-2">
                                    <span className="h-2 flex-1 overflow-hidden rounded bg-command-border/60">
                                      <span className={`block h-full ${ln?.kind === "baseline" ? "bg-slate-400" : isRec ? "bg-emerald-400" : "bg-command-action"}`} style={{ width: `${pct}%` }} />
                                    </span>
                                  </span>
                                  <span className="whitespace-nowrap font-mono text-xs text-command-text">
                                    {sc.found.length}/{total} right
                                    {wrong(sc) ? <span className="text-red-400"> · {wrong(sc)} wrong</span> : null}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                      </ol>
                    </div>
                    <p className="mt-3 text-xs text-command-muted">
                      {total} checks,{" "}
                      {judge.ground_truth === "generated_scenarios"
                        ? `with known answers, on ${scenarios.length} generated test cases`
                        : judge.ground_truth === "answer_key"
                          ? "from the answer key, on your data"
                          : "from an independent audit of your data by the judge (indicative — add an answer key for exact scoring)"}
                      . Every option ran on the same model with the same request; one judge scored each result blind.
                    </p>
                    {(shownLane ?? bestLane)?.result?.deliverable || baseLane?.result?.deliverable ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {[
                          { title: `With the skill — ${shownScore?.name ?? best.name}`, lane: shownLane ?? bestLane, accent: "text-emerald-400" },
                          { title: "Claude alone, same request", lane: baseLane, accent: "text-command-muted" }
                        ].map(({ title, lane, accent }) => (
                          <div key={title} className="min-w-0">
                            <p className={`font-mono text-[11px] uppercase tracking-[0.14em] ${accent}`}>{title}</p>
                            <div dir="auto" className="mt-2 max-h-80 overflow-auto rounded border border-command-border bg-command-bg/60 p-3 font-sans text-sm text-command-text">
                              {lane?.result?.deliverable ? <Markdown text={lane.result.deliverable} /> : <p className="text-command-muted">{lane?.result?.summary || "No finished result."}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })()}

          <details className="command-card p-3">
            <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.14em] text-command-muted">
              Technical details — scores, test cases, method, every option
            </summary>
            <div className="mt-3 space-y-4">
          <div className={`rounded-lg border p-4 ${winnerBeatsBaseline ? "border-emerald-400/40 bg-emerald-400/5" : "border-amber-400/40 bg-amber-400/5"}`}>
            {winner && winnerBeatsBaseline ? (
              <p className="text-sm text-command-text">
                <span className="font-semibold">{winner.name}</span>: correctness {winner.correctness}
                {range(winner) ? ` (runs ${range(winner)})` : ""}
                {baselineScore ? ` vs ${baselineScore.correctness}${range(baselineScore) ? ` (${range(baselineScore)})` : ""} for Claude with no skill` : ""}.{" "}
                {rec?.improvement === "format"
                  ? "The gain is mainly in format."
                  : rec?.improvement === "both"
                    ? "Better on correctness and format."
                    : rec?.improvement === "correctness"
                      ? "The gain is in correctness."
                      : "The gain is small."}
              </p>
            ) : winner && inNoise ? (
              <div className="text-sm text-command-text">
                <p className="font-semibold text-amber-400">No clear difference from Claude with no skill on this test.</p>
                <p className="mt-1 text-command-muted">
                  {winner.name}: correctness {winner.correctness}
                  {range(winner) ? ` (runs ${range(winner)})` : ""} vs {baselineScore?.correctness}
                  {baselineScore && range(baselineScore) ? ` (${range(baselineScore)})` : ""}{(winner.runs ?? 1) > 1 ? " — the ranges overlap, so the gap is within run-to-run noise." : " — with a single run, a gap under 10 points is within run-to-run noise. Use 3 runs for a firmer answer."}
                  {winner.format !== null && baselineScore?.format !== null && (winner.format ?? 0) - (baselineScore?.format ?? 0) >= 10
                    ? ` The skill did follow the required format better (${winner.format}% vs ${baselineScore?.format}%).`
                    : ""}
                </p>
              </div>
            ) : notDone ? (
              <p className="text-sm text-command-text">
                <span className="font-semibold text-amber-400">No option actually did the task.</span> Every run declined or only explained what
                it would need (for example live data or access it does not have). A refusal is not a win, so nothing is recommended. Change the
                request or provide the data it needs, then run again.
              </p>
            ) : !winner && ranked.some((s) => s.key !== "skill_baseline_none") ? (
              <p className="text-sm text-command-text">
                <span className="font-semibold text-amber-400">No skill is eligible for a recommendation.</span> The directory skills that ran did not
                pass screening (weak fit), and no custom skill was scored.
              </p>
            ) : !winner ? (
              <div className="text-sm text-command-text">
                <p className="font-semibold text-amber-400">No skill was actually tested — only Claude with no skill ran, so there is no comparison yet.</p>
                {directoryCandidateCount === 0 && (
                  <p className="mt-1 text-command-muted">Sourcing found no directory skill with a readable SKILL.md for this need.</p>
                )}
                {failedLanes.map((lane) => (
                  <p key={lane.candidate.candidate_id} className="mt-1 text-command-muted">
                    {lane.candidate.name}: <span className="text-red-400">{lane.error || "did not run"}</span>
                  </p>
                ))}
                <p className="mt-1 text-command-muted">Press “Run again” to retry.</p>
              </div>
            ) : (
              <p className="text-sm text-command-text">
                <span className="font-semibold text-amber-400">Claude with no skill did better on this test</span> — correctness{" "}
                {baselineScore?.correctness}
                {baselineScore && range(baselineScore) ? ` (runs ${range(baselineScore)})` : ""} vs {winner.correctness}
                {range(winner) ? ` (runs ${range(winner)})` : ""} for the best skill, {winner.name}. A skill is not needed for correctness here;
                it is offered in Step 04 only if you want this process written down and applied the same way every time.
              </p>
            )}
            <p className="mt-1 font-mono text-[11px] text-command-muted">
              Ground truth: {judge.ground_truth === "answer_key"
                ? "your answer key"
                : judge.ground_truth === "generated_scenarios"
                  ? `${scenarios.length} generated scenarios with planted answer keys (synthetic — confirm on real data before relying on it)`
                  : "independent audit of the data (indicative)"} · {judge.issues.length} issues
            </p>
            <p className="mt-1 font-mono text-[11px] text-command-muted">
              Asked: {ranWith === "everyday"
                ? mode === "scenarios"
                  ? "the everyday request and the customer's message only — your prices and rules were not handed to any option; a skill had to supply them"
                  : "the everyday request and your data — your rules were not repeated to any option; a skill had to supply them"
                : "your full Skill Spec on every run — shows what Claude can do when you spell everything out each time"}
            </p>
            {unscoredRuns > 0 && (
              <p className="mt-1 font-mono text-[11px] text-amber-400">
                {unscoredRuns} run(s) could not be scored and were left out of the averages (not counted as zero).
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={shareResults}
              className="rounded-lg border border-command-action/60 bg-command-action/10 px-3 py-1.5 font-mono text-xs font-semibold text-command-action hover:bg-command-action/20"
            >
              ↗ Share results
            </button>
            {shareUrl ? (
              <>
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded border border-command-border bg-command-bg px-2 py-1 font-mono text-[11px] text-command-muted"
                  aria-label="Share link"
                />
                <span className="font-mono text-[11px] text-command-action">{shareCopied ? "Copied" : ""}</span>
              </>
            ) : (
              <span className="text-xs text-command-muted">A public link with the scores only — no data, outputs or skill text.</span>
            )}
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
                    <pre dir="auto" style={{ unicodeBidi: "plaintext" }} className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-command-border bg-command-bg p-2 text-[11px] text-command-text">{sc.customer_data}</pre>
                    {sc.reference_data ? (
                      <pre dir="auto" style={{ unicodeBidi: "plaintext" }} className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded border border-command-border bg-command-bg p-2 text-[11px] text-command-muted">{sc.reference_data}</pre>
                    ) : null}
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-command-muted">Answer key</p>
                    <pre dir="auto" style={{ unicodeBidi: "plaintext" }} className="whitespace-pre-wrap text-[11px] text-command-muted">{sc.answer_key}</pre>
                  </div>
                ))}
              </div>
            </details>
          )}

          {contract.length > 0 && (
            <details className="command-card p-3">
              <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.14em] text-command-muted">
                Required output format ({contract.length} checks — the format score)
              </summary>
              <p className="mt-2 text-xs text-command-muted">
                Set once from the Skill Spec, before any option ran. The custom skill carries it word for word; every option is scored on it.
                Checks marked “auto” are verified mechanically, not by a model.
              </p>
              <ol className="mt-2 list-decimal space-y-1 ps-5 text-sm text-command-text" dir="auto">
                {contract.map((r) => (
                  <li key={r.id}>
                    {r.description}
                    {r.check ? <span className="ms-2 font-mono text-[10px] uppercase text-command-action">auto</span> : null}
                  </li>
                ))}
              </ol>
            </details>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-command-border text-left text-command-muted">
                  <th className="py-2 pr-2 font-normal">#</th>
                  <th className="py-2 pr-2 font-normal">Option</th>
                  <th className="py-2 pr-2 font-normal" title="Screening fit (directory skills)">Fit</th>
                  <th className="py-2 pr-2 font-normal" title="60% recall + 30% precision + 10% grounding, on correctness items; mean and range over runs">Correctness</th>
                  <th className="py-2 pr-2 font-normal" title="Share of format requirements met">Format</th>
                  <th className="py-2 pr-2 font-normal" title="Share of real issues found">Recall</th>
                  <th className="py-2 pr-2 font-normal" title="Share of flags that were real issues">Precision</th>
                  <th className="py-2 pr-2 font-normal" title="Share of items grounded in the data">Grounding</th>
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
                      {s.key === rec?.key ? <span className="ml-2 text-command-action">{winnerBeatsBaseline || inNoise ? "★ recommended" : "★ best skill"}</span> : null}
                      {securityWarning(laneFor(s.key)?.candidate.risk_flags) ? (
                        <span className="ml-2 rounded border border-red-400/50 bg-red-400/10 px-1.5 text-[10px] font-semibold text-red-300" title={securityWarning(laneFor(s.key)?.candidate.risk_flags) ?? ""}>
                          ⚠ review
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2">
                      {laneFor(s.key)?.kind === "directory" ? (
                        <span className={fitOf(s.key) < MIN_FIT ? "text-amber-400" : "text-command-text"} title={fitOf(s.key) < MIN_FIT ? "Weak fit — tested, never recommended" : ""}>
                          {fitOf(s.key)}
                          {fitOf(s.key) < MIN_FIT ? " weak" : ""}
                        </span>
                      ) : (
                        <span className="text-command-muted">—</span>
                      )}
                    </td>
                    <td className={`py-2 pr-2 text-sm font-semibold ${scoreTone(s.correctness ?? s.composite)}`}>
                      {s.correctness ?? s.composite}
                      {range(s) ? <span className="ml-1 text-[10px] font-normal text-command-muted">({range(s)})</span> : null}
                    </td>
                    <td className={`py-2 pr-2 ${s.format === null || s.format === undefined ? "text-command-muted" : scoreTone(s.format)}`}>
                      {s.format === null || s.format === undefined ? "—" : `${s.format}%`}
                    </td>
                    <td className={`py-2 pr-2 ${scoreTone(s.recall)}`}>{s.recall}%</td>
                    <td className={`py-2 pr-2 ${scoreTone(s.precision)}`}>{s.precision}%</td>
                    <td className={`py-2 pr-2 ${scoreTone(s.grounding)}`}>{s.grounding}%</td>
                    <td className="py-2 pr-2">
                      {s.found.length}/{judge.issues.length}
                      {s.false_flags.length ? <span className="text-red-400"> · {s.false_flags.length} false</span> : null}
                    </td>
                  </tr>
                ))}
                {failedLanes.map((lane) => (
                  <tr key={lane.candidate.candidate_id} className="border-b border-command-border/60 text-command-muted">
                    <td className="py-2 pr-2">—</td>
                    <td className="py-2 pr-2">
                      <span className="font-sans text-sm">{lane.candidate.name}</span>
                    </td>
                    <td colSpan={7} className="py-2 pr-2 text-red-400">
                      Not scored: {lane.error || "did not run"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 font-mono text-[10px] text-command-muted">Correctness = 60% recall + 30% precision + 10% grounding, on correctness items only; format is scored separately. Each output judged blind, on its own, by one fixed model. Numbers in brackets = lowest–highest over runs. Recommendation: custom skill or a directory skill with fit ≥ {MIN_FIT} that actually did the task; a directory skill replaces the custom skill only when clearly better (10+ points). Click a row for details.</p>
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
                {lane.result?.deliverable ? (
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-command-muted">What it produced (first run)</p>
                    <div dir="auto" className="mt-2 max-h-[28rem] overflow-auto rounded border border-command-border bg-command-bg/60 p-3 font-sans text-sm text-command-text">
                      <Markdown text={lane.result.deliverable} />
                    </div>
                  </div>
                ) : null}
                <details open={!lane.result?.deliverable}>
                  <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.14em] text-command-muted">
                    {lane.result?.deliverable ? "Checks and open points" : "Output"} ({lane.result?.items.length ?? 0} items)
                  </summary>
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
                    <pre dir="auto" style={{ unicodeBidi: "plaintext" }} className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded border border-command-border bg-command-bg p-2 text-[11px] text-command-text">{lane.skillMd}</pre>
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

            </div>
          </details>

          <div className="flex justify-end">
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
          </div>

          {/* Step 04 — the outcome is always a skill to install in Claude. The baseline is a yardstick, never the recommendation. */}
          <div className="rounded-xl border border-command-action/50 bg-command-action/5 p-5">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-command-muted">Step 04 · Install in Claude</p>
            {recommendedLane ? (
              <>
                <p className="mt-2 text-lg font-semibold text-command-text">{winnerBeatsBaseline ? "Recommended skill" : "Best skill (optional)"}: {recommendedLane.candidate.name}</p>
                <p className="mt-1 text-sm text-command-muted">
                  {recommendedScore && baselineScore
                    ? winnerBeatsBaseline
                      ? `${recommendedScore.found.length} of ${judge.issues.length} checks right, against ${baselineScore.found.length} for Claude with no skill — a clear gain on this test.`
                      : inNoise
                        ? `Correctness ${recommendedScore.correctness} vs ${baselineScore.correctness} for Claude with no skill — within run-to-run noise. ${recommendedLane.kind === "custom" ? "The skill's value here is applying your process the same way every time" : "Installing it is optional — it did not measurably improve the result"}${(recommendedScore.format ?? 0) - (baselineScore.format ?? 0) >= 10 ? ", though it followed your format better" : ""}.`
                        : `Correctness ${recommendedScore.correctness} vs ${baselineScore.correctness} for Claude with no skill. Claude alone did better on this test, so a skill is not needed for correctness${recommendedLane.kind === "custom" ? "; install it only if you want your process written down and applied the same way every time" : ""}.`
                    : recommendedScore
                      ? `Correctness ${recommendedScore.correctness}.`
                      : "The test did not recommend it (see Result above). It is offered because it was written for this exact process."}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => downloadSkill(recommendedLane)}
                    className="rounded-lg border border-command-action bg-command-action px-5 py-2.5 font-mono text-sm font-semibold text-command-bg transition hover:brightness-110"
                  >
                    ⬇ Download skill (.zip)
                  </button>
                  {recommendedLane.kind === "directory" ? (
                    <span className="font-mono text-[10px] text-command-muted">
                      Only SKILL.md is packaged — scripts from the original repository are not included and were not run.
                    </span>
                  ) : null}
                  {recommendedLane.kind === "directory" && securityWarning(recommendedLane.candidate.risk_flags) ? (
                    <span className="rounded border border-red-400/50 bg-red-400/10 px-2 py-0.5 text-xs font-semibold text-red-300">
                      ⚠ {securityWarning(recommendedLane.candidate.risk_flags)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 border-t border-command-border pt-4">
                  <InstallGuide />
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-command-text">
                {notDone
                  ? "Nothing to install: no option actually did the task on this test."
                  : "No skill is ready to install from this run — every skill option failed. Press “Run again”."}
              </p>
            )}
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
