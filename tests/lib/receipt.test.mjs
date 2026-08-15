// The rung above "a second reader agreed".
//
// Every rung below asks about the moment of review. None asks whether the code
// that was reviewed is the code that shipped — `code-reviewer` approves a tree,
// senior-dev keeps editing, and every rung still reads green because every rung
// is answering a question about the past.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { treeReceipt, compareReceipts, describeDrift, fileDigest, receiptHash, writeAcceptance, readAcceptance, clearAcceptance } from '../../scripts/lib/receipt.mjs';

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-receipt-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@e.x');
  g('config', 'user.name', 'T');
  fs.writeFileSync(path.join(dir, 'base.txt'), 'base\n');
  g('add', '-A');
  g('commit', '-qm', 'init');
  return dir;
}
const write = (d, p, s) => { fs.mkdirSync(path.dirname(path.join(d, p)), { recursive: true }); fs.writeFileSync(path.join(d, p), s); };
const clean = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} };

test('a receipt of an unchanged tree has no dirty fingerprint', () => {
  const d = repo();
  try {
    const r = treeReceipt(d);
    assert.ok(r.head, 'it records the commit it stood on');
    assert.equal(r.dirty, null);
  } finally { clean(d); }
});

test('editing a tracked file changes the receipt', () => {
  // HEAD alone would not notice: an agent almost always reviews a dirty tree,
  // and two entirely different working states share a commit sha.
  const d = repo();
  try {
    const before = treeReceipt(d);
    write(d, 'base.txt', 'edited\n');
    const after = treeReceipt(d);
    assert.equal(before.head, after.head, 'same commit');
    assert.notEqual(before.dirty, after.dirty, 'different content');
  } finally { clean(d); }
});

test('a brand-new file is part of the change', () => {
  // `git diff HEAD` does not see untracked files, so a receipt built from the
  // diff alone called a tree clean while an agent reviewed four new modules —
  // which is most of what a new feature is.
  const d = repo();
  try {
    write(d, 'src/new-module.mjs', 'export const a = 1;\n');
    const r = treeReceipt(d);
    assert.ok(r.dirty, 'an untracked file makes the tree dirty');
    assert.ok('src/new-module.mjs' in r.files, 'and it is in the reviewed set');
  } finally { clean(d); }
});

test('a gitignored file is not part of the change', () => {
  const d = repo();
  try {
    write(d, '.gitignore', 'build/\n');
    write(d, 'build/out.js', 'generated\n');
    const r = treeReceipt(d);
    assert.ok(!('build/out.js' in r.files), 'build output is not something anyone reviewed');
  } finally { clean(d); }
});

// ── Comparison ──────────────────────────────────────────────────────────────

test('an untouched tree matches its receipt', () => {
  const d = repo();
  try {
    write(d, 'src/a.mjs', 'export const a = 1;\n');
    const recorded = treeReceipt(d);
    const cmp = compareReceipts(recorded, treeReceipt(d));
    assert.equal(cmp.state, 'matches');
  } finally { clean(d); }
});

test('a reviewed file edited after the approval is named, not just counted', () => {
  // "Something changed" sends a reader looking. "src/a.mjs changed after the
  // review that approved it" is the finding.
  const d = repo();
  try {
    write(d, 'src/a.mjs', 'export const a = 1;\n');
    const recorded = treeReceipt(d);
    write(d, 'src/a.mjs', 'export const a = 2;   // slipped in after review\n');
    const cmp = compareReceipts(recorded, treeReceipt(d));
    assert.equal(cmp.state, 'differs');
    assert.deepEqual(cmp.changed, ['src/a.mjs']);
    assert.match(describeDrift(cmp), /src\/a\.mjs/);
  } finally { clean(d); }
});

test('a reviewed file deleted after the approval is a difference too', () => {
  const d = repo();
  try {
    write(d, 'src/a.mjs', 'export const a = 1;\n');
    const recorded = treeReceipt(d);
    fs.rmSync(path.join(d, 'src/a.mjs'));
    const cmp = compareReceipts(recorded, treeReceipt(d));
    assert.equal(cmp.state, 'differs');
    assert.deepEqual(cmp.removed, ['src/a.mjs']);
  } finally { clean(d); }
});

test('work continuing alongside is "extended", not a bypassed review', () => {
  // A README written after an approval is not somebody sneaking past the
  // reviewer, and reporting it as one is how a signal dies.
  const d = repo();
  try {
    write(d, 'src/a.mjs', 'export const a = 1;\n');
    const recorded = treeReceipt(d);
    write(d, 'README.md', '# notes\n');
    const cmp = compareReceipts(recorded, treeReceipt(d));
    assert.equal(cmp.state, 'extended');
    assert.deepEqual(cmp.added, ['README.md']);
    assert.equal(cmp.changed.length, 0, 'nothing reviewed was altered');
  } finally { clean(d); }
});

test('no receipt is its own answer, not a match and not a difference', () => {
  // A push with no receipt to compare and a push whose receipt matched are
  // different facts. Collapsing them is the defect this ladder exists to remove.
  const cmp = compareReceipts(null, { files: {} });
  assert.equal(cmp.state, 'no-receipt');
  assert.match(cmp.why, /nothing to compare/);
});

test('an unreadable tree is not a match either', () => {
  const cmp = compareReceipts({ files: {} }, null);
  assert.equal(cmp.state, 'unreadable');
});

test('outside a repository there is no receipt, rather than an empty one', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-plain-'));
  try { assert.equal(treeReceipt(d), null); } finally { clean(d); }
});

test('a receipt stays small enough to sit on a verdict line', () => {
  const d = repo();
  try {
    for (let i = 0; i < 40; i++) write(d, `src/f${i}.mjs`, `export const x = ${i};\n`);
    const line = JSON.stringify(treeReceipt(d, { maxFiles: 5 }));
    assert.ok(JSON.parse(line).truncated, 'and it says when it stopped counting');
    assert.ok(line.length < 2000, `a verdict line must not become a file listing (${line.length} bytes)`);
  } finally { clean(d); }
});

test('the digest is of the file on disk, not of what was staged', () => {
  // `git rev-parse :path` reads the index — what was staged, not what the
  // reviewer read.
  const d = repo();
  try {
    write(d, 'src/a.mjs', 'reviewed\n');
    execFileSync('git', ['add', 'src/a.mjs'], { cwd: d, stdio: 'ignore' });
    const staged = fileDigest(d, 'src/a.mjs');
    write(d, 'src/a.mjs', 'edited after staging\n');
    assert.notEqual(fileDigest(d, 'src/a.mjs'), staged);
  } finally { clean(d); }
});

// ── Which verdict counts as an approval ─────────────────────────────────────

import { latestApproval, APPROVING_AGENTS } from '../../scripts/lib/receipt.mjs';

const logs = (m) => (p) => {
  const agent = String(p).split('/').pop().replace('.log', '');
  if (!(agent in m)) { const e = new Error('ENOENT'); throw e; }
  return m[agent];
};
const rec = (o) => JSON.stringify({ v: 1, ts: '2026-08-11T10:00:00Z', ...o });

test('the newest approving verdict with a receipt wins', () => {
  const found = latestApproval('/x', { read: logs({
    'code-reviewer': [
      rec({ ts: '2026-08-11T09:00:00Z', agent: 'code-reviewer', verdict: 'APPROVED', receipt: { head: 'aaa' } }),
      rec({ ts: '2026-08-11T11:00:00Z', agent: 'code-reviewer', verdict: 'APPROVED', receipt: { head: 'bbb' } }),
    ].join('\n'),
  }) });
  assert.equal(found.receipt.head, 'bbb');
});

test('an approval with no receipt is not an approval this can use', () => {
  const found = latestApproval('/x', { read: logs({
    'code-reviewer': rec({ agent: 'code-reviewer', verdict: 'APPROVED' }),
  }) });
  assert.equal(found, null, 'and the caller reports no-receipt rather than a match');
});

test('a BLOCKED verdict is not an approval', () => {
  const found = latestApproval('/x', { read: logs({
    'code-reviewer': rec({ agent: 'code-reviewer', verdict: 'BLOCKED', receipt: { head: 'aaa' } }),
  }) });
  assert.equal(found, null);
});

test('only reviewing stages count', () => {
  // architect APPROVED says nothing about which bytes shipped. Counting it would
  // make the check pass for the wrong reason, which is worse than not running.
  assert.ok(!APPROVING_AGENTS.includes('architect'));
  assert.ok(APPROVING_AGENTS.includes('code-reviewer'));
});

test('a missing log is not an error', () => {
  assert.equal(latestApproval('/x', { read: logs({}) }), null);
});

test('a corrupt line does not hide the good ones after it', () => {
  const found = latestApproval('/x', { read: logs({
    'code-reviewer': ['{not json', rec({ agent: 'code-reviewer', verdict: 'APPROVED', receipt: { head: 'ccc' } })].join('\n'),
  }) });
  assert.equal(found.receipt.head, 'ccc');
});

// ── Falling out of the change set is not being deleted ──────────────────────
//
// The file map is the diff against the merge-base, so the moment a reviewed
// change is committed and the base moves forward, every reviewed file drops out
// of it. The first version read that as `removed` — the strongest wording it
// has — about files sitting right there on disk, and would have blocked every
// push after a release. A gate that fires on the ordinary case gets routed
// around.

test('a reviewed file that was committed since reads as landed, not removed', () => {
  const recorded = { head: 'a', dirty: null, base: 'b', files: { 'src/x.mjs': 'D1' } };
  const current = { head: 'c', dirty: null, base: 'd', files: {} };   // no longer in the diff
  const cmp = compareReceipts(recorded, current, { digest: () => 'D1' });   // same bytes on disk
  assert.equal(cmp.state, 'matches');
  assert.deepEqual(cmp.landed, ['src/x.mjs']);
  assert.deepEqual(cmp.removed, []);
  assert.match(cmp.why, /committed since, unchanged/);
});

test('a reviewed file that is genuinely gone is removed', () => {
  const recorded = { head: 'a', dirty: null, base: 'b', files: { 'src/x.mjs': 'D1' } };
  const cmp = compareReceipts(recorded, { head: 'c', files: {} }, { digest: () => null });
  assert.equal(cmp.state, 'differs');
  assert.deepEqual(cmp.removed, ['src/x.mjs']);
});

test('a reviewed file out of the diff but edited on disk is changed', () => {
  const recorded = { head: 'a', dirty: null, base: 'b', files: { 'src/x.mjs': 'D1' } };
  const cmp = compareReceipts(recorded, { head: 'c', files: {} }, { digest: () => 'D2' });
  assert.equal(cmp.state, 'differs');
  assert.deepEqual(cmp.changed, ['src/x.mjs']);
});

// ── An approval names a state ───────────────────────────────────────────────
//
// hashgate's formulation, better than the one we shipped: an approve button
// approves an intention, a hash approves a state. Accepting "ship despite the
// drift" without naming WHICH state leaves an acceptance that survives the next
// edit — an expiring bypass wearing an approval's clothes.

test('the hash covers the files, their contents, and the uncommitted work', () => {
  const a = { head: 'H', dirty: 'D', files: { 'a.mjs': '1', 'b.mjs': '2' } };
  assert.equal(receiptHash(a), receiptHash({ head: 'H', dirty: 'D', files: { 'b.mjs': '2', 'a.mjs': '1' } }),
    'key order is not part of the state');
  assert.notEqual(receiptHash(a), receiptHash({ ...a, files: { 'a.mjs': '9', 'b.mjs': '2' } }));
  assert.notEqual(receiptHash(a), receiptHash({ ...a, dirty: 'OTHER' }));
  assert.notEqual(receiptHash(a), receiptHash({ ...a, head: 'OTHER' }));
  assert.equal(receiptHash(null), null, 'no receipt, no hash — not a fabricated one');
});

test('an acceptance is valid only for the state it named', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-accept-'));
  try {
    writeAcceptance(dir, { hash: 'STATE-1', why: 'checked by hand' });
    assert.equal(readAcceptance(dir, 'STATE-1').valid, true);
    const other = readAcceptance(dir, 'STATE-2');
    assert.equal(other.valid, false);
    assert.equal(other.stale, true);
    assert.match(other.why, /tree changed after it was accepted/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('one acceptance authorises one push', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-accept-'));
  try {
    writeAcceptance(dir, { hash: 'S' });
    assert.equal(readAcceptance(dir, 'S').valid, true);
    clearAcceptance(dir);
    const after = readAcceptance(dir, 'S');
    assert.equal(after.valid, false, 'an acceptance that survives its push is a standing permission');
    assert.match(after.why, /no acceptance recorded/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an unreadable acceptance is not a valid one', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-accept-'));
  try {
    fs.mkdirSync(path.join(dir, '.great_cto'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.great_cto/.receipt-accept'), '{ not json');
    const r = readAcceptance(dir, 'S');
    assert.equal(r.valid, false);
    assert.equal(r.unreadable, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
