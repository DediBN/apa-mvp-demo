export interface AJD {
  job_title: string;
  business_need: string;
  domain: string;
  agent_profile?: {
    role: string;
    mission: string;
    kpis: Array<{
      name: string;
      target: string;
    }>;
    tech_specs: string[];
  };
  required_capabilities: string[];
  integrations: {
    crm: string;
    erp: string;
    knowledge_base: string;
    ticketing: string;
  };
  kpis: {
    deflection_rate_target: number;
    max_response_latency_ms: number;
    hallucination_tolerance: number;
  };
  constraints: {
    compliance: string[];
    languages: string[];
    human_escalation_required: boolean;
  };
  boundary_map: {
    can_access: string[];
    cannot_access: string[];
  };
}

const SIMULATED_DELAY_MS = 1250;

function pickDomain(businessNeed: string): string {
  const normalized = businessNeed.toLowerCase();

  if (normalized.includes("support") || normalized.includes("ticket") || normalized.includes("customer")) {
    return "Customer Support";
  }

  if (normalized.includes("sales") || normalized.includes("lead")) {
    return "Sales Operations";
  }

  if (normalized.includes("finance") || normalized.includes("invoice")) {
    return "Finance Operations";
  }

  return "General Operations";
}

function inferCapabilities(domain: string): string[] {
  if (domain === "Customer Support") {
    return ["intent classification", "policy-grounded response", "handoff to human"];
  }

  if (domain === "Sales Operations") {
    return ["lead qualification", "CRM enrichment", "next-best-action guidance"];
  }

  if (domain === "Finance Operations") {
    return ["document extraction", "policy validation", "escalation routing"];
  }

  return ["task orchestration", "knowledge retrieval", "human escalation"]; 
}

export async function runMockIntakeAgent(businessNeed: string): Promise<AJD> {
  const cleanedNeed = businessNeed.trim();

  if (!cleanedNeed) {
    throw new Error("Business need is required.");
  }

  const domain = pickDomain(cleanedNeed);

  await new Promise((resolve) => {
    setTimeout(resolve, SIMULATED_DELAY_MS);
  });

  return {
    job_title: `${domain} Automation Agent`,
    business_need: cleanedNeed,
    domain,
    agent_profile: {
      role: `${domain} Automation Agent`,
      mission: `Automate ${domain.toLowerCase()} workflows with safe escalation controls.`,
      kpis: [
        { name: "Resolution Deflection", target: ">= 35%" },
        { name: "Response Latency", target: "<= 2500 ms" },
        { name: "Hallucination Rate", target: "<= 2%" }
      ],
      tech_specs: [
        "CRM connector with OAuth",
        "Knowledge base retrieval layer",
        "Escalation path to human",
        "Audit log + trace IDs",
        "Policy-driven response guardrails"
      ]
    },
    required_capabilities: inferCapabilities(domain),
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
    }
  };
}
