// Agent 9: Approval Follow-up.
// Chases internal approvers on stuck invoices. Safe: reminders, context
// summaries, due-date alerts. Human-only: rejections, disputes, high-value.
import { findInvoice, findPurchaseOrder, findVendorById } from '../services/apLookup.js';
import { exceedsHighValue } from '../services/policyGuardrails.js';
import { result, writeReply } from './shared.js';

const AGENT = 'Approval Follow-up Agent';
const INTENT = 'approval_follow_up';
const RECORDS = ['invoices', 'purchase_orders'];

const daysUntil = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export async function handle({ entities, confidence }) {
  const base = { intent: INTENT, agent: AGENT, vendor: null, confidence, entities, records_checked: RECORDS };

  const invoice = findInvoice(entities.invoice_id);
  if (!invoice) {
    return result({
      ...base, resolved: false, action: 'escalate', escalation_reason: 'invoice_not_found',
      audit_notes: `Invoice ${entities.invoice_id || '(none given)'} not found.`,
    });
  }
  const vendor = findVendorById(invoice.vendor_id);
  const vbase = { ...base, vendor };

  if (invoice.approval_status !== 'pending') {
    return result({
      ...vbase, resolved: true, action: 'reply_internal',
      response: `Invoice ${invoice.invoice_id} is already ${invoice.approval_status} — no follow-up needed.`,
      audit_notes: `Approval status is ${invoice.approval_status}; nothing to chase.`,
    });
  }

  if (exceedsHighValue(invoice.invoice_amount)) {
    return result({
      ...vbase, resolved: false, action: 'escalate', escalation_reason: 'high_value_invoice',
      audit_notes: `Invoice ${invoice.invoice_id} ($${invoice.invoice_amount.toLocaleString()}) exceeds the high-value threshold — approval chasing is owned by the AP manager.`,
    });
  }

  const po = findPurchaseOrder(invoice.po_number);
  const dueIn = daysUntil(invoice.due_date);
  const pendingFor = invoice.submitted_date ? daysSince(invoice.submitted_date) : null;
  const urgent = dueIn <= 3;

  const context = {
    scenario: 'approval_reminder',
    invoice_id: invoice.invoice_id,
    vendor_name: vendor?.vendor_name,
    amount: invoice.invoice_amount,
    approver: invoice.assigned_approver,
    due_date: invoice.due_date,
    due_in_days: dueIn,
    pending_days: pendingFor,
    po_number: invoice.po_number,
    receipt_status: po?.receipt_status,
  };
  const fallback =
    `${urgent ? 'URGENT — ' : ''}Reminder sent to ${invoice.assigned_approver}: invoice ${invoice.invoice_id} from ` +
    `${vendor?.vendor_name} ($${invoice.invoice_amount.toLocaleString()}, PO ${invoice.po_number}` +
    `${po?.receipt_status === 'received' ? ', goods received' : ''}) ` +
    `${pendingFor != null ? `has been pending approval for ${pendingFor} days and ` : ''}` +
    `is due ${dueIn <= 0 ? 'today' : `in ${dueIn} day${dueIn === 1 ? '' : 's'}`}. ` +
    `${urgent ? 'A due-date alert was also raised to the AP operator with a backup-approver option.' : ''}`;

  return result({
    ...vbase, resolved: true, action: 'send_approval_reminder',
    response: await writeReply({ context, fallback }),
    audit_notes:
      `Approval reminder to ${invoice.assigned_approver}; due in ${dueIn}d` +
      `${pendingFor != null ? `, pending ${pendingFor}d` : ''}${urgent ? '; escalation path to backup approver flagged' : ''}. ` +
      'Approve/reject stays with the human approver.',
  });
}
