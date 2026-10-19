// One brief per gate (ADR-036) — what the approver is actually approving.
//
// Everything a gate decision needs was already recorded, in six places: the
// tree receipt, the change tier, the reversibility of the gate, the reviewers'
// verdicts, the second model's opinion, and which parts of the system the diff
// touches. The inbox showed a title. So a gate was approved on its title, or
// after reading logs by hand in a terminal.
//
// This is a projection, never an authority. It does not approve, does not
// write, and changes nothing about the token, the binding or who may approve.
// Three rules carry its weight:
//
//   • unknown is not pass — a source that could not be read gives a section
//     `unknown` with the reason; it never becomes an empty list;
//   • bound to the tree — the receipt the token was issued for is compared
//     with the tree now, and a move is the first thing said;
//   • a verdict counts only for the tree it saw — an approval of other bytes is
//     shown, and marked as such.
//
// Every input arrives already read, as `{ok, value}` or `{ok:false, why}`
// (see `settle`), so `gateBrief` does no I/O and each rule is testable alone.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareReceipts } from './receipt.mjs';
import { reversibilityOf } from './gate-reversibility.mjs';
import { groupOf } from './system-map.mjs';
import { parseVerdictLog } from './verdict-record.mjs';

/** A read, whatever happened to it, as a value or a reason. Never throws. */
export async function settle(read) {
  try {
    const value = await (typeof read === 'function' ? read() : read);
    return { ok: true, value };
  } catch (e) {
    return { ok: false, why: String(e?.message || e) };
  }
}

const MAX_FILES_SHOWN = 100;

function treeSection(token, binding, digest) {
  if (!binding.ok) return { key: 'tree', state: 'unknown', moved: null, why: binding.why };
  if (binding.value === null) return { key: 'tree', state: 'unknown', moved: null, why: 'not a git repository — there is no tree to bind an approval to' };
  if (!token?.receipt) return { key: 'tree', state: 'unknown', moved: null, why: 'no approval token was issued for this gate yet' };
  const cmp = compareReceipts(token.receipt, binding.value, { digest });
  // `landed` is committed-since and byte-identical: the same bytes, not a move.
  const moved = cmp.state !== 'matches';
  return { key: 'tree', state: 'recorded', moved, changed: cmp.changed || [], added: cmp.added || [], removed: cmp.removed || [], why: cmp.why };
}

function changeSection(binding, tier) {
  if (!binding.ok) return { key: 'change', state: 'unknown', why: binding.why };
  if (binding.value === null) return { key: 'change', state: 'unknown', why: 'not a git repository — no change set to show' };
  const all = Object.keys(binding.value.files || {}).sort();
  const out = { key: 'change', state: 'recorded', total: all.length, files: all.slice(0, MAX_FILES_SHOWN),
    head: binding.value.head || null, base: binding.value.base || null, dirty: binding.value.dirty ?? null,
    tier: null, tierReasons: [] };
  if (tier.ok && tier.value?.tier && !tier.value.error) { out.tier = tier.value.tier; out.tierReasons = tier.value.reasons || []; }
  else out.tierWhy = tier.ok ? String(tier.value?.error || 'no tier was computed') : tier.why;
  return out;
}

function riskSection(gate) {
  const r = gate?.reversibility || reversibilityOf(gate);
  return { key: 'risk', state: 'recorded', reversibility: r.state, categories: r.categories || [], why: r.why || '' };
}

function reviewsSection(verdictLogs, binding, digest) {
  if (!verdictLogs.ok) return { key: 'reviews', state: 'unknown', why: verdictLogs.why, verdicts: [] };
  const latest = new Map();
  let rejected = 0;
  for (const [agent, text] of Object.entries(verdictLogs.value || {})) {
    const { records, rejected: bad } = parseVerdictLog(text, { agent });
    rejected += bad.length;
    for (const rec of records) {
      const prev = latest.get(rec.agent);
      if (!prev || String(rec.ts) > String(prev.ts)) latest.set(rec.agent, rec);
    }
  }
  const current = binding.ok ? binding.value : null;
  const verdicts = [...latest.values()]
    .sort((a, b) => a.agent.localeCompare(b.agent))
    .map((rec) => ({
      agent: rec.agent, verdict: rec.verdict, ts: rec.ts,
      // Only a recorded receipt of these exact bytes counts. No receipt, or no
      // readable tree to compare with, is "not shown to be this tree".
      onThisTree: Boolean(rec.receipt && current && compareReceipts(rec.receipt, current, { digest }).state === 'matches'),
    }));
  return { key: 'reviews', state: verdicts.length ? 'recorded' : 'empty', verdicts, rejected,
    ...(verdicts.length ? {} : { why: 'no reviewer has recorded a verdict in this project' }) };
}

function secondSection(secondOpinion) {
  if (!secondOpinion.ok) return { key: 'second', state: 'unknown', why: secondOpinion.why };
  const v = secondOpinion.value || {};
  return { key: 'second', state: 'recorded', opinion: v.state, provider: v.provider || null,
    verdict: v.verdict || null, p0: v.p0 ?? null, why: v.why || null };
}

function touchesSection(binding, tests) {
  if (!binding.ok) return { key: 'touches', state: 'unknown', why: binding.why };
  if (binding.value === null) return { key: 'touches', state: 'unknown', why: 'not a git repository — nothing to group' };
  const groups = new Map();
  for (const f of Object.keys(binding.value.files || {}).sort()) {
    const name = groupOf(f) || (f.includes('/') ? f.split('/')[0] : '(root)');
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(f);
  }
  const out = { key: 'touches', state: 'recorded',
    containers: [...groups].map(([name, files]) => ({ name, files: files.slice(0, MAX_FILES_SHOWN), total: files.length })),
    tests: null, unmapped: [] };
  if (tests.ok && tests.value) { out.tests = tests.value.tests || []; out.unmapped = tests.value.unmapped || []; out.testsMode = tests.value.mode; }
  else out.testsWhy = tests.ok ? 'no test mapping was computed' : tests.why;
  return out;
}

/**
 * @param {object} p
 * @param {object} p.gate            pending gate as the inbox returns it
 * @param {object|null} p.token      the token store entry ({receipt, receiptHash}) or null
 * @param {{ok:boolean}} p.binding   the current tree receipt (null outside git)
 * @param {{ok:boolean}} p.verdictLogs  {agent: log text}
 * @param {{ok:boolean}} p.secondOpinion
 * @param {{ok:boolean}} p.tier
 * @param {{ok:boolean}} p.tests     affectedTests() result
 * @param {Function} [p.digest]      file digest for compareReceipts (injected in tests)
 */
export function gateBrief({ gate, token = null, binding, verdictLogs, secondOpinion, tier, tests, digest = undefined }) {
  const tree = treeSection(token, binding, digest);
  return {
    gate: { id: gate?.id || null, title: gate?.title || '', gate: gate?.gate || null },
    moved: tree.moved,
    sections: [
      tree,
      changeSection(binding, tier),
      riskSection(gate),
      reviewsSection(verdictLogs, binding, digest),
      secondSection(secondOpinion),
      touchesSection(binding, tests),
    ],
  };
}

/**
 * The project's verdict logs as `{agent: text}`. No directory is "nothing
 * recorded" — a real answer. Any other failure throws, so `settle` turns it
 * into `unknown` instead of an empty list.
 */
export function readVerdictLogs(cwd) {
  const dir = join(cwd, '.great_cto', 'verdicts');
  let names;
  try { names = readdirSync(dir); }
  catch (e) { if (e?.code === 'ENOENT') return {}; throw e; }
  const out = {};
  for (const n of names) if (n.endsWith('.log')) out[n.slice(0, -4)] = readFileSync(join(dir, n), 'utf8');
  return out;
}
