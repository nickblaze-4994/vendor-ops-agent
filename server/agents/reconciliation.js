// Agent 6: Reconciliation Support.
// Investigates invoice / payment / ERP / rail mismatches. Auto-resolves only
// harmless timing explanations; anything needing an accounting change (ERP
// correction, journal entry) escalates.
import {
  findInvoice,
  findPaymentById,
  findErpRecord,
  erpBreakRecords,
  findRailStatus,
} from '../services/apLookup.js';
import { result, writeReply } from './shared.js';

const AGENT = 'Reconciliation Agent';
const INTENT = 'reconciliation_break';
const RECORDS = ['invoices', 'payments', 'erp_records', 'rail_statuses'];

export async function handle({ rawText, entities, confidence }) {
  const base = { intent: INTENT, agent: AGENT, vendor: null, confidence, entities, records_checked: RECORDS };

  // Locate the ERP record under investigation.
  let erp = null;
  if (entities.invoice_id || entities.payment_id) {
    erp = findErpRecord({ invoiceId: entities.invoice_id, paymentId: entities.payment_id });
    if (!erp) {
      return result({
        ...base, resolved: false, action: 'escalate', escalation_reason: 'break_record_not_found',
        audit_notes: `No ERP record found for ${entities.invoice_id || entities.payment_id}.`,
      });
    }
  } else {
    // No identifiers — scan open breaks, narrowed by what the message describes.
    let candidates = erpBreakRecords();
    if (/general ledger|\bgl\b|journal/i.test(rawText)) {
      candidates = candidates.filter((e) => ['missing', 'error'].includes(e.gl_posting_status));
    }
    if (candidates.length === 0) {
      return result({
        ...base, resolved: false, action: 'escalate', escalation_reason: 'break_record_not_found',
        audit_notes: 'No open reconciliation break matches the description.',
      });
    }
    if (candidates.length > 1) {
      return result({
        ...base, resolved: false, action: 'escalate', escalation_reason: 'multiple_records_match',
        audit_notes: `${candidates.length} open breaks match the description — needs a human to pick the case.`,
      });
    }
    erp = candidates[0];
  }

  const invoice = findInvoice(erp.invoice_id);
  const payment = findPaymentById(erp.payment_id);
  const rail = payment ? findRailStatus(payment.rail_reference) : null;
  const evidence =
    `ERP: invoice=${erp.erp_invoice_status}, payment=${erp.erp_payment_status}, GL=${erp.gl_posting_status}, ` +
    `last sync ${erp.last_sync_time}. Payment system: ${payment ? `${payment.payment_id}=${payment.payment_status}` : 'none'}` +
    `${rail ? `, rail ${rail.status_code} (${rail.status})` : ''}.`;

  // GL posting problems require a journal correction — human-only.
  if (['missing', 'error'].includes(erp.gl_posting_status) || /gl/i.test(erp.sync_error || '')) {
    return result({
      ...base, resolved: false, action: 'escalate', escalation_reason: 'journal_correction_needed',
      audit_notes: `Root cause: GL posting failure (${erp.sync_error || 'GL status ' + erp.gl_posting_status}). ${evidence} Journal corrections are human-only.`,
    });
  }

  // Payment in flight or settled while ERP lags behind → harmless timing gap.
  if (payment && ['sent', 'settled'].includes(payment.payment_status) &&
      ['unpaid', 'pending'].includes(erp.erp_invoice_status)) {
    const settled = payment.settlement_date && new Date(payment.settlement_date) <= new Date();
    const cause = settled
      ? 'ERP sync delay — payment settled after the last ERP sync'
      : 'timing gap — payment is in flight and ERP will update once it settles';
    const context = {
      scenario: 'reconciliation_explanation',
      invoice_id: invoice?.invoice_id, payment_id: payment.payment_id,
      root_cause: cause, evidence,
    };
    const fallback =
      `No accounting error found. Root cause: ${cause}. ` +
      `Invoice ${invoice?.invoice_id} / payment ${payment.payment_id}: the payment system shows ` +
      `${payment.payment_status}${payment.settlement_date ? ` (settlement ${payment.settlement_date})` : ''}, ` +
      `while ERP last synced ${erp.last_sync_time}. A resync task has been created; no journal change is needed.`;
    return result({
      ...base, resolved: true, action: 'create_correction_task',
      response: await writeReply({ context, fallback }),
      audit_notes: `Root cause: ${cause}. ${evidence} Resync task created — no accounting change made.`,
    });
  }

  return result({
    ...base, resolved: false, action: 'escalate', escalation_reason: 'unexplained_mismatch',
    audit_notes: `Mismatch does not match a harmless pattern. ${evidence}`,
  });
}
