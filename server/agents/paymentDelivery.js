// Agent 5: Payment Delivery & Failed Payment Triage.
// Handles failed, returned, delayed, or unclear payment delivery cases.
// Safe: explain status, request corrections via secure portal, create retry
// tasks, notify the AP team. Never updates bank details or reissues money.
import { findPaymentById, findPaymentsForVendor, findRailStatus } from '../services/apLookup.js';
import { exceedsHighValue } from '../services/policyGuardrails.js';
import { result, writeReply } from './shared.js';

const AGENT = 'Payment Delivery Agent';
const INTENT = 'failed_payment';
const RECORDS = ['payments', 'rail_statuses', 'vendors'];
const STALE_CHECK_DAYS = 14;

const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export async function handle({ rawText, entities, confidence, verification }) {
  const vendor = verification.vendor;
  const base = { intent: INTENT, agent: AGENT, vendor, confidence, entities, records_checked: RECORDS };

  let payment = entities.payment_id ? findPaymentById(entities.payment_id) : null;
  if (!payment && vendor) {
    // No reference given — a vendor reporting a delivery problem usually means
    // their most recent payment.
    payment = findPaymentsForVendor(vendor.vendor_id)[0] || null;
  }
  if (!payment) {
    return result({
      ...base, resolved: false, action: 'escalate',
      escalation_reason: entities.payment_id ? 'payment_not_found' : 'cannot_identify_payment',
      audit_notes: 'Could not identify which payment the delivery issue refers to.',
    });
  }

  const rail = findRailStatus(payment.rail_reference);
  const railNote = rail ? `${rail.status_code} (${rail.status_description})` : 'no rail status on file';

  if (exceedsHighValue(payment.payment_amount)) {
    return result({
      ...base, resolved: false, action: 'escalate', escalation_reason: 'high_value_payment',
      audit_notes: `Payment ${payment.payment_id} exceeds the high-value threshold; delivery issues on it are human-only.`,
    });
  }

  // Message claims a failure but our records show the payment cleared.
  const claimsFailure = /fail|could not|declin|not processed|did not receive|never (received|arrived)/i.test(rawText);
  if (claimsFailure && ['settled', 'cleared'].includes(payment.payment_status)) {
    return result({
      ...base, resolved: false, action: 'escalate', escalation_reason: 'claims_conflict',
      audit_notes: `Payment ${payment.payment_id} shows ${payment.payment_status} on rail ${railNote}, but the message claims it failed. Possible misdirection or fraud — routed for review.`,
    });
  }

  if (payment.payment_status === 'failed') {
    const reason = payment.failure_reason || '';
    const correctable = /invalid_account|account_number|undeliverable|address|invalid/i.test(reason);
    if (!correctable) {
      return result({
        ...base, resolved: false, action: 'escalate', escalation_reason: 'unmapped_failure_code',
        audit_notes: `Payment ${payment.payment_id} failed with unmapped reason "${reason}" — no safe automated path.`,
      });
    }
    const fix = /account/i.test(reason)
      ? 'confirm your bank details through the secure portal (we never collect bank details by email)'
      : 'confirm your current remit-to address through the secure portal';
    const context = {
      scenario: 'failed_payment_correction',
      payment_id: payment.payment_id,
      payment_method: payment.payment_method,
      failure_reason: reason,
      rail_status: railNote,
      requested_fix: fix,
    };
    const fallback =
      `Payment ${payment.payment_id} (${payment.payment_method.toUpperCase()}) could not be delivered — ` +
      `the rail reported: ${railNote}. To get this re-issued quickly, please ${fix}. ` +
      `A retry has been queued and will go out as soon as the details are confirmed.`;
    return result({
      ...base, resolved: true, action: 'send_secure_correction_request',
      response: await writeReply({ context, fallback }),
      audit_notes: `Failure ${reason} mapped to secure-portal correction. Retry task created; AP team notified. Rail: ${railNote}. No bank data accepted by email.`,
    });
  }

  // Stale check: issued long ago, never presented.
  if (payment.payment_method === 'check' && payment.payment_status === 'sent' && !payment.settlement_date) {
    const age = daysSince(payment.sent_date);
    if (age >= STALE_CHECK_DAYS) {
      return result({
        ...base, resolved: true, action: 'create_retry_task',
        response:
          `Check ${payment.payment_id} was issued on ${payment.sent_date} (${age} days ago) and has not been presented. ` +
          `A stop-and-reissue review task has been created for the AP team, and the vendor can confirm their ` +
          `remit-to address or switch to electronic payment via the secure portal.`,
        audit_notes: `Stale check (${age}d, rail ${railNote}). Stop/reissue is a human decision — task created, vendor portal path offered.`,
      });
    }
  }

  // In-flight payment — just explain status.
  const context = {
    scenario: 'delivery_status',
    payment_id: payment.payment_id,
    payment_status: payment.payment_status,
    rail_status: railNote,
    settlement_date: payment.settlement_date,
  };
  const fallback =
    `Payment ${payment.payment_id} is currently ${payment.payment_status} (rail status: ${railNote})` +
    (payment.settlement_date ? ` and is expected to settle on ${payment.settlement_date}.` : '.');
  return result({
    ...base, resolved: true, action: 'reply_to_vendor',
    response: await writeReply({ context, fallback }),
    audit_notes: `Delivery status explained from payment + rail records (${railNote}).`,
  });
}
