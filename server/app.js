// Express app, exported without a listener so it can run both locally
// (server/index.js), as a Vercel serverless function (api/index.js), or as a
// single Node service that also serves the built web app (Render/Railway/etc.).
import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, llmEnabled } from './services/config.js';
import { processMessage } from './agents/router.js';
import { getLog, getMetrics, resetLog } from './services/auditLog.js';
import { commitActivity, getActivities, resetActivities } from './services/erp.js';
import { predictDisposition } from './services/predict.js';
import { db } from './services/apLookup.js';
import { SCENARIOS } from './scenarios.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, llm: llmEnabled, model: llmEnabled ? config.model : 'rules-fallback' });
});

app.post('/api/process', async (req, res) => {
  const { message, senderEmail } = req.body || {};
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  try {
    const result = await processMessage({ rawText: String(message), senderEmail });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// Batch pre-triage prediction for inbox flags. Language-only screen — no record
// lookups, nothing logged. Body: { messages: [{ id, message, senderEmail }] }.
app.post('/api/predict', async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }
  try {
    const out = {};
    for (const m of messages) {
      out[m.id] = await predictDisposition({ rawText: String(m.message || ''), senderEmail: m.senderEmail });
    }
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.get('/api/audit', (_req, res) => res.json(getLog()));
app.get('/api/metrics', (_req, res) => res.json(getMetrics()));
app.post('/api/reset', (_req, res) => {
  resetLog();
  resetActivities();
  res.json({ ok: true });
});

// ERP / system-of-record write-back (resolution activity only — never accounting fields).
app.post('/api/erp/commit', (req, res) => {
  const { record_type, record_id, activity_type } = req.body || {};
  if (!record_type || !record_id || !activity_type) {
    return res.status(400).json({ error: 'record_type, record_id, activity_type required' });
  }
  res.json(commitActivity(req.body));
});
app.get('/api/erp', (_req, res) => res.json(getActivities()));

// Demo helpers for the UI.
app.get('/api/scenarios', (_req, res) => res.json(SCENARIOS));
app.get('/api/vendors', (_req, res) =>
  res.json(
    db.vendors.map((v) => ({
      vendor_id: v.vendor_id,
      vendor_name: v.vendor_name,
      contact: v.approved_contacts[0],
      payment_method: v.payment_method,
      enrollment_status: v.enrollment_status,
    })),
  ),
);

// Serve the built web app when running as a single service (Render/Railway/etc.).
// On Vercel the static files are served by the platform, so this is a no-op there.
const webDist = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(join(webDist, 'index.html'));
  });
}

export default app;
