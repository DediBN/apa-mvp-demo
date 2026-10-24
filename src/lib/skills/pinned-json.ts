import "server-only";
import { createAnthropicClient } from "../anthropic-client";
import { extractJsonObject } from "./claude-json";

// One fixed judge model, no fallback chain: every output in a run must be judged by the same model.
export const JUDGE_MODEL = process.env.APA_JUDGE_MODEL?.trim() || process.env.APA_SKILLS_MODEL?.trim() || "claude-sonnet-5";

const ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The answer comes back as a forced tool call against a JSON schema, so the model never hand-writes JSON
// (Hebrew text such as ש"ח inside a string used to break parsing). Transient failures (rate limits, overload,
// a malformed answer) are retried with backoff — the model stays the same on every attempt.
export async function pinnedJson<T>(system: string, user: string, maxTokens = 2000, schema?: Record<string, unknown>): Promise<T> {
  const anthropic = createAnthropicClient();
  let lastError: unknown;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(1500 * 2 ** (attempt - 1) + Math.random() * 500);
    try {
      if (schema) {
        const response = await anthropic.messages.create({
          model: JUDGE_MODEL,
          max_tokens: maxTokens,
          system,
          tools: [{ name: "submit", description: "Submit the result.", input_schema: schema as never }],
          tool_choice: { type: "tool", name: "submit" },
          messages: [{ role: "user", content: user }]
        });
        const block = response.content.find((b) => b.type === "tool_use");
        if (!block || block.type !== "tool_use") throw new Error("No structured result returned");
        return block.input as T;
      }
      const response = await anthropic.messages.create({
        model: JUDGE_MODEL,
        max_tokens: maxTokens,
        system: `${system}\nRespond with strict JSON only. No markdown fences, no prose.`,
        messages: [{ role: "user", content: user }]
      });
      const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
      return extractJsonObject<T>(text);
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number })?.status;
      // Bad requests and auth errors will not get better on retry.
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Judge call failed.");
}
