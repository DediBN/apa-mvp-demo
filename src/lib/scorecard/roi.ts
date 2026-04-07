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

export function buildDefaultAssumptions(compositeScore: number): ROIAssumptions {
  const ef = Math.max(0.5, compositeScore / 100);
  const agentCost = Math.max(2.5, 6.5 - (Math.max(60, compositeScore) - 60) / 13);

  return {
    monthlyHoursSaved: 600,
    costPerHour: 45,
    efficiencyFactor: ef,
    apiCostMonthly: 800,
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
