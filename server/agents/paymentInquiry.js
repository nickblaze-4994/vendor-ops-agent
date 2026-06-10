// Payment Inquiry Agent — answers "where is my payment?" type questions.
import {
  findInvoice,
  findPaymentsForInvoice,
} from '../services/apLookup.js';
import { exceedsHighValue } from '../services/policyGuardrails.js';
import { result, writeReply } from './shared.js';

const AGENT = 'Payment Inquiry Agent';
const INTENT = 'payment_inquiry';

export async function handle({ entities, confidence, verification }) {
  const vendor = verification.vendor;
  const base = { intent: INTENT, agent: AGENT, vendor, confidence, entities };

  const invoiceId = entities.invoice_id;
  if (!invoiceId) {
    return result({
      ...base,
      resolved: false,
      action: 'escalate',
      escalation_reason: 'cannot_identify_invoice',
      audit_notes: 'No invoice/PO reference found to identify the payment.',
    });
  }

  const invoice = findInvoice(invoiceId);
  if (!invoice) {
    return result({
      ...base,
      resolved: false,
      action: 'escalate',
      escalation_reason: 'invoice_not_found',
      audit_notes: `Invoice ${invoiceId} not found in records.`,
    });
  }

  if (invoice.vendor_id !== vendor.vendor_id) {
    return result({
      ...base,
      resolved: false,
      action: 'escalate',
      escalation_reason: 'invoice_belongs_to_other_vendor',
      audit_notes: `Invoice ${invoiceId} is not owned by ${vendor.vendor_id}.`,
    });
  }

  const payments = findPaymentsForInvoice(invoice.invoice_id);

  if (payments.length > 1) {
    return result({
      ...base,
      resolved: false,
      action: 'escalate',
      escalation_reason: 'multiple_payments_match',
      audit_notes: `Invoice ${invoiceId} matched ${payments.length} payments.`,
    });
  }

  const payment = payments[0] || null;

  // No payment yet — only "clean" if the invoice is legitimately still in the pipeline.
  if (!payment) {
    if (invoice.invoice_status === 'pending_approval') {
      const context = {
        scenario: 'invoice_pending_approval',
        vendor_name: vendor.vendor_name,
        invoice_id: invoice.invoice_id,
        invoice_status: invoice.invoice_status,
        due_date: invoice.due_date,
      };
      const fallback =
        `Invoice ${invoice.invoice_id} has been received and is currently awaiting internal ` +
        `approval. It has not been scheduled for payment yet. Once approved it will be paid ` +
        `ahead of the ${invoice.due_date} due date.`;
      return result({
        ...base,
        resolved: true,
        action: 'reply_to_vendor',
        response: await writeReply({ context, fallback }),
        audit_notes: 'Invoice verified, awaiting approval, no payment record yet.',
      });
    }
    return result({
      ...base,
      resolved: false,
      action: 'escalate',
      escalation_reason: 'invoice_approved_but_no_payment',
      audit_notes: `Invoice ${invoiceId} is ${invoice.invoice_status} but has no payment record.`,
    });
  }

  if (payment.payment_status === 'failed') {
    return result({
      ...base,
      resolved: false,
      action: 'escalate',
      escalation_reason: 'payment_failed',
      audit_notes: `Payment ${payment.payment_id} failed (${payment.failure_reason}).`,
    });
  }

  if (exceedsHighValue(payment.payment_amount)) {
    return result({
      ...base,
      resolved: false,
      action: 'escalate',
      escalation_reason: 'high_value_payment',
      audit_notes: `Payment ${payment.payment_id} exceeds high-value threshold.`,
    });
  }

  const context = {
    scenario: 'payment_status',
    vendor_name: vendor.vendor_name,
    invoice_id: invoice.invoice_id,
    approval_date: invoice.approval_date,
    payment_method: payment.payment_method,
    payment_status: payment.payment_status,
    sent_date: payment.sent_date,
    settlement_date: payment.settlement_date,
  };
  const settle = payment.settlement_date
    ? ` and is expected to settle on ${payment.settlement_date}`
    : '';
  const fallback =
    `Invoice ${invoice.invoice_id} was approved on ${invoice.approval_date}. ` +
    `Payment was sent by ${payment.payment_method} on ${payment.sent_date}${settle}. ` +
    `No further action is needed on your side.`;

  return result({
    ...base,
    entities: { ...entities, payment_id: payment.payment_id },
    resolved: true,
    action: 'reply_to_vendor',
    response: await writeReply({ context, fallback }),
    audit_notes: `Vendor verified by ${verification.method}. Invoice and payment records matched.`,
  });
}
