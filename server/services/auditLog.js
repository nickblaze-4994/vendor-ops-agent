// In-memory audit log + metrics. Every processed message appends one entry.
// In production this would be an append-only store / ticketing system.
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

const entries = [];

export function logAction(record) {
  const entry = {
    ticket_id: `T-${randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    vendor_id: record.vendor_id ?? null,
    intent: record.intent ?? 'unknown',
    agent_name: record.agent ?? 'Intent Router',
    input_message: record.input_message ?? '',
    action_taken: record.action ?? null,
    response_text: record.response ?? null,
    confidence: record.confidence ?? null,
    escalation_reason: record.escalation_reason ?? null,
    resolved: Boolean(record.resolved),
    risk_level: record.risk_level ?? null,
    records_used: record.records_checked ?? [],
  };
  entries.unshift(entry); // newest first
  return entry;
}

export function getLog() {
  return entries;
}

export function getMetrics() {
  const byIntent = {};
  let resolved = 0;
  let escalated = 0;
  let riskBlocks = 0;
  let manualMinutesSaved = 0;

  for (const e of entries) {
    const intent = e.intent || 'unknown';
    byIntent[intent] ??= { total: 0, resolved: 0, escalated: 0 };
    byIntent[intent].total += 1;

    if (e.resolved) {
      resolved += 1;
      byIntent[intent].resolved += 1;
      manualMinutesSaved += config.manualMinutes[intent] || 0;
    } else {
      escalated += 1;
      byIntent[intent].escalated += 1;
      if (e.risk_level === 'high') riskBlocks += 1;
    }
  }

  const total = entries.length;
  const perAgent = Object.fromEntries(
    Object.entries(byIntent).map(([intent, s]) => [
      intent,
      {
        ...s,
        auto_resolution_rate: s.total ? +(s.resolved / s.total).toFixed(2) : 0,
      },
    ]),
  );

  return {
    total,
    resolved,
    escalated,
    risk_blocks: riskBlocks,
    auto_resolution_rate: total ? +(resolved / total).toFixed(2) : 0,
    manual_hours_saved: +(manualMinutesSaved / 60).toFixed(2),
    per_intent: perAgent,
  };
}

export function resetLog() {
  entries.length = 0;
}
