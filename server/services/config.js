import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 8799,
  model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  highValueThreshold: Number(process.env.HIGH_VALUE_PAYMENT_THRESHOLD) || 25000,
  minConfidence: Number(process.env.MIN_CONFIDENCE) || 0.6,
  // Manual effort assumptions (minutes) used for hours-saved math.
  manualMinutes: {
    payment_inquiry: 10,
    remittance_request: 8,
    vendor_outreach: 12,
    failed_payment: 15,
    reconciliation_break: 25,
    vendor_data_update_request: 12,
    invoice_exception: 18,
    approval_follow_up: 6,
    duplicate_payment_risk: 12,
    late_payment_risk: 12,
    payment_method_optimization: 15,
  },
};

export const llmEnabled = Boolean(config.apiKey);
