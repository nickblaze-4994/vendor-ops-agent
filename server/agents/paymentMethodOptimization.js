// Agent 11: Payment Method Optimization.
// Recommends the best payment method per vendor (cost, speed, rebate, risk)
// and triggers Vendor Outreach for conversions. Human-only: strategic-vendor
// terms, fee negotiation, policy overrides.
import { db, findVendorById } from '../services/apLookup.js';
import { result, writeReply } from './shared.js';

const AGENT = 'Payment Method Optimization Agent';
const INTENT = 'payment_method_optimization';
const RECORDS = ['vendors', 'invoices', 'payments'];
const VC_REBATE_RATE = 0.015; // illustrative virtual-card rebate

const annualSpend = (vendorId) =>
  db.invoices
    .filter((i) => i.vendor_id === vendorId)
    .reduce((s, i) => s + i.invoice_amount, 0) * 4; // rough annualization of the sample window

function recommendation(vendor) {
  const accepted = vendor.accepted_payment_methods || [];
  const spend = annualSpend(vendor.vendor_id);
  if (vendor.payment_method !== 'check') return null;
  if (accepted.includes('virtual_card')) {
    return { to: 'virtual card', rebate: Math.round(spend * VC_REBATE_RATE), spend };
  }
  if (accepted.includes('ach')) {
    return { to: 'ACH', rebate: 0, spend };
  }
  return null;
}

export async function handle({ rawText, entities, confidence }) {
  const base = { intent: INTENT, agent: AGENT, vendor: null, confidence, entities, records_checked: RECORDS };

  // Single-vendor case (by id or name in the message).
  const named =
    findVendorById(entities.vendor_id) ||
    db.vendors.find((v) => rawText.toLowerCase().includes(v.vendor_name.toLowerCase())) ||
    null;

  if (named) {
    const rec = recommendation(named);
    if (!rec) {
      return result({
        ...base, vendor: named, resolved: true, action: 'reply_internal',
        response: `${named.vendor_name} is already on ${named.payment_method} — no conversion opportunity found.`,
        audit_notes: 'No better accepted method than the current one.',
      });
    }
    if (named.strategic_vendor || named.risk_level === 'high') {
      return result({
        ...base, vendor: named, resolved: false, action: 'escalate',
        escalation_reason: 'high_value_strategic_vendor',
        audit_notes:
          `Recommendation prepared: convert ${named.vendor_name} from check to ${rec.to}` +
          `${rec.rebate ? ` (~$${rec.rebate.toLocaleString()}/yr rebate on ~$${rec.spend.toLocaleString()} spend)` : ''}. ` +
          'Vendor is strategic/high-risk, so terms and outreach are owned by the strategic vendor manager.',
      });
    }
    const context = {
      scenario: 'method_recommendation', vendor_name: named.vendor_name,
      from: named.payment_method, to: rec.to,
      est_annual_rebate: rec.rebate, est_annual_spend: rec.spend,
    };
    const fallback =
      `Recommendation: convert ${named.vendor_name} from check to ${rec.to}. ` +
      `Estimated annual spend ~$${rec.spend.toLocaleString()}` +
      (rec.rebate ? `, projected rebate ~$${rec.rebate.toLocaleString()}/yr at card rates` : ', eliminating check costs and mail delays') +
      `. An outreach task has been handed to the Vendor Outreach Agent with the secure enrollment link.`;
    return result({
      ...base, vendor: named, resolved: true, action: 'trigger_outreach',
      response: await writeReply({ context, fallback }),
      audit_notes: `Method recommendation check→${rec.to} (accepted methods: ${named.accepted_payment_methods.join('/')}). Outreach task created; no method changed directly.`,
    });
  }

  // Batch case: rank all conversion candidates.
  const candidates = db.vendors
    .map((v) => ({ v, rec: recommendation(v) }))
    .filter((x) => x.rec);
  const auto = candidates.filter(({ v }) => !v.strategic_vendor && v.risk_level !== 'high');
  const held = candidates.filter(({ v }) => v.strategic_vendor || v.risk_level === 'high');

  if (candidates.length === 0) {
    return result({
      ...base, resolved: true, action: 'reply_internal',
      response: 'All vendors are already on their best accepted payment method — no conversions to recommend.',
      audit_notes: 'Batch scan found no conversion candidates.',
    });
  }
  const lines = auto
    .sort((a, b) => b.rec.spend - a.rec.spend)
    .map(({ v, rec }) =>
      `• ${v.vendor_name} (${v.vendor_id}): check → ${rec.to}` +
      (rec.rebate ? ` — est. rebate ~$${rec.rebate.toLocaleString()}/yr` : ''),
    )
    .join('\n');
  return result({
    ...base, resolved: true, action: 'trigger_outreach',
    response:
      `Conversion candidates, ranked by spend:\n\n${lines}\n\nOutreach tasks were handed to the Vendor Outreach Agent.` +
      (held.length ? `\n\nHeld for the strategic vendor manager: ${held.map(({ v }) => v.vendor_name).join(', ')}.` : ''),
    audit_notes:
      `Batch optimization: ${auto.length} outreach task(s) triggered` +
      (held.length ? `; ${held.map(({ v }) => v.vendor_id).join(', ')} held (strategic/high-risk)` : '') + '.',
  });
}
