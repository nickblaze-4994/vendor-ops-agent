// Language layer. The LLM does ONLY language work: intent classification,
// entity extraction, and response wording. All decisions and data lookups
// happen in deterministic code elsewhere. If no API key is configured we fall
// back to a rules engine so the prototype always runs.
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config, llmEnabled } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptsDir = join(__dirname, '..', 'prompts');
const prompt = (name) => readFileSync(join(promptsDir, name), 'utf8');

const ROUTER_PROMPT = prompt('router_prompt.md');
const RESPONSE_PROMPT = prompt('response_prompt.md');

const client = llmEnabled ? new Anthropic({ apiKey: config.apiKey }) : null;

const INTENTS = [
  'payment_inquiry',
  'remittance_request',
  'vendor_outreach',
  'failed_payment',
  'reconciliation_break',
  'vendor_data_update_request',
  'invoice_exception',
  'approval_follow_up',
  'duplicate_payment_risk',
  'late_payment_risk',
  'payment_method_optimization',
  'bank_change_request',
  'fraud_or_dispute',
  'tax_or_legal_request',
  'unknown',
];

const classifyTool = {
  name: 'classify',
  description: 'Return the intent, confidence, and extracted entities for the message.',
  input_schema: {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: INTENTS },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      reasoning: { type: 'string' },
      entities: {
        type: 'object',
        properties: {
          invoice_id: { type: 'string' },
          invoice_ids: { type: 'array', items: { type: 'string' } },
          po_number: { type: 'string' },
          payment_id: { type: 'string' },
          vendor_id: { type: 'string' },
          amount: { type: 'number' },
          date: { type: 'string' },
          vendor_clue: { type: 'string' },
          update_type: { type: 'string' },
        },
      },
    },
    required: ['intent', 'confidence', 'entities'],
  },
};

export async function classifyAndExtract({ rawText, senderEmail }) {
  if (!client) return ruleClassify({ rawText });

  try {
    const msg = await client.messages.create({
      model: config.model,
      max_tokens: 400,
      system: ROUTER_PROMPT,
      tools: [classifyTool],
      tool_choice: { type: 'tool', name: 'classify' },
      messages: [
        {
          role: 'user',
          content: `Sender: ${senderEmail || '(unknown)'}\n\nMessage:\n${rawText}`,
        },
      ],
    });
    const block = msg.content.find((b) => b.type === 'tool_use');
    if (!block) return ruleClassify({ rawText });
    const out = block.input;
    return {
      intent: out.intent,
      confidence: out.confidence,
      reasoning: out.reasoning || '',
      entities: out.entities || {},
      via: 'llm',
    };
  } catch (err) {
    return { ...ruleClassify({ rawText }), llm_error: String(err?.message || err) };
  }
}

export async function generateResponse({ context }) {
  if (!client) return null; // caller uses its template fallback
  try {
    const msg = await client.messages.create({
      model: config.model,
      max_tokens: 350,
      system: RESPONSE_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Structured context (JSON):\n${JSON.stringify(context, null, 2)}\n\nWrite the reply.`,
        },
      ],
    });
    const text = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return text || null;
  } catch {
    return null;
  }
}

// ----------------------- deterministic fallback router -----------------------
function ruleClassify({ rawText }) {
  const t = rawText.toLowerCase();
  const entities = extractEntities(rawText);
  const has = (...words) => words.some((w) => t.includes(w));
  const changeVerb = /\b(chang\w*|updat\w*|new|switch\w*|correct\w*)\b/.test(t);

  let intent = 'unknown';
  let confidence = 0.55;

  if (changeVerb && has('bank', 'account number', 'account details', 'routing', 'iban', 'swift')) {
    intent = 'bank_change_request';
    confidence = 0.95;
  } else if (has('fraud', 'fraudulent', 'wrong amount', 'missing $', 'short paid', 'dispute', 'unauthorized')) {
    intent = 'fraud_or_dispute';
    confidence = 0.92;
  } else if (has('lawsuit', 'legal action', 'attorney', 'subpoena', 'tax dispute', 'tax penalty')) {
    intent = 'tax_or_legal_request';
    confidence = 0.9;
  } else if (has('failed', 'could not be processed', 'not been cashed', 'was returned', 'bounced', 'declined')) {
    intent = 'failed_payment';
    confidence = 0.88;
  } else if (has('erp says', 'general ledger', 'reconcil', 'rail says', 'posted in corpay', 'not in the gl')) {
    intent = 'reconciliation_break';
    confidence = 0.86;
  } else if (changeVerb && has('address', 'tax form', 'contact info', 'phone number', 'remit-to', 'w-9')) {
    intent = 'vendor_data_update_request';
    confidence = 0.85;
  } else if (has('looks similar')) {
    intent = 'duplicate_payment_risk';
    confidence = 0.85;
  } else if (has('no po number', 'missing po', 'duplicate', 'mismatch', 'but po ')) {
    intent = 'invoice_exception';
    confidence = 0.84;
  } else if (has('pending approval', 'reminder to approver', 'approver for')) {
    intent = 'approval_follow_up';
    confidence = 0.86;
  } else if (/due (tomorrow|today|in \d+ days?)[^.]*not (yet )?approved/.test(t) || has('overdue and not approved')) {
    intent = 'late_payment_risk';
    confidence = 0.84;
  } else if (has('accepts virtual card', 'accepts ach', 'still paid by check', 'should be moved', 'rebate opportunit', 'payment method optimization')) {
    intent = 'payment_method_optimization';
    confidence = 0.82;
  } else if (has('remittance', 'what invoices', 'invoices are included', 'invoices does this', 'deposit but', "what it is for", "what it's for")) {
    intent = 'remittance_request';
    confidence = 0.85;
  } else if (has('where is', 'have not received', "haven't received", 'not received', 'not been paid', 'not paid yet', 'where is my payment', 'payment status', 'when will')) {
    intent = 'payment_inquiry';
    confidence = 0.85;
  } else if (has('enroll', 'onboard', 'switch from check', 'switch to ach', 'electronic payment', 'virtual card', 'follow-up to vendors', 'follow up to vendors')) {
    intent = 'vendor_outreach';
    confidence = 0.8;
  } else if (entities.payment_id) {
    intent = 'remittance_request';
    confidence = 0.6;
  } else if (entities.invoice_id) {
    intent = 'payment_inquiry';
    confidence = 0.6;
  }

  return { intent, confidence, reasoning: 'rule-based fallback (no API key)', entities, via: 'rules' };
}

function extractEntities(text) {
  const entities = {};
  // Prefer full "INV-1007" style tokens; otherwise fall back to "invoice 8842".
  const invAll = [...text.matchAll(/\bINV-?\d+\b/gi)].map((m) =>
    m[0].toUpperCase().replace(/^INV-?/, 'INV-'),
  );
  if (invAll.length > 0) {
    entities.invoice_id = invAll[0];
    if (invAll.length > 1) entities.invoice_ids = invAll;
  } else {
    const inv = text.match(/\b(?:invoice|inv)\.?\s*#?\s*(\d+)\b/i);
    if (inv) entities.invoice_id = inv[1];
  }
  const pay = text.match(/\bP\d{3,}\b/i);
  if (pay) entities.payment_id = pay[0].toUpperCase();
  const po = text.match(/\bPO-\d+/i) || text.match(/\bPO\s+(\d+)\b/i);
  if (po) entities.po_number = po[0].toUpperCase().replace(/\s+/, '-');
  const ven = text.match(/\bV\d{4}\b/);
  if (ven) entities.vendor_id = ven[0].toUpperCase();
  const amt = text.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
  if (amt) entities.amount = Number(amt[1].replace(/,/g, ''));
  return entities;
}

export { llmEnabled };
