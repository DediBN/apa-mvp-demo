export type AgentHealthStatus = "ONLINE" | "DEGRADED" | "OFFLINE";
export type AlertType = "NEW_ALTERNATIVE" | null;

export interface OrchestrationLink {
  targetName: string;
  targetType: "CRM" | "ERP" | "KNOWLEDGE_BASE" | "TICKETING" | "AGENT";
  messagesPerHour: number;
}

export interface OptimizationAlert {
  type: "NEW_ALTERNATIVE";
  alternativeScore: number;
  roiGainPerYear: number;
  suggestedSource: string;
}

export interface ActiveAgent {
  id: string;
  name: string;
  domain: string;
  source: string;
  compositeScore: number;
  deployedAt: string;
  status: AgentHealthStatus;
  uptimePercent: number;
  tasksProcessed: number;
  avgLatencyMs: number;
  monthlyROI: number;
  orchestrationLinks: OrchestrationLink[];
  alert: OptimizationAlert | null;
}

export const ACTIVE_FLEET: ActiveAgent[] = [
  {
    id: "agent_prod_001",
    name: "Customer Support Automation Agent",
    domain: "Customer Support",
    source: "OpenAI",
    compositeScore: 88,
    deployedAt: "2026-03-12",
    status: "ONLINE",
    uptimePercent: 99.4,
    tasksProcessed: 14820,
    avgLatencyMs: 1180,
    monthlyROI: 285000,
    orchestrationLinks: [
      { targetName: "Zendesk Ticketing", targetType: "TICKETING", messagesPerHour: 340 },
      { targetName: "Confluence KB", targetType: "KNOWLEDGE_BASE", messagesPerHour: 210 }
    ],
    alert: null
  },
  {
    id: "agent_prod_002",
    name: "Sales Qualification Agent",
    domain: "Sales Operations",
    source: "CrewAI",
    compositeScore: 74,
    deployedAt: "2026-02-28",
    status: "DEGRADED",
    uptimePercent: 96.1,
    tasksProcessed: 9340,
    avgLatencyMs: 2890,
    monthlyROI: 195000,
    orchestrationLinks: [
      { targetName: "Salesforce CRM", targetType: "CRM", messagesPerHour: 280 }
    ],
    alert: {
      type: "NEW_ALTERNATIVE",
      alternativeScore: 91,
      roiGainPerYear: 120000,
      suggestedSource: "OpenAI"
    }
  },
  {
    id: "agent_prod_003",
    name: "Finance Operations Agent",
    domain: "Finance Operations",
    source: "Hugging Face",
    compositeScore: 82,
    deployedAt: "2026-03-25",
    status: "ONLINE",
    uptimePercent: 99.9,
    tasksProcessed: 6490,
    avgLatencyMs: 1420,
    monthlyROI: 240000,
    orchestrationLinks: [
      { targetName: "NetSuite ERP", targetType: "ERP", messagesPerHour: 190 },
      { targetName: "Invoice Processing Agent", targetType: "AGENT", messagesPerHour: 95 }
    ],
    alert: null
  }
];
