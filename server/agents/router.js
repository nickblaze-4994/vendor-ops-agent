// Intent Router + orchestration. Owns the end-to-end flow for one message:
// classify -> verify identity -> deterministic preflight guardrails ->
// specialist agent -> audit log.
import { classifyAndExtract } from '../services/llm.js';
import { verifyVendor } from '../services/identityCheck.js';
import { preflight } from '../services/policyGuardrails.js';
import { logAction } from '../services/auditLog.js';
import { proposeWriteback } from '../services/erp.js';
import { routeEscalation, HIGH_RISK_REASONS } from '../services/routing.js';
import { guardrailReview } from '../services/auditGuardrail.js';
import { result, escalationReply } from './shared.js';
import { handle as paymentInquiry } from './paymentInquiry.js';
import { handle as remittance } from './remittance.js';
import { handle as vendorOutreach } from './vendorOutreach.js';
import { handle as paymentDelivery } from './paymentDelivery.js';
import { handle as reconciliation } from './reconciliation.js';
import { handle as vendorDataIntake } from './vendorDataIntake.js';
import { handle as invoiceException } from './invoiceException.js';
import { handle as approvalFollowup } from './approvalFollowup.js';
import { handle as duplicateLatePayment } from './duplicateLatePayment.js';
import { handle as paymentMethodOptimization } from './paymentMethodOptimization.js';

const SPECIALISTS = {
  payment_inquiry: paymentInquiry,
  remittance_request: remittance,
  vendor_outreach: vendorOutreach,
  failed_payment: paymentDelivery,
  reconciliation_break: reconciliation,
  vendor_data_update_request: vendorDataIntake,
  invoice_exception: invoiceException,
  approval_follow_up: approvalFollowup,
  duplicate_payment_risk: duplicateLatePayment,
  late_payment_risk: duplicateLatePayment,
  payment_method_optimization: paymentMethodOptimization,
};

const AGENT_LABEL = {
  payment_inquiry: 'Payment Inquiry Agent',
  remittance_request: 'Remittance Agent',
  vendor_outreach: 'Vendor Outreach Agent',
  failed_payment: 'Payment Delivery Agent',
  reconciliation_break: 'Reconciliation Agent',
  vendor_data_update_request: 'Vendor Data Intake Agent',
  invoice_exception: 'Invoice Exception Agent',
  approval_follow_up: 'Approval Follow-up Agent',
  duplicate_payment_risk: 'Duplicate & Late Payment Agent',
  late_payment_risk: 'Duplicate & Late Payment Agent',
  payment_method_optimization: 'Payment Method Optimization Agent',
};

// Default systems consulted per intent, for agents that predate records_checked.
const DEFAULT_RECORDS = {
  payment_inquiry: ['vendors', 'invoices', 'payments'],
  remittance_request: ['vendors', 'payments', 'invoices', 'remittances'],
  vendor_outreach: ['vendors', 'outreach_campaigns'],
};

export async function processMessage({ rawText, senderEmail }) {
  // 1. Language layer: intent + entities (LLM, or rules fallback).
  const classification = await classifyAndExtract({ rawText, senderEmail });
  const { intent, confidence, entities, reasoning, via } = classification;

  // 2. Deterministic identity verification.
  const verification = verifyVendor({
    senderEmail,
    vendorIdHint: entities.vendor_id || entities.vendor_clue,
  });

  // 3. Deterministic guardrails — may force escalation before any agent runs.
  const gate = preflight({ rawText, intent, confidence, verification });

  let outcome;
  if (gate.escalate) {
    outcome = result({
      intent,
      agent: AGENT_LABEL[intent] || 'Intent Router',
      vendor: verification.vendor,
      resolved: false,
      confidence,
      entities,
      action: 'escalate',
      response: escalationReply,
      escalation_reason: gate.reason,
      audit_notes: `Routed to human by guardrail: ${gate.reason}.`,
    });
  } else {
    const specialist = SPECIALISTS[intent];
    outcome = specialist
      ? await specialist({ rawText, intent, entities, confidence, verification })
      : result({
          intent,
          agent: 'Intent Router',
          vendor: verification.vendor,
          resolved: false,
          confidence,
          entities,
          action: 'escalate',
          response: escalationReply,
          escalation_reason: 'no_specialist',
          audit_notes: `No specialist for intent ${intent}.`,
        });
  }

  if (!outcome.records_checked?.length) {
    outcome.records_checked = DEFAULT_RECORDS[intent] || ['policy_guardrails'];
  }

  // 4. Agent 12: Audit & Guardrail Agent — final pass on every outcome. A
  // failed hard check flips a resolved case to escalation before it is sent.
  const guardrail = guardrailReview(outcome, { rawText, verification });
  if (!guardrail.passed && outcome.resolved) {
    outcome = {
      ...outcome,
      resolved: false,
      action: 'escalate',
      response: escalationReply,
      escalation_reason: 'guardrail_block',
      audit_notes: `${outcome.audit_notes} Guardrail agent blocked auto-send: ${guardrail.checks.filter((c) => !c.pass).map((c) => c.name).join(', ')}.`,
    };
  }
  outcome.guardrail = guardrail;

  // Escalations are routed to a specific human team with priority + SLA.
  if (!outcome.resolved && outcome.escalation_reason) {
    outcome.human_routing = routeEscalation(outcome.escalation_reason);
  }

  outcome.risk_level = outcome.resolved
    ? 'low'
    : HIGH_RISK_REASONS.has(outcome.escalation_reason) ? 'high' : 'medium';

  // 5. Audit log.
  const ticket = logAction({
    ...outcome,
    input_message: rawText,
  });

  // Proposed system-of-record write-back (activity note only; committed on approval).
  const erp = proposeWriteback(outcome);

  return {
    ...outcome,
    ticket_id: ticket.ticket_id,
    timestamp: ticket.timestamp,
    routing: { reasoning, via, verification_method: verification.method },
    erp,
  };
}
