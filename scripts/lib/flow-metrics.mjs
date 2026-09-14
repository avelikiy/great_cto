#!/usr/bin/env node
// flow-metrics — how long a decision waits at a gate.
//
// Gate beads carry `created_at` and `closed_at`; nothing computed the difference.
// For a solo CTO the bottleneck of the pipeline is their own signature, and until
// now it was the one step nobody measured.
//
// The one place that tried was /inbox's stale-gate block, and it could not fire:
// it took the task id as the first field of `bd list`, which is the status symbol
// `○`, then grepped `created:` where bd prints `Created:`. Checked 2026-09-14 in
// two projects with gates open since 2026-07-11 — never reported stale.
//
// Three rules, each the same rule this repository applies everywhere:
//   - a store that could not be read is `unmeasured`, never zero gates;
//   - under MIN_SAMPLE closed gates the values are listed, not summarised —
//     across 17 projects there were 21 gate beads in total, so most projects sit
//     below it and a median would be a trend drawn through two points;
//   - a bead whose timestamps do not parse is counted in `untimed`, never read as
//     a zero-hour wait.
//
// CLI (used by scripts/cmd-data/inbox-data.sh):
//   node scripts/lib/flow-metrics.mjs [--stale-hours 24] [--json]

import { readGateBeads } from './gate-state.mjs';

export const MIN_SAMPLE = 5;

const HOUR = 3600 * 1000;
const hours = (ms) => Math.round((ms / HOUR) * 10) / 10;
const time = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s) ? Date.parse(s) : NaN);

function median(sorted) {
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : Math.round(((sorted[m - 1] + sorted[m]) / 2) * 10) / 10;
}

/**
 * @param {Array<object> & {unreadable?: boolean, why?: string}} beads — from readGateBeads()
 * @returns {{state:'unmeasured', why:string}
 *   | {state:'measured', untimed:number,
 *      closed:{n:number, median_h:number|null, max_h:number|null, values_h?:number[]},
 *      open:{n:number, oldest:{id,title,age_h}|null, stale:Array<{id,title,age_h}>}}}
 */
export function gateWaits(beads, { now = Date.now(), staleHours = 24 } = {}) {
  if (!Array.isArray(beads) || beads.unreadable) {
    return { state: 'unmeasured', why: (beads && beads.why) || 'gate beads could not be read' };
  }
  let untimed = 0;
  const waits = [];
  const opened = [];
  for (const b of beads) {
    const created = time(b?.created_at);
    const isClosed = String(b?.status || '').toLowerCase() === 'closed';
    if (!Number.isFinite(created)) { untimed++; continue; }
    if (isClosed) {
      const closedAt = time(b?.closed_at);
      if (!Number.isFinite(closedAt) || closedAt < created) { untimed++; continue; }
      waits.push(hours(closedAt - created));
    } else {
      opened.push({ id: b.id ?? null, title: b.title ?? '', age_h: hours(now - created) });
    }
  }
  waits.sort((a, b) => a - b);
  opened.sort((a, b) => b.age_h - a.age_h);

  const closed = {
    n: waits.length,
    median_h: waits.length >= MIN_SAMPLE ? median(waits) : null,
    max_h: waits.length ? waits[waits.length - 1] : null,
  };
  if (waits.length < MIN_SAMPLE) closed.values_h = waits;

  return {
    state: 'measured',
    untimed,
    closed,
    open: {
      n: opened.length,
      oldest: opened[0] ?? null,
      stale: opened.filter((g) => g.age_h > staleHours),
    },
  };
}

/** The /inbox sections. `## STALE_GATES` only when there is one; `## GATE_WAIT` always. */
export function formatInboxSections(r) {
  const out = [];
  if (r.state !== 'measured') {
    out.push('## GATE_WAIT', `not measured: ${r.why}`);
    return out.join('\n') + '\n\n';
  }
  if (r.open.stale.length) {
    out.push('## STALE_GATES');
    for (const g of r.open.stale) out.push(`STALE:${g.id} age:${g.age_h}h ${g.title}`.trimEnd());
    out.push('');
  }
  out.push('## GATE_WAIT');
  out.push(r.open.oldest
    ? `oldest open: ${r.open.oldest.id} waiting ${r.open.oldest.age_h}h (${r.open.n} open)`
    : 'no open gate');
  if (r.closed.median_h !== null) {
    out.push(`closed n=${r.closed.n}: median ${r.closed.median_h}h, max ${r.closed.max_h}h`);
  } else if (r.closed.n) {
    out.push(`closed n=${r.closed.n}: ${r.closed.values_h.map((h) => `${h}h`).join(', ')} (under ${MIN_SAMPLE}, no median)`);
  } else {
    out.push('closed n=0');
  }
  if (r.untimed) out.push(`untimed: ${r.untimed} gate bead(s) with timestamps that do not parse`);
  return out.join('\n') + '\n\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--stale-hours');
  const staleHours = i >= 0 && Number.isFinite(Number(argv[i + 1])) ? Number(argv[i + 1]) : 24;
  const r = gateWaits(readGateBeads({ cwd: process.cwd() }), { staleHours });
  process.stdout.write(argv.includes('--json') ? JSON.stringify(r, null, 2) + '\n' : formatInboxSections(r));
}
