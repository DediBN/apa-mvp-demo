// Skill sourcing: AJD → search queries → SkillsMP + skills.sh → SKILL.md retrieval → Claude screening → shortlist.
// Returns the same { candidates } shape as /api/sourcing/scan so the existing pipeline UI is unchanged.

import { NextResponse } from "next/server";
import type { Candidate } from "../../../../lib/research-agent/mock";
import { claudeJson } from "../../../../lib/skills/claude-json";
import {
  SkillHit,
  dedupeHits,
  fetchSkillMd,
  fetchSkillsShAudit,
  searchSkillsMp,
  searchSkillsSh,
  skillMdRiskSignals
} from "../../../../lib/skills/sources";

// Needs Vercel Fluid compute (Hobby max 300s). Long documents + a skill exceed 60s.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface SkillScanRequest {
  jobTitle?: string;
  mission?: string;
  kpis?: Array<{ name: string; target: string }>;
}

interface QueryPlan {
  semantic_query: string;
  keyword_queries: string[];
}

interface ScreeningResult {
  results: Array<{
    index: number;
    fit_score: number;
    fit_reason: string;
    gaps: string;
  }>;
}

const MAX_TO_FETCH = 24;
const MAX_SHORTLIST = 4; // directory skills tested; + custom skill + no-skill baseline
const MIN_SKILLS = 3; // always test at least this many directory skills when that many are readable
const MIN_FIT = 40;
const SKILL_EXCERPT_CHARS = 2500;
const SKILL_CARRY_CHARS = 20000;

function heuristicPlan(jobTitle: string, mission: string): QueryPlan {
  const words = `${jobTitle} ${mission}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["agent", "automate", "with", "that", "from", "into", "their", "this"].includes(w));
  return {
    semantic_query: `${jobTitle}: ${mission}`.slice(0, 200),
    keyword_queries: [words.slice(0, 2).join(" "), words.slice(2, 4).join(" ")].filter(Boolean)
  };
}

async function planQueries(jobTitle: string, mission: string, kpis: SkillScanRequest["kpis"]): Promise<QueryPlan> {
  try {
    const plan = await claudeJson<QueryPlan>(
      "You turn a business job description for an AI worker into search queries for Agent Skill directories (SKILL.md files for Claude). " +
        "Skills are named by the concrete task they perform (e.g. 'invoice reconciliation', 'whatsapp order parsing', 'xlsx analysis'). " +
        "Queries must be in English even if the input is in another language.",
      `job_title: ${jobTitle}\nmission: ${mission}\nkpis: ${JSON.stringify(kpis ?? [])}\n` +
        'Return {"semantic_query": "<one natural-language sentence describing the skill needed>", "keyword_queries": ["<2-3 words>", "<2-3 words>", "<2-3 words>"]}',
      400
    );
    if (plan.semantic_query && Array.isArray(plan.keyword_queries)) {
      return { semantic_query: plan.semantic_query, keyword_queries: plan.keyword_queries.filter(Boolean).slice(0, 3) };
    }
  } catch (error) {
    console.warn("[skills] query planning failed, using heuristic:", error instanceof Error ? error.message : error);
  }
  return heuristicPlan(jobTitle, mission);
}

function popularity(hit: SkillHit): number {
  return Math.log10(1 + (hit.stars ?? 0)) + Math.log10(1 + (hit.installs ?? 0));
}

function licenseNote(content: string): string | null {
  const match = content.match(/^license:\s*(.+)$/im);
  if (!match) {
    return "No license declared — confirm reuse rights before commercial use";
  }
  const license = match[1].trim();
  if (/proprietary|all rights reserved|non-?commercial|cc-by-nc/i.test(license)) {
    return `License restricts reuse: ${license}`;
  }
  return null;
}

function customSkillCandidate(jobTitle: string): Candidate {
  return {
    candidate_id: "skill_custom_ajd",
    name: `Custom skill: ${jobTitle}`,
    source: "Custom Skill",
    fit_score_pre_eval: 70,
    reason_codes: ["Written from the approved Skill Spec — fits the process exactly", "Fallback when no directory skill passes screening"],
    risk_flags: ["Not yet written — must be authored and tested before deployment"],
    skill: { directory: "Custom", author: "APA" }
  };
}

function baselineCandidate(): Candidate {
  return {
    candidate_id: "skill_baseline_none",
    name: "Baseline: Claude with no skill",
    source: "Custom Skill",
    fit_score_pre_eval: 50,
    reason_codes: ["Control group — shows what Claude does without any skill", "Every skill must beat this to justify installing it"],
    risk_flags: ["Not a deployable skill"],
    skill: { directory: "Custom", author: "Anthropic (base model)" }
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SkillScanRequest;
    const jobTitle = body.jobTitle?.trim() || "Business process skill";
    const mission = body.mission?.trim() || jobTitle;
    const oidcHeader = request.headers.get("x-vercel-oidc-token");

    // 1. Query plan
    const plan = await planQueries(jobTitle, mission, body.kpis);

    // 2. Search both directories in parallel (SkillsMP quota is ~500/day: 1 semantic + 1 keyword call per run)
    const [mpSemantic, mpKeyword1, mpKeyword2, ...shResults] = await Promise.all([
      searchSkillsMp(plan.semantic_query, "semantic"),
      searchSkillsMp(plan.keyword_queries[0] ?? "", "keyword"),
      searchSkillsMp(plan.keyword_queries[1] ?? "", "keyword"),
      ...plan.keyword_queries.map((q) => searchSkillsSh(q, oidcHeader))
    ]);
    const mpKeyword = [...mpKeyword1, ...mpKeyword2];
    const shHits = shResults.flat();
    const allHits = dedupeHits([...mpSemantic, ...shHits, ...mpKeyword]);

    // Keep relevance order from the directories, nudged by popularity.
    const ranked = allHits
      .map((hit, order) => ({ hit, rank: order - popularity(hit) * 2 }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, MAX_TO_FETCH)
      .map((entry) => entry.hit);

    // 3. Retrieve SKILL.md for each (skills without a readable SKILL.md are dropped — we only shortlist what we can read)
    const withContent = (
      await Promise.all(
        ranked.map(async (hit) => {
          const md = await fetchSkillMd(hit);
          return md ? { hit, ...md } : null;
        })
      )
    ).filter((x): x is { hit: SkillHit; content: string; rawUrl: string } => x !== null);

    let candidates: Candidate[] = [];

    // 4. Screen with Claude against the AJD
    if (withContent.length > 0) {
      const dossier = withContent
        .map(
          (entry, index) =>
            `### [${index}] ${entry.hit.name} (by ${entry.hit.author || "unknown"}, ${entry.hit.directory})\n` +
            entry.content.slice(0, SKILL_EXCERPT_CHARS)
        )
        .join("\n\n");

      let screening: ScreeningResult = { results: [] };
      try {
        screening = await claudeJson<ScreeningResult>(
          "You are a strict hiring screener for Claude Agent Skills. Judge each SKILL.md only by what it actually instructs, " +
            "against the job description. Do not reward popularity, general writing quality or broad 'productivity' skills.\n" +
            "Score the fit with these anchors:\n" +
            "- 80-100: the skill's core purpose IS this task, in this kind of business (its steps produce this exact output).\n" +
            "- 60-79: same task type, needs minor adaptation (e.g. same document type, different industry).\n" +
            "- 40-59: covers a real part of the task (a sub-step or the output format), not the whole task.\n" +
            "- 10-39: shares words or a general area only (e.g. cloud-service pricing for a furniture price quote; a generic writing or editing skill for a calculation task).\n" +
            "- 0-9: unrelated.\n" +
            "A skill that depends on tools, APIs or data sources the business does not have scores at most 30.",
          `JOB DESCRIPTION\njob_title: ${jobTitle}\nmission: ${mission}\nkpis: ${JSON.stringify(body.kpis ?? [])}\n\n` +
            `CANDIDATE SKILLS\n${dossier}\n\n` +
            'Return {"results":[{"index":0,"fit_score":0-100,"fit_reason":"one line, concrete","gaps":"one line: what the job needs that this skill does not cover"}]} for every candidate.',
          4000
        );
      } catch (error) {
        console.warn("[skills] screening failed:", error instanceof Error ? error.message : error);
      }

      const scored = withContent
        .map((entry, index) => {
          const verdict = screening.results?.find((r) => r.index === index);
          return { entry, verdict };
        })
        .filter(({ verdict }) => Boolean(verdict))
        .sort((a, b) => (b.verdict?.fit_score ?? 0) - (a.verdict?.fit_score ?? 0));
      const passing = scored.filter(({ verdict }) => (verdict?.fit_score ?? 0) >= MIN_FIT).slice(0, MAX_SHORTLIST);
      // Always test at least MIN_SKILLS directory skills: top up with the best weaker matches (flagged as weak fit).
      const topUp = scored.filter((entry) => !passing.includes(entry)).slice(0, Math.max(0, MIN_SKILLS - passing.length));
      const shortlisted = [...passing, ...topUp];

      candidates = await Promise.all(
        shortlisted.map(async ({ entry, verdict }, i) => {
          const { hit, content, rawUrl } = entry;
          const audit = await fetchSkillsShAudit(hit, oidcHeader);
          const license = licenseNote(content);
          const popularityLine = [hit.stars ? `${hit.stars}★ GitHub` : "", hit.installs ? `${hit.installs.toLocaleString()} installs` : ""]
            .filter(Boolean)
            .join(" · ");
          return {
            candidate_id: `skill_${i + 1}_${hit.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
            name: hit.name,
            source: hit.directory,
            fit_score_pre_eval: Math.max(0, Math.min(100, Math.round(verdict?.fit_score ?? 0))),
            reason_codes: [verdict?.fit_reason || hit.description || "Matched the Skill Spec", popularityLine || `by ${hit.author || "unknown"}`],
            risk_flags: [
              ...((verdict?.fit_score ?? 0) < MIN_FIT ? ["Weak fit at screening — tested anyway so at least 3 skills are compared"] : []),
              ...(verdict?.gaps ? [`Gap: ${verdict.gaps}`] : []),
              ...skillMdRiskSignals(content),
              ...(license ? [license] : []),
              ...audit
            ].slice(0, 5),
            skill: {
              directory: hit.directory,
              author: hit.author,
              githubUrl: hit.githubUrl,
              rawUrl,
              pageUrl: hit.pageUrl,
              stars: hit.stars,
              installs: hit.installs,
              content: content.slice(0, SKILL_CARRY_CHARS)
            }
          } satisfies Candidate;
        })
      );
    }

    // 5. Always add the custom-skill option and the no-skill baseline (control group every skill must beat).
    candidates.push(customSkillCandidate(jobTitle), baselineCandidate());

    const meta = {
      queries: plan,
      found: { skillsmp: mpSemantic.length + mpKeyword.length, skills_sh: shHits.length, unique: allHits.length },
      readable_skill_md: withContent.length,
      sources_enabled: {
        skillsmp: true, // works anonymously; a key only raises the quota
        skills_sh: Boolean(process.env.SKILLS_SH_API_KEY?.trim() || oidcHeader || process.env.VERCEL_OIDC_TOKEN?.trim())
      }
    };
    console.log("[skills] scan", JSON.stringify(meta));

    return NextResponse.json({ candidates, meta });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Skill sourcing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
