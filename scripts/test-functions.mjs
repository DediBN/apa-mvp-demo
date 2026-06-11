/**
 * Test script for apa-analyze and apa-execute Netlify Functions.
 * Run with: node scripts/test-functions.mjs
 * Requires: netlify dev running on port 8888 (npm run dev:netlify)
 */

const BASE = 'http://localhost:8888/.netlify/functions';

const SAMPLE_PROMPTS = [
  {
    label: 'Law firm settlement',
    prompt: 'I need to draft a settlement letter for David Stern (case IL-2023-441). The settlement amount is ₪850,000 and his account number is 12-345-678. Please also retrieve his full case history and prepare a summary for the partner meeting.',
  },
  {
    label: 'Wealth management portfolio',
    prompt: 'Review the portfolio for Amit Dahan (ID: 034782910, account 98-765-432). He has ₪2,400,000 in equities and wants to rebalance to 60/40 before end of quarter. Draft a rebalancing proposal and calculate the expected tax impact.',
  },
  {
    label: 'Insurance renewal',
    prompt: 'Miriam Levi (policy IL-2847, DOB 1972-03-15) needs her health insurance renewed. Her current premium is ₪1,200/month. Please check coverage gaps and draft a renewal letter with options for upgrading to include dental coverage.',
  },
];

async function testAnalyze(label, prompt) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`▶ ANALYZE: ${label}`);
  console.log(`  Prompt: "${prompt.slice(0, 80)}..."`);

  const res = await fetch(`${BASE}/apa-analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    console.error(`  ✗ HTTP ${res.status}: ${await res.text()}`);
    return null;
  }

  const data = await res.json();
  console.log(`  ✓ Entities detected: ${data.entities?.length ?? 0}`);
  data.entities?.forEach(e => console.log(`    [${e.type}] "${e.value}" → ${e.token}`));
  console.log(`  ✓ Tasks decomposed: ${data.tasks?.length ?? 0}`);
  data.tasks?.forEach(t => {
    const dest = t.needsCloud ? '☁ cloud' : '🖥 local';
    console.log(`    ${t.id}. [${dest}] ${t.title}`);
    if (t.cloudPrompt) console.log(`       masked: "${t.cloudPrompt.slice(0, 80)}..."`);
  });
  return data;
}

async function testExecute(analysisResult) {
  if (!analysisResult) return;
  const cloudTasks = analysisResult.tasks?.filter(t => t.needsCloud && t.cloudPrompt) ?? [];
  if (cloudTasks.length === 0) {
    console.log('  (no cloud tasks to execute)');
    return;
  }

  console.log(`\n▶ EXECUTE: running ${cloudTasks.length} cloud task(s) in parallel`);

  const res = await fetch(`${BASE}/apa-execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks: cloudTasks.map(t => ({ id: t.id, cloudPrompt: t.cloudPrompt })) }),
  });

  if (!res.ok) {
    console.error(`  ✗ HTTP ${res.status}: ${await res.text()}`);
    return;
  }

  const data = await res.json();
  data.results?.forEach(r => {
    if (r.error) {
      console.log(`  ✗ Task ${r.id} failed: ${r.error}`);
    } else {
      console.log(`  ✓ Task ${r.id}: "${r.response?.slice(0, 120)}..."`);
    }
  });
}

async function testPIIGuard() {
  console.log(`\n${'─'.repeat(60)}`);
  console.log('▶ PII GUARD TEST: should reject unmasked prompt');
  const res = await fetch(`${BASE}/apa-execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tasks: [{ id: 1, cloudPrompt: 'Write a letter for David Stern (ID: 034782910) about his ₪500,000 settlement.' }],
    }),
  });
  if (res.status === 400) {
    const { error } = await res.json();
    console.log(`  ✓ Guard fired: ${error}`);
  } else {
    console.log(`  ✗ Guard did NOT fire (status ${res.status}) — check PII patterns`);
  }
}

(async () => {
  console.log('APA Functions Test Suite');
  console.log(`Target: ${BASE}`);

  for (const { label, prompt } of SAMPLE_PROMPTS) {
    const analysisResult = await testAnalyze(label, prompt);
    await testExecute(analysisResult);
  }

  await testPIIGuard();

  console.log(`\n${'─'.repeat(60)}`);
  console.log('Done.');
})();
