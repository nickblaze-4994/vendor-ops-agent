// Vendor Outreach Agent — drafts onboarding / payment-method conversion outreach.
// Input is an internal instruction from ops staff, not an inbound vendor email,
// so the target vendor is identified from the message text (by name) or the
// whole not-enrolled cohort for a batch instruction. No real email is sent;
// the agent drafts the message and proposes an outreach status update.
import { db, vendorsNeedingOutreach } from '../services/apLookup.js';
import { result, writeReply } from './shared.js';

const AGENT = 'Vendor Outreach Agent';
const INTENT = 'vendor_outreach';
const PORTAL_LINK = 'https://portal.example-ap.com/onboard/{TOKEN}';

function findNamedVendor(text) {
  const t = text.toLowerCase();
  return db.vendors.find((v) => t.includes(v.vendor_name.toLowerCase())) || null;
}

async function draftFor(vendor) {
  const context = {
    scenario: 'vendor_outreach',
    vendor_name: vendor.vendor_name,
    current_method: vendor.payment_method,
    portal_link: PORTAL_LINK,
    options: ['ACH', 'virtual card'],
  };
  const fallback =
    `Hello,\n\nWe are helping your customer move supplier payments to electronic payment. ` +
    `Our records show ${vendor.vendor_name} is currently paid by ${vendor.payment_method}. ` +
    `Please use the secure link below to confirm your preferred payment method (ACH or virtual card):\n\n` +
    `${PORTAL_LINK}\n\nThis reduces delays and gives you better visibility into payment status and ` +
    `remittance details. Bank details should only ever be entered through this secure portal — ` +
    `we will never ask for them by email.`;
  return writeReply({ context, fallback });
}

export async function handle({ rawText, entities, confidence, verification }) {
  const base = { intent: INTENT, agent: AGENT, vendor: null, confidence, entities };

  // Resolve targets.
  const named = findNamedVendor(rawText);
  const targets = named ? [named] : vendorsNeedingOutreach();

  if (targets.length === 0) {
    return result({
      ...base,
      resolved: true,
      action: 'no_action',
      response: 'All vendors are already enrolled in electronic payment. No outreach needed.',
      audit_notes: 'No vendors require outreach.',
    });
  }

  // High-risk / strategic vendors are not auto-contacted — escalate to a human owner.
  const autoTargets = targets.filter((v) => v.risk_level !== 'high');
  const escalated = targets.filter((v) => v.risk_level === 'high');

  if (autoTargets.length === 0) {
    return result({
      ...base,
      vendor: targets[0],
      resolved: false,
      action: 'escalate',
      escalation_reason: 'high_value_strategic_vendor',
      audit_notes: `Target(s) ${escalated.map((v) => v.vendor_id).join(', ')} are high-risk/strategic; routed to a human owner.`,
    });
  }

  const primary = autoTargets[0];
  const draft = await draftFor(primary);
  const escalatedNote = escalated.length
    ? ` Held for human review (high-risk/strategic): ${escalated.map((v) => v.vendor_name).join(', ')}.`
    : '';

  const summary = named
    ? draft
    : `Drafted outreach to ${autoTargets.length} vendor(s) not enrolled in electronic payment: ` +
      `${autoTargets.map((v) => v.vendor_name).join(', ')}.\n\nSample message:\n\n${draft}`;

  return result({
    ...base,
    vendor: primary,
    resolved: true,
    action: 'send_outreach',
    response: summary,
    audit_notes:
      `Outreach drafted for ${autoTargets.map((v) => v.vendor_id).join(', ')}; ` +
      `outreach_status -> contacted.${escalatedNote}`,
  });
}
