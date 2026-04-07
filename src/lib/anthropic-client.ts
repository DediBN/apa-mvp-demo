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

export function createAnthropicClient(): Anthropic {
  return new Anthropic({
    apiKey: getApiKey()
  });
}
