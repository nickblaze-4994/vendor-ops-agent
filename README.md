# AI Managed AP Operations Desk — Prototype

A 12-agent system that automates the human service layer around managed AP:

| # | Agent | Handles |
|---|---|---|
| 1 | Intent Router & Orchestrator | classify → verify → guardrails → route |
| 2 | Vendor Outreach | onboarding, check → ACH/virtual-card conversion |
| 3 | Payment Inquiry | "where is my payment?" |
| 4 | Remittance | "what does this payment cover / resend remittance" |
| 5 | Payment Delivery | failed/returned/stale payments, secure correction workflows |
| 6 | Reconciliation Support | ERP vs payment vs rail vs GL mismatches |
| 7 | Vendor Data Intake | address/contact/tax-form updates via secure portal |
| 8 | Invoice Exception | PO mismatches, missing POs, duplicate invoices |
| 9 | Approval Follow-up | chase stuck internal approvers |
| 10 | Duplicate & Late Prevention | duplicate-charge and late-payment risk flags |
| 11 | Payment Method Optimization | rank conversions, estimate rebates, trigger outreach |
| 12 | Audit & Guardrail | final-pass review of every output before it is sent |

It never approves payments, changes bank details, edits ERP accounting records,
or makes fraud decisions — those always escalate to a named human team with a
priority and SLA.

## How it works

```
Vendor message
  → Intent Router            (LLM: classify + extract entities)
  → Identity verification    (deterministic: sender vs approved contacts/domains)
  → Policy & risk guardrails (deterministic: hard-escalation rules)
  → Specialist agent         (deterministic lookups + LLM-worded reply)
  → Send reply OR escalate
  → Audit log + metrics
```

**Design principle:** the LLM does *only* language work — intent classification,
entity extraction, and response wording. Every decision (identity, record
lookups, escalation) is deterministic code the LLM cannot override. That keeps
the sensitive path auditable and makes "100% high-risk escalation" achievable.

If no `ANTHROPIC_API_KEY` is set, a deterministic rules engine takes over so the
prototype always runs.

## Run it

```bash
cd vendor-ops-agent
npm install                 # root (concurrently)
npm run install:all         # server + web deps

# optional: enable the real LLM
cp server/.env.example server/.env   # paste ANTHROPIC_API_KEY

npm run dev                 # API on :8787, web on :5173
```

Open http://localhost:5173. Click an example scenario, hit **Process message**,
and watch the decision card + dashboard update.

## Test / eval

```bash
npm test          # runs the spec's scenarios through the full pipeline
```

The suite asserts the demo scenarios resolve and that every high-risk request
(bank change, dispute, fraud, unverified sender) escalates — escalation
precision target = 100%.

## Layout

```
server/
  index.js              Express API
  agents/               router + 3 specialists + shared helpers
  services/             apLookup, identityCheck, policyGuardrails, auditLog, llm, config
  data/                 mock vendors / invoices / payments / remittances
  prompts/              router + response prompts
  scenarios.js          canned demo messages
  tests/                pipeline + escalation eval
web/                    Vite + React + Tailwind UI
```

## Demo script

Open the triage inbox (seeds itself with 28 pre-flagged messages) and click
through, in order:

1. **Payment inquiry** — "Where is payment for invoice 8842?" → Payment Inquiry Agent resolves with no human help.
2. **Remittance** — "$8,200 payment" → Remittance Agent breaks it into invoices 1120/1121/1125.
3. **Outreach** — "Ask ABC Supplies to switch…" → Outreach Agent drafts the enrollment email.
4. **Failed payment** — "P9003 ACH return" → Payment Delivery Agent maps R03 to a secure correction workflow.
5. **Reconciliation** — "ERP says INV-8842 unpaid…" → Reconciliation Agent explains the timing gap, creates a resync task.
6. **Invoice exception** — "INV-5002 vs PO-3002" → Exception Agent drafts a corrected-invoice request.
7. **Approval chase** — "INV-7004 pending 5 days" → Follow-up Agent reminds the assigned approver.
8. **Duplicate flag** — "INV-1009 looks similar to INV-1008" → hold recommended, operator notified.
9. **Bank change** — "We changed banks…" → guardrail blocks auto-action, routes to Vendor Master Team (4h SLA).
10. **Approve & send** a few drafts → ERP write-back posts; **Analytics** shows resolved cases, escalations, risk blocks, and manual hours saved.

## Guardrails (always escalate)

Bank account changes · payment-amount disputes · fraud / tax / legal · payments
over the high-value threshold · record conflicts · multiple matching records ·
low LLM confidence · unverified vendor. Responses never expose full bank
numbers, internal risk scores, or other vendors' data.

## Scope / non-goals

No real emails are sent (outreach is drafted + status proposed). No real money
movement, ERP writes, or bank changes. Mock data only.

## Deployment

Live at https://vendor-ops-agent.vercel.app — deployed from this repo via the
Vercel Git integration (every push to `main` triggers a production deploy;
branches get preview URLs). API runs as a single serverless function
([api/index.js](api/index.js)); the web app is served statically from `web/dist`.
To enable the real LLM in production: `npx vercel env add ANTHROPIC_API_KEY production`.
