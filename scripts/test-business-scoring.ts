// Run: node --experimental-strip-types scripts/test-business-scoring.ts
import assert from "node:assert/strict";
import {
  applyDeterministicChecks,
  hasMarkdownTable,
  recommend,
  scoreOption,
  type OptionResult,
  type Rule
} from "../src/lib/business/scoring.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const realTable = "הצעת מחיר\n\n| פריט | כמות | מחיר |\n|---|---|---|\n| כיסא | 12 | 3,600 |\n| שולחן | 2 | 2,400 |\n\nסה\"כ: 7,398.60";
const fakeTable = "טבלה:\nשורה 1 — כיסא, 12 יחידות, 3,600 ש\"ח\nשורה 2 — שולחן, 2 יחידות, 2,400 ש\"ח";

test("real markdown table is detected", () => assert.equal(hasMarkdownTable(realTable), true));
test("text that only says 'table' is not a table", () => assert.equal(hasMarkdownTable(fakeTable), false));
test("pipes without a separator row are not a table", () =>
  assert.equal(hasMarkdownTable("| a | b |\n| c | d |"), false));

const rules: Rule[] = [
  { id: "R1", text: "הנחת כמות 10% על 10 כיסאות ומעלה, כיסאות בלבד", kind: "business", source: "user" },
  { id: "R2", text: "לא להמציא מחירים; לבקש מחיר חסר", kind: "business", source: "user" },
  { id: "R3", text: "להציג את ההצעה בטבלה", kind: "format", source: "user" }
];

test("judge saying a table rule is met is overridden when there is no table", () => {
  const judged = applyDeterministicChecks(rules, fakeTable, {
    key: "x",
    verdicts: { R1: "met", R2: "met", R3: "met" },
    invented: [],
    asked_for_missing: []
  });
  assert.equal(judged.verdicts.R3, "not_met");
});

test("a real table keeps the format rule met", () => {
  const judged = applyDeterministicChecks(rules, realTable, {
    key: "x",
    verdicts: { R1: "met", R2: "met", R3: "not_met" },
    invented: [],
    asked_for_missing: []
  });
  assert.equal(judged.verdicts.R3, "met");
});

test("scores separate correctness from format, and invented facts reduce correctness", () => {
  const s = scoreOption(rules, [
    { key: "x", verdicts: { R1: "met", R2: "met", R3: "not_met" }, invented: [], asked_for_missing: [] },
    { key: "x", verdicts: { R1: "met", R2: "met", R3: "not_met" }, invented: ["מחיר ארונית 450"], asked_for_missing: [] }
  ]);
  assert.equal(s.correctness, 80); // 4 met of 4 applicable + 1 invented
  assert.equal(s.format, 0);
  assert.equal(s.invented, 1);
});

const opt = (key: string, kind: OptionResult["kind"], fit: number, correctness: number, format: number): OptionResult => ({
  key,
  kind,
  fit,
  correctness,
  format,
  invented: 0,
  cases: 2
});

test("the Azure case: weak-fit skill tied at the top is not recommended; tie goes to the custom skill", () => {
  const r = recommend([
    opt("pricing-estimate (Azure)", "directory", 25, 100, 100),
    opt("custom", "custom", 100, 100, 100),
    opt("quote-helper", "directory", 65, 100, 100),
    opt("baseline", "baseline", 0, 100, 0)
  ]);
  assert.equal(r.key, "custom");
  assert.equal(r.reason, "tie_custom");
  assert.equal(r.improvement, "format"); // the baseline was correct; only the format improved
});

test("a weak-fit skill scoring higher than everyone is still not recommended", () => {
  const r = recommend([opt("azure", "directory", 25, 100, 100), opt("custom", "custom", 100, 90, 100), opt("baseline", "baseline", 0, 60, 100)]);
  assert.equal(r.key, "custom");
  assert.equal(r.improvement, "correctness");
});

test("an eligible directory skill that beats the custom skill is recommended", () => {
  const r = recommend([opt("quote-helper", "directory", 70, 100, 100), opt("custom", "custom", 100, 80, 100), opt("baseline", "baseline", 0, 60, 0)]);
  assert.equal(r.key, "quote-helper");
  assert.equal(r.reason, "best_score");
  assert.equal(r.improvement, "both");
});

test("a small gain over the baseline is reported as no clear improvement", () => {
  const r = recommend([opt("custom", "custom", 100, 92, 100), opt("baseline", "baseline", 0, 88, 95)]);
  assert.equal(r.key, "custom");
  assert.equal(r.improvement, "none");
});

test("no eligible option yields no recommendation", () => {
  const r = recommend([opt("azure", "directory", 20, 100, 100), opt("baseline", "baseline", 0, 90, 90)]);
  assert.equal(r.key, null);
  assert.equal(r.reason, "no_eligible");
});

test("the cinema case: a grocery-price skill (fit 58) scoring higher is not recommended", () => {
  const r = recommend([
    opt("israeli-grocery-price-intelligence", "directory", 58, 100, 100),
    opt("custom", "custom", 100, 68, 100),
    opt("baseline", "baseline", 0, 88, 100)
  ]);
  assert.equal(r.key, "custom");
});

test("a refusal is not a win: options that did not do the task are not recommended", () => {
  const done = (o: OptionResult, d: number) => ({ ...o, done: d });
  const r = recommend([
    done(opt("price-skill", "directory", 80, 100, 100), 0),
    done(opt("custom", "custom", 100, 70, 100), 0),
    done(opt("baseline", "baseline", 0, 88, 100), 0)
  ]);
  assert.equal(r.key, null);
  assert.equal(r.reason, "not_done");
});

test("an option that did the task wins over higher-scoring ones that refused", () => {
  const r = recommend([
    { ...opt("price-skill", "directory", 80, 100, 100), done: 0 },
    { ...opt("custom", "custom", 100, 70, 100), done: 1 },
    opt("baseline", "baseline", 0, 60, 100)
  ]);
  assert.equal(r.key, "custom");
});

test("a library skill only slightly better than the custom skill does not replace it", () => {
  const r = recommend([opt("quote-helper", "directory", 75, 95, 100), opt("custom", "custom", 100, 90, 100), opt("baseline", "baseline", 0, 60, 0)]);
  assert.equal(r.key, "custom");
  assert.equal(r.reason, "custom_preferred");
});

console.log(`\n${passed} tests passed`);
