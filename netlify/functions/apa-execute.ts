import Anthropic from '@anthropic-ai/sdk';
import type { Handler, HandlerEvent } from '@netlify/functions';

// ── CORS headers ──────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── PII guard: reject prompts containing unmasked sensitive data ──────────────
// Patterns: Israeli 9-digit ID, IBAN, ₪ currency, IL-XXX-XXX account format,
// credit card numbers, SSN-like patterns, bare email addresses.
const PII_PATTERNS: RegExp[] = [
  /\b\d{9}\b/,                                    // Israeli ID / 9-digit number
  /\bIL\d{2}[\d\s]{15,}\b/i,                      // IBAN starting with IL
  /₪\s*[\d,.]+/,                                   // Israeli shekel amounts
  /\b[A-Z]{2}-\d{3}-\d{3}\b/,                     // IL-XXX-XXX account format
  /\b(?:\d[ -]?){13,16}\b/,                        // credit card (13–16 digits)
  /\b\d{3}-\d{2}-\d{4}\b/,                         // SSN
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, // email
];

function containsPII(text: string): boolean {
  // Allow tokens like [CLIENT_NAME] — strip those before checking
  const stripped = text.replace(/\[[A-Z0-9_]+\]/g, '');
  return PII_PATTERNS.some(re => re.test(stripped));
}

// ── Handler ───────────────────────────────────────────────────────────────────
interface CloudTask {
  id: number;
  cloudPrompt: string;
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  let tasks: CloudTask[];
  try {
    ({ tasks } = JSON.parse(event.body ?? '{}'));
    if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('Missing tasks');
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  // Belt-and-suspenders PII guard on every cloud prompt
  for (const task of tasks) {
    if (containsPII(task.cloudPrompt ?? '')) {
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({
          error: `Task ${task.id} contains unmasked PII. Masking must be applied before sending to cloud.`,
        }),
      };
    }
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const SYSTEM = `You are a helpful AI assistant executing a sub-task as part of a larger privacy-preserving workflow.
The user's prompt may contain placeholder tokens like [CLIENT_NAME] or [ACCOUNT_ID].
Treat these tokens as opaque identifiers — do NOT replace them with real values.
Keep all placeholder tokens exactly as-is in your response.
Be concise and focused on the specific task.`;

  // Execute all cloud tasks in parallel
  const results = await Promise.all(
    tasks.map(async task => {
      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 700,
          system: SYSTEM,
          messages: [{ role: 'user', content: task.cloudPrompt }],
        });
        const text = response.content
          .filter(b => b.type === 'text')
          .map(b => (b as Anthropic.TextBlock).text)
          .join('');
        return { id: task.id, response: text, error: null };
      } catch (err) {
        return { id: task.id, response: null, error: String(err) };
      }
    })
  );

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ results }),
  };
};
