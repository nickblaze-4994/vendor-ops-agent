// Mock ERP / system-of-record write-back.
// IMPORTANT: we only ever append a *resolution activity* (a note + workflow
// status) to the invoice/payment/vendor record. We never modify accounting
// fields (amounts, bank details, GL, payment status) — those stay in the
// human-only guardrail set. `fields_changed` is therefore always empty.
import { randomUUID } from 'node:crypto';

const activities = [];

// Build the activity the agent proposes to write, from a processed outcome.
// Returned with the /process result but NOT yet committed (human approves first).
export function proposeWriteback(outcome) {
  const { intent, entities = {}, vendor_id, resolved, escalation_reason } = outcome;

  if (!resolved) {
    return {
      record_type: entities.invoice_id ? 'invoice' : entities.payment_id ? 'payment' : 'vendor',
      record_id: entities.invoice_id || entities.payment_id || vendor_id || 'unmatched',
      vendor_id,
      activity_type: 'exception_logged',
      status_set: 'needs_human_review',
      note: `Escalated to AP specialist — ${escalation_reason}. No automated action taken.`,
      fields_changed: [],
    };
  }

  switch (intent) {
    case 'payment_inquiry':
      return {
        record_type: 'invoice', record_id: entities.invoice_id, vendor_id,
        activity_type: 'inquiry_resolved', status_set: 'vendor_notified',
        note: 'Vendor payment-status inquiry answered by AI agent; status reply sent. Accounting records unchanged.',
        fields_changed: [],
      };
    case 'remittance_request':
      return {
        record_type: 'payment', record_id: entities.payment_id, vendor_id,
        activity_type: 'remittance_resent', status_set: 'remittance_delivered',
        note: 'Remittance advice re-sent to approved vendor contact. Accounting records unchanged.',
        fields_changed: [],
      };
    case 'vendor_outreach':
      return {
        record_type: 'vendor', record_id: vendor_id, vendor_id,
        activity_type: 'outreach_logged', status_set: 'outreach_contacted',
        note: 'Payment-method conversion outreach sent via secure portal link.',
        fields_changed: [],
      };
    case 'failed_payment':
      return {
        record_type: 'payment', record_id: entities.payment_id || 'unmatched', vendor_id,
        activity_type: 'failed_payment_triaged', status_set: 'correction_requested',
        note: 'Delivery failure triaged by AI agent; secure correction/retry workflow initiated. No payment reissued automatically.',
        fields_changed: [],
      };
    case 'reconciliation_break':
      return {
        record_type: entities.invoice_id ? 'invoice' : 'payment',
        record_id: entities.invoice_id || entities.payment_id || 'unmatched', vendor_id,
        activity_type: 'reconciliation_note_added', status_set: 'resync_task_created',
        note: 'Reconciliation break investigated; root-cause note attached and resync task created. No journal entries changed.',
        fields_changed: [],
      };
    case 'vendor_data_update_request':
      return {
        record_type: 'vendor', record_id: vendor_id, vendor_id,
        activity_type: 'update_intake_logged', status_set: 'portal_link_sent',
        note: 'Vendor data update intake logged; secure portal link sent. No master data fields changed directly.',
        fields_changed: [],
      };
    case 'invoice_exception':
      return {
        record_type: 'invoice', record_id: entities.invoice_id || 'unmatched', vendor_id,
        activity_type: 'exception_routed', status_set: 'correction_requested',
        note: 'Invoice exception detected and routed; correction request drafted. Approval decisions remain with humans.',
        fields_changed: [],
      };
    case 'approval_follow_up':
      return {
        record_type: 'invoice', record_id: entities.invoice_id || 'unmatched', vendor_id,
        activity_type: 'approval_reminder_sent', status_set: 'reminder_sent',
        note: 'Approval reminder sent to assigned approver with invoice context. Approve/reject stays with the approver.',
        fields_changed: [],
      };
    case 'duplicate_payment_risk':
      return {
        record_type: 'invoice', record_id: entities.invoice_id || 'unmatched', vendor_id,
        activity_type: 'duplicate_risk_flagged', status_set: 'hold_recommended',
        note: 'Duplicate risk flagged with hold recommendation; release/override requires an AP operator.',
        fields_changed: [],
      };
    case 'late_payment_risk':
      return {
        record_type: 'invoice', record_id: entities.invoice_id || 'unmatched', vendor_id,
        activity_type: 'late_risk_flagged', status_set: 'reminder_sent',
        note: 'Late-payment risk flagged; approver reminded and AP operator alerted. Scheduling stays human-controlled.',
        fields_changed: [],
      };
    case 'payment_method_optimization':
      return {
        record_type: 'vendor', record_id: vendor_id || 'batch', vendor_id,
        activity_type: 'method_recommendation_logged', status_set: 'outreach_triggered',
        note: 'Payment-method recommendation logged and outreach task triggered. No payment method changed directly.',
        fields_changed: [],
      };
    default:
      return {
        record_type: 'vendor', record_id: vendor_id, vendor_id,
        activity_type: 'activity_logged', status_set: 'handled',
        note: 'Handled by AI agent.', fields_changed: [],
      };
  }
}

export function commitActivity(payload) {
  const entry = {
    erp_activity_id: `ERP-${randomUUID().slice(0, 8)}`,
    system: 'Acme ERP (mock)',
    record_type: payload.record_type,
    record_id: payload.record_id,
    vendor_id: payload.vendor_id ?? null,
    activity_type: payload.activity_type,
    status_set: payload.status_set ?? null,
    note: payload.note ?? '',
    ticket_id: payload.ticket_id ?? null,
    fields_changed: [], // never modified
    posted_at: new Date().toISOString(),
  };
  activities.unshift(entry);
  return entry;
}

export const getActivities = () => activities;
export const resetActivities = () => { activities.length = 0; };
