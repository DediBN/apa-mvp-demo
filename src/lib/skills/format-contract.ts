// The format contract: the exact form the deliverable must take, fixed once from the Skill Spec and shared by
// every test set. Pure functions only (no imports from Next), so it can be unit-tested with plain Node.
//
// Each requirement is atomic. Structural checks (a real table, the language) decide the verdict both ways. Label checks
// (column names, required lines) can only confirm: a pass counts as met, a miss goes to the judge, who accepts an
// equivalent wording ("סכום סופי לתשלום" for "סה״כ לתשלום") — a literal phrase list must never fail a correct result.

export type FormatCheck =
  | { type: "markdown_table" }
  | { type: "table_columns"; names: string[] }
  | { type: "contains_any"; phrases: string[] }
  | { type: "hebrew_text" };

export interface FormatRequirement {
  id: string; // F1, F2, ...
  description: string;
  check?: FormatCheck;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[״"׳'`*_:()[\]{}.,;!?\-–—/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const isRow = (l: string) => l.startsWith("|") && l.endsWith("|") && l.split("|").length >= 4;
const isSep = (l: string) => /^\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{0,}:?\s*\|?$/.test(l);

// Header rows of every real Markdown table in the text (a header row, a separator row, at least one data row).
export function tableHeaders(text: string): string[][] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const headers: string[][] = [];
  for (let i = 0; i + 2 < lines.length; i += 1) {
    if (isRow(lines[i]) && isSep(lines[i + 1]) && isRow(lines[i + 2])) {
      headers.push(
        lines[i]
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => norm(c))
      );
    }
  }
  return headers;
}

// A column name matches a header cell when one contains the other ("מחיר ליחידה" ~ "מחיר ליחידה (₪)").
const cellMatches = (cell: string, name: string) => {
  const n = norm(name);
  return n.length > 0 && (cell.includes(n) || (cell.length > 1 && n.includes(cell)));
};

export function runCheck(check: FormatCheck, deliverable: string): boolean {
  const text = deliverable ?? "";
  switch (check.type) {
    case "markdown_table":
      return tableHeaders(text).length > 0;
    case "table_columns":
      return tableHeaders(text).some((header) => check.names.every((name) => header.some((cell) => cellMatches(cell, name))));
    case "contains_any": {
      const t = norm(text);
      return check.phrases.some((p) => norm(p).length > 0 && t.includes(norm(p)));
    }
    case "hebrew_text": {
      const hebrew = (text.match(/[֐-׿]/g) ?? []).length;
      const latin = (text.match(/[A-Za-z]/g) ?? []).length;
      return hebrew > 20 && hebrew > latin * 2;
    }
    default:
      return false;
  }
}

export const isDecisive = (check: FormatCheck) => check.type === "markdown_table" || check.type === "hebrew_text";

// Mechanical verdicts: true = met, false = not met; absent = for the judge to decide.
export function checkContract(contract: FormatRequirement[], deliverable: string): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const req of contract) {
    if (!req.check) continue;
    const ok = runCheck(req.check, deliverable);
    if (ok || isDecisive(req.check)) out.set(req.id, ok);
  }
  return out;
}

// The contract as a SKILL.md section, appended verbatim to the custom skill so the skill carries the exact format.
export function contractSection(contract: FormatRequirement[]): string {
  return (
    "## Required output format (follow exactly)\n\n" +
    "Write the finished deliverable in Markdown and meet every point below:\n\n" +
    contract
      .map((r, i) => {
        const exact =
          r.check?.type === "table_columns"
            ? ` — column headers exactly: ${r.check.names.join(" | ")}`
            : r.check?.type === "contains_any"
              ? ` — use the label: “${r.check.phrases[0]}”`
              : "";
        return `${i + 1}. ${r.description}${exact}`;
      })
      .join("\n") +
    "\n"
  );
}
