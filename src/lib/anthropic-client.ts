import "server-only";
import Anthropic from "@anthropic-ai/sdk";

function getApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local.");
  }

  if (apiKey === "your_key_here") {
    throw new Error("ANTHROPIC_API_KEY is still set to placeholder value.");
  }

  return apiKey;
}

// Every Claude call logs one line with its token usage, so the cost of a run can be read in Vercel → Logs:
// {"event":"usage","model":"…","in":1234,"out":567,"cache_write":0,"cache_read":0} — Vercel shows the route beside it.
export function createAnthropicClient(): Anthropic {
  const client = new Anthropic({
    apiKey: getApiKey()
  });
  const create = client.messages.create.bind(client.messages);
  (client.messages as { create: unknown }).create = (async (...args: Parameters<typeof create>) => {
    const response = (await create(...args)) as Anthropic.Message;
    const usage = response?.usage;
    if (usage) {
      console.log(
        JSON.stringify({
          event: "usage",
          model: response.model,
          in: usage.input_tokens,
          out: usage.output_tokens,
          cache_write: usage.cache_creation_input_tokens ?? 0,
          cache_read: usage.cache_read_input_tokens ?? 0
        })
      );
    }
    return response;
  }) as unknown;
  return client;
}
