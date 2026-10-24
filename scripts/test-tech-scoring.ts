// Run: node --experimental-strip-types scripts/test-tech-scoring.ts
import assert from "node:assert/strict";
import { pool, scoreRun, spread, withinNoise, type Issue } from "../src/lib/skills/tech-scoring.ts";

let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => {
    passed += 1;
    console.log(`ok - ${name}`);
  });
}

const issues: Issue[] = [
  { id: "I1", description: "discount applied to 12 chairs", kind: "correctness" },
  { id: "I2", description: "total 7,398.60", kind: "correctness" },
  { id: "I3", description: "asks for the cabinet price", kind: "correctness" },
  { id: "I4", description: "result shown as a table", kind: "format" }
];

await test("format misses do not lower correctness (the 100 vs 88 case)", () => {
  const baseline = scoreRun(issues, [{ found: ["I1", "I2", "I3"], false_flags: [], unsupported: 0, total_items: 5 }]);
  const skill = scoreRun(issues, [{ found: ["I1", "I2", "I3", "I4"], false_flags: [], unsupported: 0, total_items: 5 }]);
  assert.equal(baseline.correctness, 100);
  assert.equal(skill.correctness, 100);
  assert.equal(baseline.format, 0);
  assert.equal(skill.format, 100);
});

await test("false flags lower precision; unknown ids are ignored", () => {
  const s = scoreRun(issues, [{ found: ["I1", "I9"], false_flags: [{ item: "x", why: "y" }], unsupported: 1, total_items: 4 }]);
  assert.equal(s.recall, 33);
  assert.equal(s.precision, 50);
  assert.equal(s.grounding, 75);
});

await test("no format issues gives a null format score", () => {
  const s = scoreRun(issues.slice(0, 3), [{ found: ["I1"], false_flags: [], unsupported: 0, total_items: 1 }]);
  assert.equal(s.format, null);
});

await test("overlapping run ranges are within noise", () => {
  assert.equal(withinNoise(spread([95, 88, 92]), spread([84, 90, 86])), true);
  assert.equal(withinNoise(spread([95, 96, 97]), spread([80, 84, 82])), false);
});

await test("a single run each: gaps under the noise floor are within noise (95 vs 88)", () => {
  assert.equal(withinNoise(spread([95]), spread([88])), true);
  assert.equal(withinNoise(spread([100]), spread([60])), false);
});

await test("pool keeps order and respects the limit", async () => {
  let active = 0;
  let peak = 0;
  const tasks = [30, 10, 20, 5, 15].map((ms, i) => async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, ms));
    active -= 1;
    return i;
  });
  const out = await pool(tasks, 2);
  assert.deepEqual(out, [0, 1, 2, 3, 4]);
  assert.equal(peak, 2);
});

console.log(`\n${passed} tests passed`);
