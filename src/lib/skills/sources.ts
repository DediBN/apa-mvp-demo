import "server-only";

// Skill sourcing from public skill directories.
// - SkillsMP:  https://skillsmp.com/api/v1/skills/{search|ai-search}   (Bearer SKILLSMP_API_KEY, ~500 req/day)
// - skills.sh: https://skills.sh/api/v1/skills/search                   (Bearer SKILLS_SH_API_KEY or Vercel OIDC token)
// Every source is optional: a missing key or a failed call returns [] and the pipeline continues.

export type SkillDirectory = "SkillsMP" | "skills.sh";

export interface SkillHit {
  id: string;
  name: string;
  author: string;
  description: string;
  directory: SkillDirectory;
  githubUrl: string;
  pageUrl?: string;
  stars?: number;
  installs?: number;
  updatedAt?: string;
}

const REQUEST_TIMEOUT_MS = 12000;

async function fetchJson(url: string, headers: Record<string, string>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Directory responses are not formally documented, so find the first array of records anywhere sensible.
function findRecords(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object");
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const obj = payload as Record<string, unknown>;
  for (const key of ["skills", "results", "items", "data"]) {
    const found = findRecords(obj[key]);
    if (found.length > 0) {
      return found;
    }
  }
  return [];
}

// ─── SkillsMP ───────────────────────────────────────────────────────────────

function mapSkillsMp(record: Record<string, unknown>): SkillHit | null {
  // ai-search may wrap the skill: { skill: {...}, score }
  const r = (record.skill && typeof record.skill === "object" ? record.skill : record) as Record<string, unknown>;
  const githubUrl = str(r.githubUrl) || str(r.github_url) || str(r.repoUrl);
  const name = str(r.name);
  if (!githubUrl || !name) {
    return null;
  }
  return {
    id: `skillsmp:${str(r.id) || githubUrl}`,
    name,
    author: str(r.author) || str(r.owner),
    description: str(r.description),
    directory: "SkillsMP",
    githubUrl,
    pageUrl: str(r.url) || str(r.skillUrl) || undefined,
    stars: num(r.stars),
    updatedAt: str(r.updatedAt) || undefined
  };
}

export async function searchSkillsMp(query: string, mode: "keyword" | "semantic"): Promise<SkillHit[]> {
  // The key is optional: anonymous access works with a lower quota (~50 searches/day, 10/min).
  const key = process.env.SKILLSMP_API_KEY?.trim();
  if (!query.trim()) {
    return [];
  }
  const path = mode === "semantic" ? "ai-search" : "search";
  const params = new URLSearchParams({ q: query });
  if (mode === "keyword") {
    params.set("limit", "15");
    params.set("sortBy", "stars");
  }
  try {
    const payload = await fetchJson(`https://skillsmp.com/api/v1/skills/${path}?${params}`, key ? { Authorization: `Bearer ${key}` } : {});
    return findRecords(payload).map(mapSkillsMp).filter((x): x is SkillHit => x !== null);
  } catch (error) {
    console.warn(`[skills] SkillsMP ${path} failed:`, error instanceof Error ? error.message : error);
    return [];
  }
}

// ─── skills.sh ──────────────────────────────────────────────────────────────

function skillsShToken(oidcHeader?: string | null): string | null {
  return process.env.SKILLS_SH_API_KEY?.trim() || oidcHeader?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim() || null;
}

function mapSkillsSh(record: Record<string, unknown>): SkillHit | null {
  const id = str(record.id); // e.g. "vercel-labs/skills/find-skills"
  const source = str(record.source); // e.g. "vercel-labs/skills"
  const name = str(record.name) || id.split("/").pop() || "";
  const installUrl = str(record.installUrl);
  const githubUrl = installUrl.includes("github.com") ? installUrl : source && !source.includes(".") ? `https://github.com/${source}` : "";
  if (!name || !githubUrl) {
    return null;
  }
  return {
    id: `skills.sh:${id || `${source}/${name}`}`,
    name,
    author: str(record.owner) || source.split("/")[0] || "",
    description: str(record.description),
    directory: "skills.sh",
    githubUrl,
    pageUrl: str(record.url) || undefined,
    installs: num(record.installs ?? record.installCount)
  };
}

export async function searchSkillsSh(query: string, oidcHeader?: string | null): Promise<SkillHit[]> {
  const token = skillsShToken(oidcHeader);
  if (!token || !query.trim()) {
    return [];
  }
  try {
    const params = new URLSearchParams({ q: query, limit: "10" });
    const payload = await fetchJson(`https://skills.sh/api/v1/skills/search?${params}`, { Authorization: `Bearer ${token}` });
    return findRecords(payload).map(mapSkillsSh).filter((x): x is SkillHit => x !== null);
  } catch (error) {
    console.warn("[skills] skills.sh search failed:", error instanceof Error ? error.message : error);
    return [];
  }
}

export async function fetchSkillsShAudit(hit: SkillHit, oidcHeader?: string | null): Promise<string[]> {
  const token = skillsShToken(oidcHeader);
  if (!token || hit.directory !== "skills.sh") {
    return [];
  }
  const id = hit.id.replace(/^skills\.sh:/, "");
  try {
    const payload = (await fetchJson(`https://skills.sh/api/v1/skills/audit/${id}`, { Authorization: `Bearer ${token}` }, 6000)) as Record<string, unknown>;
    // Keep it shape-agnostic: surface any non-passing verdict strings.
    const flags: string[] = [];
    const walk = (value: unknown, label: string) => {
      if (typeof value === "string" && /fail|warn|risk|critical|high|malicious/i.test(value)) {
        flags.push(`skills.sh audit · ${label}: ${value}`);
      } else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          walk(v, label ? `${label}.${k}` : k);
        }
      }
    };
    walk(payload, "");
    return flags.slice(0, 3);
  } catch {
    return [];
  }
}

// ─── SKILL.md retrieval from GitHub ─────────────────────────────────────────

// Converts a GitHub URL into candidate raw URLs for the skill's SKILL.md.
export function rawSkillMdUrls(githubUrl: string, skillName?: string): string[] {
  const match = githubUrl.match(/github\.com\/([^/]+)\/([^/#?]+)(?:\/(?:tree|blob)\/([^/]+)(?:\/(.*))?)?/);
  if (!match) {
    return [];
  }
  const [, owner, repoRaw, branch, subPath] = match;
  const repo = repoRaw.replace(/\.git$/, "");
  const cleanSub = (subPath || "").replace(/\/?SKILL\.md$/i, "").replace(/\/$/, "");
  const branches = branch ? [branch] : ["main", "master"];
  const dirs = cleanSub
    ? [cleanSub]
    : ["", ...(skillName ? [`skills/${skillName}`, skillName, `.claude/skills/${skillName}`] : [])];
  const urls: string[] = [];
  for (const b of branches) {
    for (const d of dirs) {
      urls.push(`https://raw.githubusercontent.com/${owner}/${repo}/${b}/${d ? `${d}/` : ""}SKILL.md`);
    }
  }
  return urls;
}

async function fetchText(url: string, timeoutMs = 6000, headers: Record<string, string> = {}): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store", headers });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// One GitHub tree listing per repo per request (60/h unauthenticated; set GITHUB_TOKEN to raise it).
const treeCache = new Map<string, Promise<string[]>>();

function listSkillMdPaths(owner: string, repo: string): Promise<string[]> {
  const key = `${owner}/${repo}`.toLowerCase();
  const cached = treeCache.get(key);
  if (cached) return cached;
  const token = process.env.GITHUB_TOKEN?.trim();
  const promise = fetchText(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
    8000,
    { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  ).then((text) => {
    if (!text) return [];
    try {
      const tree = (JSON.parse(text) as { tree?: Array<{ path?: string; type?: string }> }).tree ?? [];
      return tree.filter((t) => t.type === "blob" && /(^|\/)SKILL\.md$/i.test(t.path ?? "")).map((t) => t.path as string);
    } catch {
      return [];
    }
  });
  treeCache.set(key, promise);
  return promise;
}

function pickSkillPath(paths: string[], slug: string, subPath: string): string | null {
  if (paths.length === 0) return null;
  const dirOf = (p: string) => p.replace(/\/?SKILL\.md$/i, "");
  const last = (p: string) => dirOf(p).split("/").pop()?.toLowerCase() ?? "";
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    (subPath && paths.find((p) => dirOf(p).toLowerCase() === subPath.toLowerCase().replace(/\/$/, ""))) ||
    paths.find((p) => norm(last(p)) === slug) ||
    paths.find((p) => norm(last(p)).includes(slug) || slug.includes(norm(last(p)) || "\u0000")) ||
    (paths.length === 1 ? paths[0] : null)
  );
}

export async function fetchSkillMd(hit: SkillHit): Promise<{ content: string; rawUrl: string } | null> {
  const slug = hit.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // 1. Cheap guesses at the usual locations (raw.githubusercontent.com, no rate limit).
  const guesses = rawSkillMdUrls(hit.githubUrl, slug);
  const results = await Promise.all(guesses.map(async (rawUrl) => ({ rawUrl, text: await fetchText(rawUrl) })));
  const hitGuess = results.find((r) => r.text?.trim());
  if (hitGuess?.text) {
    return { content: hitGuess.text.slice(0, 40000), rawUrl: hitGuess.rawUrl };
  }

  // 2. Fallback: list the repo's SKILL.md files and pick the one that matches this skill.
  const match = hit.githubUrl.match(/github\.com\/([^/]+)\/([^/#?]+)(?:\/(?:tree|blob)\/[^/]+\/(.*))?/);
  if (!match) return null;
  const [, owner, repoRaw, subPath = ""] = match;
  const repo = repoRaw.replace(/\.git$/, "");
  const path = pickSkillPath(await listSkillMdPaths(owner, repo), slug, subPath.replace(/\/?SKILL\.md$/i, ""));
  if (!path) return null;
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`;
  const text = await fetchText(rawUrl);
  return text?.trim() ? { content: text.slice(0, 40000), rawUrl } : null;
}

// Signals the screener cannot see from SKILL.md text alone.
export function skillMdRiskSignals(content: string): string[] {
  const flags: string[] = [];
  // Instructions that make Claude execute something on the user's machine or install software.
  if (/(?:python3?|node|bash|sh|npx|uvx?)\s+[\w./-]*scripts?\/|(?:pip3?|npm|pnpm|yarn|brew|apt(?:-get)?)\s+(?:install|add)|\bsudo\b|chmod\s+\+x|rm\s+-rf/i.test(content)) {
    flags.push("Runs scripts or installs packages — not executed in this demo; review before use");
  } else if (/```(?:bash|sh|python|py|js|ts)/i.test(content)) {
    flags.push("Contains code examples");
  }
  if (/curl\s|wget\s|https?:\/\/[^\s)]+\/(?:api|upload|webhook)/i.test(content)) {
    flags.push("References outbound network calls");
  }
  if (!/^---[\s\S]*?\bname:[\s\S]*?\bdescription:[\s\S]*?---/m.test(content)) {
    flags.push("Missing standard SKILL.md frontmatter (name/description)");
  }
  return flags;
}

export function dedupeHits(hits: SkillHit[]): SkillHit[] {
  const seen = new Map<string, SkillHit>();
  for (const hit of hits) {
    const key = `${hit.githubUrl.toLowerCase().replace(/\/$/, "")}#${hit.name.toLowerCase()}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, hit);
    } else {
      // merge popularity signals across directories
      existing.stars = existing.stars ?? hit.stars;
      existing.installs = existing.installs ?? hit.installs;
    }
  }
  return Array.from(seen.values());
}
