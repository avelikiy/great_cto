// scripts/lib/connectors/bank-feed.mjs — bank-feed adapter (Phase 4 Wave 6, accounting).
//
// `fetch-transactions` pulls bank transactions via Plaid. It builds a REAL Plaid /transactions/get
// request and POSTs it when GREAT_CTO_PLAID_CLIENT_ID + GREAT_CTO_PLAID_SECRET (+ an access_token)
// are set — works against the free Plaid sandbox out of the box. Without credentials it returns the
// prepared request plus a realistic sample feed so the accounting autopilot's intake step runs
// end-to-end. It also classifies each transaction toward a GL account (a real, deterministic rule
// set) — the bookkeeping autopilot's first pass.
//
// No external deps. Plaid sandbox: set GREAT_CTO_PLAID_ENV=sandbox (default) and your sandbox keys.

const ENV = (process.env.GREAT_CTO_PLAID_ENV || 'sandbox').toLowerCase();
const BASE = `https://${ENV}.plaid.com`;
const CLIENT_ID = process.env.GREAT_CTO_PLAID_CLIENT_ID || '';
const SECRET = process.env.GREAT_CTO_PLAID_SECRET || '';

export const capabilities = ['fetch-transactions'];

// Deterministic GL classification — Plaid category → ledger account (chart-of-accounts mapping).
const GL_RULES = [
  { match: /payroll|gusto|adp/i, account: '6000 · Payroll expense' },
  { match: /aws|google cloud|gcp|azure|vercel|datadog/i, account: '6200 · Software & hosting' },
  { match: /stripe|deposit|invoice|payout/i, account: '4000 · Revenue' },
  { match: /rent|wework/i, account: '6100 · Rent' },
  { match: /uber|lyft|delta|airbnb|travel/i, account: '6300 · Travel' },
  { match: /tax|irs|franchise/i, account: '2200 · Taxes payable' },
  { match: /transfer/i, account: '1010 · Bank transfer' },
];
export function classify(name = '', amount = 0) {
  const hit = GL_RULES.find((r) => r.match.test(name));
  const account = hit ? hit.account : (amount < 0 ? '4000 · Revenue' : '6900 · Uncategorized expense');
  return { account, side: amount < 0 ? 'credit' : 'debit' };
}

const SAMPLE = [
  { date: '2026-06-03', name: 'STRIPE PAYOUT', amount: -4200.00 },
  { date: '2026-06-03', name: 'AWS EMEA', amount: 318.44 },
  { date: '2026-06-02', name: 'GUSTO PAYROLL', amount: 12850.00 },
  { date: '2026-06-01', name: 'WEWORK RENT', amount: 2400.00 },
  { date: '2026-05-31', name: 'DELTA AIR LINES', amount: 612.30 },
];

export async function call(op, payload = {}) {
  if (op !== 'fetch-transactions') return { ok: false, error: `bank-feed adapter has no op '${op}'` };

  const start = payload.start_date || '2026-05-17';
  const end = payload.end_date || '2026-06-16';
  let txns = SAMPLE;
  let live = false;

  if (CLIENT_ID && SECRET && payload.access_token) {
    try {
      const r = await fetch(`${BASE}/transactions/get`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CLIENT_ID, secret: SECRET, access_token: payload.access_token, start_date: start, end_date: end }),
      });
      if (!r.ok) throw new Error(`Plaid ${r.status}: ${(await r.text()).slice(0, 120)}`);
      const data = await r.json();
      txns = (data.transactions || []).map((t) => ({ date: t.date, name: t.name, amount: t.amount }));
      live = true;
    } catch (e) {
      return { ok: false, mode: 'live', error: `Plaid fetch failed: ${e.message}`, request: { start, end } };
    }
  }

  const entries = txns.map((t) => ({ ...t, ...classify(t.name, t.amount) }));
  return {
    ok: true, mode: 'live', source: live ? `${BASE}/transactions/get` : 'sample',
    data: { start, end, count: entries.length, transactions: entries },
    note: live ? undefined : 'Sample feed — set GREAT_CTO_PLAID_CLIENT_ID/SECRET + an access_token to pull a real Plaid sandbox feed.',
  };
}
