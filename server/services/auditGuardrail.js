// Agent 12: Audit and Guardrail Agent.
// Final-pass review of EVERY specialist output before it is sent or actioned.
// Deterministic — the LLM cannot influence these checks. If any hard check
// fails on a resolved outcome, the case is blocked and escalated instead.
import { config } from './config.js';
import { screenMessage, INTERNAL_EVENT_INTENTS } from './policyGuardrails.js';

const FORBIDDEN_ACTIONS = new Set([
  'approve_payment',
  'release_payment',
  'change_bank_details',
  'edit_vendor_banking',
  'modify_erp_journal',
]);

export function guardrailReview(outcome, { rawText, verification }) {
  const checks = [];
  const add = (name, pass, note) => checks.push({ name, pass, ...(note ? { note } : {}) });

  const internal = INTERNAL_EVENT_INTENTS.has(outcome.intent);
  add(
    'vendor_identity',
    !outcome.resolved || internal || Boolean(verification?.verified),
    internal ? 'internal event — identity gate not applicable' : undefined,
  );

  add('no_forbidden_action', !FORBIDDEN_ACTIONS.has(outcome.action));

  const resp = outcome.response || '';
  const leakage =
    /\b\d{8,}\b/.test(resp) || /\brisk[_ ]?(level|score)\b/i.test(resp) || /\bfraud rule/i.test(resp);
  add('no_sensitive_data', !leakage);

  add(
    'confidence_threshold',
    !outcome.resolved || outcome.confidence == null || outcome.confidence >= config.minConfidence,
  );

  // A message that trips the hard escalation screen must never end up resolved.
  add('escalation_rules_followed', !(screenMessage(rawText).forceEscalate && outcome.resolved));

  return { agent: 'Audit & Guardrail Agent', passed: checks.every((c) => c.pass), checks };
}
