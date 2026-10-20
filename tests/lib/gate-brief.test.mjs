// ADR-036: one brief per gate. A projection over evidence that already exists;
// these tests hold the three rules that make it worth reading — unknown is not
// pass, the brief is bound to the tree the token was issued for, and a verdict
// counts only for the tree it saw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateBrief, settle } from '../../scripts/lib/gate-brief.mjs';

const tree = (files, head = 'h1') => ({ head, base: 'b0', dirty: null, files });
const ok = (value) => ({ ok: true, value });
const failed = (why) => ({ ok: false, why });
const line = (o) => JSON.stringify({ v: 1, project: 'p', cost_usd: 0, meta: {}, ...o });
const gate = { id: 'g-1', title: 'gate:ship — release', gate: 'ship' };
const noDisk = () => null;

function brief(over = {}) {
  const now = tree({ 'a.mjs': 'd1', 'scripts/lib/x.mjs': 'd2' });
  return gateBrief({
    gate,
    token: { receipt: now },
    binding: ok(now),
    verdictLogs: ok({}),
    secondOpinion: ok({ state: 'not-run' }),
    tier: ok({ tier: 'T1', reasons: ['volume'] }),
    tests: ok({ mode: 'targeted', tests: ['a.test.mjs'], unmapped: [] }),
    digest: noDisk,
    ...over,
  });
}
const section = (b, key) => b.sections.find((s) => s.key === key);

test('sections come in a fixed order, the tree first', () => {
  assert.deepEqual(brief().sections.map((s) => s.key), ['tree', 'change', 'risk', 'reviews', 'map', 'second', 'touches']);
});

test('the tree the token was issued for, unchanged → not moved', () => {
  const t = section(brief(), 'tree');
  assert.equal(t.state, 'recorded');
  assert.equal(t.moved, false);
});

test('a tree that moved after the token is said first, with the files', () => {
  const issued = tree({ 'a.mjs': 'OLD', 'scripts/lib/x.mjs': 'd2' });
  const b = brief({ token: { receipt: issued } });
  const t = b.sections[0];
  assert.equal(t.key, 'tree');
  assert.equal(t.moved, true);
  assert.deepEqual(t.changed, ['a.mjs']);
  assert.equal(b.moved, true);
});

test('no token issued yet → tree state unknown, never "not moved"', () => {
  const t = section(brief({ token: null }), 'tree');
  assert.equal(t.state, 'unknown');
  assert.equal(t.moved, null);
});

test('an unreadable tree makes tree and change unknown, with the reason', () => {
  const b = brief({ binding: failed('Receipt read timed out') });
  for (const k of ['tree', 'change', 'touches']) {
    assert.equal(section(b, k).state, 'unknown', k);
    assert.match(section(b, k).why, /timed out/, k);
  }
});

test('change lists the files and the tier; an unreadable tier is not T0', () => {
  const c = section(brief(), 'change');
  assert.equal(c.state, 'recorded');
  assert.deepEqual(c.files, ['a.mjs', 'scripts/lib/x.mjs']);
  assert.equal(c.tier, 'T1');
  const c2 = section(brief({ tier: failed('no PROJECT.md') }), 'change');
  assert.equal(c2.tier, null);
  assert.match(c2.tierWhy, /PROJECT\.md/);
});

test('risk is the gate reversibility', () => {
  const r = section(brief(), 'risk');
  assert.equal(r.state, 'recorded');
  assert.ok(['expensive', 'routine', 'unclassified'].includes(r.reversibility));
});

test('no verdict logs → reviews empty, which is not a pass', () => {
  const r = section(brief(), 'reviews');
  assert.equal(r.state, 'empty');
  assert.deepEqual(r.verdicts, []);
});

test('unreadable verdict logs → reviews unknown', () => {
  const r = section(brief({ verdictLogs: failed('EACCES') }), 'reviews');
  assert.equal(r.state, 'unknown');
  assert.match(r.why, /EACCES/);
});

test('a verdict counts only for the tree it saw; the latest per agent wins', () => {
  const now = tree({ 'a.mjs': 'd1', 'scripts/lib/x.mjs': 'd2' });
  const logs = {
    'code-reviewer': [
      line({ ts: '2026-10-18T10:00:00Z', agent: 'code-reviewer', verdict: 'BLOCKED' }),
      line({ ts: '2026-10-19T10:00:00Z', agent: 'code-reviewer', verdict: 'APPROVED', receipt: now }),
    ].join('\n'),
    'qa-engineer': line({ ts: '2026-10-19T09:00:00Z', agent: 'qa-engineer', verdict: 'PASS',
      receipt: tree({ 'a.mjs': 'OLD', 'scripts/lib/x.mjs': 'd2' }) }),
    'security-officer': line({ ts: '2026-10-19T09:00:00Z', agent: 'security-officer', verdict: 'PASS' }),
  };
  const r = section(brief({ verdictLogs: ok(logs) }), 'reviews');
  assert.equal(r.state, 'recorded');
  const by = Object.fromEntries(r.verdicts.map((v) => [v.agent, v]));
  assert.equal(by['code-reviewer'].verdict, 'APPROVED');
  assert.equal(by['code-reviewer'].onThisTree, true);
  assert.equal(by['qa-engineer'].onThisTree, false);        // saw other bytes
  assert.equal(by['security-officer'].onThisTree, false);   // saw nothing it recorded
});

test('unreadable verdict lines are counted, not dropped', () => {
  const r = section(brief({ verdictLogs: ok({ 'code-reviewer': '{not json\n' }) }), 'reviews');
  assert.equal(r.rejected, 1);
});

test('second opinion carries its own state; a failed read is unknown', () => {
  assert.equal(section(brief(), 'second').opinion, 'not-run');
  assert.equal(section(brief(), 'second').state, 'recorded');
  const s = section(brief({ secondOpinion: failed('Receipt reader busy; retry') }), 'second');
  assert.equal(s.state, 'unknown');
  assert.equal(s.opinion, undefined);
});

test('touches groups files by part of the system and lists affected tests', () => {
  const t = section(brief(), 'touches');
  assert.equal(t.state, 'recorded');
  assert.deepEqual(t.containers.map((c) => c.name).sort(), ['(root)', 'libs']);
  assert.deepEqual(t.tests, ['a.test.mjs']);
  const t2 = section(brief({ tests: failed('walk failed') }), 'touches');
  assert.equal(t2.tests, null);
  assert.match(t2.testsWhy, /walk failed/);
});

test('a non-git project has no tree to bind to: unknown, said so', () => {
  const b = brief({ binding: ok(null) });
  assert.equal(section(b, 'change').state, 'unknown');
  assert.match(section(b, 'change').why, /git/);
});

test('settle turns a rejection into a reason, never a value', async () => {
  assert.deepEqual(await settle(Promise.resolve(1)), { ok: true, value: 1 });
  assert.deepEqual(await settle(Promise.reject(Error('boom'))), { ok: false, why: 'boom' });
  assert.deepEqual(await settle(() => { throw Error('sync'); }), { ok: false, why: 'sync' });
});

// ── change map (great_cto-2m2l) ─────────────────────────────────────────────
import { mapDocPaths, changeMapSource } from '../../scripts/lib/gate-brief.mjs';
const MAPDOC = '# Review\n\n## Findings\n\nnone\n\n## Change map\n\n```mermaid\nflowchart LR\n  A[a.mjs] --> B[scripts/lib/x.mjs]\n```\n\n## Notes\n';

test('changeMapSource pulls the flowchart out of the Change map section', () => {
  assert.match(changeMapSource(MAPDOC), /^flowchart LR\n\s+A\[a\.mjs\] --> B/);
  assert.equal(changeMapSource('# x\n\n## Findings\n'), null);
});

test('mapDocPaths names the documents the latest verdicts point at, inside docs/ only', () => {
  const logs = {
    'code-reviewer': line({ ts: '2026-10-20T10:00:00Z', agent: 'code-reviewer', verdict: 'APPROVED', meta: { review: 'docs/reviews/REVIEW-x.md' } }),
    architect: line({ ts: '2026-10-19T10:00:00Z', agent: 'architect', verdict: 'DONE', meta: { arch: '../../etc/passwd' } }),
  };
  assert.deepEqual(mapDocPaths(logs), [{ agent: 'code-reviewer', path: 'docs/reviews/REVIEW-x.md' }]);
});

test('the brief shows the reviewer change map, marked by whether its verdict saw this tree', () => {
  const now = tree({ 'a.mjs': 'd1', 'scripts/lib/x.mjs': 'd2' });
  const logs = { 'code-reviewer': line({ ts: '2026-10-20T10:00:00Z', agent: 'code-reviewer', verdict: 'APPROVED', receipt: now, meta: { review: 'docs/reviews/REVIEW-x.md' } }) };
  const m = section(brief({ verdictLogs: ok(logs), docs: { 'docs/reviews/REVIEW-x.md': ok(MAPDOC) } }), 'map');
  assert.equal(m.state, 'recorded');
  assert.equal(m.agent, 'code-reviewer');
  assert.equal(m.onThisTree, true);
  assert.match(m.source, /flowchart LR/);
});

test('no map: empty when no verdict points at a document; unknown when the document cannot be read', () => {
  assert.equal(section(brief(), 'map').state, 'empty');
  const logs = { 'code-reviewer': line({ ts: '2026-10-20T10:00:00Z', agent: 'code-reviewer', verdict: 'APPROVED', meta: { review: 'docs/reviews/REVIEW-x.md' } }) };
  const m = section(brief({ verdictLogs: ok(logs), docs: { 'docs/reviews/REVIEW-x.md': failed('ENOENT') } }), 'map');
  assert.equal(m.state, 'unknown');
  assert.match(m.why, /ENOENT/);
  const n = section(brief({ verdictLogs: ok(logs), docs: { 'docs/reviews/REVIEW-x.md': ok('# R\n\n## Findings\n') } }), 'map');
  assert.equal(n.state, 'empty');
  assert.match(n.why, /no Change map/);
});
