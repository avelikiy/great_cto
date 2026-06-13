// scripts/lib/demo-feeder.mjs — inject realistic stub cases so the operator console comes alive
// for demos / first-run / sales. OFF unless explicitly enabled (GREAT_CTO_DEMO_FEED / --demo).
//
// Each tick mints a synthetic case in stub mode and runs it to the human gate — exactly like a
// real source-system push, but with no live connectors and no real writes. Capped so the inbox
// doesn't flood: it refills as the operator signs.

import { startRun, listRuns } from './run-store.mjs';

// Curated, recognisable verticals with varied recommendations — a good demo spread.
export const DEMO_VERTICALS = ['rcm', 'aml', 'mortgage', 'prior-auth', 'insurance', 'tax', 'collections', 'soc'];

// A human-readable case ref per vertical (CLAIM-1042, CASE-1043, …).
const REF_TAG = {
  rcm: 'CLAIM', aml: 'CASE', mortgage: 'LOAN', 'prior-auth': 'PA',
  insurance: 'CLM', tax: 'RET', collections: 'ACCT', soc: 'ALERT',
};

let _timer = null;
let _n = 0;

function nextRef(vertical) {
  _n++;
  return `${REF_TAG[vertical] || 'CASE'}-${1000 + _n}`;
}

/** Inject one synthetic case (stub mode, source:'demo'). Returns the run, or {error} on failure. */
export async function feedOnce({ verticals = DEMO_VERTICALS, tenant = 'default' } = {}) {
  const vertical = verticals[_n % verticals.length];
  const demoRef = nextRef(vertical);
  try {
    return await startRun(vertical, { mode: 'stub', tenant, payload: { demoRef, demo: true }, source: 'demo' });
  } catch (e) {
    return { error: e.message };   // e.g. safe-mode halt — skip this tick
  }
}

function pendingDemoCount(tenant) {
  try { return listRuns({ status: 'awaiting-approval', tenant }).filter((r) => r.source === 'demo').length; }
  catch { return 0; }
}

/** Start the feeder on an interval. Seeds one immediately; skips a tick when pending demo cases ≥ cap. */
export function startDemoFeeder({ intervalMs = 30000, verticals = DEMO_VERTICALS, tenant = 'default', cap = 12, log = () => {} } = {}) {
  stopDemoFeeder();
  log(`🎬 DEMO feeder ON — a synthetic case every ${Math.round(intervalMs / 1000)}s (cap ${cap} pending) across ${verticals.length} verticals. NOT for production.`);
  const tick = async () => {
    try {
      if (pendingDemoCount(tenant) >= cap) return;   // let the operator clear some first
      const run = await feedOnce({ verticals, tenant });
      if (run && run.id) log(`  🎬 demo case → ${run.vertical} ${run.id} (${run.status})`);
    } catch { /* never let the demo feeder crash the board */ }
  };
  _timer = setInterval(tick, intervalMs);
  if (_timer.unref) _timer.unref();   // don't keep the process alive just for the feeder
  tick();                              // seed one immediately
  return _timer;
}

export function stopDemoFeeder() { if (_timer) { clearInterval(_timer); _timer = null; } }
