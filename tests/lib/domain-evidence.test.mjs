import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, linkSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { listDomainPacks, domainPack, digest, bytesDigest, boundedFile, validateOverlay, auditOverlay, prepareDomainContext } from '../../scripts/lib/domain-evidence.mjs';
import { domainPilot } from '../../scripts/domain-pilot.mjs';

const now = '2026-10-14T12:00:00.000Z';
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'domain-evidence-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  writeFileSync(join(root, 'workflow.ts'), 'atomic send\nreconcile unknown\n');
  git(['add', 'workflow.ts']); git(['-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture']);
  const overlay = { schemaVersion: 1, projectId: 'project-a', lineageId: 'family-a', rootDigest: digest(root), classification: 'private', packId: 'money',
    packDigest: domainPack('money').digest, sourceCommit: git(['rev-parse', 'HEAD']), reviewedAt: '2026-10-14T00:00:00.000Z', expiresAt: '2026-10-21T00:00:00.000Z',
    sources: [{ path: 'workflow.ts', sha256: bytesDigest('atomic send\nreconcile unknown\n'), lines: [1, 2], sourceKind: 'implementation', invariantIds: ['atomic-send', 'ambiguous-send'], executionEvidence: null }] };
  return { root, overlay, git };
}

test('five candidate packs are cloned, opt-in and have negative checks, not certifications', () => {
  const packs = listDomainPacks(); assert.equal(packs.length, 5);
  for (const p of packs) {
    assert.equal(p.maturity, 'candidate'); assert.equal(p.activation, 'explicit-only');
    assert.equal(p.changesPermissions, false); assert.equal(p.changesReviewerRouting, false);
    assert.equal(p.invariants.length, 3); assert.ok(p.invariants.every(i => i.counterexample));
    const { digest: pin, ...body } = p; assert.equal(pin, digest(body));
  }
  packs[0].invariants[0].rule = 'changed'; assert.notEqual(listDomainPacks()[0].invariants[0].rule, 'changed');
  assert.ok(domainPack('mental-wellbeing-safety').exclusions.includes('clinical-efficacy'));
  assert.throws(() => domainPack('unknown'));
});
test('fresh audit reads only explicit source, distinguishes source observation from runtime', t => {
  const { root, overlay } = fixture(t), result = auditOverlay(root, overlay, { projectId: 'project-a', now });
  assert.equal(result.runtimeVerified, false); assert.equal(result.publicPromotionAllowed, false);
  assert.equal(result.sources[0].workingTreeDiffersFromHead, false);
  assert.equal(result.overlayDigest, digest(overlay)); assert.ok(!JSON.stringify(result).includes('workflow.ts'));
});
test('dirty working bytes need an explicit fresh pin, never masquerade as HEAD', t => {
  const { root, overlay } = fixture(t);
  writeFileSync(join(root, 'workflow.ts'), 'different\n');
  assert.throws(() => auditOverlay(root, overlay, { projectId: 'project-a', now }), /bytes changed/);
  overlay.sources[0].sha256 = bytesDigest('different\n'); overlay.sources[0].lines = [1, 1];
  assert.equal(auditOverlay(root, overlay, { projectId: 'project-a', now }).sources[0].workingTreeDiffersFromHead, true);
});
test('source commit and line range changes fail closed', t => {
  const { root, overlay } = fixture(t);
  overlay.sourceCommit = 'b'.repeat(40);
  assert.throws(() => auditOverlay(root, overlay, { projectId: 'project-a', now }), /commit changed/);
  overlay.sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  overlay.sources[0].lines = [1, 99];
  assert.throws(() => auditOverlay(root, overlay, { projectId: 'project-a', now }), /line span/);
});
test('overlay cannot be moved to another root even with identical repository bytes', t => {
  const { root, overlay } = fixture(t); overlay.rootDigest = digest('other-root');
  assert.throws(() => auditOverlay(root, overlay, { projectId: 'project-a', now }), /root binding/);
});
for (const change of [o => { o.permissions = ['Bash']; }, o => { o.classification = 'public'; }, o => { o.projectId = 'project-b'; },
  o => { o.packDigest = 'b'.repeat(64); }, o => { o.expiresAt = now; }, o => { o.reviewedAt = '2027-01-01T00:00:00.000Z'; },
  o => { o.sources[0].invariantIds = ['clinical-efficacy']; }, o => { o.sources[0].executionEvidence = { status: 'passed' }; },
  o => { o.sources.push(structuredClone(o.sources[0])); }, o => { delete o.lineageId; }]) {
  test(`invalid overlay variant ${change.toString()} is rejected`, t => {
    const { overlay } = fixture(t); change(overlay);
    assert.throws(() => validateOverlay(overlay, { projectId: 'project-a', now }));
  });
}
for (const path of ['../workflow.ts', '/tmp/source', '.env', 'patients/records.json', '.git/config', 'data/source', 'a\\b', 'source\0.ts']) {
  test(`source path refusal: ${JSON.stringify(path)}`, t => {
    const { root, overlay } = fixture(t); overlay.sources[0].path = path;
    assert.throws(() => auditOverlay(root, overlay, { projectId: 'project-a', now }));
  });
}
test('symlink, hard link and excessive artifact size rejected', t => {
  const { root } = fixture(t), source = join(root, 'workflow.ts');
  symlinkSync(source, join(root, 'sym')); assert.throws(() => boundedFile(join(root, 'sym')), /symlink/);
  linkSync(source, join(root, 'hard')); assert.throws(() => boundedFile(source), /unsupported/);
  writeFileSync(join(root, 'big'), 'big'); assert.throws(() => boundedFile(join(root, 'big'), 2), /unsupported/);
});
test('data packets differ by host but carry no raw source, paths or authority', t => {
  const { root, overlay } = fixture(t);
  const codex = prepareDomainContext(root, overlay, { projectId: 'project-a', host: 'codex', now });
  const claude = prepareDomainContext(root, overlay, { projectId: 'project-a', host: 'claude-code', now });
  assert.notEqual(codex.digest, claude.digest); assert.equal(codex.invariants.length, 2);
  assert.match(codex.authority, /untrusted/); assert.equal(codex.clinicalClaimsAllowed, false);
  assert.ok(!JSON.stringify(codex).includes(root)); assert.ok(!JSON.stringify(codex).includes('workflow.ts'));
  assert.throws(() => prepareDomainContext(root, overlay, { projectId: 'project-a', host: 'codex', now, maxBytes: 10 }), /budget/);
  assert.throws(() => prepareDomainContext(root, overlay, { projectId: 'project-a', host: 'unknown', now }));
});
test('developer CLI catalog is local and invalid invocations do not dispatch', () => {
  assert.equal(domainPilot(['catalog']).length, 5);
  assert.throws(() => domainPilot(['launch']), /usage/);
});
