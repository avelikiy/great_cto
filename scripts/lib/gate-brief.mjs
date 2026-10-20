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

// ── change map (great_cto-2m2l) ──────────────────────────────────────────────
// code-reviewer and architect draw what a change touches as a Mermaid flowchart
// in their documents; the brief shows the one the latest verdict points at. The
// board ships no diagram library, so the page shows the source, which reads as a
// list of edges and pastes into any Mermaid viewer.
const MAP_AGENTS = [['code-reviewer', 'review'], ['architect', 'arch']];

/** The flowchart source in a document's `## Change map`, or null. */
export function changeMapSource(text) {
  const lines = String(text || '').split('\n');
  const start = lines.findIndex((l) => /^##\s+change map\b/i.test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^##\s/.test(lines[i])) { end = i; break; }
  const m = lines.slice(start + 1, end).join('\n').match(/```mermaid\s*\n([\s\S]*?)```/);
  return m && /^\s*(flowchart|graph)\b/m.test(m[1]) ? m[1].replace(/\s+$/, '') : null;
}

/** Latest verdict per map agent → the document it points at; only paths under docs/. */
export function mapDocPaths(verdictLogs) {
  const out = [];
  for (const [agent, key] of MAP_AGENTS) {
    const { records } = parseVerdictLog(verdictLogs?.[agent] || '', { agent });
    const latest = records.filter((r) => r.meta?.[key]).sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];
    const p = latest?.meta?.[key];
    if (p && /^docs\/[A-Za-z0-9._/-]+\.md$/.test(p) && !p.split('/').includes('..')) out.push({ agent, path: p });
  }
  return out;
}

function mapSection(verdictLogs, docs, binding, digest) {
  if (!verdictLogs.ok) return { key: 'map', state: 'unknown', why: verdictLogs.why };
  const targets = mapDocPaths(verdictLogs.value);
  if (!targets.length) return { key: 'map', state: 'empty', why: 'no reviewer or architect verdict points at a document with a change map' };
  const { agent, path } = targets[0];
  const doc = docs?.[path];
  if (!doc || !doc.ok) return { key: 'map', state: 'unknown', agent, path, why: doc ? doc.why : 'the document was not read' };
  const source = changeMapSource(doc.value);
  if (!source) return { key: 'map', state: 'empty', agent, path, why: `${path} has no Change map section with a flowchart` };
  const { records } = parseVerdictLog(verdictLogs.value[agent] || '', { agent });
  const rec = records.filter((r) => r.meta?.review === path || r.meta?.arch === path).sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];
  const current = binding.ok ? binding.value : null;
  const onThisTree = Boolean(rec?.receipt && current && compareReceipts(rec.receipt, current, { digest }).state === 'matches');
  return { key: 'map', state: 'recorded', agent, path, onThisTree, source };
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
 * @param {object} [p.docs]      {path: {ok, value|why}} documents the verdicts point at
 * @param {Function} [p.digest]      file digest for compareReceipts (injected in tests)
 */
export function gateBrief({ gate, token = null, binding, verdictLogs, secondOpinion, tier, tests, docs = {}, digest = undefined }) {
  const tree = treeSection(token, binding, digest);
  return {
    gate: { id: gate?.id || null, title: gate?.title || '', gate: gate?.gate || null },
    moved: tree.moved,
    sections: [
      tree,
      changeSection(binding, tier),
      riskSection(gate),
      reviewsSection(verdictLogs, binding, digest),
      mapSection(verdictLogs, docs, binding, digest),
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
