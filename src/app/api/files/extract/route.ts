// Turns an uploaded PDF or image into plain text, using Claude's native PDF/vision reading.
// Text files never come here — the browser reads those directly.

import { NextResponse } from "next/server";
import { createAnthropicClient } from "../../../../lib/anthropic-client";

// Needs Vercel Fluid compute (Hobby max 300s). Long documents + a skill exceed 60s.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MODEL_CHAIN = [process.env.APA_SKILLS_MODEL?.trim(), "claude-sonnet-5-5", "claude-sonnet-5", "claude-sonnet-4-6"].filter(
  (m): m is string => Boolean(m)
);

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

// Vercel caps request bodies at ~4.5MB; base64 adds a third, so keep raw files under ~3MB.
const MAX_BASE64_CHARS = 4_200_000;

const SYSTEM = `You transcribe business documents into plain text so another step can analyze them.
- Reproduce ALL content faithfully, in the original language. Do not summarize, translate, correct or add anything.
- Tables: one row per line, cells separated by " | ", header row first. Keep every number exactly as printed.
- Multiple pages or documents: separate them with a line "--- page N ---".
- If something is unreadable, write [unreadable] in its place.
Output only the transcription.`;

export async function POST(request: Request) {
  try {
    const { media_type, data } = (await request.json()) as { media_type?: string; data?: string };
    if (!media_type || !data) {
      return NextResponse.json({ error: "media_type and data are required" }, { status: 400 });
    }
    if (data.length > MAX_BASE64_CHARS) {
      return NextResponse.json({ error: "File too large — keep it under 3MB." }, { status: 413 });
    }

    const isPdf = media_type === "application/pdf";
    const isImage = (IMAGE_TYPES as readonly string[]).includes(media_type);
    if (!isPdf && !isImage) {
      return NextResponse.json({ error: "Only PDF and image files are converted here." }, { status: 415 });
    }

    const block = isPdf
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
      : ({ type: "image", source: { type: "base64", media_type: media_type as ImageType, data } } as const);

    const anthropic = createAnthropicClient();
    let lastError: unknown;
    for (const model of MODEL_CHAIN) {
      try {
        const response = await anthropic.messages.create({
          model,
          max_tokens: 8000,
          system: SYSTEM,
          messages: [{ role: "user", content: [block, { type: "text", text: "Transcribe this file." }] }]
        });
        const text = response.content
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("\n")
          .trim();
        if (!text) {
          throw new Error("Empty transcription");
        }
        return NextResponse.json({ text, truncated: response.stop_reason === "max_tokens" });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("All models failed");
  } catch (error) {
    console.error("[files/extract]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not read this file. Try a clearer PDF or export it to CSV." }, { status: 500 });
  }
}
