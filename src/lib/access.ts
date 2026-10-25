// Access codes for the tool. Set APA_ACCESS_CODE in the environment (comma-separated for several codes, e.g. one per
// prospect). When it is not set, the tool is open — so nothing breaks before the variable exists.
// Works in both the Edge middleware and Node routes (Web Crypto only).

export const ACCESS_COOKIE = "apa_access";

export function accessCodes(): string[] {
  return (process.env.APA_ACCESS_CODE ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

export async function tokenFor(code: string): Promise<string> {
  const data = new TextEncoder().encode(`apa-skills:${code.trim()}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function isValidToken(token: string | undefined): Promise<boolean> {
  const codes = accessCodes();
  if (codes.length === 0) return true;
  if (!token) return false;
  for (const code of codes) if ((await tokenFor(code)) === token) return true;
  return false;
}
