// Read-only access layer over the mock AP "systems of record".
// In a real deployment these would be ERP / payment-rail / portal API calls.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');

const load = (name) => JSON.parse(readFileSync(join(dataDir, name), 'utf8'));

export const db = {
  vendors: load('vendors.json'),
  invoices: load('invoices.json'),
  payments: load('payments.json'),
  remittances: load('remittances.json'),
  purchaseOrders: load('purchase_orders.json'),
  receipts: load('receipts.json'),
  erpRecords: load('erp_records.json'),
  railStatuses: load('rail_statuses.json'),
  vendorUpdateRequests: load('vendor_update_requests.json'),
  outreachCampaigns: load('outreach_campaigns.json'),
};

const norm = (s) => String(s ?? '').trim().toLowerCase();

export function findVendorById(vendorId) {
  return db.vendors.find((v) => norm(v.vendor_id) === norm(vendorId)) || null;
}

export function findVendorByEmail(email) {
  if (!email) return null;
  const e = norm(email);
  const domain = e.split('@')[1] || '';
  return (
    db.vendors.find((v) => v.approved_contacts.some((c) => norm(c) === e)) ||
    db.vendors.find((v) => v.email_domains.some((d) => norm(d) === domain)) ||
    null
  );
}

// Vendors and the spec use "8842" and "INV-8842" interchangeably, so fall back
// to adding/stripping the INV- prefix when there is no exact match.
export function findInvoice(invoiceId) {
  if (!invoiceId) return null;
  const id = norm(invoiceId);
  const exact = db.invoices.find((i) => norm(i.invoice_id) === id);
  if (exact) return exact;
  const alt = id.startsWith('inv-') ? id.slice(4) : `inv-${id}`;
  return db.invoices.find((i) => norm(i.invoice_id) === alt) || null;
}

export function findPurchaseOrder(poNumber) {
  if (!poNumber) return null;
  return db.purchaseOrders.find((p) => norm(p.po_number) === norm(poNumber)) || null;
}

export function findReceiptForPO(poNumber) {
  if (!poNumber) return null;
  return db.receipts.find((r) => norm(r.po_number) === norm(poNumber)) || null;
}

export function findErpRecord({ invoiceId, paymentId } = {}) {
  const inv = invoiceId ? findInvoice(invoiceId) : null;
  return (
    db.erpRecords.find(
      (e) =>
        (inv && norm(e.invoice_id) === norm(inv.invoice_id)) ||
        (paymentId && norm(e.payment_id) === norm(paymentId)),
    ) || null
  );
}

export function erpBreakRecords() {
  return db.erpRecords.filter(
    (e) => e.sync_error || e.gl_posting_status === 'missing' || e.gl_posting_status === 'error',
  );
}

export function findRailStatus(railReference) {
  if (!railReference) return null;
  return db.railStatuses.find((r) => norm(r.rail_reference) === norm(railReference)) || null;
}

export function pendingApprovalInvoices() {
  return db.invoices.filter((i) => i.approval_status === 'pending');
}

export function findDuplicateCandidate(invoice) {
  if (!invoice) return null;
  if (invoice.duplicate_of) return findInvoice(invoice.duplicate_of);
  return (
    db.invoices.find(
      (i) =>
        i.invoice_id !== invoice.invoice_id &&
        i.vendor_id === invoice.vendor_id &&
        Math.abs(i.invoice_amount - invoice.invoice_amount) < 0.01 &&
        (i.po_number && i.po_number === invoice.po_number),
    ) || null
  );
}

export function findPaymentById(paymentId) {
  if (!paymentId) return null;
  return db.payments.find((p) => norm(p.payment_id) === norm(paymentId)) || null;
}

export function findPaymentsForInvoice(invoiceId) {
  if (!invoiceId) return [];
  return db.payments.filter((p) =>
    p.invoice_ids.some((id) => norm(id) === norm(invoiceId)),
  );
}

// Match payments for a vendor by amount and/or recency — used by the
// Remittance agent when the vendor only gives loose clues ("$8,200 yesterday").
export function findPaymentsForVendor(vendorId, { amount } = {}) {
  let rows = db.payments.filter((p) => norm(p.vendor_id) === norm(vendorId));
  if (amount != null) {
    rows = rows.filter((p) => Math.abs(p.payment_amount - Number(amount)) < 0.01);
  }
  return rows.sort((a, b) => (b.sent_date || '').localeCompare(a.sent_date || ''));
}

export function findRemittanceForPayment(paymentId) {
  if (!paymentId) return null;
  return db.remittances.find((r) => norm(r.payment_id) === norm(paymentId)) || null;
}

export function invoicesForPayment(payment) {
  if (!payment) return [];
  return payment.invoice_ids
    .map((id) => findInvoice(id))
    .filter(Boolean);
}

export function vendorsNeedingOutreach() {
  return db.vendors.filter(
    (v) => v.enrollment_status !== 'enrolled' || v.payment_method === 'check',
  );
}
