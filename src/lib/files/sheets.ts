// Spreadsheets (Excel, CSV) are read in the browser — no Claude call, no cost. Each sheet becomes CSV text.
// The full workbook stays in the browser; only a short preview goes to the "understand" step, and after it only
// the sheets it marked as relevant are sent on.

export interface Sheet {
  name: string;
  rows: number; // data rows, without the header
  csv: string;
}

export const SHEET_EXTENSIONS = ["xlsx", "xlsm", "xls", "csv", "tsv"];
const MAX_SHEET_BYTES = 5_000_000;
const PREVIEW_ROWS = 6;

function nonEmptyLines(csv: string): string[] {
  return csv.split(/\r?\n/).filter((l) => l.replace(/[,\s]/g, "") !== "");
}

export async function readSheets(file: File): Promise<Sheet[]> {
  if (file.size > MAX_SHEET_BYTES) throw new Error("The file is too large (max 5MB). Try a smaller copy.");
  const XLSX = await import("xlsx");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const wb =
    ext === "csv" || ext === "tsv"
      ? XLSX.read(await file.text(), { type: "string", FS: ext === "tsv" ? "\t" : undefined })
      : XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true });
  const sheets: Sheet[] = [];
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false, dateNF: "yyyy-mm-dd" });
    const lines = nonEmptyLines(csv);
    if (lines.length === 0) continue;
    sheets.push({ name: ext === "csv" || ext === "tsv" ? file.name : name, rows: Math.max(0, lines.length - 1), csv: lines.join("\n") });
  }
  if (sheets.length === 0) throw new Error("This file has no data we could read.");
  return sheets;
}

// What the "understand" step sees: every sheet's name, size, header and first rows.
export function sheetsPreview(sheets: Sheet[]): string {
  return sheets
    .map((s) => `=== Sheet: ${s.name} (${s.rows} rows) ===\n${s.csv.split("\n").slice(0, PREVIEW_ROWS + 1).join("\n")}${s.rows > PREVIEW_ROWS ? "\n…" : ""}`)
    .join("\n\n");
}

// The data sent to building, testing and checking: the chosen sheets in full, up to a size cap.
export function sheetsText(sheets: Sheet[], maxChars: number): { text: string; cut: boolean } {
  const full = sheets.map((s) => `=== Sheet: ${s.name} (${s.rows} rows) ===\n${s.csv}`).join("\n\n");
  return { text: full.slice(0, maxChars), cut: full.length > maxChars };
}

export function pickSheets(sheets: Sheet[], names: string[] | undefined): Sheet[] {
  const wanted = new Set((names ?? []).map((n) => n.trim()));
  const picked = sheets.filter((s) => wanted.has(s.name));
  return picked.length ? picked : sheets;
}
