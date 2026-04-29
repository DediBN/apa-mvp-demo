export interface ROIAssumptions {
  monthlyHoursSaved: number;
  costPerHour: number;
  efficiencyFactor: number;
  apiCostMonthly: number;
  infraCostMonthly: number;
  govCostMonthly: number;
  humanCostPerResolution: number;
  agentCostPerResolution: number;
}

export interface ROIResult {
  monthlyValue: number;
  annualValue: number;
  costPerResolutionHuman: number;
  costPerResolutionAgent: number;
  savingsPercent: number;
  formulaDisplay: string;
}

export function buildDefaultAssumptions(
  compositeScore: number,
  userInputText = "",
  selectedAgent = ""
): ROIAssumptions {
  const ef = Math.max(0.5, compositeScore / 100);
  const agentCost = Math.max(2.5, 6.5 - (Math.max(60, compositeScore) - 60) / 13);

  // Domain detection from user input text
  const text = userInputText.toLowerCase();
  type Domain = "support" | "sales" | "operations" | "general";
  let domain: Domain = "general";
  if (text.includes("support") || text.includes("customer") || text.includes("email")) {
    domain = "support";
  } else if (text.includes("sales") || text.includes("lead") || text.includes("pipeline")) {
    domain = "sales";
  } else if (text.includes("operations") || text.includes("process") || text.includes("workflow")) {
    domain = "operations";
  }

  const domainHours: Record<Domain, number> = {
    support: 800,
    sales: 500,
    operations: 400,
    general: 300
  };
  const domainRate: Record<Domain, number> = {
    support: 35,
    sales: 60,
    operations: 50,
    general: 40
  };

  // Complexity multiplier from input length
  const len = userInputText.trim().length;
  const complexityMultiplier = len >= 150 ? 1.2 : len >= 50 ? 1.0 : 0.8;

  // Agent cost by provider
  const agent = selectedAgent.toLowerCase();
  let apiCostMonthly = 800;
  if (agent.includes("openai")) {
    apiCostMonthly = 1200;
  } else if (agent.includes("crewai") || agent.includes("crew")) {
    apiCostMonthly = 400;
  } else if (agent.includes("hugging")) {
    apiCostMonthly = 700;
  }

  return {
    monthlyHoursSaved: Math.round(domainHours[domain] * complexityMultiplier),
    costPerHour: domainRate[domain],
    efficiencyFactor: ef,
    apiCostMonthly,
    infraCostMonthly: 400,
    govCostMonthly: 200,
    humanCostPerResolution: 28,
    agentCostPerResolution: parseFloat(agentCost.toFixed(2))
  };
}

export function calculateROI(a: ROIAssumptions): ROIResult {
  const grossValue = a.monthlyHoursSaved * a.costPerHour * a.efficiencyFactor;
  const totalCost = a.apiCostMonthly + a.infraCostMonthly + a.govCostMonthly;
  const monthlyValue = grossValue - totalCost;
  const annualValue = monthlyValue * 12;
  const savingsPercent = Math.round(
    ((a.humanCostPerResolution - a.agentCostPerResolution) / a.humanCostPerResolution) * 100
  );

  const formulaDisplay =
    `(${a.monthlyHoursSaved}h × $${a.costPerHour} × ${a.efficiencyFactor.toFixed(2)}) ` +
    `− $${totalCost.toLocaleString()} = $${Math.round(monthlyValue).toLocaleString()}/mo`;

  return {
    monthlyValue,
    annualValue,
    costPerResolutionHuman: a.humanCostPerResolution,
    costPerResolutionAgent: a.agentCostPerResolution,
    savingsPercent,
    formulaDisplay
  };
}

export function formatCurrency(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}
