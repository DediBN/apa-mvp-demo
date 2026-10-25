import { NextResponse } from "next/server";
import { ACCESS_COOKIE, accessCodes, tokenFor } from "../../../lib/access";

export const dynamic = "force-dynamic";

const attempts = new Map<string, { n: number; at: number }>();

export async function POST(request: Request) {
  // Slow down guessing: at most 10 tries per address per 10 minutes (per server instance).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const a = attempts.get(ip);
  const rec = a && now - a.at < 10 * 60_000 ? a : { n: 0, at: now };
  rec.n += 1;
  attempts.set(ip, rec);
  if (rec.n > 10) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });

  const { code } = (await request.json().catch(() => ({}))) as { code?: string };
  const codes = accessCodes();
  if (codes.length > 0 && !codes.includes((code ?? "").trim())) {
    return NextResponse.json({ error: "That code isn't valid." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, await tokenFor(code ?? ""), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return res;
}
