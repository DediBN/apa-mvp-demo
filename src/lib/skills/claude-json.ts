import "server-only";
import { createAnthropicClient } from "../anthropic-client";

// Model chain for the skill pipeline. Override with APA_SKILLS_MODEL.
const MODEL_CHAIN = [process.env.APA_SKILLS_MODEL?.trim(), "claude-sonnet-5-5", "claude-sonnet-5", "claude-sonnet-4-6"].filter(
  (m): m is string => Boolean(m)
);
// Fast, low-cost chain for steps that read and sort rather than write the skill or judge it. Override with APA_MODEL_FAST.
export const FAST_MODEL_CHAIN = [process.env.APA_MODEL_FAST?.trim(), "claude-haiku-5-5", "claude-haiku-4-5"].filter(
  (m): m is string => Boolean(m)
);

export function extractJsonObject<T>(text: string): T {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new Error("Model did not return valid JSON.");
  }
}

export async function claudeJson<T>(system: string, user: string, maxTokens = 1500, opts: { fast?: boolean } = {}): Promise<T> {
  const anthropic = createAnthropicClient();
  let lastError: unknown;
  for (const model of opts.fast ? FAST_MODEL_CHAIN : MODEL_CHAIN) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system: `${system}\nRespond with strict JSON only. No markdown fences, no prose.`,
        messages: [{ role: "user", content: user }]
      });
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("\n");
      return extractJsonObject<T>(text);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All models failed.");
}
