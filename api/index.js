// Vercel serverless function: the whole Express API runs as one handler.
// Rewrites in vercel.json send every /api/* request here with the original
// URL, so the Express routes match unchanged.
import app from '../server/app.js';

export default app;
