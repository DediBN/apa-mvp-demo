import { AJD } from "../intake-agent/mock";

export interface Candidate {
  candidate_id: string;
  name: string;
  source: "Hugging Face" | "OpenAI" | "CrewAI";
  fit_score_pre_eval: number;
  reason_codes: string[];
  risk_flags: string[];
}

const SIMULATED_SCAN_MS = 1600;

function classifyDomain(ajd: AJD): "support" | "sales" | "finance" | "general" {
  const normalized = `${ajd.domain} ${ajd.business_need}`.toLowerCase();

  if (normalized.includes("support") || normalized.includes("ticket") || normalized.includes("customer")) {
    return "support";
  }

  if (normalized.includes("sales") || normalized.includes("lead") || normalized.includes("pipeline")) {
    return "sales";
  }

  if (normalized.includes("finance") || normalized.includes("invoice") || normalized.includes("billing")) {
    return "finance";
  }

  return "general";
}

function shortlistByDomain(domain: ReturnType<typeof classifyDomain>): Candidate[] {
  const pools: Record<typeof domain, Candidate[]> = {
    support: [
      {
        candidate_id: "cand_sup_hf_01",
        name: "SupportAgent-X",
        source: "Hugging Face",
        fit_score_pre_eval: 84,
        reason_codes: ["Strong support benchmark", "RAG-friendly architecture"],
        risk_flags: ["Needs strict policy prompt templates"]
      },
      {
        candidate_id: "cand_sup_oa_02",
        name: "GPT Support Copilot",
        source: "OpenAI",
        fit_score_pre_eval: 88,
        reason_codes: ["High instruction reliability", "Excellent tool use for CRM handoff"],
        risk_flags: ["Higher token cost under heavy load"]
      },
      {
        candidate_id: "cand_sup_ca_03",
        name: "Crew Resolve Mesh",
        source: "CrewAI",
        fit_score_pre_eval: 80,
        reason_codes: ["Agent teamwork for escalations", "Configurable workflow routing"],
        risk_flags: ["More orchestration tuning required"]
      },
      {
        candidate_id: "cand_sup_hf_04",
        name: "TicketTriage-Pro",
        source: "Hugging Face",
        fit_score_pre_eval: 79,
        reason_codes: ["Fast classification", "Good low-latency profile"],
        risk_flags: ["Lower answer style consistency"]
      }
    ],
    sales: [
      {
        candidate_id: "cand_sales_oa_01",
        name: "Pipeline Navigator",
        source: "OpenAI",
        fit_score_pre_eval: 87,
        reason_codes: ["Strong sequencing for lead workflows", "Reliable CRM action planning"],
        risk_flags: ["Prompt guardrails needed for compliance messaging"]
      },
      {
        candidate_id: "cand_sales_hf_02",
        name: "LeadQual-LM",
        source: "Hugging Face",
        fit_score_pre_eval: 81,
        reason_codes: ["Fast qualification scoring", "Adaptable with custom fine-tuning"],
        risk_flags: ["Requires tuning for enterprise tone"]
      },
      {
        candidate_id: "cand_sales_ca_03",
        name: "Crew SDR Stack",
        source: "CrewAI",
        fit_score_pre_eval: 83,
        reason_codes: ["Multi-agent outreach choreography", "Strong task decomposition"],
        risk_flags: ["Complexity overhead for small teams"]
      }
    ],
    finance: [
      {
        candidate_id: "cand_fin_hf_01",
        name: "InvoiceSense",
        source: "Hugging Face",
        fit_score_pre_eval: 82,
        reason_codes: ["Document extraction quality", "Good structured output support"],
        risk_flags: ["Needs rule layer for exceptions"]
      },
      {
        candidate_id: "cand_fin_oa_02",
        name: "Ledger Copilot",
        source: "OpenAI",
        fit_score_pre_eval: 86,
        reason_codes: ["Strong reasoning over reconciliation flows", "Reliable abstention behavior"],
        risk_flags: ["Can be slower on long contexts"]
      },
      {
        candidate_id: "cand_fin_ca_03",
        name: "Crew Audit Relay",
        source: "CrewAI",
        fit_score_pre_eval: 78,
        reason_codes: ["Great for escalations", "Trace-friendly chain of tasks"],
        risk_flags: ["Extra setup for connector reliability"]
      }
    ],
    general: [
      {
        candidate_id: "cand_gen_oa_01",
        name: "General Ops Copilot",
        source: "OpenAI",
        fit_score_pre_eval: 85,
        reason_codes: ["Balanced capability profile", "Strong instruction following"],
        risk_flags: ["Requires careful cost monitoring"]
      },
      {
        candidate_id: "cand_gen_hf_02",
        name: "OpsFlow-LM",
        source: "Hugging Face",
        fit_score_pre_eval: 79,
        reason_codes: ["Low-latency execution", "Flexible deployment options"],
        risk_flags: ["May need extra prompt engineering"]
      },
      {
        candidate_id: "cand_gen_ca_03",
        name: "Crew Operations Mesh",
        source: "CrewAI",
        fit_score_pre_eval: 81,
        reason_codes: ["Good multi-step orchestration", "Actionable task breakdown"],
        risk_flags: ["Higher orchestration complexity"]
      }
    ]
  };

  const domainPool = pools[domain] ?? pools.general;
  const selected = domainPool.slice(0, 5);

  if (selected.length >= 3) {
    return selected;
  }

  return pools.general.slice(0, 3);
}

export async function runMockSourcingAgent(ajd: AJD): Promise<Candidate[]> {
  await new Promise((resolve) => {
    setTimeout(resolve, SIMULATED_SCAN_MS);
  });

  return shortlistByDomain(classifyDomain(ajd));
}
