// Small, safe Markdown renderer for model output: headings, paragraphs, lists, tables, bold. No raw HTML.
import { Fragment, ReactNode } from "react";

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>
  );
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i += 1;
      continue;
    }
    // table
    if (trimmed.startsWith("|") && i + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[i + 1].trim())) {
      const head = cells(trimmed);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(cells(lines[i]));
        i += 1;
      }
      out.push(
        <div key={`t${i}`} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {head.map((h, k) => (
                  <th key={k} className="border border-command-border bg-command-panel px-3 py-2 text-start font-semibold">
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, k) => (
                    <td key={k} className="border border-command-border px-3 py-2 align-top">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    const h = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const size = h[1].length <= 2 ? "text-lg" : "text-base";
      out.push(
        <p key={`h${i}`} className={`mt-4 mb-1 font-semibold ${size}`}>
          {inline(h[2])}
        </p>
      );
      i += 1;
      continue;
    }
    if (/^([-*•]|\d+[.)])\s+/.test(trimmed)) {
      const ordered = /^\d/.test(trimmed);
      const items: string[] = [];
      while (i < lines.length && /^([-*•]|\d+[.)])\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^([-*•]|\d+[.)])\s+/, ""));
        i += 1;
      }
      const List = ordered ? "ol" : "ul";
      out.push(
        <List key={`l${i}`} className={`my-2 space-y-1 ps-5 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((it, k) => (
            <li key={k}>{inline(it)}</li>
          ))}
        </List>
      );
      continue;
    }
    if (/^-{3,}$/.test(trimmed)) {
      out.push(<hr key={`r${i}`} className="my-3 border-command-border" />);
      i += 1;
      continue;
    }
    out.push(
      <p key={`p${i}`} className="my-2">
        {inline(trimmed)}
      </p>
    );
    i += 1;
  }
  return <div className="leading-relaxed">{out}</div>;
}
