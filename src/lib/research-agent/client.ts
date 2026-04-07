import { Candidate } from "./mock";

interface ScanInput {
  jobTitle: string;
  mission: string;
}

export async function runSourcingScan(input: ScanInput): Promise<Candidate[]> {
  const response = await fetch("/api/sourcing/scan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  const data = (await response.json()) as { candidates?: Candidate[]; error?: string };

  if (!response.ok || !Array.isArray(data.candidates)) {
    throw new Error(data.error || "Failed to run sourcing scan");
  }

  return data.candidates;
}
