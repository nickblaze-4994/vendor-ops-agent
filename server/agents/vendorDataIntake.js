// Agent 7: Vendor Data Maintenance Intake.
// Classifies vendor master-data update requests and routes them to the secure
// portal. Never accepts or applies sensitive details directly — bank changes,
// legal name changes, and M&A updates always escalate (bank changes are also
// caught upstream by the hard guardrail screen).
import { result, writeReply } from './shared.js';

const AGENT = 'Vendor Data Intake Agent';
const INTENT = 'vendor_data_update_request';
const RECORDS = ['vendors', 'vendor_update_requests'];
const PORTAL_LINK = 'https://portal.example-ap.com/vendor/{TOKEN}/profile';

function classifyUpdate(text) {
  const t = text.toLowerCase();
  if (/(bank|account number|routing|iban|swift)/.test(t)) return { type: 'bank_account_change', risk: 'high' };
  if (/(legal name|renamed|name change)/.test(t)) return { type: 'vendor_name_change', risk: 'high' };
  if (/(merger|acquisition|acquired)/.test(t)) return { type: 'merger_or_acquisition', risk: 'high' };
  if (/tax form|w-?9|w-?8/.test(t)) return { type: 'tax_form_update', risk: 'low', fields: ['current-year tax form upload'] };
  if (/address/.test(t)) return { type: 'address_update', risk: 'low', fields: ['remit-to address', 'effective date'] };
  if (/(contact|phone|email)/.test(t)) return { type: 'contact_update', risk: 'low', fields: ['contact name', 'email', 'phone'] };
  if (/(payment preference|payment method)/.test(t)) return { type: 'payment_preference_change', risk: 'low', fields: ['preferred method'] };
  return { type: 'unclassified_update', risk: 'high' };
}

export async function handle({ rawText, entities, confidence, verification }) {
  const vendor = verification.vendor;
  const base = { intent: INTENT, agent: AGENT, vendor, confidence, entities, records_checked: RECORDS };
  const update = classifyUpdate(rawText);

  if (update.risk === 'high') {
    return result({
      ...base,
      entities: { ...entities, update_type: update.type },
      resolved: false, action: 'escalate', escalation_reason: update.type,
      audit_notes: `Update classified as ${update.type} (high-risk). Sensitive master-data changes are human-only; vendor will be directed to the secure portal by the specialist.`,
    });
  }

  const context = {
    scenario: 'vendor_data_intake',
    vendor_name: vendor.vendor_name,
    update_type: update.type,
    required_fields: update.fields,
    portal_link: PORTAL_LINK,
  };
  const fallback =
    `Happy to help with your ${update.type.replace(/_/g, ' ')}. For security, all profile changes go through ` +
    `our portal — please use the secure link below and provide: ${update.fields.join(', ')}.\n\n` +
    `Secure update link: ${PORTAL_LINK}\n\n` +
    `We'll confirm once the update is reviewed. Note that we never accept bank detail changes by email.`;

  return result({
    ...base,
    entities: { ...entities, update_type: update.type },
    resolved: true, action: 'send_secure_portal_link',
    response: await writeReply({ context, fallback }),
    audit_notes: `Vendor verified by ${verification.method}. ${update.type} classified low-risk; intake request logged, secure portal link sent, completion will be chased automatically.`,
  });
}
