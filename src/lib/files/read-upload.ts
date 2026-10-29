// Reads an uploaded file into text the pipeline can work with.
// - Text formats (CSV, TXT, MD, JSON, TSV): read directly in the browser.
// - PDF and images: sent to /api/files/extract, where Claude transcribes them.
// - Excel: read in the browser (SheetJS), every sheet as CSV text. No Claude call.
// - Anything else binary (Word, ...): rejected with a clear message instead of turning into gibberish.

import { readSheets, sheetsText } from "./sheets";

export const UPLOAD_ACCEPT = ".xlsx,.xlsm,.xls,.txt,.csv,.tsv,.md,.json,.pdf,.png,.jpg,.jpeg,.webp,.gif";

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const MAX_TEXT_BYTES = 2_000_000;
const MAX_BINARY_BYTES = 3_000_000;

function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// A text read that contains NUL or many replacement characters is a binary file in disguise.
function looksBinary(text: string): boolean {
  if (text.includes("\u0000")) return true;
  const sample = text.slice(0, 4000);
  const bad = (sample.match(/�/g) ?? []).length;
  return sample.length > 0 && bad / sample.length > 0.02;
}

export async function readUploadAsText(file: File, maxChars: number): Promise<{ text: string; note?: string }> {
  const ext = extensionOf(file.name);

  if (ext === "pdf" || file.type === "application/pdf" || IMAGE_TYPES[ext]) {
    if (file.size > MAX_BINARY_BYTES) {
      throw new Error("File too large — keep PDFs and images under 3MB, or upload a few pages.");
    }
    const mediaType = ext === "pdf" ? "application/pdf" : IMAGE_TYPES[ext] || file.type;
    const res = await fetch("/api/files/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_type: mediaType, data: toBase64(await file.arrayBuffer()) })
    });
    const data = (await res.json().catch(() => ({}))) as { text?: string; truncated?: boolean; error?: string };
    if (!res.ok || !data.text) {
      throw new Error(data.error || "Could not read this file.");
    }
    const notes = [
      `Converted from ${ext.toUpperCase()} by Claude — check the text below before running.`,
      data.truncated || data.text.length > maxChars ? "The document is long; only the first part is used." : ""
    ].filter(Boolean);
    return { text: data.text.slice(0, maxChars), note: notes.join(" ") };
  }

  if (["xlsx", "xlsm", "xls"].includes(ext)) {
    const { text, cut } = sheetsText(await readSheets(file), maxChars);
    return { text, note: cut ? `File is long; only the first ${maxChars.toLocaleString()} characters are used.` : undefined };
  }

  if (["docx", "doc", "pptx", "zip"].includes(ext)) {
    throw new Error("This format isn't supported yet — save it as PDF (or copy the text) and upload that.");
  }

  if (file.size > MAX_TEXT_BYTES) {
    throw new Error("File too large (max 2MB). Try a smaller sample.");
  }
  const text = await file.text();
  if (looksBinary(text)) {
    throw new Error("This doesn't look like a text file. Upload CSV, TXT, PDF or an image.");
  }
  return {
    text: text.slice(0, maxChars),
    note: text.length > maxChars ? `File is long; only the first ${maxChars.toLocaleString()} characters are used.` : undefined
  };
}

