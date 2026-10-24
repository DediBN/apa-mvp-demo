import "server-only";
import { createAnthropicClient } from "../anthropic-client";
import { extractJsonObject } from "./claude-json";

// One fixed judge model, no fallback chain: every output in a run must be judged by the same model.
export const JUDGE_MODEL = process.env.APA_JUDGE_MODEL?.trim() || process.env.APA_SKILLS_MODEL?.trim() || "claude-sonnet-5";

export async function pinnedJson<T>(system: string, user: string, maxTokens = 2000): Promise<T> {
  const anthropic = createAnthropicClient();
  const response = await anthropic.messages.create({
    model: JUDGE_MODEL,
    max_tokens: maxTokens,
    system: `${system}\nRespond with strict JSON only. No markdown fences, no prose.`,
    messages: [{ role: "user", content: user }]
  });
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
  return extractJsonObject<T>(text);
}
