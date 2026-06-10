// Updated-spec test scenarios for agents 5–12, run through the full pipeline
// (rules fallback, fully reproducible).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processMessage } from '../agents/router.js';

const INTERNAL = 'ap-events@corpay-internal.com';
const run = (message, senderEmail = INTERNAL) => processMessage({ rawText: message, senderEmail });

// ---- Agent 5: Payment Delivery / Failed Payment Triage ----
test('failed ACH P9003 triaged with secure correction workflow', async () => {
  const r = await run('Payment P9003 failed because the ACH account number is invalid.');
  assert.equal(r.intent, 'failed_payment');
  assert.equal(r.resolved, true);
  assert.equal(r.action, 'send_secure_correction_request');
  assert.match(r.response, /secure portal/i);
});

test('stale check P7701 creates retry task', async () => {
  const r = await run('Check P7701 has not been cashed after 20 days.');
  assert.equal(r.resolved, true);
  assert.equal(r.action, 'create_retry_task');
});

test('vendor claims failure but payment cleared → escalates as claims conflict', async () => {
  const r = await run('Vendor says the virtual card payment could not be processed.', 'ap@brightway.com');
  assert.equal(r.resolved, false);
  assert.equal(r.escalation_reason, 'claims_conflict');
  assert.equal(r.human_routing.team, 'Risk & Fraud Team');
});

// ---- Agent 6: Reconciliation Support ----
test('ERP unpaid vs settled payment resolves as timing/sync explanation', async () => {
  const r = await run('ERP says INV-8842 is unpaid, but payment P9001 settled.');
  assert.equal(r.intent, 'reconciliation_break');
  assert.equal(r.resolved, true);
  assert.match(r.audit_notes, /timing gap|sync delay/i);
});

test('GL posting failure escalates for journal correction', async () => {
  const r = await run('Payment posted in Corpay but not in the general ledger.');
  assert.equal(r.resolved, false);
  assert.equal(r.escalation_reason, 'journal_correction_needed');
  assert.equal(r.human_routing.team, 'GL & Reconciliation Team');
});

// ---- Agent 7: Vendor Data Maintenance Intake ----
test('address update from verified vendor gets secure portal link', async () => {
  const r = await run('We need to update our billing address.', 'accounts@abc-supplies.com');
  assert.equal(r.intent, 'vendor_data_update_request');
  assert.equal(r.resolved, true);
  assert.match(r.response, /portal/i);
});

test('tax form update is low-risk intake, not a legal escalation', async () => {
  const r = await run('Please update our tax form for this year.', 'ap@brightway.com');
  assert.equal(r.resolved, true);
  assert.equal(r.entities.update_type, 'tax_form_update');
});

test('changed banks escalates with no bank data accepted by email', async () => {
  const r = await run('We changed banks. Please update our account details.', 'ap@acme-industrial.com');
  assert.equal(r.resolved, false);
  assert.equal(r.escalation_reason, 'bank_change_request');
  assert.equal(r.human_routing.team, 'Vendor Master Team');
});

// ---- Agent 8: Invoice Exception ----
test('INV-5002 vs PO-3002 mismatch drafts corrected-invoice request', async () => {
  const r = await run('Invoice INV-5002 is $50,000, but PO PO-3002 is $45,000.');
  assert.equal(r.intent, 'invoice_exception');
  assert.equal(r.resolved, true);
  assert.equal(r.action, 'request_corrected_invoice');
  assert.match(r.audit_notes, /human-only/);
});

test('missing PO invoice requests PO info from requester', async () => {
  const r = await run('Invoice INV-9004 has no PO number.');
  assert.equal(r.resolved, true);
  assert.equal(r.action, 'request_po_info');
});

test('duplicate invoice INV-7777 flagged with hold recommendation', async () => {
  const r = await run('Invoice INV-7777 appears to be a duplicate.');
  assert.equal(r.resolved, true);
  assert.equal(r.action, 'flag_duplicate_hold');
  assert.match(r.response, /INV-7770/);
});

// ---- Agent 9: Approval Follow-up ----
test('stuck approval INV-7004 sends urgent reminder to approver', async () => {
  const r = await run('Invoice INV-7004 has been pending approval for 5 days and is due in 2 days.');
  assert.equal(r.intent, 'approval_follow_up');
  assert.equal(r.resolved, true);
  assert.match(r.response, /maria\.chen@acmecorp\.com/);
});

// ---- Agent 10: Duplicate & Late Payment Prevention ----
test('INV-1009 vs INV-1008 flags duplicate risk with hold recommendation', async () => {
  const r = await run('Invoice INV-1009 looks similar to invoice INV-1008 from the same vendor.');
  assert.equal(r.intent, 'duplicate_payment_risk');
  assert.equal(r.resolved, true);
  assert.match(r.response, /INV-1008/);
});

test('INV-2210 near-due unapproved raises late payment alert', async () => {
  const r = await run('Invoice INV-2210 is due tomorrow but is not approved.');
  assert.equal(r.intent, 'late_payment_risk');
  assert.equal(r.resolved, true);
  assert.equal(r.action, 'late_payment_alert');
});

// ---- Agent 11: Payment Method Optimization ----
test('strategic vendor V1005 recommendation is held for human owner', async () => {
  const r = await run('Vendor V1005 accepts virtual card but is still paid by check.', 'ops@corpay-internal.com');
  assert.equal(r.intent, 'payment_method_optimization');
  assert.equal(r.resolved, false);
  assert.equal(r.escalation_reason, 'high_value_strategic_vendor');
  assert.match(r.audit_notes, /virtual card/i);
});

test('batch optimization ranks candidates and triggers outreach', async () => {
  const r = await run('Find vendors that should be moved from check to electronic payment.', 'ops@corpay-internal.com');
  assert.equal(r.resolved, true);
  assert.equal(r.action, 'trigger_outreach');
  assert.match(r.response, /ABC Supplies|Nguyen/);
});

// ---- Agent 12: Audit & Guardrail + universal schema ----
test('payment approval request is blocked and escalated', async () => {
  const r = await run('Please approve this payment today.', 'ap@acme-industrial.com');
  assert.equal(r.resolved, false);
  assert.equal(r.escalation_reason, 'payment_approval_request');
  assert.equal(r.human_routing.team, 'AP Manager Approvals');
});

test('every outcome carries guardrail review, records_checked, and risk_level', async () => {
  const r = await run('Where is payment for invoice 8842?', 'ap@acme-industrial.com');
  assert.equal(r.guardrail.passed, true);
  assert.ok(r.guardrail.checks.length >= 5);
  assert.ok(Array.isArray(r.records_checked) && r.records_checked.length > 0);
  assert.equal(r.risk_level, 'low');
});
