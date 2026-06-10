// Helpers shared by specialist agents.
import { generateResponse } from '../services/llm.js';
import { redact } from '../services/policyGuardrails.js';

export function result({
  intent,
  agent,
  vendor,
  resolved,
  confidence,
  entities = {},
  action,
  response = null,
  escalation_reason = null,
  audit_notes = '',
  records_checked = [],
}) {
  return {
    intent,
    agent,
    vendor_id: vendor?.vendor_id ?? null,
    resolved,
    confidence,
    entities,
    records_checked,
    action,
    response: response ? redact(response) : null,
    escalation_reason,
    audit_notes,
  };
}

// Produce vendor-facing text via the LLM, falling back to a template string
// when the LLM is unavailable (no key / error).
export async function writeReply({ context, fallback }) {
  const llmText = await generateResponse({ context });
  return llmText || fallback;
}

export const escalationReply =
  'Thank you for reaching out. This request needs review by a specialist on our ' +
  'AP team, who will follow up with you shortly. We are not able to action it automatically.';
