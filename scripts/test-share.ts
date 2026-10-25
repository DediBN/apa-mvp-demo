// Run: node --experimental-strip-types scripts/test-share.ts
import assert from "node:assert/strict";
import { decodeReport, encodeReport, type SharedReport } from "../src/lib/skills/share.ts";

const report: SharedReport = {
  v: 1,
  title: "Office Furniture Quote Builder",
  need: 'הצעות מחיר בעברית: כיסא 300 ש"ח, שולחן 1,200 ש"ח',
  date: "2026-10-25T08:00:00.000Z",
  groundTruth: "generated_scenarios",
  asked: "everyday",
  runs: 3,
  verdict: "gain",
  contract: ["המסמך כתוב בעברית", "טבלה"],
  rows: [
    { name: "Custom skill", kind: "custom", fit: null, correctness: 95, min: 89, max: 100, format: 100, found: 38, total: 39, recommended: true, warning: null },
    { name: "Claude alone", kind: "baseline", fit: null, correctness: 17, min: 8, max: 23, format: 38, found: 8, total: 39, recommended: false, warning: null }
  ]
};

const encoded = await encodeReport(report);
assert.match(encoded, /^[A-Za-z0-9_-]+$/);
assert.deepEqual(await decodeReport(encoded), report);
assert.equal(await decodeReport("not-a-report"), null);
console.log(`ok - round trip (${encoded.length} chars)\n1 tests passed`);
