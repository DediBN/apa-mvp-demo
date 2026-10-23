// Shared between the judge route and the Step 03 skill evaluation UI.

export interface OptionScore {
  key: string;
  name: string;
  found: string[];
  missed: string[];
  false_flags: Array<{ item: string; why: string }>;
  unsupported: number;
  total_items: number;
  recall: number;
  precision: number;
  grounding: number;
  composite: number;
  verdict: string;
}

export interface JudgeResponse {
  ground_truth: "answer_key" | "independent_audit";
  issues: Array<{ id: string; description: string }>;
  scores: OptionScore[];
}
