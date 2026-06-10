// Local dev entry — the app itself lives in app.js (shared with Vercel).
import app from './app.js';
import { config, llmEnabled } from './services/config.js';

app.listen(config.port, () => {
  console.log(`vendor-ops-agent API on http://localhost:${config.port}`);
  console.log(`LLM: ${llmEnabled ? config.model : 'disabled (deterministic rules fallback)'}`);
});
