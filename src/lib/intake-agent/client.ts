import { AJD } from "./mock";

export async function runIntakeAgent(businessNeed: string): Promise<AJD> {
  const response = await fetch("/api/intake/ajd", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ businessNeed })
  });

  const data = (await response.json()) as { ajd?: AJD; error?: string };

  if (!response.ok || !data.ajd) {
    throw new Error(data.error || "Failed to generate AJD from Claude API");
  }

  return data.ajd;
}
