// Human-intervention routing. When the agent escalates, it doesn't just stop —
// it routes the case to the correct AP specialist queue with a priority + SLA,
// the way a managed-AP team triages exceptions.
const ROUTES = {
  // sensitive / high-risk
  bank_change_request:        { team: 'Vendor Master Team',        priority: 'high',   sla_hours: 4 },
  fraud_or_dispute:           { team: 'Risk & Fraud Team',         priority: 'urgent', sla_hours: 2 },
  payment_dispute:            { team: 'AP Disputes Team',          priority: 'high',   sla_hours: 8 },
  legal_or_tax:               { team: 'Controller & Legal',        priority: 'high',   sla_hours: 24 },
  high_value_payment:         { team: 'AP Manager Approvals',      priority: 'high',   sla_hours: 4 },
  high_value_strategic_vendor:{ team: 'Strategic Vendor Manager',  priority: 'normal', sla_hours: 24 },

  // identity
  vendor_not_verified:        { team: 'Vendor Verification Desk',  priority: 'normal', sla_hours: 8 },
  sender_not_on_approved_list:{ team: 'Vendor Verification Desk',  priority: 'normal', sla_hours: 8 },
  no_matching_vendor:         { team: 'Vendor Verification Desk',  priority: 'normal', sla_hours: 8 },

  // data / research
  invoice_not_found:          { team: 'AP Operations · Research',  priority: 'normal', sla_hours: 8 },
  invoice_belongs_to_other_vendor: { team: 'AP Operations · Research', priority: 'high', sla_hours: 8 },
  multiple_payments_match:    { team: 'AP Operations · Research',  priority: 'normal', sla_hours: 8 },
  invoice_approved_but_no_payment: { team: 'AP Operations · Payments', priority: 'high', sla_hours: 4 },
  payment_not_found:          { team: 'AP Operations · Research',  priority: 'normal', sla_hours: 8 },
  payment_belongs_to_other_vendor: { team: 'Risk & Fraud Team',   priority: 'urgent', sla_hours: 2 },
  payment_failed:             { team: 'AP Operations · Payments',  priority: 'high',   sla_hours: 4 },
  totals_mismatch:            { team: 'AP Disputes Team',          priority: 'high',   sla_hours: 8 },

  // approvals / payment control
  payment_approval_request:   { team: 'AP Manager Approvals',      priority: 'high',   sla_hours: 4 },
  high_value_invoice:         { team: 'AP Manager Approvals',      priority: 'high',   sla_hours: 4 },

  // failed payments / delivery
  claims_conflict:            { team: 'Risk & Fraud Team',         priority: 'high',   sla_hours: 4 },
  unmapped_failure_code:      { team: 'AP Operations · Payments',  priority: 'high',   sla_hours: 4 },
  cannot_identify_payment:    { team: 'AP Operations · Payments',  priority: 'normal', sla_hours: 8 },
  repeated_payment_failure:   { team: 'AP Operations · Payments',  priority: 'high',   sla_hours: 4 },

  // reconciliation / accounting
  erp_correction_needed:      { team: 'GL & Reconciliation Team',  priority: 'high',   sla_hours: 8 },
  journal_correction_needed:  { team: 'GL & Reconciliation Team',  priority: 'high',   sla_hours: 8 },
  multiple_records_match:     { team: 'AP Operations · Research',  priority: 'normal', sla_hours: 8 },
  unexplained_mismatch:       { team: 'GL & Reconciliation Team',  priority: 'high',   sla_hours: 8 },
  break_record_not_found:     { team: 'AP Operations · Research',  priority: 'normal', sla_hours: 8 },

  // vendor data
  vendor_name_change:         { team: 'Vendor Master Team',        priority: 'high',   sla_hours: 8 },
  merger_or_acquisition:      { team: 'Vendor Master Team',        priority: 'high',   sla_hours: 24 },

  // confidence / fallthrough
  cannot_identify_invoice:    { team: 'AP Operations · Manual Triage', priority: 'normal', sla_hours: 8 },
  low_confidence:             { team: 'AP Operations · Manual Triage', priority: 'normal', sla_hours: 8 },
  unknown_intent:             { team: 'AP Operations · Manual Triage', priority: 'low',    sla_hours: 12 },
  no_specialist:              { team: 'AP Operations · Manual Triage', priority: 'low',    sla_hours: 12 },
  guardrail_block:            { team: 'AP Operations · Manual Triage', priority: 'high',   sla_hours: 4 },
};

const DEFAULT = { team: 'AP Operations', priority: 'normal', sla_hours: 8 };

// Reasons treated as high-risk across the system (risk levels, predictions).
export const HIGH_RISK_REASONS = new Set([
  'bank_change_request',
  'fraud_or_dispute',
  'payment_dispute',
  'legal_or_tax',
  'payment_approval_request',
  'claims_conflict',
  'payment_belongs_to_other_vendor',
  'guardrail_block',
]);

export function routeEscalation(reason) {
  const r = ROUTES[reason] || DEFAULT;
  return { reason, ...r };
}
