import { NextResponse } from "next/server";
import { createAnthropicClient } from "../../../../lib/anthropic-client";
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

function extractJson(text: string): ClaudeAJD {
  const direct = text.trim();

  try {
    return JSON.parse(direct) as ClaudeAJD;
  } catch {
    const start = direct.indexOf("{");
    const end = direct.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(direct.slice(start, end + 1)) as ClaudeAJD;
    }

    throw new Error("Claude did not return valid JSON.");
  }
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
    job_title: raw.role || "Automation Agent",
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
      role: raw.role || "Automation Agent",
      mission: raw.mission || "Improve process efficiency",
      kpis,
      tech_specs: techSpecs
    }
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { businessNeed?: string };
    const businessNeed = body.businessNeed?.trim();

    console.log("--- DEBUG START ---");
    console.log("Using Key (first 10):", process.env.ANTHROPIC_API_KEY?.slice(0, 10));
    console.log("Payload:", body);

    if (!businessNeed) {
      return NextResponse.json({ error: "businessNeed is required" }, { status: 400 });
    }

    const anthropic = createAnthropicClient();
    const requestPayload = {
      max_tokens: 900,
      temperature: 0.2,
      system:
        "You are an enterprise solutions architect. Return strict JSON only. No markdown, no prose.",
      messages: [
        {
          role: "user" as const,
          content:
            "Analyze this business requirement and return JSON with this exact shape: " +
            '{"role":"string","mission":"string","domain":"string","kpis":[{"name":"string","target":"string"},{"name":"string","target":"string"},{"name":"string","target":"string"}],"tech_specs":["string","string","string","string","string"]}. ' +
            `Business requirement: ${businessNeed}`
        }
      ]
    };

    const modelFallbackChain = [
      "claude-3-5-sonnet-latest",
      "claude-3-opus-latest",
      "claude-sonnet-4-6",
      "claude-opus-4-6",
      "claude-sonnet-4-20250514"
    ];

    let response;
    let lastError: unknown;

    for (const model of modelFallbackChain) {
      try {
        response = await anthropic.messages.create({
          model,
          ...requestPayload
        });
        console.log("Model selected:", model);
        break;
      } catch (error) {
        lastError = error;
        console.error(`Anthropic model failed (${model}):`, error);
      }
    }

    if (!response) {
      throw lastError instanceof Error ? lastError : new Error("All Anthropic models failed.");
    }

    const textParts = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const parsed = extractJson(textParts);
    const ajd = normalizeClaudeAJD(parsed, businessNeed);

    return NextResponse.json({ ajd });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate AJD";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
