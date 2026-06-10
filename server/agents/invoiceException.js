// Agent 8: Invoice Exception.
// Detects and routes invoice/PO/receipt exceptions before payment starts.
// Safe: detect, summarize, draft correction requests, flag duplicates with a
// hold recommendation. Human-only: approving price differences, paying without
// a PO, overriding duplicate warnings.
import {
  findInvoice,
  findPurchaseOrder,
  findReceiptForPO,
  findDuplicateCandidate,
  findVendorById,
} from '../services/apLookup.js';
import { result, writeReply } from './shared.js';

const AGENT = 'Invoice Exception Agent';
const INTENT = 'invoice_exception';
const RECORDS = ['invoices', 'purchase_orders', 'receipts'];

export async function handle({ rawText, entities, confidence }) {
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

  // Duplicate exception → flag + hold recommendation (override is human-only).
  if (invoice.exception_type === 'duplicate' || /duplicate/i.test(rawText)) {
    const original = findDuplicateCandidate(invoice);
    if (original) {
      return result({
        ...vbase, resolved: true, action: 'flag_duplicate_hold',
        response:
          `Invoice ${invoice.invoice_id} ($${invoice.invoice_amount.toLocaleString()}) matches ` +
          `${original.invoice_id} (${original.invoice_status}, same vendor, same PO ${invoice.po_number}, same amount). ` +
          `It has been flagged as a probable duplicate with a hold recommendation — an AP operator must ` +
          `confirm before it can be released or rejected.`,
        audit_notes: `Duplicate match: ${invoice.invoice_id} ↔ ${original.invoice_id} on vendor+PO+amount. Hold recommended; release/override is human-only.`,
      });
    }
  }

  // Missing PO → ask the internal requester for PO / receipt confirmation.
  const poNumber = invoice.po_number || entities.po_number;
  if (!poNumber) {
    return result({
      ...vbase, resolved: true, action: 'request_po_info',
      response:
        `Invoice ${invoice.invoice_id} from ${vendor?.vendor_name} ($${invoice.invoice_amount.toLocaleString()}) ` +
        `has no PO reference. A request has been drafted to the internal requester to supply the PO number or ` +
        `confirm receipt. Paying without a PO requires AP manager approval, so the invoice stays on hold meanwhile.`,
      audit_notes: `Exception: missing_po. Internal requester message drafted; invoice held. Non-PO payment approval is human-only.`,
    });
  }

  const po = findPurchaseOrder(poNumber);
  if (!po) {
    return result({
      ...vbase, resolved: false, action: 'escalate', escalation_reason: 'invoice_not_found',
      audit_notes: `PO ${poNumber} referenced by ${invoice.invoice_id} does not exist in the PO system.`,
    });
  }

  // Amount mismatch → summarize evidence + draft vendor correction request.
  if (Math.abs(invoice.invoice_amount - po.po_amount) > 0.01) {
    const receipt = findReceiptForPO(po.po_number);
    const diff = invoice.invoice_amount - po.po_amount;
    const context = {
      scenario: 'invoice_po_mismatch',
      invoice_id: invoice.invoice_id, invoice_amount: invoice.invoice_amount,
      po_number: po.po_number, po_amount: po.po_amount,
      received_amount: receipt?.received_amount ?? null,
      difference: diff,
    };
    const fallback =
      `Invoice ${invoice.invoice_id} is $${invoice.invoice_amount.toLocaleString()}, but PO ${po.po_number} ` +
      `authorizes $${po.po_amount.toLocaleString()}` +
      (receipt ? ` and goods receipt ${receipt.receipt_id} confirms $${receipt.received_amount.toLocaleString()} received` : '') +
      `. A correction request has been drafted asking the vendor for a corrected invoice or a credit memo for the ` +
      `$${Math.abs(diff).toLocaleString()} difference. Approving the price difference instead requires the PO owner (${po.buyer_owner}).`;
    return result({
      ...vbase, resolved: true, action: 'request_corrected_invoice',
      response: await writeReply({ context, fallback }),
      audit_notes:
        `Exception: amount_mismatch ($${invoice.invoice_amount} vs PO $${po.po_amount}` +
        `${receipt ? `, receipt $${receipt.received_amount}` : ''}). Vendor correction drafted; price-difference approval is human-only (${po.buyer_owner}).`,
    });
  }

  return result({
    ...vbase, resolved: true, action: 'reply_internal',
    response: `Invoice ${invoice.invoice_id} matches PO ${po.po_number} on amount and vendor — no exception found.`,
    audit_notes: 'Invoice, PO, and receipt records reconcile; no exception detected.',
  });
}
