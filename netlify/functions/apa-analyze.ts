import Anthropic from '@anthropic-ai/sdk';
import type { Handler, HandlerEvent } from '@netlify/functions';

// ── Rate limiting (in-memory, per function instance) ──────────────────────────
const rateMap = new Map<string, number[]>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (rateMap.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_LIMIT) return true;
  hits.push(now);
  rateMap.set(ip, hits);
  return false;
}

// ── CORS headers ──────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Tool schema for forced JSON output ───────────────────────────────────────
const ANALYZE_TOOL: Anthropic.Tool = {
  name: 'analyze_request',
  description: 'Extract PII entities and decompose into tasks.',
  input_schema: {
    type: 'object' as const,
    required: ['entities', 'tasks'],
    additionalProperties: false,
    properties: {
      entities: {
        type: 'array',
        description: 'All sensitive entities found in the prompt.',
        items: {
          type: 'object',
          required: ['value', 'type', 'token'],
          additionalProperties: false,
          properties: {
            value: { type: 'string', description: 'Exact string as it appears in the prompt.' },
            type: {
              type: 'string',
              enum: [
                'PERSON_NAME', 'ACCOUNT_ID', 'AMOUNT', 'DATE_OF_BIRTH',
                'ADDRESS', 'PHONE', 'EMAIL', 'ID_NUMBER',
                'MEDICAL_REF', 'PERCENTAGE', 'OTHER_PII',
              ],
            },
            token: { type: 'string', description: 'Semantic placeholder, e.g. [CLIENT_NAME] or [AMOUNT_1].' },
          },
        },
      },
      tasks: {
        type: 'array',
        description: '3–6 tasks that fulfil the request.',
        items: {
          type: 'object',
          required: ['id', 'title', 'destination', 'model', 'needsCloud'],
          additionalProperties: false,
          properties: {
            id: { type: 'integer' },
            title: { type: 'string' },
            destination: { type: 'string', enum: ['local', 'cloud'] },
            model: { type: 'string' },
            needsCloud: { type: 'boolean' },
            cloudPrompt: {
              type: 'string',
              description: 'REQUIRED when needsCloud=true. Must use tokens, never real values.',
            },
          },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You are the Privacy Intelligence Layer of APA (AI Privacy Architecture).
Your task: analyze a user prompt and return structured JSON via the analyze_request tool.

ENTITY DETECTION RULES:
- Detect ALL sensitive data: full names, first/last names alone when clearly identifying,
  account numbers, policy IDs, case numbers, monetary amounts (any currency), dates of birth,
  addresses, phone numbers, email addresses, national ID numbers (Israeli 9-digit IDs, SSNs, etc.),
  medical terms tied to a person, percentages clearly tied to a person's data.
- Generate SEMANTIC tokens: [CLIENT_NAME], [ACCOUNT_ID], [AMOUNT_1], [AMOUNT_2], [DOB], etc.
  Number tokens when multiple entities share a type: [CLIENT_1], [CLIENT_2].
- If a value appears multiple times in the prompt, use the SAME token for every occurrence.

TASK DECOMPOSITION RULES:
- Break the request into 3–6 logical sub-tasks.
- Classification rule: data retrieval / internal computation / policy lookup → local (Llama 3.2);
  creative drafting / external knowledge synthesis / summarisation for humans → cloud (Claude).
- For cloud tasks, write cloudPrompt EXCLUSIVELY with the tokens — never include real names,
  amounts, IDs or any PII. The cloud model must never see the actual values.
- Assign sequential integer IDs starting at 1.

OUTPUT: Call analyze_request exactly once with the full result. No other text.`;

// ── Handler ───────────────────────────────────────────────────────────────────
export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  const ip = event.headers['x-forwarded-for']?.split(',')[0].trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return {
      statusCode: 429,
      headers: CORS,
      body: JSON.stringify({ error: 'Rate limit exceeded. Max 10 runs/hour.' }),
    };
  }

  let prompt: string;
  try {
    ({ prompt } = JSON.parse(event.body ?? '{}'));
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new Error('Missing prompt');
    }
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    temperature: 0,
    system: SYSTEM_PROMPT,
    tools: [ANALYZE_TOOL],
    tool_choice: { type: 'tool', name: 'analyze_request' },
    messages: [{ role: 'user', content: prompt }],
  });

  const toolBlock = response.content.find(b => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'No tool_use block in response.' }),
    };
  }

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(toolBlock.input),
  };
};
