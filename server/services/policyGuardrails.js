// Deterministic policy & risk guardrails.
// These run independently of the LLM. The LLM can never override an escalation
// decided here — this is what makes "100% high-risk escalation" achievable and
// keeps the sensitive path auditable.
import { config } from './config.js';

// Defense-in-depth keyword screen on the RAW message, regardless of how the
// LLM router classified it. If any of these fire, we escalate no matter what.
const HARD_ESCALATION_PATTERNS = [
  { re: /\b(chang\w*|updat\w*|new|correct\w*|switch\w*)\b[^.]*\b(banks?|account number|account details|routing|iban|swift|wire details)\b/i, reason: 'bank_change_request' },
  { re: /\b(bank account|routing number|account number)\b[^.]*\b(chang\w*|updat\w*|new)\b/i, reason: 'bank_change_request' },
  { re: /\bfraud|fraudulent|scam|unauthorized\b/i, reason: 'fraud_or_dispute' },
  { re: /\b(wrong amount|missing \$?\d|short ?paid|underpaid|overpaid|incorrect amount|dispute)\b/i, reason: 'payment_dispute' },
  { re: /\b(lawsuit|legal action|attorney|subpoena|tax dispute|tax penalt\w*|1099 dispute)\b/i, reason: 'legal_or_tax' },
  { re: /\b(approve|release|authorize)\b[^.]*\b(payment|invoice|funds)\b/i, reason: 'payment_approval_request' },
];

// Intents that always go to a human.
const ESCALATION_INTENTS = new Set([
  'bank_change_request',
  'fraud_or_dispute',
  'tax_or_legal_request',
]);

// Intents triggered by internal ops staff or system events (ERP, payment rails,
// approval queues) rather than an inbound vendor email — these are not gated on
// vendor identity verification.
export const INTERNAL_EVENT_INTENTS = new Set([
  'vendor_outreach',
  'failed_payment',
  'reconciliation_break',
  'invoice_exception',
  'approval_follow_up',
  'duplicate_payment_risk',
  'late_payment_risk',
  'payment_method_optimization',
]);

export function screenMessage(rawText = '') {
  for (const { re, reason } of HARD_ESCALATION_PATTERNS) {
    if (re.test(rawText)) return { forceEscalate: true, reason };
  }
  return { forceEscalate: false, reason: null };
}

// Shared gate applied to every message before a specialist agent acts.
// Returns { escalate, reason } or { escalate:false }.
export function preflight({ rawText, intent, confidence, verification }) {
  const screen = screenMessage(rawText);
  if (screen.forceEscalate) return { escalate: true, reason: screen.reason };

  if (ESCALATION_INTENTS.has(intent)) {
    return { escalate: true, reason: intent };
  }

  if (intent === 'unknown') {
    return { escalate: true, reason: 'unknown_intent' };
  }

  if (typeof confidence === 'number' && confidence < config.minConfidence) {
    return { escalate: true, reason: 'low_confidence' };
  }

  if (!INTERNAL_EVENT_INTENTS.has(intent) && !verification?.verified) {
    return { escalate: true, reason: verification?.reason || 'vendor_not_verified' };
  }

  return { escalate: false, reason: null };
}

export function exceedsHighValue(amount) {
  return typeof amount === 'number' && amount > config.highValueThreshold;
}

// Strip data that must never reach a vendor-facing response, as a final pass.
export function redact(text = '') {
  return text
    // any 8+ digit run that looks like a full account number
    .replace(/\b\d{8,}\b/g, '••••••')
    // explicit risk-level leakage
    .replace(/\brisk[_ ]?level\b\s*[:=]?\s*\w+/gi, '[internal]');
}
