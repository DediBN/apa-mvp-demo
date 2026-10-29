import { NextResponse } from "next/server";
import { pinnedJson } from "../../../../lib/skills/pinned-json";
import { AJD } from "../../../../lib/intake-agent/mock";

interface ClaudeAJD {
  role: string;
  mission: string;
  domain: string;
  kpis: Array<{
    name: string;
    target: string;
  }>;
  tech_specs: string[];
}

function normalizeClaudeAJD(raw: ClaudeAJD, businessNeed: string): AJD {
  const kpis = Array.isArray(raw.kpis) ? raw.kpis.slice(0, 3) : [];
  const techSpecs = Array.isArray(raw.tech_specs) ? raw.tech_specs.slice(0, 5) : [];

  while (kpis.length < 3) {
    kpis.push({ name: `KPI ${kpis.length + 1}`, target: "TBD" });
  }

  while (techSpecs.length < 5) {
    techSpecs.push(`Tech spec ${techSpecs.length + 1}: TBD`);
  }

  return {
    job_title: raw.role || "Business Skill",
    business_need: businessNeed,
    domain: raw.domain || "General Operations",
    required_capabilities: techSpecs.slice(0, 3),
    integrations: {
      crm: "Salesforce",
      erp: "NetSuite",
      knowledge_base: "Confluence",
      ticketing: "Zendesk"
    },
    kpis: {
      deflection_rate_target: 0.35,
      max_response_latency_ms: 2500,
      hallucination_tolerance: 0.02
    },
    constraints: {
      compliance: ["SOC2"],
      languages: ["en"],
      human_escalation_required: true
    },
    boundary_map: {
      can_access: ["ticket metadata", "approved KB"],
      cannot_access: ["payment credentials", "raw PII"]
    },
    agent_profile: {
      role: raw.role || "Business Skill",
      mission: raw.mission || "Improve process efficiency",
      kpis,
      tech_specs: techSpecs
    }
  };
}

const SYSTEM = `You define Claude Agent Skills for business processes.
- role: a short name for the skill (e.g. "Supplier Invoice Checker"). Never use the word Agent.
- mission: what the skill makes Claude do, in one or two sentences.
- domain: the business area.
- kpis: exactly 3 measurable success measures with a concrete target each, that can be checked on a test output
  (e.g. "Below-minimum products found: 100%"). Never response-time or uptime targets.
- tech_specs: 5 concrete capabilities the skill needs (what it reads, checks, calculates and produces).
- feasibility: can an AI assistant with a written skill do this task using ONLY data the business gives it (files or
  text it pastes) and general knowledge? A skill is written instructions: it cannot browse the web, fetch live data,
  or read or send anything in other systems.
  status "not_possible": the task needs live or current outside information the business does not have in its own
  files (today's prices or schedules of other businesses, availability, news, web search), or needs to act in another
  system (send emails or messages, update a calendar, a website or a bank).
  status "needs_file": the task is about the business's own records (stock, clients, appointments, invoices, price
  list...) and the request does not include them — the run must use the business's file.
  status "ok": otherwise. reason: one sentence on what is missing ("" when ok). needs: one sentence on what would make
  it work ("" when ok).
Write role, mission, KPIs and tech_specs in the language of the requirement. reason and needs in English.`;

const SCHEMA = {
  type: "object",
  properties: {
    role: { type: "string" },
    mission: { type: "string" },
    domain: { type: "string" },
    kpis: {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" }, target: { type: "string" } }, required: ["name", "target"] }
    },
    tech_specs: { type: "array", items: { type: "string" } },
    feasibility: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["ok", "needs_file", "not_possible"] },
        reason: { type: "string" },
        needs: { type: "string" }
      },
      required: ["status", "reason", "needs"]
    }
  },
  required: ["role", "mission", "domain", "kpis", "tech_specs", "feasibility"]
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { businessNeed?: string };
    const businessNeed = body.businessNeed?.trim();

    if (!businessNeed) {
      return NextResponse.json({ error: "businessNeed is required" }, { status: 400 });
    }

    // Structured answer (forced tool call): Hebrew quotes such as ש"ח in a KPI target cannot break parsing.
    const parsed = await pinnedJson<ClaudeAJD & { feasibility?: AJD["feasibility"] }>(
      SYSTEM,
      `Business requirement:\n"""${businessNeed.slice(0, 6000)}"""\n\nSubmit the skill spec.`,
      3000,
      SCHEMA,
      { model: process.env.APA_SKILLS_MODEL?.trim() || "claude-sonnet-5-5" }
    );
    const ajd = normalizeClaudeAJD(parsed, businessNeed);
    const f = parsed.feasibility;
    ajd.feasibility = {
      status: f && ["ok", "needs_file", "not_possible"].includes(f.status) ? f.status : "ok",
      reason: f?.reason?.trim() || "",
      needs: f?.needs?.trim() || ""
    };

    return NextResponse.json({ ajd });
  } catch (error) {
    console.error("[intake/ajd]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not write the Skill Spec. Please try again." }, { status: 500 });
  }
}
