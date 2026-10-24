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
  // Technology evaluation v2: correctness and format scored separately, over repeated runs.
  correctness?: number;
  correctness_min?: number;
  correctness_max?: number;
  format?: number | null;
  runs?: number;
}

export interface JudgeResponse {
  ground_truth: "answer_key" | "independent_audit" | "generated_scenarios";
  issues: Array<{ id: string; description: string }>;
  scores: OptionScore[];
}

export interface GeneratedScenario {
  title: string;
  customer_data: string;
  reference_data: string;
  answer_key: string;
}
