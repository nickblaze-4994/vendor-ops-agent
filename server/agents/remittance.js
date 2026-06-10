// Remittance Agent — answers "what does this payment cover?" / resend remittance.
import {
  findPaymentById,
  findPaymentsForVendor,
  invoicesForPayment,
} from '../services/apLookup.js';
import { result, writeReply } from './shared.js';

const AGENT = 'Remittance Agent';
const INTENT = 'remittance_request';

export async function handle({ entities, confidence, verification }) {
  const vendor = verification.vendor;
  const base = { intent: INTENT, agent: AGENT, vendor, confidence, entities };

  // Resolve which payment the vendor means, from strongest clue to weakest.
  let payment = null;
  let matchBasis = '';

  if (entities.payment_id) {
    payment = findPaymentById(entities.payment_id);
    matchBasis = `payment id ${entities.payment_id}`;
    if (!payment) {
      return result({
        ...base,
        resolved: false,
        action: 'escalate',
        escalation_reason: 'payment_not_found',
        audit_notes: `Payment ${entities.payment_id} not found.`,
      });
    }
  } else {
    const candidates =
      entities.amount != null
        ? findPaymentsForVendor(vendor.vendor_id, { amount: entities.amount })
        : findPaymentsForVendor(vendor.vendor_id);
    matchBasis = entities.amount != null ? `amount $${entities.amount}` : 'most recent payment';

    if (candidates.length === 0) {
      return result({
        ...base,
        resolved: false,
        action: 'escalate',
        escalation_reason: 'payment_not_found',
        audit_notes: `No payment matched (${matchBasis}) for ${vendor.vendor_id}.`,
      });
    }
    if (candidates.length > 1) {
      return result({
        ...base,
        resolved: false,
        action: 'escalate',
        escalation_reason: 'multiple_payments_match',
        audit_notes: `${candidates.length} payments matched ${matchBasis}; ambiguous.`,
      });
    }
    payment = candidates[0];
  }

  if (payment.vendor_id !== vendor.vendor_id) {
    return result({
      ...base,
      resolved: false,
      action: 'escalate',
      escalation_reason: 'payment_belongs_to_other_vendor',
      audit_notes: `Payment ${payment.payment_id} does not belong to ${vendor.vendor_id}.`,
    });
  }

  const invoices = invoicesForPayment(payment);
  const invoiceTotal = invoices.reduce((s, i) => s + (i.approved_amount ?? i.invoice_amount), 0);

  // Totals must reconcile — a mismatch implies a short-pay/dispute, not a clean resend.
  if (Math.abs(invoiceTotal - payment.payment_amount) > 0.01) {
    return result({
      ...base,
      resolved: false,
      action: 'escalate',
      escalation_reason: 'totals_mismatch',
      audit_notes: `Invoice total ${invoiceTotal} != payment ${payment.payment_amount}.`,
    });
  }

  const recipient = vendor.approved_contacts[0];
  const lines = invoices.map((i) => ({
    invoice_id: i.invoice_id,
    amount: i.approved_amount ?? i.invoice_amount,
  }));

  const context = {
    scenario: 'remittance_summary',
    vendor_name: vendor.vendor_name,
    payment_id: payment.payment_id,
    payment_amount: payment.payment_amount,
    payment_method: payment.payment_method,
    sent_date: payment.sent_date,
    invoices: lines,
    deliver_to: recipient,
  };
  const breakdown = lines.map((l) => `Invoice ${l.invoice_id}: $${l.amount.toLocaleString()}`).join('\n');
  const fallback =
    `The $${payment.payment_amount.toLocaleString()} payment (${payment.payment_id}) covers the ` +
    `following invoices:\n\n${breakdown}\n\nThe remittance details have been sent to ${recipient} for your records.`;

  return result({
    ...base,
    entities: { ...entities, payment_id: payment.payment_id },
    resolved: true,
    action: 'reply_to_vendor',
    response: await writeReply({ context, fallback }),
    audit_notes: `Vendor verified by ${verification.method}. Matched on ${matchBasis}; totals reconciled. Sent only to approved contact ${recipient}.`,
  });
}
