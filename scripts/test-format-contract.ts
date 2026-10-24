// Run: node --experimental-strip-types scripts/test-format-contract.ts
import assert from "node:assert/strict";
import { checkContract, contractSection, runCheck, tableHeaders, type FormatRequirement } from "../src/lib/skills/format-contract.ts";

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

const quote = `# הצעת מחיר

| פריט | כמות | מחיר ליחידה (₪) | הנחה | סה״כ |
|---|---|---|---|---|
| כיסא | 12 | 300 | 10% | 3,240 |
| משלוח | 1 | 250 | — | 250 |

**סה"כ לפני מע"מ:** 7,090 ₪
**מע"מ 18%:** 1,276.20 ₪
**סה"כ לתשלום:** 8,366.20 ₪
תנאי תשלום: שוטף 30`;

test("finds the table header", () => {
  assert.equal(tableHeaders(quote).length, 1);
});

test("text that only says 'table' is not a table", () => {
  assert.equal(runCheck({ type: "markdown_table" }, "התוצאה מוצגת בטבלה: פריט, כמות, מחיר"), false);
});

test("columns match despite ״ vs \" and a unit suffix", () => {
  assert.equal(runCheck({ type: "table_columns", names: ["פריט", "כמות", "מחיר ליחידה", 'סה"כ'] }, quote), true);
  assert.equal(runCheck({ type: "table_columns", names: ["פריט", "מק״ט"] }, quote), false);
});

test("contains_any matches a variant", () => {
  assert.equal(runCheck({ type: "contains_any", phrases: ["שוטף+30", "שוטף 30"] }, quote), true);
  assert.equal(runCheck({ type: "contains_any", phrases: ["תוקף ההצעה"] }, quote), false);
});

test("hebrew_text", () => {
  assert.equal(runCheck({ type: "hebrew_text" }, quote), true);
  assert.equal(runCheck({ type: "hebrew_text" }, "Price quote in English with a few words"), false);
});

test("checkContract leaves requirements without a check to the judge", () => {
  const contract: FormatRequirement[] = [
    { id: "F1", description: "table", check: { type: "markdown_table" } },
    { id: "F2", description: "polite closing line" }
  ];
  const r = checkContract(contract, quote);
  assert.equal(r.get("F1"), true);
  assert.equal(r.has("F2"), false);
  assert.match(contractSection(contract), /1\. table\n2\. polite closing line/);
});

console.log(`${passed} tests passed`);
