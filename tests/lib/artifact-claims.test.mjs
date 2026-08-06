// A verdict carries claims — `arch=docs/architecture/ARCH-x.md`, `tests=33`,
// `coverage=100%`. Nothing checked any of them. The completion hook checked that
// a verdict EXISTED and parsed: that the agent reported, not that it did
// anything.
//
// One session, six agents: senior-dev left its work in a worktree and recorded
// nothing; code-reviewer found a P1 and never checked the fix; qa-engineer
// reported coverage=100% having run about a third of the suite; a
// re-verification produced no output at all. Two of six closed their own
// contract.
//
// This is the cheapest rung of the evidence ladder — a named path exists and has
// content, or the claim that produced it is not true.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathClaims, checkArtifacts, explainArtifacts, THIN_BYTES } from '../../scripts/lib/artifact-claims.mjs';

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-art-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return root;
}
const clean = (r) => { try { fs.rmSync(r, { recursive: true, force: true }); } catch {} };
const BODY = 'x'.repeat(THIN_BYTES + 1);

// ── which values are paths ─────────────────────────────────────────────────

test('bookkeeping fields are not mistaken for paths', () => {
  // Every one of these is a real meta value from this repo's verdict logs. A
  // looser rule fails an agent for a field that was never a file, and a false
  // accusation teaches people to switch the check off.
  assert.deepEqual(pathClaims({
    task: 'great_cto-12qe', files: 'pipeline-position', tests: '33',
    coverage: '100%', findings: '1-P1', critical: '2', feature: 'tenant-onboarding',
  }), []);
});

test('a path needs both a separator and an artefact extension', () => {
  assert.deepEqual(pathClaims({ arch: 'docs/architecture/ARCH-x.md' }), [{ key: 'arch', path: 'docs/architecture/ARCH-x.md' }]);
  assert.deepEqual(pathClaims({ a: 'ARCH-x.md' }), [], 'a bare filename names no location');
  assert.deepEqual(pathClaims({ a: 'docs/architecture' }), [], 'a directory is not the artefact');
  assert.deepEqual(pathClaims({ a: 'https://example.com/x.md' }), [], 'a URL is a claim about somewhere this module cannot see');
});

// ── the case this exists for ───────────────────────────────────────────────

test('a verdict naming a document nobody wrote fails', () => {
  const root = repo({ 'docs/other.md': BODY });
  try {
    const r = checkArtifacts({ arch: 'docs/architecture/ARCH-ghost.md' }, { root });
    assert.equal(r.ok, false);
    assert.equal(r.missing[0].path, 'docs/architecture/ARCH-ghost.md');
    assert.match(explainArtifacts(r), /named but absent/);
    assert.match(explainArtifacts(r), /drop the claim/, 'the fix is either write it or stop claiming it');
  } finally { clean(root); }
});

test('a touched placeholder is reported separately from a missing file', () => {
  // They mean different things to whoever has to fix it: one was never written,
  // the other was created and left empty.
  const root = repo({ 'docs/thin.md': '# title\n' });
  try {
    const r = checkArtifacts({ report: 'docs/thin.md' }, { root });
    assert.equal(r.ok, false);
    assert.equal(r.missing.length, 0);
    assert.equal(r.thin[0].key, 'report');
    assert.match(explainArtifacts(r), /under 200 bytes/);
  } finally { clean(root); }
});

test('a real artefact passes and says nothing', () => {
  const root = repo({ 'docs/architecture/ARCH-x.md': BODY, 'docs/adr/ADR-1.md': BODY });
  try {
    const r = checkArtifacts({ arch: 'docs/architecture/ARCH-x.md', adr: 'docs/adr/ADR-1.md' }, { root });
    assert.equal(r.ok, true);
    assert.equal(r.checked.length, 2);
    assert.equal(explainArtifacts(r), null, 'a clean check must be silent, or the signal is noise');
  } finally { clean(root); }
});

// ── polarity, and its deliberate asymmetry ─────────────────────────────────

test('a verdict claiming no artefact is not failed here', () => {
  // Requiring every agent to name an artefact is a different rule and belongs in
  // the agent contract. Enforcing it from this checker would fail the whole
  // fleet at once for a rule nobody agreed to.
  const r = checkArtifacts({ tests: '33', coverage: '100%' }, { root: '/nonexistent' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.checked, []);
  assert.equal(explainArtifacts(r), null);
});

test('a directory where a file was claimed is missing, not present', () => {
  const root = repo({ 'docs/architecture/ARCH-x.md/keep.txt': BODY });
  try {
    assert.equal(checkArtifacts({ arch: 'docs/architecture/ARCH-x.md' }, { root }).missing.length, 1);
  } finally { clean(root); }
});

test('an unreadable path counts as missing rather than throwing', () => {
  const r = checkArtifacts({ arch: 'docs/x.md' }, { root: '/nonexistent', stat: () => { throw new Error('EACCES'); } });
  assert.equal(r.ok, false);
  assert.equal(r.missing.length, 1);
});

test('an absolute path is checked where it points, not under the root', () => {
  const root = repo({ 'real.md': BODY });
  try {
    assert.equal(checkArtifacts({ a: path.join(root, 'real.md') }, { root: '/nonexistent' }).ok, true);
  } finally { clean(root); }
});

test('no meta at all is not an error', () => {
  for (const meta of [undefined, null, {}]) {
    assert.equal(checkArtifacts(meta, { root: '/nonexistent' }).ok, true);
  }
});
