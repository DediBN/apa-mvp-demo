"use client";

// Business flow: four steps for a non-technical user — need → rules → result & check → get & install.
// No answer key is asked from the user: the rules they approve are the yardstick.

import { useRef, useState } from "react";
import { readUploadAsText, UPLOAD_ACCEPT } from "../../lib/files/read-upload";
import { buildZip, skillFolderName } from "../../lib/skills/zip";
import { recommend, scoreOption, type JudgedOutput, type OptionResult, type Recommendation, type Rule } from "../../lib/business/scoring";
import { Markdown } from "./markdown";
import { useLang } from "./i18n";

interface Question {
  id: string;
  question: string;
  why: string;
  options: string[];
  suggested_default: string;
}
interface Interview {
  language: "he" | "en";
  task_title: string;
  task_summary: string;
  known_rules: Array<{ id: string; text: string; kind: "business" | "format"; source: "user" | "document" }>;
  questions: Question[];
}
interface Answer {
  answer: string;
  fromDefault: boolean;
  skipped: boolean;
}
interface TestCase {
  title: string;
  input: string;
  reference_data: string;
  reference_generated: boolean;
}
interface Option {
  key: string;
  kind: "custom" | "directory" | "baseline";
  name: string;
  fit: number;
  skillMd?: string;
  url?: string;
  outputs: Array<string | null>;
  judged: Array<(JudgedOutput & { note?: string }) | null>;
}
interface DirectoryCandidate {
  name: string;
  content: string;
  fit: number;
  url?: string;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const MAX_DOC_CHARS = 15000;

function stripFrontmatter(md: string): string {
  return md.replace(/^---[\s\S]*?---\s*/, "").trim();
}

export function BusinessFlow() {
  const { t, lang } = useLang();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // step 1
  const [request, setRequest] = useState("");
  const [doc, setDoc] = useState<{ name: string; text: string; note?: string } | null>(null);
  const [docBusy, setDocBusy] = useState(false);

  // step 2
  const [interview, setInterview] = useState<Interview | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [outputFormat, setOutputFormat] = useState("");
  const [approved, setApproved] = useState(false);
  const sourcing = useRef<Promise<DirectoryCandidate | null> | null>(null);

  // step 3
  const [progress, setProgress] = useState(-1);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [scores, setScores] = useState<Record<string, OptionResult>>({});
  const [failures, setFailures] = useState<string[]>([]);
  const [caseIdx, setCaseIdx] = useState(0);
  const [showBaseline, setShowBaseline] = useState(false);

  // step 4
  const [platform, setPlatform] = useState<"claude" | "chatgpt" | "other">("claude");
  const [copied, setCopied] = useState(false);

  const contentLang = interview?.language ?? (lang === "he" ? "he" : "en");

  async function onFile(file: File | undefined) {
    if (!file) return;
    setDocBusy(true);
    setError(null);
    try {
      const { text, note } = await readUploadAsText(file, MAX_DOC_CHARS);
      setDoc({ name: file.name, text, note });
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errorGeneric);
    } finally {
      setDocBusy(false);
    }
  }

  function startSourcing(title: string, summary: string) {
    sourcing.current = post<{ candidates: Array<{ name: string; source: string; fit_score_pre_eval: number; skill?: { content?: string; pageUrl?: string; githubUrl?: string } }> }>(
      "/api/sourcing/skills",
      { jobTitle: title, mission: summary }
    )
      .then((r) => {
        const dir = (r.candidates ?? [])
          .filter((c) => c.source !== "Custom Skill" && c.skill?.content?.trim())
          .sort((a, b) => b.fit_score_pre_eval - a.fit_score_pre_eval)[0];
        return dir ? { name: dir.name, content: dir.skill!.content!, fit: dir.fit_score_pre_eval, url: dir.skill?.pageUrl || dir.skill?.githubUrl } : null;
      })
      .catch(() => null);
  }

  async function goInterview() {
    setBusy(true);
    setError(null);
    try {
      const data = await post<Interview>("/api/business/interview", { request, document_text: doc?.text, ui_language: lang });
      setInterview(data);
      setAnswers(Object.fromEntries(data.questions.map((q) => [q.id, { answer: "", fromDefault: false, skipped: false }])));
      setRules(null);
      setApproved(false);
      setStep(2);
      startSourcing(data.task_title, data.task_summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  async function summarize() {
    if (!interview) return;
    setBusy(true);
    setError(null);
    try {
      const data = await post<{ rules: Rule[]; missing: string[]; output_format: string }>("/api/business/rules", {
        request,
        language: interview.language,
        known_rules: interview.known_rules,
        answers: interview.questions.map((q) => ({
          id: q.id,
          question: q.question,
          answer: answers[q.id]?.skipped ? "" : answers[q.id]?.answer ?? "",
          from_default: answers[q.id]?.fromDefault ?? false
        }))
      });
      setRules(data.rules);
      setMissing(data.missing);
      setOutputFormat(data.output_format);
      setApproved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  async function buildAndTest() {
    if (!interview || !rules) return;
    const finalRules = rules.filter((r) => r.text.trim()).map((r, i) => ({ ...r, id: `R${i + 1}`, text: r.text.trim() }));
    setRules(finalRules);
    setStep(3);
    setBusy(true);
    setError(null);
    setFailures([]);
    setRec(null);
    setCaseIdx(0);
    setShowBaseline(false);
    const fails: string[] = [];
    try {
      setProgress(0);
      const common = { language: interview.language, task_title: interview.task_title, task_summary: interview.task_summary, rules: finalRules, missing, output_format: outputFormat };
      const buildP = post<{ skill_md: string; name: string }>("/api/business/build", { ...common, document_text: doc?.text, document_name: doc?.name });
      const casesP = post<{ cases: TestCase[] }>("/api/business/cases", { ...common, document_text: doc?.text });
      const skill = await buildP;
      setProgress(1);
      const { cases: cs } = await casesP;
      setCases(cs);
      const dir = sourcing.current ? await Promise.race([sourcing.current, new Promise<null>((r) => setTimeout(() => r(null), 90000))]) : null;

      const opts: Option[] = [
        { key: "custom", kind: "custom", name: t.s3Custom, fit: 100, skillMd: skill.skill_md, outputs: [], judged: [] },
        { key: "baseline", kind: "baseline", name: t.s3BaselineName, fit: 0, outputs: [], judged: [] }
      ];
      if (dir) opts.push({ key: "directory", kind: "directory", name: dir.name, fit: dir.fit, skillMd: dir.content, url: dir.url, outputs: [], judged: [] });

      setProgress(2);
      await Promise.all(
        opts.map(async (o) => {
          o.outputs = await Promise.all(
            cs.map((c) =>
              post<{ output: string }>("/api/business/run", { request, input: c.input, reference_data: c.reference_data, skill_md: o.skillMd })
                .then((r) => r.output)
                .catch((e: Error) => {
                  fails.push(`${o.name}: ${e.message}`);
                  return null;
                })
            )
          );
        })
      );

      setProgress(3);
      await Promise.all(
        opts.map(async (o) => {
          o.judged = await Promise.all(
            cs.map((c, i) =>
              o.outputs[i]
                ? post<JudgedOutput & { note: string }>("/api/business/judge", {
                    task_summary: interview.task_summary,
                    rules: finalRules,
                    input: c.input,
                    reference_data: c.reference_data,
                    output: o.outputs[i]
                  }).catch((e: Error) => {
                    fails.push(`${o.name}: ${e.message}`);
                    return null;
                  })
                : Promise.resolve(null)
            )
          );
        })
      );

      const results: Record<string, OptionResult> = {};
      for (const o of opts) {
        const judged = o.judged.filter((j): j is JudgedOutput => Boolean(j));
        if (judged.length === 0) continue;
        const s = scoreOption(finalRules, judged);
        results[o.key] = { key: o.key, kind: o.kind, fit: o.fit, correctness: s.correctness, format: s.format, invented: s.invented, cases: judged.length };
      }
      setOptions(opts);
      setScores(results);
      setRec(recommend(Object.values(results)));
      setFailures(fails);
      setProgress(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errorGeneric);
      setProgress(-1);
    } finally {
      setBusy(false);
    }
  }

  const recommended = options.find((o) => o.key === (rec?.key ?? "custom")) ?? options.find((o) => o.key === "custom");
  const custom = options.find((o) => o.key === "custom");
  const baseline = options.find((o) => o.key === "baseline");

  function downloadZip(o: Option) {
    if (!o.skillMd) return;
    const folder = skillFolderName(o.skillMd, "business-skill");
    const blob = buildZip([{ path: `${folder}/SKILL.md`, content: o.skillMd }]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${folder}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyInstructions(o: Option) {
    if (!o.skillMd) return;
    try {
      await navigator.clipboard.writeText(stripFrontmatter(o.skillMd));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t.errorGeneric);
    }
  }

  function restart() {
    setStep(1);
    setRequest("");
    setDoc(null);
    setInterview(null);
    setRules(null);
    setOptions([]);
    setCases([]);
    setRec(null);
    setProgress(-1);
    setError(null);
  }

  const card = "rounded-2xl border border-command-border bg-command-panel p-5 md:p-7";
  const primary =
    "inline-flex min-h-[48px] items-center justify-center rounded-xl bg-command-action px-6 text-base font-semibold text-command-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40";
  const ghost = "inline-flex min-h-[44px] items-center rounded-xl border border-command-border px-4 text-sm text-command-text hover:border-command-action";
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-command-action bg-command-action/15 text-command-text" : "border-command-border text-command-muted hover:text-command-text"}`;
  const pctText = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n}%`);

  const verdictText = rec ? { both: t.s3VerdictBoth, correctness: t.s3VerdictCorrect, format: t.s3VerdictFormat, none: t.s3VerdictNone }[rec.improvement] : "";
  const allAnswered = interview ? interview.questions.every((q) => answers[q.id]?.skipped || answers[q.id]?.answer.trim()) : false;

  return (
    <div dir={lang === "he" ? "rtl" : "ltr"} className="space-y-5 text-command-text">
      {/* stepper */}
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {t.steps.map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "now" : "later";
          return (
            <li
              key={label}
              className={`rounded-xl border px-3 py-2 text-sm ${
                state === "now" ? "border-command-action bg-command-panelElevated" : "border-command-border bg-command-panel"
              } ${state === "later" ? "text-command-muted" : ""}`}
              aria-current={state === "now" ? "step" : undefined}
            >
              <span className="font-mono text-xs text-command-action">{n}</span> <span className="font-semibold">{label}</span>
            </li>
          );
        })}
      </ol>

      {error ? <p className="rounded-xl border border-command-fail/50 bg-command-fail/10 px-4 py-3 text-sm">{error}</p> : null}

      {/* STEP 1 */}
      {step === 1 ? (
        <section className={card}>
          <h2 className="text-2xl font-semibold">{t.s1Title}</h2>
          <p className="mt-1 text-command-muted">{t.s1Hint}</p>
          <label htmlFor="need" className="sr-only">
            {t.s1Title}
          </label>
          <textarea
            id="need"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder={t.s1Placeholder}
            rows={3}
            className="mt-4 w-full rounded-xl border border-command-border bg-command-bg p-4 text-lg outline-none focus:border-command-action"
          />
          <p className="mt-3 text-sm text-command-muted">{t.s1Examples}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {t.s1ExampleList.map((ex) => (
              <button key={ex} type="button" className={chip(request === ex)} onClick={() => setRequest(ex)}>
                {ex}
              </button>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-dashed border-command-border p-4">
            <label className="block text-sm font-semibold">
              {t.s1Attach}
              <input type="file" accept={UPLOAD_ACCEPT} className="mt-2 block w-full text-sm text-command-muted" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <p className="mt-1 text-xs text-command-muted">{t.s1AttachHint}</p>
            {docBusy ? <p className="mt-2 text-sm text-command-action">{t.s1Reading}</p> : null}
            {doc ? (
              <p className="mt-2 text-sm">
                {doc.name}
                {doc.note ? <span className="text-command-muted"> · {doc.note}</span> : null}{" "}
                <button type="button" className="text-command-action underline" onClick={() => setDoc(null)}>
                  {t.s1Remove}
                </button>
              </p>
            ) : null}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button type="button" className={primary} disabled={!request.trim() || busy || docBusy} onClick={goInterview}>
              {busy ? t.s1Working : t.s1Primary}
            </button>
            <p className="text-sm text-command-muted">
              <b>{t.nextLabel}</b> {t.s1Next}
            </p>
          </div>
        </section>
      ) : null}

      {/* STEP 2 */}
      {step === 2 && interview ? (
        <section className={card} dir={contentLang === "he" ? "rtl" : "ltr"}>
          <h2 className="text-2xl font-semibold">
            {t.s2Title}: {interview.task_title}
          </h2>
          <p className="mt-1 text-command-muted">{interview.task_summary}</p>

          <h3 className="mt-6 font-semibold">{t.s2Known}</h3>
          {interview.known_rules.length === 0 ? (
            <p className="mt-1 text-sm text-command-muted">{t.s2KnownEmpty}</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
              {interview.known_rules.map((k) => (
                <li key={k.id}>
                  {k.text}
                  {k.source === "document" ? <span className="text-command-muted"> ({t.s2FromDoc})</span> : null}
                </li>
              ))}
            </ul>
          )}

          {!rules ? (
            <>
              <h3 className="mt-6 font-semibold">{t.s2Questions}</h3>
              <div className="mt-3 space-y-4">
                {interview.questions.map((q) => {
                  const a = answers[q.id] ?? { answer: "", fromDefault: false, skipped: false };
                  const set = (patch: Partial<Answer>) => setAnswers((prev) => ({ ...prev, [q.id]: { ...a, ...patch } }));
                  return (
                    <div key={q.id} className="rounded-xl border border-command-border bg-command-bg/60 p-4">
                      <p className="font-semibold">{q.question}</p>
                      {q.why ? (
                        <p className="mt-0.5 text-xs text-command-muted">
                          {t.s2Why} {q.why}
                        </p>
                      ) : null}
                      {q.options.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {q.options.map((o) => (
                            <button key={o} type="button" className={chip(a.answer === o && !a.skipped)} onClick={() => set({ answer: o, fromDefault: false, skipped: false })}>
                              {o}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <label className="mt-3 block text-xs text-command-muted">
                        {t.s2Your}
                        <input
                          value={a.skipped ? "" : a.answer}
                          onChange={(e) => set({ answer: e.target.value, fromDefault: false, skipped: false })}
                          className="mt-1 w-full rounded-lg border border-command-border bg-command-bg px-3 py-2 text-sm text-command-text outline-none focus:border-command-action"
                        />
                      </label>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                        {q.suggested_default ? (
                          <button type="button" className="text-command-action underline" onClick={() => set({ answer: q.suggested_default, fromDefault: true, skipped: false })}>
                            {t.s2UseSuggestion} {q.suggested_default}
                          </button>
                        ) : null}
                        <button type="button" className="text-command-muted underline" onClick={() => set({ answer: "", fromDefault: false, skipped: true })}>
                          {t.s2Skip}
                        </button>
                        {a.fromDefault ? <span className="rounded-full bg-command-warning/15 px-2 py-0.5 text-xs text-command-warning">{t.s2Suggestion}</span> : null}
                        {a.skipped ? <span className="text-xs text-command-muted">{t.s2Skipped}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <button type="button" className={primary} disabled={busy || !allAnswered} onClick={summarize}>
                  {busy ? t.s2Working : t.s2Summarize}
                </button>
                <button type="button" className={ghost} onClick={() => setStep(1)}>
                  ←
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="mt-6 text-lg font-semibold">{t.s2SummaryTitle}</h3>
              <p className="mt-1 text-sm text-command-muted">{t.s2SummaryHint}</p>
              <div className="mt-3 space-y-2">
                {rules.map((r, i) => (
                  <div key={r.id} className="flex flex-wrap items-start gap-2 rounded-xl border border-command-border bg-command-bg/60 p-3">
                    <select
                      aria-label={t.s2Business}
                      value={r.kind}
                      onChange={(e) => setRules(rules.map((x, k) => (k === i ? { ...x, kind: e.target.value as Rule["kind"] } : x)))}
                      className="rounded-lg border border-command-border bg-command-bg px-2 py-1 text-xs"
                    >
                      <option value="business">{t.s2Business}</option>
                      <option value="format">{t.s2Format}</option>
                    </select>
                    <textarea
                      value={r.text}
                      rows={1}
                      aria-label={r.text}
                      onChange={(e) => {
                        setRules(rules.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)));
                        setApproved(false);
                      }}
                      className="min-w-[220px] flex-1 resize-y rounded-lg border border-command-border bg-command-bg px-3 py-1.5 text-sm outline-none focus:border-command-action"
                    />
                    {r.source === "approved_default" ? <span className="rounded-full bg-command-warning/15 px-2 py-0.5 text-xs text-command-warning">{t.s2Approved}</span> : null}
                    <button
                      type="button"
                      className="text-xs text-command-muted underline"
                      onClick={() => {
                        setRules(rules.filter((_, k) => k !== i));
                        setApproved(false);
                      }}
                    >
                      {t.s2Delete}
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="mt-3 text-sm text-command-action underline"
                onClick={() => {
                  setRules([...rules, { id: `N${Date.now()}`, text: "", kind: "business", source: "user" }]);
                  setApproved(false);
                }}
              >
                + {t.s2Add}
              </button>
              {missing.length ? (
                <div className="mt-5 rounded-xl border border-command-warning/40 bg-command-warning/5 p-4">
                  <p className="font-semibold">{t.s2Missing}</p>
                  <p className="text-xs text-command-muted">{t.s2MissingHint}</p>
                  <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
                    {missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <label className="mt-5 flex items-center gap-3 text-sm">
                <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} className="h-5 w-5" />
                {t.s2Approve}
              </label>
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <button type="button" className={primary} disabled={!approved || busy || rules.every((r) => !r.text.trim())} onClick={buildAndTest}>
                  {t.s2Primary}
                </button>
                <button type="button" className={ghost} onClick={() => setRules(null)}>
                  ←
                </button>
                <p className="text-sm text-command-muted">
                  <b>{t.nextLabel}</b> {t.s2Next}
                </p>
              </div>
            </>
          )}
        </section>
      ) : null}

      {/* STEP 3 */}
      {step === 3 ? (
        <section className={card}>
          <h2 className="text-2xl font-semibold">{t.s3Title}</h2>
          {progress < 4 ? (
            <ol className="mt-4 space-y-2">
              {t.s3Progress.map((p, i) => (
                <li key={p} className={`flex items-center gap-3 ${i < progress ? "text-command-muted" : i === progress ? "text-command-text" : "text-command-muted/60"}`}>
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${i < progress ? "bg-command-pass" : i === progress ? "animate-pulse bg-command-action" : "bg-command-border"}`} />
                  {p}
                </li>
              ))}
            </ol>
          ) : null}
          {progress === -1 && !busy ? (
            <button type="button" className={`${primary} mt-4`} onClick={buildAndTest}>
              {t.s3Retry}
            </button>
          ) : null}

          {progress === 4 && cases.length ? (
            <div dir={contentLang === "he" ? "rtl" : "ltr"}>
              {cases.length > 1 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {cases.map((c, i) => (
                    <button key={c.title} type="button" className={chip(caseIdx === i)} onClick={() => setCaseIdx(i)}>
                      {c.title}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 rounded-xl border border-command-border bg-command-bg/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-command-action">{t.s3Example}</p>
                <p className="mt-1 whitespace-pre-wrap">{cases[caseIdx].input}</p>
                <p className="mt-2 text-xs text-command-warning">{t.s3Generated}</p>
                {cases[caseIdx].reference_generated ? <p className="mt-1 text-xs text-command-warning">{t.s3RefGenerated}</p> : null}
              </div>

              <h3 className="mt-6 text-lg font-semibold">{t.s3Output}</h3>
              <div className="mt-2 rounded-xl border border-command-action/40 bg-command-bg p-4">
                {recommended?.outputs[caseIdx] ? <Markdown text={recommended.outputs[caseIdx]!} /> : <p className="text-command-muted">—</p>}
              </div>
              <button type="button" className="mt-3 text-sm text-command-action underline" onClick={() => setShowBaseline((v) => !v)}>
                {showBaseline ? t.s3HideBaseline : t.s3Baseline}
              </button>
              {showBaseline ? (
                <div className="mt-2 rounded-xl border border-command-border bg-command-bg p-4 opacity-90">
                  {baseline?.outputs[caseIdx] ? <Markdown text={baseline.outputs[caseIdx]!} /> : <p className="text-command-muted">—</p>}
                </div>
              ) : null}

              <h3 className="mt-8 text-lg font-semibold">{t.s3Scores}</h3>
              <p className="mt-1">{verdictText}</p>
              {recommended && baseline ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="text-command-muted">
                        <th className="py-2 text-start font-normal" />
                        <th className="py-2 text-start font-semibold text-command-text">{t.s3With}</th>
                        <th className="py-2 text-start font-normal">{t.s3Without}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        [t.s3Correct, pctText(scores[recommended.key]?.correctness), pctText(scores.baseline?.correctness)],
                        [t.s3Format, scores[recommended.key]?.format === null ? t.s3None : pctText(scores[recommended.key]?.format), scores.baseline?.format === null ? t.s3None : pctText(scores.baseline?.format)],
                        [
                          t.s3Missing,
                          String(recommended.judged.reduce((s, j) => s + (j?.asked_for_missing.length ?? 0), 0)),
                          String(baseline.judged.reduce((s, j) => s + (j?.asked_for_missing.length ?? 0), 0))
                        ],
                        [t.s3Invented, String(scores[recommended.key]?.invented ?? "—"), String(scores.baseline?.invented ?? "—")]
                      ].map(([label, a, b]) => (
                        <tr key={label} className="border-t border-command-border">
                          <td className="py-2 pe-4">{label}</td>
                          <td className="py-2 pe-4 font-semibold">{a}</td>
                          <td className="py-2 text-command-muted">{b}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {failures.length ? (
                <p className="mt-3 text-sm text-command-warning">
                  {t.s3Failed} {failures.join(" · ")}
                </p>
              ) : null}

              <details className="mt-6 rounded-xl border border-command-border p-4">
                <summary className="cursor-pointer font-semibold">{t.s3Details}</summary>
                <p className="mt-3 text-sm text-command-muted">{t.s3Rule}</p>
                <h4 className="mt-4 font-semibold">{t.s3Options}</h4>
                <ul className="mt-2 space-y-1 text-sm">
                  {options.map((o) => (
                    <li key={o.key}>
                      <b>{o.name}</b>
                      {o.kind === "directory" ? ` · ${t.s3Fit} ${o.fit}${o.fit < 40 ? ` · ${t.s3Weak}` : ""}` : ""} · {t.s3Correct} {pctText(scores[o.key]?.correctness)} · {t.s3Format}{" "}
                      {pctText(scores[o.key]?.format)}
                      {o.key === recommended?.key ? " ✓" : ""}
                    </li>
                  ))}
                </ul>
                <h4 className="mt-4 font-semibold">{t.s3RuleChecks}</h4>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="border border-command-border px-2 py-1 text-start" />
                        {options.map((o) => (
                          <th key={o.key} className="border border-command-border px-2 py-1 text-start">
                            {o.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(rules ?? []).map((r) => (
                        <tr key={r.id}>
                          <td className="border border-command-border px-2 py-1">{r.text}</td>
                          {options.map((o) => (
                            <td key={o.key} className="border border-command-border px-2 py-1 text-center">
                              {o.judged
                                .map((j) => (j ? { met: "✓", not_met: "✗", not_applicable: "–" }[j.verdicts[r.id] ?? "not_met"] : "?"))
                                .join(" ")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {custom?.skillMd ? (
                  <>
                    <h4 className="mt-4 font-semibold">{t.s3SkillFile}</h4>
                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-command-bg p-3 text-xs" dir="auto">
                      {recommended?.skillMd ?? custom.skillMd}
                    </pre>
                  </>
                ) : null}
              </details>

              <div className="mt-6 flex flex-wrap items-center gap-4">
                <button type="button" className={primary} onClick={() => setStep(4)}>
                  {t.s3Primary}
                </button>
                <p className="text-sm text-command-muted">
                  <b>{t.nextLabel}</b> {t.s3Next}
                </p>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* STEP 4 */}
      {step === 4 && recommended ? (
        <section className={card}>
          <h2 className="text-2xl font-semibold">{t.s4Title}</h2>
          <p className="mt-2 text-lg">
            {t.s4Recommended}: <b dir="auto">{interview?.task_title}</b>
          </p>
          {recommended.kind === "directory" && recommended.url ? (
            <a href={recommended.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-command-action underline">
              {t.s4Source}
            </a>
          ) : null}

          <p className="mt-5 font-semibold">{t.s4Platform}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["claude", "chatgpt", "other"] as const).map((p) => (
              <button key={p} type="button" className={chip(platform === p)} onClick={() => setPlatform(p)}>
                {p === "claude" ? t.s4Claude : p === "chatgpt" ? t.s4ChatGPT : t.s4Other}
              </button>
            ))}
          </div>
          <ol className="mt-4 list-decimal space-y-1 ps-5">
            {(platform === "claude" ? t.s4ClaudeSteps : platform === "chatgpt" ? t.s4ChatSteps : t.s4OtherSteps).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-3">
            {platform === "claude" ? (
              <button type="button" className={primary} onClick={() => downloadZip(recommended.kind === "directory" ? recommended : custom ?? recommended)}>
                {t.s4Download}
              </button>
            ) : (
              <button type="button" className={primary} onClick={() => copyInstructions(recommended.kind === "directory" ? recommended : custom ?? recommended)}>
                {copied ? t.s4Copied : t.s4Copy}
              </button>
            )}
          </div>

          {cases[0] ? (
            <div className="mt-8 rounded-xl border border-command-border bg-command-bg/60 p-4" dir={contentLang === "he" ? "rtl" : "ltr"}>
              <p className="font-semibold">{t.s4FirstUse}</p>
              <p className="mt-1 text-sm text-command-muted">{t.s4FirstUseHint}</p>
              <p className="mt-2 whitespace-pre-wrap rounded-lg border border-command-border bg-command-bg p-3 text-sm">{cases[0].input}</p>
              <p className="mt-3 text-sm font-semibold">{t.s4Check}</p>
              <ul className="mt-1 list-disc space-y-1 ps-5 text-sm">
                {(rules ?? []).map((r) => (
                  <li key={r.id}>{r.text}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <button type="button" className={`${ghost} mt-6`} onClick={restart}>
            {t.s4Restart}
          </button>
        </section>
      ) : null}
    </div>
  );
}
