// Shareable result reports. The report travels inside the link itself (compressed, after the #), so nothing is stored
// on a server and nothing is sent anywhere until the person shares the link. Only scores and labels are included —
// never the test data, the outputs or the skill text.

export interface SharedRow {
  name: string;
  kind: "custom" | "directory" | "baseline";
  fit: number | null;
  correctness: number;
  min: number;
  max: number;
  format: number | null;
  found: number;
  total: number;
  recommended: boolean;
  warning: string | null;
}

export interface SharedReport {
  v: 1;
  title: string;
  need: string;
  date: string; // ISO date
  groundTruth: "generated_scenarios" | "answer_key" | "independent_audit";
  asked: "everyday" | "full";
  runs: number;
  verdict: "gain" | "noise" | "baseline_better" | "none";
  contract: string[];
  rows: SharedRow[];
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeReport(report: SharedReport): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(report));
  return toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

export async function decodeReport(data: string): Promise<SharedReport | null> {
  try {
    const bytes = await pipe(fromBase64Url(data), new DecompressionStream("deflate-raw"));
    const report = JSON.parse(new TextDecoder().decode(bytes)) as SharedReport;
    return report?.v === 1 && Array.isArray(report.rows) ? report : null;
  } catch {
    return null;
  }
}
