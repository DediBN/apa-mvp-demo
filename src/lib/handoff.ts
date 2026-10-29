// Carries the request (and an attached file) from the landing page to the tool at /app, inside this browser tab
// only. Nothing is sent anywhere until the tool starts. Storage can be unavailable (private mode, blocked site data),
// so every access is guarded and the tool still works without it.

export interface Handoff {
  request: string;
  lang: "en" | "he";
  file?: { name: string; type: string; base64: string };
}

const KEY = "apa-handoff";
const MAX_FILE_BYTES = 3_000_000;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// Returns false when the file could not be carried over (too large or storage unavailable); the request still is.
export async function saveHandoff(request: string, lang: "en" | "he", file: File | null): Promise<boolean> {
  let fileOk = true;
  let payload: Handoff = { request, lang };
  if (file) {
    if (file.size <= MAX_FILE_BYTES) {
      payload = { ...payload, file: { name: file.name, type: file.type, base64: toBase64(await file.arrayBuffer()) } };
    } else fileOk = false;
  }
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify({ request, lang }));
    } catch {
      // storage unavailable
    }
    fileOk = !file;
  }
  return fileOk;
}

// Reads the handoff once and clears it, so a reload of /app starts fresh.
export function takeHandoff(): { request: string; lang: "en" | "he"; file: File | null } | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const h = JSON.parse(raw) as Handoff;
    if (!h.request?.trim()) return null;
    let file: File | null = null;
    if (h.file?.base64) {
      const bin = atob(h.file.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      file = new File([bytes], h.file.name, { type: h.file.type || "application/octet-stream" });
    }
    return { request: h.request, lang: h.lang === "he" ? "he" : "en", file };
  } catch {
    return null;
  }
}
