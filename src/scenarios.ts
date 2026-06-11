// Single source of truth for all scenario content.
// Components never hard-code copy — they read from here.

export type ScenarioKey = 'wealth' | 'law' | 'bank' | 'insurance';

export interface PiiEntry {
  value: string;
  token: string;
}

export interface AttachedTable {
  headers: string[];
  rows: string[][];
  piiCols: number[];                     // column indices that carry PII
  tokenMap: Record<string, string>;      // `${rowIdx}_${colIdx}` → token e.g. [CLIENT_1]
}

export interface ScenarioTask {
  id: number;
  label: string;
  destination: 'local' | 'cloud';
  model: string;
  anonymized: boolean;
  executionMs: number;
  cloudPrompt?: string;   // preserved for live mode execute call; unused by scripted scenarios
}

export interface AuditRow {
  time: string;
  task: string;
  sentTo: string;
  blocked: string[];
  status: 'Clean';
}

export interface Scenario {
  key: ScenarioKey;
  icon: string;
  cardLabel: string;
  cardDesc: string;
  workspace: string;
  user: string;
  request: string;
  attachedTable?: AttachedTable;
  piiMap: PiiEntry[];
  tasks: ScenarioTask[];
  maskedPrompt: string;
  finalAnswer: { title: string; body: string };
  answerChips: string[];
  auditRows: AuditRow[];
  banner: string;
}

// ── Scenario D — Wealth Management (DEFAULT) ─────────────────────────────────

const wealth: Scenario = {
  key: 'wealth',
  icon: '📊',
  cardLabel: 'Wealth Mgmt',
  cardDesc: 'Portfolio bulk analysis',
  workspace: 'Harel Wealth — Private Banking',
  user: 'Amit Dahan, Senior Advisor',
  request:
    "Analyze my client portfolio table. Identify clients over-exposed to tech stocks (>40%), " +
    "flag anyone whose risk profile no longer matches their allocation, and draft a prioritized " +
    "call list with talking points for each.",
  attachedTable: {
    headers: ['Client', 'Account', 'Portfolio Value', 'Tech %', 'Risk Profile', 'Last Review'],
    rows: [
      ['Rachel Avrahami', '77-203-981', '₪4,250,000', '62%', 'Conservative', '14 months ago'],
      ['Moshe Peretz',    '77-481-225', '₪1,870,000', '48%', 'Moderate',     '8 months ago' ],
      ['Sara Goldman',    '77-115-668', '₪8,900,000', '71%', 'Conservative', '19 months ago'],
      ['Eli Navon',       '77-339-470', '₪950,000',   '22%', 'Aggressive',   '3 months ago' ],
      ['Tamar Shavit',    '77-602-114', '₪3,400,000', '55%', 'Moderate',     '11 months ago'],
      ['Yaakov Mizrahi',  '77-228-953', '₪12,300,000','44%', 'Conservative', '22 months ago'],
    ],
    piiCols: [0, 1, 2],
    tokenMap: {
      '0_0': '[CLIENT_1]', '0_1': '[ACCT_1]', '0_2': '[VALUE_1]',
      '1_0': '[CLIENT_2]', '1_1': '[ACCT_2]', '1_2': '[VALUE_2]',
      '2_0': '[CLIENT_3]', '2_1': '[ACCT_3]', '2_2': '[VALUE_3]',
      '3_0': '[CLIENT_4]', '3_1': '[ACCT_4]', '3_2': '[VALUE_4]',
      '4_0': '[CLIENT_5]', '4_1': '[ACCT_5]', '4_2': '[VALUE_5]',
      '5_0': '[CLIENT_6]', '5_1': '[ACCT_6]', '5_2': '[VALUE_6]',
    },
  },
  piiMap: [
    { value: 'Rachel Avrahami', token: '[CLIENT_1]' },
    { value: '77-203-981',      token: '[ACCT_1]'   },
    { value: '₪4,250,000',      token: '[VALUE_1]'  },
    { value: 'Moshe Peretz',    token: '[CLIENT_2]' },
    { value: '77-481-225',      token: '[ACCT_2]'   },
    { value: '₪1,870,000',      token: '[VALUE_2]'  },
    { value: 'Sara Goldman',    token: '[CLIENT_3]' },
    { value: '77-115-668',      token: '[ACCT_3]'   },
    { value: '₪8,900,000',      token: '[VALUE_3]'  },
    { value: 'Eli Navon',       token: '[CLIENT_4]' },
    { value: '77-339-470',      token: '[ACCT_4]'   },
    { value: '₪950,000',        token: '[VALUE_4]'  },
    { value: 'Tamar Shavit',    token: '[CLIENT_5]' },
    { value: '77-602-114',      token: '[ACCT_5]'   },
    { value: '₪3,400,000',      token: '[VALUE_5]'  },
    { value: 'Yaakov Mizrahi',  token: '[CLIENT_6]' },
    { value: '77-228-953',      token: '[ACCT_6]'   },
    { value: '₪12,300,000',     token: '[VALUE_6]'  },
  ],
  tasks: [
    { id: 1, label: 'Parse table & compute tech exposure per client',        destination: 'local', model: 'Qwen 2.5',  anonymized: false, executionMs: 900  },
    { id: 2, label: 'Cross-check risk profile vs. current allocation',       destination: 'local', model: 'Qwen 2.5',  anonymized: false, executionMs: 1100 },
    { id: 3, label: 'Rank clients by urgency (exposure × review age × value)', destination: 'local', model: 'Llama 3.2', anonymized: false, executionMs: 800  },
    { id: 4, label: 'Generate talking points per flagged client',             destination: 'cloud', model: 'Claude',    anonymized: true,  executionMs: 4200 },
    { id: 5, label: 'Draft prioritized call list narrative',                  destination: 'cloud', model: 'Claude',    anonymized: true,  executionMs: 3800 },
  ],
  maskedPrompt:
    "Analyze portfolio data for 6 clients (anonymized). Flagged profiles:\n" +
    "[CLIENT_1]: [VALUE_1], 62% tech, Conservative, 14 mo since review\n" +
    "[CLIENT_3]: [VALUE_3], 71% tech, Conservative, 19 mo since review\n" +
    "[CLIENT_5]: [VALUE_5], 55% tech, Moderate, 11 mo since review\n" +
    "[CLIENT_6]: [VALUE_6], 44% tech, Conservative, 22 mo since review\n" +
    "Generate prioritized call list with talking points.",
  finalAnswer: {
    title: 'Priority Call List — Portfolio Risk Review',
    body:
      "🔴 Urgent (this week):\n" +
      "1. Sara Goldman — ₪8.9M, 71% tech vs. Conservative profile, 19 months since review.\n" +
      "   Talking point: recent tech volatility; propose shifting 25–30% to bonds, capital-preservation framing.\n\n" +
      "2. Rachel Avrahami — ₪4.25M, 62% tech vs. Conservative, 14 months.\n" +
      "   Talking point: rebalancing as \"locking in gains.\"\n\n" +
      "🟡 This month:\n" +
      "3. Yaakov Mizrahi — ₪12.3M, 44% tech, Conservative, 22 months overdue.\n" +
      "   Highest portfolio value — schedule full review.\n\n" +
      "4. Tamar Shavit — ₪3.4M, 55% tech vs. Moderate.\n" +
      "   Moderate drift; bundle with quarterly check-in.\n\n" +
      "✓ No action: Moshe Peretz (within tolerance), Eli Navon (aligned, recently reviewed).",
  },
  answerChips: ['🔒 18 entities masked', '🖥 3 local', '☁ 2 masked', '⏱ 38s'],
  auditRows: [
    { time: '10:22:18', task: 'Talking points generation', sentTo: 'Claude', blocked: ['CLIENT_1–6', 'ACCT_1–6', 'VALUE_1–6'], status: 'Clean' },
    { time: '10:22:19', task: 'Call list narrative',       sentTo: 'Claude', blocked: ['CLIENT_1–6', 'ACCT_1–6', 'VALUE_1–6'], status: 'Clean' },
  ],
  banner: '6 client records analyzed. 18 sensitive entities masked. The full table never left the organization.',
};

// ── Scenario A — Law Firm ────────────────────────────────────────────────────

const lawFirm: Scenario = {
  key: 'law',
  icon: '⚖',
  cardLabel: 'Law Firm',
  cardDesc: 'Settlement recommendation',
  workspace: 'Goldfarb & Co. — Legal Workspace',
  user: 'Adv. Dana Goldfarb',
  request:
    "Prepare a settlement recommendation for our client David Stern, case 4421/24. " +
    "The opposing party's latest offer is ₪850,000. Review the medical records summary " +
    "and liability assessment, find supporting precedents, and draft a counter-offer letter at ₪1,150,000.",
  piiMap: [
    { value: 'David Stern',     token: '[CLIENT_NAME]'   },
    { value: '4421/24',         token: '[CASE_ID]'       },
    { value: '₪850,000',        token: '[OFFER_AMOUNT]'  },
    { value: '₪1,150,000',      token: '[COUNTER_AMOUNT]'},
    { value: 'medical records', token: '[MEDICAL_REF]'   },
  ],
  tasks: [
    { id: 1, label: 'Retrieve case file & liability assessment', destination: 'local', model: 'Llama 3.2', anonymized: false, executionMs: 900  },
    { id: 2, label: 'Summarize medical records (privileged)',    destination: 'local', model: 'Qwen 2.5',  anonymized: false, executionMs: 1100 },
    { id: 3, label: 'Compute settlement range from case history',destination: 'local', model: 'Qwen 2.5',  anonymized: false, executionMs: 800  },
    { id: 4, label: 'Search supporting precedents',              destination: 'cloud', model: 'GPT-4o',    anonymized: true,  executionMs: 3800 },
    { id: 5, label: 'Draft counter-offer letter',                destination: 'cloud', model: 'Claude',    anonymized: true,  executionMs: 4200 },
  ],
  maskedPrompt:
    "Review liability assessment for [CLIENT_NAME], case [CASE_ID]. " +
    "Opposing offer: [OFFER_AMOUNT]. Find 3 supporting precedents for counter-offer of [COUNTER_AMOUNT]. " +
    "[MEDICAL_REF] indicates soft tissue injuries with prognosis of 8–12 months recovery.",
  finalAnswer: {
    title: 'Settlement Recommendation — David Stern, Case 4421/24',
    body:
      "Based on the liability assessment and medical summary, the recommended counter-offer is " +
      "₪1,150,000, supported by three comparable precedents (CA 3912/19, CA 7741/21, CA 1186/23) " +
      "with awards 28–41% above the current offer. Draft counter-offer letter attached. " +
      "Probability-weighted settlement range: ₪980,000–₪1,210,000.",
  },
  answerChips: ['🔒 5 entities masked', '🖥 3 local', '☁ 2 masked'],
  auditRows: [
    { time: '10:22:14', task: 'Precedent search',     sentTo: 'GPT-4o', blocked: ['CLIENT_NAME', 'CASE_ID'],                                                status: 'Clean' },
    { time: '10:22:16', task: 'Counter-offer letter', sentTo: 'Claude', blocked: ['CLIENT_NAME', 'CASE_ID', 'OFFER_AMOUNT', 'COUNTER_AMOUNT', 'MEDICAL_REF'], status: 'Clean' },
  ],
  banner: '3 tasks ran locally — privileged material never left the firm.',
};

// ── Scenario B — Bank ────────────────────────────────────────────────────────

const bank: Scenario = {
  key: 'bank',
  icon: '🏦',
  cardLabel: 'Bank',
  cardDesc: 'Mortgage refinance proposal',
  workspace: 'Leumit Bank — Retail Credit',
  user: 'Yael Baruch, Credit Officer',
  request:
    "Prepare a mortgage refinance proposal for Yossi Cohen, account 88-392-114. " +
    "Current loan ₪1.2M at 5.1%, monthly income ₪38,000, excellent credit history. " +
    "Benchmark against current market rates and draft a personalized offer.",
  piiMap: [
    { value: 'Yossi Cohen',  token: '[CLIENT_NAME]'  },
    { value: '88-392-114',   token: '[ACCOUNT_ID]'   },
    { value: '₪1.2M',        token: '[LOAN_AMOUNT]'  },
    { value: '₪38,000',      token: '[INCOME]'       },
    { value: '5.1%',         token: '[CURRENT_RATE]' },
  ],
  tasks: [
    { id: 1, label: 'Retrieve account profile & history',       destination: 'local', model: 'Llama 3.2', anonymized: false, executionMs: 800  },
    { id: 2, label: 'Compute debt-to-income & eligibility',     destination: 'local', model: 'Qwen 2.5',  anonymized: false, executionMs: 950  },
    { id: 3, label: 'Apply internal credit policy rules',       destination: 'local', model: 'Qwen 2.5',  anonymized: false, executionMs: 700  },
    { id: 4, label: 'Benchmark current market refinance rates', destination: 'cloud', model: 'GPT-4o',    anonymized: true,  executionMs: 3600 },
    { id: 5, label: 'Draft personalized refinance offer',       destination: 'cloud', model: 'Claude',    anonymized: true,  executionMs: 4000 },
  ],
  maskedPrompt:
    "Draft personalized refinance offer for [CLIENT_NAME], account [ACCOUNT_ID]. " +
    "Current loan: [LOAN_AMOUNT] at [CURRENT_RATE], monthly income [INCOME], excellent credit. " +
    "Market benchmark rate is 4.35%.",
  finalAnswer: {
    title: 'Refinance Proposal — Yossi Cohen, Account 88-392-114',
    body:
      "Eligible for refinance at 4.35% (vs. current 5.1%), saving ₪68,400 over the loan term. " +
      "Debt-to-income ratio 31% — well within policy. Market benchmark confirms our rate is 0.2% " +
      "below the leading competitor. Personalized offer letter ready for review.",
  },
  answerChips: ['🔒 5 entities masked', '🖥 3 local', '☁ 2 masked'],
  auditRows: [
    { time: '14:07:51', task: 'Market rate benchmark', sentTo: 'GPT-4o', blocked: ['CLIENT_NAME', 'ACCOUNT_ID', 'INCOME'],                    status: 'Clean' },
    { time: '14:07:54', task: 'Refinance offer draft', sentTo: 'Claude', blocked: ['CLIENT_NAME', 'ACCOUNT_ID', 'LOAN_AMOUNT', 'CURRENT_RATE'], status: 'Clean' },
  ],
  banner: '3 tasks ran locally — account data never left the bank.',
};

// ── Scenario C — Insurance ───────────────────────────────────────────────────

const insurance: Scenario = {
  key: 'insurance',
  icon: '🛡',
  cardLabel: 'Insurance',
  cardDesc: 'Policy renewal offer',
  workspace: 'Shamir Insurance — Renewals',
  user: 'Noa Shapiro',
  request:
    "Prepare a renewal offer for Miriam Levi, policy IL-2847. " +
    "She's been a client for 12 years and had 2 claims last year — " +
    "car accident in March (₪45,000) and water damage in October (₪12,000). " +
    "Apply our loyalty tier discount, benchmark against competitor rates, " +
    "and draft a personalized renewal letter she'll actually want to accept.",
  piiMap: [
    { value: 'Miriam Levi', token: '[CLIENT_NAME]'    },
    { value: 'IL-2847',     token: '[POLICY_ID]'      },
    { value: '₪45,000',     token: '[CLAIM_1_AMOUNT]' },
    { value: '₪12,000',     token: '[CLAIM_2_AMOUNT]' },
    { value: '14%',         token: '[DISCOUNT_RATE]'  },
    { value: '12 years',    token: '[TENURE]'         },
  ],
  tasks: [
    { id: 1, label: 'Retrieve client profile and full claims history',      destination: 'local', model: 'Llama 3.2', anonymized: false, executionMs: 600  },
    { id: 2, label: 'Determine loyalty tier and applicable discount rate',  destination: 'local', model: 'Qwen 2.5',  anonymized: false, executionMs: 600  },
    { id: 3, label: 'Calculate risk adjustment for 2 claims in 12 months', destination: 'local', model: 'Qwen 2.5',  anonymized: false, executionMs: 600  },
    { id: 4, label: 'Draft personalized renewal letter with pricing',       destination: 'cloud', model: 'Claude',    anonymized: true,  executionMs: 2000 },
    { id: 5, label: 'Benchmark renewal rate against competitor market data', destination: 'cloud', model: 'GPT-4o',   anonymized: true,  executionMs: 2000 },
  ],
  maskedPrompt:
    "Draft renewal letter for [CLIENT_NAME], policy [POLICY_ID]. " +
    "Client has [TENURE] years tenure, Gold loyalty tier. " +
    "Claims last year: [CLAIM_1_AMOUNT] and [CLAIM_2_AMOUNT]. " +
    "Apply [DISCOUNT_RATE] discount.",
  finalAnswer: {
    title: 'Renewal Offer — Miriam Levi, Policy IL-2847',
    body:
      "As a valued Gold-tier client since 2013, we're pleased to present your renewal for policy IL-2847. " +
      "Given your 12-year relationship with us, you qualify for a 14% loyalty discount. " +
      "Following our actuarial review of your 2024 claims (₪57,000 total), your adjusted premium is " +
      "₪8,240/year — still 11% below the market average for comparable coverage in your area.",
  },
  answerChips: ['🔒 6 entities masked', '🖥 3 local', '☁ 2 masked'],
  auditRows: [
    { time: '09:14:32', task: 'Renewal letter drafting', sentTo: 'Claude', blocked: ['CLIENT_NAME', 'POLICY_ID', 'CLAIM_1_AMOUNT', 'CLAIM_2_AMOUNT', 'DISCOUNT_RATE'], status: 'Clean' },
    { time: '09:14:33', task: 'Competitor benchmarking', sentTo: 'GPT-4o', blocked: ['CLIENT_NAME', 'POLICY_ID'], status: 'Clean' },
  ],
  banner: '3 tasks ran locally — zero outbound traffic. Only 2 masked requests left the org today.',
};

export const SCENARIOS: Record<ScenarioKey, Scenario> = { wealth, law: lawFirm, bank, insurance };

// Wealth management is first and default
export const SCENARIO_ORDER: ScenarioKey[] = ['wealth', 'law', 'bank', 'insurance'];
export const DEFAULT_SCENARIO: ScenarioKey = 'wealth';
