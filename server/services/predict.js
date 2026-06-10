// Pre-triage prediction: a fast, lookup-free read on how a message will land
// (auto-resolvable vs escalation vs needs review) so the inbox can flag every
// ticket BEFORE anyone opens it. Mirrors the preflight guardrails + identity
// check, but performs no record lookups and writes nothing to the audit log.
import { classifyAndExtract } from './llm.js';
import { screenMessage, INTERNAL_EVENT_INTENTS } from './policyGuardrails.js';
import { verifyVendor } from './identityCheck.js';
import { routeEscalation, HIGH_RISK_REASONS } from './routing.js';
import { config } from './config.js';

export async function predictDisposition({ rawText, senderEmail }) {
  const cls = await classifyAndExtract({ rawText, senderEmail });
  const base = { intent: cls.intent, confidence: cls.confidence };

  const screen = screenMessage(rawText);
  const escalateReason = screen.forceEscalate
    ? screen.reason
    : ['bank_change_request', 'fraud_or_dispute', 'tax_or_legal_request'].includes(cls.intent)
      ? cls.intent
      : null;

  if (escalateReason) {
    const route = routeEscalation(escalateReason);
    return {
      ...base,
      prediction: 'escalation',
      severity: HIGH_RISK_REASONS.has(escalateReason) ? 'high' : 'normal',
      reason: escalateReason,
      team: route.team,
      priority: route.priority,
    };
  }

  if (cls.intent === 'unknown' || (typeof cls.confidence === 'number' && cls.confidence < config.minConfidence)) {
    return {
      ...base,
      prediction: 'review',
      reason: cls.intent === 'unknown' ? 'unknown_intent' : 'low_confidence',
    };
  }

  const verification = verifyVendor({ senderEmail });
  if (!INTERNAL_EVENT_INTENTS.has(cls.intent) && !verification.verified) {
    const route = routeEscalation('vendor_not_verified');
    return {
      ...base,
      prediction: 'escalation',
      severity: 'normal',
      reason: 'vendor_not_verified',
      team: route.team,
      priority: route.priority,
    };
  }

  return { ...base, prediction: 'auto', reason: null };
}
