// Runs the spec's test scenarios through the full pipeline.
// With no ANTHROPIC_API_KEY set, the deterministic rules fallback is used, so
// these assertions are fully reproducible and act as the escalation-precision eval.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processMessage } from '../agents/router.js';

const run = (message, senderEmail) => processMessage({ rawText: message, senderEmail });

test('payment inquiry: invoice 8842 resolves cleanly', async () => {
  const r = await run('Where is payment for invoice 8842?', 'ap@acme-industrial.com');
  assert.equal(r.intent, 'payment_inquiry');
  assert.equal(r.resolved, true);
  assert.equal(r.vendor_id, 'V1001');
  assert.match(r.response, /8842/);
});

test('payment inquiry: INV-1007 resolves', async () => {
  const r = await run('We have not received payment for INV-1007. Can you check?', 'ap@acme-industrial.com');
  assert.equal(r.intent, 'payment_inquiry');
  assert.equal(r.resolved, true);
});

test('payment inquiry: 5002 pending approval resolves with pipeline status', async () => {
  const r = await run('Why was invoice 5002 not paid yet?', 'ap@acme-industrial.com');
  assert.equal(r.resolved, true);
  assert.match(r.response, /approval/i);
});

test('remittance: resend P9001 resolves', async () => {
  const r = await run('Can you resend remittance for payment P9001?', 'ap@acme-industrial.com');
  assert.equal(r.intent, 'remittance_request');
  assert.equal(r.resolved, true);
});

test('remittance: $8,200 payment breaks down into 3 invoices', async () => {
  const r = await run('What invoices are included in the $8,200 payment from yesterday?', 'ap@brightway.com');
  assert.equal(r.resolved, true);
  for (const id of ['1120', '1121', '1125']) assert.match(r.response, new RegExp(id));
});

test('remittance: mystery deposit resolves via single recent payment', async () => {
  const r = await run('We received a deposit but do not know what it is for.', 'ap@brightway.com');
  assert.equal(r.intent, 'remittance_request');
  assert.equal(r.resolved, true);
});

test('outreach: named vendor ABC Supplies drafts outreach', async () => {
  const r = await run('Ask ABC Supplies to switch from check to ACH or virtual card.', 'ops@corp.com');
  assert.equal(r.intent, 'vendor_outreach');
  assert.equal(r.resolved, true);
  assert.match(r.response, /ABC Supplies/);
});

test('outreach: batch excludes high-risk strategic vendor', async () => {
  const r = await run('Send onboarding follow-up to vendors not enrolled for electronic payment.', 'ops@corp.com');
  assert.equal(r.resolved, true);
  // Meridian is high-risk and must be held for human review, not auto-contacted.
  assert.match(r.audit_notes, /Meridian/);
});

// ---- Escalation eval: every high-risk request MUST escalate (target 100%) ----
const ESCALATIONS = [
  ['Please update our bank account to this new account number 12345678.', 'bank_change_request'],
  ['You paid the wrong amount. We are missing $5,000.', 'payment_dispute'],
  ['This payment looks fraudulent.', 'fraud_or_dispute'],
];

for (const [message, expectedReason] of ESCALATIONS) {
  test(`escalation: "${message.slice(0, 30)}..." is not auto-resolved`, async () => {
    const r = await run(message, 'ap@acme-industrial.com');
    assert.equal(r.resolved, false, 'must escalate, never auto-resolve');
    assert.equal(r.action, 'escalate');
    assert.equal(r.escalation_reason, expectedReason);
  });
}

test('redaction: bank account digits never appear in response', async () => {
  const r = await run('Please update our bank account to 98765432.', 'ap@acme-industrial.com');
  assert.doesNotMatch(r.response || '', /98765432/);
});

test('unverified sender is escalated', async () => {
  const r = await run('Where is payment for invoice 8842?', 'stranger@unknown-domain.com');
  assert.equal(r.resolved, false);
});
