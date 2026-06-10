// Agent 10: Duplicate & Late Payment Prevention.
// Detects duplicate-charge risk and late-payment risk before they become vendor
// issues. Safe: flag, explain, recommend, notify. Human-only: holding or
// releasing payments, overriding duplicate warnings.
import { findInvoice, findDuplicateCandidate, findVendorById } from '../services/apLookup.js';
import { result, writeReply } from './shared.js';

const RECORDS = ['invoices', 'payments'];
const daysUntil = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

export async function handle({ intent, entities, confidence }) {
  const agent = 'Duplicate & Late Payment Agent';
  const base = { intent, agent, vendor: null, confidence, entities, records_checked: RECORDS };

  const invoice = findInvoice(entities.invoice_id);
  if (!invoice) {
    return result({
      ...base, resolved: false, action: 'escalate', escalation_reason: 'invoice_not_found',
      audit_notes: `Invoice ${entities.invoice_id || '(none given)'} not found.`,
    });
  }
  const vendor = findVendorById(invoice.vendor_id);
  const vbase = { ...base, vendor };

  if (intent === 'duplicate_payment_risk') {
    const other = entities.invoice_ids?.length > 1
      ? findInvoice(entities.invoice_ids[1])
      : findDuplicateCandidate(invoice);
    if (!other) {
      return result({
        ...vbase, resolved: true, action: 'reply_internal',
        response: `No duplicate match found for ${invoice.invoice_id} on vendor, amount, and PO — no risk flag raised.`,
        audit_notes: 'Duplicate scan on vendor+amount+PO found no match.',
      });
    }
    const fields = [
      `vendor ${invoice.vendor_id}`,
      Math.abs(invoice.invoice_amount - other.invoice_amount) < 0.01 ? `same amount $${invoice.invoice_amount.toLocaleString()}` : null,
      invoice.po_number === other.po_number ? `same PO ${invoice.po_number}` : null,
    ].filter(Boolean).join(', ');
    const context = {
      scenario: 'duplicate_risk',
      invoice_id: invoice.invoice_id, matched_invoice: other.invoice_id,
      matched_on: fields, other_status: other.invoice_status,
    };
    const fallback =
      `Duplicate risk flagged: ${invoice.invoice_id} matches ${other.invoice_id} (${other.invoice_status}) on ${fields}. ` +
      `Recommendation: hold ${invoice.invoice_id} pending operator review — ${other.invoice_id} ` +
      `${other.invoice_status === 'paid' ? 'has already been paid' : 'is already in the pipeline'}. ` +
      `The AP operator has been notified; releasing or rejecting it is their call.`;
    return result({
      ...vbase, resolved: true, action: 'flag_duplicate_risk',
      response: await writeReply({ context, fallback }),
      audit_notes: `Duplicate pair ${invoice.invoice_id} ↔ ${other.invoice_id} matched on ${fields}. Hold recommended + operator notified; override is human-only.`,
    });
  }

  // late_payment_risk
  const dueIn = daysUntil(invoice.due_date);
  const blocked = invoice.approval_status === 'pending';
  const context = {
    scenario: 'late_payment_risk',
    invoice_id: invoice.invoice_id, vendor_name: vendor?.vendor_name,
    due_date: invoice.due_date, due_in_days: dueIn,
    blocker: blocked ? `awaiting approval from ${invoice.assigned_approver}` : 'not scheduled for payment',
  };
  const fallback =
    `Late-payment risk: invoice ${invoice.invoice_id} from ${vendor?.vendor_name} ` +
    `($${invoice.invoice_amount.toLocaleString()}) is due ${dueIn <= 0 ? 'today' : `in ${dueIn} day${dueIn === 1 ? '' : 's'}`} ` +
    `but is ${blocked ? `still awaiting approval from ${invoice.assigned_approver}` : 'not yet scheduled'}. ` +
    `An urgent reminder was sent${blocked ? ` to ${invoice.assigned_approver}` : ''} and the AP operator was alerted ` +
    `so payment can be scheduled the moment it clears.`;
  return result({
    ...vbase, resolved: true, action: 'late_payment_alert',
    response: await writeReply({ context, fallback }),
    audit_notes: `Late risk: due in ${dueIn}d, blocker=${blocked ? 'pending approval' : 'unscheduled'}. Reminder + operator alert sent; scheduling/holding payment is human-only.`,
  });
}
