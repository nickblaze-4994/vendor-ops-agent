import { useEffect, useMemo, useState, useCallback } from 'react';

const api = (path, opts) => fetch(`/api${path}`, opts).then((r) => r.json());

/* ------------------------------------------------------------------ icons */
const Icon = ({ d, className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" className={className}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);
const ICONS = {
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  alert: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  chart: ['M3 3v18h18', 'M18 17V9', 'M13 17V5', 'M8 17v-3'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
  send: ['M22 2 11 13', 'M22 2 15 22l-4-9-9-4 20-7z'],
  sparkle: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z'],
  check: ['M20 6 9 17l-5-5'],
  edit: ['M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  plus: ['M12 5v14', 'M5 12h14'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
  back: ['M15 18l-6-6 6-6'],
  flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
  database: ['M12 8c4.42 0 8-1.34 8-3s-3.58-3-8-3-8 1.34-8 3 3.58 3 8 3z', 'M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5', 'M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6'],
  bolt: ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
};

/* ------------------------------------------------------------------ utils */
const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// Best-effort display name from an email before the agent verifies the vendor.
const senderName = (email = '') => {
  const domain = (email.split('@')[1] || '').split('.')[0];
  return domain ? domain.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : email;
};

const subjectFor = (item) =>
  item.scenarioLabel || item.message.replace(/\s+/g, ' ').trim().slice(0, 48);

const timeAgo = (iso) => {
  if (!iso) return '';
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

const AGENT_SHORT = {
  payment_inquiry: 'Payment Inquiry',
  remittance_request: 'Remittance',
  vendor_outreach: 'Outreach',
  failed_payment: 'Failed Payment',
  reconciliation_break: 'Reconciliation',
  vendor_data_update_request: 'Vendor Data',
  invoice_exception: 'Invoice Exception',
  approval_follow_up: 'Approval Chase',
  duplicate_payment_risk: 'Duplicate Risk',
  late_payment_risk: 'Late Risk',
  payment_method_optimization: 'Method Optimization',
  bank_change_request: 'Bank Change',
  fraud_or_dispute: 'Dispute',
  tax_or_legal_request: 'Tax / Legal',
  unknown: 'Unclassified',
};

// disposition derived from the case's workflow status
function disposition(item) {
  switch (item.status) {
    case 'pending': return { key: 'pending', label: 'Pending triage', tone: 'slate' };
    case 'processing': return { key: 'processing', label: 'Agent working…', tone: 'indigo' };
    case 'sent': return { key: 'sent', label: 'Resolved · sent', tone: 'slate' };
    case 'assigned': return { key: 'assigned', label: 'Assigned to specialist', tone: 'violet' };
    case 'draft': return { key: 'draft', label: 'Reply drafted', tone: 'emerald' };
    case 'escalated': return { key: 'escalated', label: 'Escalated', tone: 'amber' };
    default: return { key: 'pending', label: 'Pending triage', tone: 'slate' };
  }
}

const TONE = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
};

// Workspace queues: communications vs system-event work, the way real AP
// platforms split their left nav. Items are assigned by intent (predicted
// pre-triage, actual once processed), with the seed group as fallback.
const QUEUES = [
  { id: 'inbox', label: 'Triage inbox', icon: 'inbox', blurb: 'Vendor emails & portal messages' },
  { id: 'payment-ops', label: 'Payment ops', icon: 'bolt', blurb: 'Failed payments & reconciliation' },
  { id: 'invoice-desk', label: 'Invoice desk', icon: 'edit', blurb: 'Exceptions, approvals & risk' },
  { id: 'vendor-ops', label: 'Vendor outreach', icon: 'send', blurb: 'Onboarding & method conversion' },
];

const INTENT_WORKSPACE = {
  payment_inquiry: 'inbox',
  remittance_request: 'inbox',
  vendor_data_update_request: 'inbox',
  bank_change_request: 'inbox',
  fraud_or_dispute: 'inbox',
  tax_or_legal_request: 'inbox',
  unknown: 'inbox',
  failed_payment: 'payment-ops',
  reconciliation_break: 'payment-ops',
  invoice_exception: 'invoice-desk',
  approval_follow_up: 'invoice-desk',
  duplicate_payment_risk: 'invoice-desk',
  late_payment_risk: 'invoice-desk',
  vendor_outreach: 'vendor-ops',
  payment_method_optimization: 'vendor-ops',
};

const GROUP_WORKSPACE = {
  'Failed Payments': 'payment-ops',
  'Reconciliation': 'payment-ops',
  'Invoice Exceptions': 'invoice-desk',
  'Approvals & Payment Risk': 'invoice-desk',
  'Vendor Outreach': 'vendor-ops',
  'Method Optimization': 'vendor-ops',
};

function workspaceOf(item) {
  const intent = item.result?.intent || item.prediction?.intent;
  if (intent && INTENT_WORKSPACE[intent]) return INTENT_WORKSPACE[intent];
  return GROUP_WORKSPACE[item.group] || 'inbox';
}

// AI pre-triage flag shown on untouched tickets (prediction from message text only).
function predictionFlag(p) {
  if (!p) return null;
  if (p.prediction === 'escalation' && p.severity === 'high')
    return { label: 'High-risk', cls: 'text-rose-700 bg-rose-50 ring-rose-600/20' };
  if (p.prediction === 'escalation')
    return { label: 'Will escalate', cls: 'text-amber-700 bg-amber-50 ring-amber-600/20' };
  if (p.prediction === 'auto')
    return { label: 'Auto-resolvable', cls: 'text-emerald-700 bg-emerald-50 ring-emerald-600/20' };
  return { label: 'Needs review', cls: 'text-slate-500 bg-slate-100 ring-slate-500/20' };
}

/* ------------------------------------------------------------------ app */
export default function App() {
  const [health, setHealth] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [items, setItems] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('inbox');
  const [filter, setFilter] = useState('all');
  const [composer, setComposer] = useState(false);
  const [seeding, setSeeding] = useState(true);
  const [query, setQuery] = useState('');

  const vendorName = useCallback(
    (id) => vendors.find((v) => v.vendor_id === id)?.vendor_name,
    [vendors],
  );

  const refreshMetrics = useCallback(() => api('/metrics').then(setMetrics), []);

  // Seed the inbox with UNTRIAGED inbound messages. The agent runs live when a
  // message is opened — nothing is pre-resolved.
  useEffect(() => {
    (async () => {
      const [h, scn, vnd] = await Promise.all([api('/health'), api('/scenarios'), api('/vendors')]);
      setHealth(h);
      setScenarios(scn);
      setVendors(vnd);
      await api('/reset', { method: 'POST' });

      let n = 0;
      const seeded = scn.flatMap((g) =>
        g.items.map((it) => ({
          id: `M${++n}`,
          message: it.message,
          senderEmail: it.senderEmail,
          scenarioLabel: it.label,
          group: g.group,
          result: null,
          status: 'pending',
        })),
      );
      setItems(seeded);
      setSeeding(false);

      // Hydrate AI pre-triage flags (language-only prediction, no records touched).
      try {
        const preds = await api('/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: seeded.map((s) => ({ id: s.id, message: s.message, senderEmail: s.senderEmail })),
          }),
        });
        setItems((prev) => prev.map((it) => ({ ...it, prediction: preds[it.id] || it.prediction })));
      } catch { /* flags are progressive enhancement */ }
    })();
  }, []);

  // Run the agent on a single message in real time.
  const processItem = useCallback(async (item) => {
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: 'processing' } : it)));
    const [result] = await Promise.all([
      api('/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: item.message, senderEmail: item.senderEmail }),
      }),
      new Promise((r) => setTimeout(r, 1500)), // let the pipeline animation play
    ]);
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, result, status: result.resolved ? 'draft' : 'escalated' } : it,
      ),
    );
    refreshMetrics();
  }, [refreshMetrics]);

  const selectItem = (id) => {
    setSelectedId(id);
    if (!id) return;
    const item = items.find((i) => i.id === id);
    if (item && !item.result && item.status !== 'processing') processItem(item);
  };

  const addMessage = ({ message, senderEmail }) => {
    const item = {
      id: `M${Date.now()}`, message, senderEmail,
      scenarioLabel: null, group: 'Manual', result: null, status: 'pending',
    };
    setItems((prev) => [item, ...prev]);
    setSelectedId(item.id);
    setView('inbox');
    setFilter('all');
    processItem(item);
  };

  // Human approves → commit the resolution activity to the ERP system of record.
  const resolveCase = async (item, nextStatus, erpOverride) => {
    const payload = erpOverride || item.result?.erp;
    let committed = null;
    if (payload) {
      committed = await api('/erp/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, ticket_id: item.result?.ticket_id }),
      });
    }
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, status: nextStatus, erpCommitted: committed } : it)),
    );
  };

  const selected = items.find((i) => i.id === selectedId) || null;
  const isQueue = QUEUES.some((qu) => qu.id === view);

  // Actionable case count per work queue (badge in the sidebar).
  const queueCounts = useMemo(() => {
    const c = Object.fromEntries(QUEUES.map((qu) => [qu.id, 0]));
    for (const it of items) {
      if (['pending', 'processing', 'draft', 'escalated'].includes(it.status)) {
        c[workspaceOf(it)] += 1;
      }
    }
    return c;
  }, [items]);

  // Search is global (across all queues); otherwise scope to the active queue.
  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return items.filter((i) =>
        [
          i.message, i.scenarioLabel, i.senderEmail, senderName(i.senderEmail),
          i.result?.vendor_id, vendorName(i.result?.vendor_id),
          i.result?.intent, i.result?.escalation_reason,
          ...Object.values(i.result?.entities || {}),
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return items.filter((i) => workspaceOf(i) === view);
  }, [items, query, view, vendorName]);

  const filtered = useMemo(() => {
    if (filter === 'pending') return scoped.filter((i) => i.status === 'pending' || i.status === 'processing');
    if (filter === 'ready') return scoped.filter((i) => i.status === 'draft');
    if (filter === 'escalated') return scoped.filter((i) => i.status === 'escalated' || i.status === 'assigned');
    if (filter === 'sent') return scoped.filter((i) => i.status === 'sent');
    return scoped;
  }, [scoped, filter]);

  // Typing a search always surfaces the result list (master view).
  const onSearch = (q) => {
    setQuery(q);
    if (!isQueue) setView('inbox');
    if (q) setSelectedId(null);
  };

  // Switching work queues shows that queue's list, not a stale selection.
  const switchView = (v) => {
    setView(v);
    if (QUEUES.some((qu) => qu.id === v)) setSelectedId(null);
  };

  return (
    <div className="h-screen flex bg-slate-50 text-slate-800 text-sm">
      <Sidebar view={view} setView={switchView} queueCounts={queueCounts} health={health} />

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onCompose={() => setComposer(true)} query={query} onSearch={onSearch} />

        {isQueue && (
          <Inbox
            items={filtered}
            counts={{ all: scoped.length, pending: scoped.filter((i) => i.status === 'pending' || i.status === 'processing').length }}
            filter={filter} setFilter={setFilter}
            selected={selected} onSelect={selectItem} vendorName={vendorName}
            seeding={seeding} onResolve={resolveCase}
          />
        )}
        {view === 'analytics' && <Analytics metrics={metrics} />}
        {view === 'vendors' && <Vendors vendors={vendors} />}
      </div>

      {composer && (
        <Composer scenarios={scenarios} onClose={() => setComposer(false)} onSubmit={addMessage} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ chrome */
function Sidebar({ view, setView, queueCounts, health }) {
  const Item = ({ id, icon, label, badge, title }) => (
    <button onClick={() => setView(id)} title={title}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition
        ${view === id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
      <Icon d={ICONS[icon]} />
      <span className="flex-1 font-medium">{label}</span>
      {badge > 0 && (
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${view === id ? 'bg-white/20' : 'bg-slate-200 text-slate-600'}`}>
          {badge}
        </span>
      )}
    </button>
  );
  return (
    <aside className="w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col">
      <div className="px-4 h-14 flex items-center gap-2.5 border-b border-slate-200">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white grid place-items-center font-bold">C</div>
        <div className="leading-tight">
          <div className="font-semibold text-slate-800">Corpay AP</div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <Icon d={ICONS.sparkle} className="w-3 h-3 text-indigo-500" /> AI Operations Desk
          </div>
        </div>
      </div>

      <nav className="p-3 space-y-1">
        <p className="px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Work queues</p>
        {QUEUES.map((q) => (
          <Item key={q.id} id={q.id} icon={q.icon} label={q.label} badge={queueCounts[q.id]} title={q.blurb} />
        ))}
        <p className="px-3 pt-4 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Insights</p>
        <Item id="analytics" icon="chart" label="Analytics" />
        <Item id="vendors" icon="users" label="Vendor directory" />
      </nav>

      <div className="mt-auto p-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${health?.llm ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="font-medium text-slate-600">Agent engine</span>
          </div>
          <p className="text-slate-400 font-mono text-[11px] truncate">
            {health ? (health.llm ? health.model : 'rules fallback') : '…'}
          </p>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ onCompose, query, onSearch }) {
  return (
    <header className="h-14 shrink-0 bg-white border-b border-slate-200 flex items-center gap-4 px-5">
      <div className="flex items-center gap-2 text-slate-500">
        <span className="font-medium text-slate-700">Acme Corp</span>
        <span className="text-slate-300">/</span>
        <span>AP Operations</span>
      </div>
      <div className="flex-1 max-w-md relative">
        <Icon d={ICONS.search} className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={query} onChange={(e) => onSearch(e.target.value)}
          placeholder="Search messages, vendors, invoices…"
          className="w-full bg-slate-100 rounded-lg pl-9 pr-8 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
        {query && (
          <button onClick={() => onSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <Icon d={ICONS.x} className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {/* Stand-in for a live email integration: injects a new inbound into the queue. */}
      <button onClick={onCompose} title="No live email hookup in this prototype — this injects a new inbound vendor email into the queue"
        className="flex items-center gap-1.5 border border-slate-300 hover:bg-slate-50 text-slate-600 px-3.5 py-2 rounded-lg font-medium">
        <Icon d={ICONS.plus} /> New test email
      </button>
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white grid place-items-center text-xs font-semibold">AP</div>
    </header>
  );
}

/* ------------------------------------------------------------------ inbox */
function Inbox({ items, counts, filter, setFilter, selected, onSelect, vendorName, seeding, onResolve }) {
  const tabs = [
    { id: 'all', label: 'All', n: counts.all },
    { id: 'pending', label: 'Pending', n: counts.pending },
    { id: 'ready', label: 'Ready to send' },
    { id: 'escalated', label: 'Escalated' },
    { id: 'sent', label: 'Resolved' },
  ];
  return (
    <div className="flex-1 flex min-h-0">
      {/* Message list: full-width on narrow screens, hidden once an item is open;
          fixed rail alongside the detail on wide screens. */}
      <div className={`w-full xl:w-[360px] shrink-0 border-r border-slate-200 bg-white flex-col
        ${selected ? 'hidden xl:flex' : 'flex'}`}>
        <div className="px-4 pt-3 flex gap-1 border-b border-slate-200 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setFilter(t.id)}
              className={`px-2.5 py-2 text-xs font-medium border-b-2 -mb-px transition whitespace-nowrap
                ${filter === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              {t.label}{t.n != null && <span className="ml-1 text-slate-300">{t.n}</span>}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {seeding && <div className="p-8 text-center text-slate-400 text-sm">Agent triaging inbox…</div>}
          {!seeding && items.length === 0 && <div className="p-8 text-center text-slate-400 text-sm">No messages in this view.</div>}
          {items.map((it) => (
            <Row key={it.id} item={it} active={selected?.id === it.id}
              onSelect={() => onSelect(it.id)} vendorName={vendorName} />
          ))}
        </div>
      </div>

      {/* Detail: takes the full width on narrow screens (with a back link), or
          fills the remaining space on wide screens. */}
      <div className={`flex-1 min-w-0 overflow-y-auto bg-slate-50
        ${selected ? 'block' : 'hidden xl:block'}`}>
        {selected
          ? <Detail item={selected} vendorName={vendorName} onResolve={onResolve} onBack={() => onSelect(null)} />
          : <div className="h-full grid place-items-center text-slate-400">Select a message to review</div>}
      </div>
    </div>
  );
}

function Row({ item, active, onSelect, vendorName }) {
  const d = disposition(item);
  const r = item.result;
  const name = (r && vendorName(r.vendor_id)) || senderName(item.senderEmail);
  const isNew = item.status === 'pending';
  return (
    <button onClick={onSelect}
      className={`w-full text-left px-4 py-3 border-b border-slate-100 flex gap-3 transition
        ${active ? 'bg-indigo-50/60 border-l-2 border-l-indigo-600' : 'hover:bg-slate-50 border-l-2 border-l-transparent'}`}>
      <div className="relative w-9 h-9 shrink-0 rounded-full bg-slate-200 text-slate-600 grid place-items-center text-xs font-semibold">
        {initials(name)}
        {isNew && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-2 ring-white" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate ${isNew ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'}`}>{name}</span>
          <span className="ml-auto text-[11px] text-slate-400 shrink-0">{r ? `${timeAgo(r.timestamp)} ago` : 'new'}</span>
        </div>
        <div className="text-slate-600 truncate">{subjectFor(item)}</div>
        <div className="flex items-center gap-1.5 mt-1.5">
          {r && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
              {AGENT_SHORT[r.intent] || r.intent}
            </span>
          )}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 ring-inset font-medium ${TONE[d.tone]}`}>{d.label}</span>
          {!r && (() => {
            const f = predictionFlag(item.prediction);
            if (!f) return null;
            const p = item.prediction;
            const tip = `AI prediction (pre-triage): ${AGENT_SHORT[p.intent] || p.intent}` +
              (p.confidence != null ? ` · ${Math.round(p.confidence * 100)}%` : '') +
              (p.team ? ` → ${p.team}` : '');
            return (
              <span title={tip}
                className={`ml-auto inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ring-1 ring-inset font-medium ${f.cls}`}>
                <Icon d={ICONS.flag} className="w-2.5 h-2.5" /> {f.label}
              </span>
            );
          })()}
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ detail */
function Detail({ item, vendorName, onResolve, onBack }) {
  const { result } = item;
  const d = disposition(item);
  const processing = item.status === 'processing';
  const name = (result && vendorName(result.vendor_id)) || senderName(item.senderEmail);
  const resolved = result?.resolved;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <button onClick={onBack}
        className="xl:hidden inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 -mb-1">
        <Icon d={ICONS.back} className="w-4 h-4" /> Back to queue
      </button>

      {/* vendor header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-slate-200 text-slate-600 grid place-items-center font-semibold">{initials(name)}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-slate-800 truncate">{name}</h2>
            {result?.vendor_id && (
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{result.vendor_id}</span>
            )}
            {result?.routing?.verification_method && result.routing.verification_method !== 'none' && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                <Icon d={ICONS.shield} className="w-3.5 h-3.5" /> verified
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">Email · {item.senderEmail}</p>
        </div>
        <span className={`ml-auto text-xs px-2.5 py-1 rounded-full ring-1 ring-inset font-medium ${TONE[d.tone]}`}>{d.label}</span>
      </div>

      {/* inbound message */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <Icon d={ICONS.inbox} className="w-3.5 h-3.5" /> Inbound message
          <span className="ml-auto flex items-center gap-1">
            <Icon d={ICONS.clock} className="w-3 h-3" />{result ? `${timeAgo(result.timestamp)} ago` : 'just now'}
          </span>
        </div>
        <p className="text-slate-700 leading-relaxed">{item.message}</p>
      </div>

      {/* live pipeline while the agent works */}
      {processing && <AgentRunning />}

      {/* agent analysis once resolved */}
      {result && !processing && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-slate-200">
              <Icon d={ICONS.sparkle} className="w-4 h-4 text-indigo-600" />
              <span className="font-semibold text-slate-700">{result.agent}</span>
              <span className="text-xs text-slate-400">{result.ticket_id}</span>
              <div className="ml-auto"><Confidence value={result.confidence} /></div>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex flex-wrap gap-1.5">
                <Chip k="intent" v={result.intent} accent />
                {Object.entries(result.entities || {}).map(([k, v]) => <Chip key={k} k={k} v={String(v)} />)}
              </div>

              <Evidence text={result.audit_notes} />

              {result.records_checked?.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                  <Icon d={ICONS.database} className="w-3.5 h-3.5" />
                  <span>Systems checked:</span>
                  {result.records_checked.map((r) => (
                    <span key={r} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">{r}</span>
                  ))}
                </div>
              )}

              {result.guardrail && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <Icon d={ICONS.shield} className={`w-3.5 h-3.5 ${result.guardrail.passed ? 'text-emerald-600' : 'text-rose-600'}`} />
                  <span className="text-slate-400">Guardrail review:</span>
                  {result.guardrail.checks.map((c) => (
                    <span key={c.name} title={c.note || c.name}
                      className={`px-1.5 py-0.5 rounded font-mono ${c.pass ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {c.pass ? '✓' : '✗'} {c.name}
                    </span>
                  ))}
                </div>
              )}

              {resolved
                ? <DraftReply item={item} onResolve={onResolve} />
                : <Escalation item={item} onResolve={onResolve} />}
            </div>
          </div>

          {/* ERP / system-of-record write-back */}
          <ErpCard erp={result.erp} committed={item.erpCommitted} />
        </>
      )}
    </div>
  );
}

/* live pipeline stepper */
function AgentRunning() {
  const steps = [
    'Classifying intent',
    'Verifying vendor identity',
    'Querying AP records (invoices · payments)',
    'Applying policy & risk guardrails',
    'Drafting vendor response',
  ];
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActive((a) => Math.min(a + 1, steps.length - 1)), 300);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-indigo-700 mb-3">
        <Icon d={ICONS.bolt} className="w-4 h-4" /> Agent working…
      </div>
      <ol className="space-y-2.5">
        {steps.map((s, i) => {
          const done = i < active, current = i === active;
          return (
            <li key={s} className="flex items-center gap-2.5 text-sm">
              {done ? (
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 grid place-items-center"><Icon d={ICONS.check} className="w-3 h-3" /></span>
              ) : current ? (
                <span className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
              ) : (
                <span className="w-5 h-5 rounded-full border border-slate-200" />
              )}
              <span className={done ? 'text-slate-500' : current ? 'text-slate-800 font-medium' : 'text-slate-300'}>{s}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ERP write-back card */
function ErpCard({ erp, committed }) {
  if (!erp) return null;
  return (
    <div className={`rounded-xl border p-4 ${committed ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon d={ICONS.database} className="w-4 h-4 text-slate-500" />
        <span className="font-semibold text-slate-700">System of record · Acme ERP</span>
        <span className={`ml-auto text-[11px] px-2 py-0.5 rounded-full ring-1 ring-inset font-medium ${committed ? TONE.emerald : TONE.slate}`}>
          {committed ? 'Posted' : 'Pending approval'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs mb-3">
        <Field label="Record" value={`${erp.record_type} ${erp.record_id}`} />
        <Field label="Activity" value={erp.activity_type} />
        <Field label="Status set" value={erp.status_set || '—'} />
      </div>
      <p className="text-xs text-slate-600 leading-relaxed mb-2">{erp.note}</p>
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-700">
        <Icon d={ICONS.shield} className="w-3.5 h-3.5" />
        Accounting fields modified: <span className="font-medium">none</span>
        <span className="text-slate-400">(amounts, bank details &amp; GL stay human-only)</span>
      </div>
      {committed && (
        <p className="mt-2 text-[11px] font-mono text-emerald-700">
          ✓ {committed.erp_activity_id} · posted to {erp.record_type} {erp.record_id} timeline
        </p>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="font-medium text-slate-700 break-words">{value}</div>
    </div>
  );
}

function Confidence({ value }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const tone = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-400">confidence</span>
      <div className="w-20 h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-600 tabular-nums">{pct}%</span>
    </div>
  );
}

const Chip = ({ k, v, accent }) => (
  <span className={`text-xs px-2 py-1 rounded-md font-mono ${accent ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
    <span className="opacity-50">{k}:</span> {v}
  </span>
);

function Evidence({ text }) {
  if (!text) return null;
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1 flex items-center gap-1">
        <Icon d={ICONS.check} className="w-3 h-3" /> Why · records checked
      </p>
      <p className="text-xs text-slate-600 leading-relaxed">{text}</p>
    </div>
  );
}

function DraftReply({ item, onResolve }) {
  const [text, setText] = useState(item.result.response || '');
  const [busy, setBusy] = useState(false);
  const sent = item.status === 'sent';
  const send = async () => { setBusy(true); await onResolve(item, 'sent'); setBusy(false); };
  const escalate = () => onResolve(item, 'assigned', {
    record_type: 'vendor', record_id: item.result.vendor_id || 'unmatched', vendor_id: item.result.vendor_id,
    activity_type: 'manual_override', status_set: 'needs_human_review',
    note: 'Operator overrode the AI draft and escalated to a specialist.', fields_changed: [],
  });
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">
        {sent ? 'Sent to vendor' : 'Suggested reply · review before sending'}
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} disabled={sent}
        className={`w-full rounded-lg border p-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30
          ${sent ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-white border-slate-300'}`} />
      <div className="flex items-center gap-2 mt-3">
        {sent ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
            <Icon d={ICONS.check} /> Reply sent · ERP updated · case closed
          </span>
        ) : (
          <>
            <button onClick={send} disabled={busy}
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3.5 py-2 rounded-lg font-medium shadow-sm">
              <Icon d={ICONS.send} /> {busy ? 'Sending…' : 'Approve & send'}
            </button>
            <button onClick={escalate}
              className="inline-flex items-center gap-1.5 border border-slate-300 hover:bg-slate-50 text-slate-600 px-3.5 py-2 rounded-lg font-medium">
              <Icon d={ICONS.alert} className="w-4 h-4" /> Escalate instead
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Escalation({ item, onResolve }) {
  const [busy, setBusy] = useState(false);
  const assigned = item.status === 'assigned';
  const route = item.result.human_routing;
  const assign = async () => { setBusy(true); await onResolve(item, 'assigned'); setBusy(false); };
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 text-amber-800 font-medium mb-1">
        <Icon d={ICONS.alert} className="w-4 h-4" /> Held for human review
      </div>
      <p className="text-sm text-amber-700">
        Reason: <span className="font-mono">{item.result.escalation_reason}</span>
      </p>
      <p className="text-xs text-amber-600/80 mt-1">
        The agent did not act automatically — this involves bank, fraud, dispute, or an unverified
        request and requires an AP specialist.
      </p>
      {route && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-amber-700">Routes to</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white ring-1 ring-inset ring-amber-600/20 font-medium text-amber-800">
            <Icon d={ICONS.user} className="w-3 h-3" /> {route.team}
          </span>
          <span className={`px-2 py-0.5 rounded-full ring-1 ring-inset font-medium uppercase tracking-wide text-[10px]
            ${route.priority === 'urgent' ? 'bg-rose-50 text-rose-700 ring-rose-600/20' : route.priority === 'high' ? 'bg-amber-100 text-amber-800 ring-amber-600/30' : 'bg-white text-amber-700 ring-amber-600/20'}`}>
            {route.priority}
          </span>
          <span className="text-amber-700">SLA {route.sla_hours}h</span>
        </div>
      )}
      <div className="mt-3">
        {assigned ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-violet-700 font-medium">
            <Icon d={ICONS.check} /> Assigned to {route?.team || 'AP specialist'} · exception logged to ERP
          </span>
        ) : (
          <button onClick={assign} disabled={busy}
            className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-3.5 py-2 rounded-lg font-medium shadow-sm">
            <Icon d={ICONS.user} className="w-4 h-4" /> {busy ? 'Assigning…' : `Assign to ${route?.team || 'specialist'}`}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ analytics */
function Analytics({ metrics }) {
  if (!metrics) return <div className="p-8 text-slate-400">Loading…</div>;
  const pct = (n) => `${Math.round(n * 100)}%`;
  const cards = [
    { label: 'Messages processed', value: metrics.total, sub: 'this session' },
    { label: 'Auto-resolution rate', value: pct(metrics.auto_resolution_rate), sub: `${metrics.resolved} resolved`, accent: 'text-emerald-600' },
    { label: 'Escalated to humans', value: metrics.escalated, sub: 'routed to specialist teams', accent: 'text-amber-600' },
    { label: 'Risk blocks', value: metrics.risk_blocks ?? 0, sub: 'high-risk actions stopped', accent: 'text-rose-600' },
    { label: 'Manual hours saved', value: metrics.manual_hours_saved, sub: 'vs. manual handling', accent: 'text-indigo-600' },
  ];
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-lg font-semibold text-slate-800 mb-1">Operations analytics</h1>
      <p className="text-slate-400 mb-5">How much AP-operations work the AI desk absorbed.</p>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className={`text-3xl font-semibold ${c.accent || 'text-slate-800'}`}>{c.value}</div>
            <div className="text-sm text-slate-600 mt-1">{c.label}</div>
            <div className="text-xs text-slate-400">{c.sub}</div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-700 mb-4">Auto-resolution by workflow</h2>
        <div className="space-y-3">
          {Object.entries(metrics.per_intent).map(([intent, s]) => (
            <div key={intent} className="flex items-center gap-3">
              <span className="w-40 text-sm text-slate-600">{AGENT_SHORT[intent] || intent}</span>
              <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${s.auto_resolution_rate * 100}%` }} />
              </div>
              <span className="w-28 text-right text-xs text-slate-400 tabular-nums">
                {s.resolved}/{s.total} · {Math.round(s.auto_resolution_rate * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ vendors */
function Vendors({ vendors }) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-lg font-semibold text-slate-800 mb-1">Vendor directory</h1>
      <p className="text-slate-400 mb-5">Mock vendor master used for identity verification and lookups.</p>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wide">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Approved contact</th>
              <th className="px-4 py-3 font-medium">Pay method</th>
              <th className="px-4 py-3 font-medium">Enrollment</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.vendor_id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 grid place-items-center text-xs font-semibold">{initials(v.vendor_name)}</div>
                    <div>
                      <div className="font-medium text-slate-800">{v.vendor_name}</div>
                      <div className="text-[11px] font-mono text-slate-400">{v.vendor_id}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{v.contact}</td>
                <td className="px-4 py-3"><span className="uppercase text-xs font-medium text-slate-600">{v.payment_method}</span></td>
                <td className="px-4 py-3">
                  {v.enrollment_status === 'enrolled'
                    ? <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">enrolled</span>
                    : <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-500/20">not enrolled</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ composer */
function Composer({ scenarios, onClose, onSubmit }) {
  const [senderEmail, setSenderEmail] = useState('ap@acme-industrial.com');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!message.trim()) return;
    setBusy(true);
    await onSubmit({ message, senderEmail });
    setBusy(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm grid place-items-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">New test vendor email</h3>
          <p className="sr-only">Stand-in for a live email integration</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><Icon d={ICONS.x} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">From (sender email)</label>
            <input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Message</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Paste a vendor email…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Or start from an example</p>
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {scenarios.map((g) => (
                <div key={g.group}>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{g.group}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.items.map((it) => (
                      <button key={it.label} onClick={() => { setMessage(it.message); setSenderEmail(it.senderEmail); }}
                        className="text-xs rounded-full border border-slate-200 px-2.5 py-1 hover:border-indigo-400 hover:text-indigo-600">
                        {it.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-medium">Cancel</button>
          <button onClick={submit} disabled={busy || !message.trim()}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium shadow-sm">
            <Icon d={ICONS.sparkle} /> {busy ? 'Triaging…' : 'Send to inbox'}
          </button>
        </div>
      </div>
    </div>
  );
}
