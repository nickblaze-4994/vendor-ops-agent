// Pre-triage prediction + escalation routing (rules fallback = reproducible).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predictDisposition } from '../services/predict.js';
import { processMessage } from '../agents/router.js';

test('predict: bank change flags as high-risk escalation routed to Vendor Master Team', async () => {
  const p = await predictDisposition({
    rawText: 'Please update our bank account to this new account number 12345678.',
    senderEmail: 'ap@acme-industrial.com',
  });
  assert.equal(p.prediction, 'escalation');
  assert.equal(p.severity, 'high');
  assert.equal(p.team, 'Vendor Master Team');
});

test('predict: clean payment inquiry from verified sender flags auto-resolvable', async () => {
  const p = await predictDisposition({
    rawText: 'Where is payment for invoice 8842?',
    senderEmail: 'ap@acme-industrial.com',
  });
  assert.equal(p.prediction, 'auto');
});

test('predict: unverified sender flags escalation to Verification Desk', async () => {
  const p = await predictDisposition({
    rawText: 'Where is payment for invoice 8842?',
    senderEmail: 'stranger@unknown.com',
  });
  assert.equal(p.prediction, 'escalation');
  assert.equal(p.team, 'Vendor Verification Desk');
});

test('escalated outcomes carry a human routing assignment', async () => {
  const r = await processMessage({
    rawText: 'This payment looks fraudulent.',
    senderEmail: 'ap@acme-industrial.com',
  });
  assert.equal(r.resolved, false);
  assert.equal(r.human_routing.team, 'Risk & Fraud Team');
  assert.equal(r.human_routing.priority, 'urgent');
  assert.equal(typeof r.human_routing.sla_hours, 'number');
});
