import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { beginWork, finishWork, mutateWorkTask, readWorkTask, acquireProjectLease, publicWorkTask } from '../../scripts/lib/work-tasks.mjs';
import { treeReceipt } from '../../scripts/lib/receipt.mjs';
import { previewPublication, publishPublication } from '../../scripts/lib/work-publication.mjs';
const temp = mkdtempSync(join(tmpdir(), 'gcto-publication-')); let n = 0;
after(() => rmSync(temp, { recursive: true, force: true }));
function fixture() {
  const dir = join(temp, String(++n)), root = join(dir, 'project'), store = join(dir, 'tasks'), remote = join(dir, 'remote.git');
  mkdirSync(root, { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
  git('init', '-q', '-b', 'main'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(root, 'README.md'), 'Base\n'); git('add', '.'); git('commit', '-qm', 'base'); git('init', '-q', '--bare', remote);
  git('remote', 'add', 'origin', remote); git('push', '-q', 'origin', 'main'); git('checkout', '-qb', 'feature');
  mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src', 'feature.txt'), 'Verified feature\n'); git('add', '.'); git('commit', '-qm', 'feature');
  const f = { root, store, remote, dir, git, pushes: 0, creates: 0, reads: 0, prs: [], timeout: false, invisible: false };
  const work = beginWork({ root, host: 'claude-code', goal: 'Deliver feature', acceptance: ['Feature checked'], authority: { writeScope: ['src'] } }, f);
  f.taskId = work.task.taskId; finishWork(f.taskId, work.operation.operationId, 0, f); work.lease.release();
  const verify = () => mutateWorkTask(f.taskId, t => { t.phase = 'verified'; t.outcome = { kind: 'delivery', state: 'verified',
    artifacts: [], criteria: [], receipt: treeReceipt(root) }; }, f);
  f.verify = verify; verify();
  f.execute = (bin, args, options) => {
    if (bin === 'git') {
      if (args[0] === 'remote' && args[1] === 'get-url') return 'https://github.com/example/fixture.git\n';
      if (args[0] === 'push') f.pushes++;
      return execFileSync(bin, args, options);
    }
    assert.equal(bin, 'gh');
    if (args[1] === 'list') { f.reads++; return JSON.stringify(f.invisible ? [] : f.prs); }
    assert.equal(args[1], 'create'); assert.ok(args.includes('--draft')); f.creates++;
    f.prs = [{ url: 'https://github.com/example/fixture/pull/1', headRefOid: git('rev-parse', 'HEAD').trim(),
      headRefName: 'feature', baseRefName: 'main', state: 'OPEN', isDraft: true }];
    if (f.timeout) throw Error('network timeout with PRIVATE_OUTPUT');
    return f.prs[0].url;
  };
  f.preview = () => previewPublication({ root, taskId: f.taskId }, f);
  f.request = p => ({ root, taskId: f.taskId, approval: p.approval, expectedRevision: p.revision, confirm: 'publish-draft-pr' });
  return f;
}
test('preview is read-only and binds task revision, all commits, paths and target', () => {
  const f = fixture(), revision = readWorkTask(f.taskId, f).revision, p = f.preview();
  assert.equal(readWorkTask(f.taskId, f).revision, revision); assert.equal(f.pushes, 0); assert.equal(f.creates, 0);
  assert.deepEqual(p.paths, ['src/feature.txt']); assert.match(p.patch, /Verified feature/); assert.equal(p.repository, 'example/fixture');
  assert.equal(f.preview().approval, p.approval);
});
test('publication sends immutable commit, preserves hooks, stays verified and replays without extra writes', () => {
  const f = fixture(), p = f.preview(), request = f.request(p);
  writeFileSync(join(f.root, '.git', 'hooks', 'pre-push'), '#!/bin/sh\necho invoked > "$PWD/.git/hook-observed"\n', { mode: 0o755 });
  const result = publishPublication(request, f);
  assert.equal(result.publication.state, 'pr-linked'); assert.equal(result.task.phase, 'verified');
  assert.equal(f.pushes, 1); assert.equal(f.creates, 1); assert.equal(readFileSync(join(f.root, '.git', 'hook-observed'), 'utf8').trim(), 'invoked');
  assert.equal(publishPublication(request, f).publication.url, result.publication.url);
  assert.equal(f.pushes, 1); assert.equal(f.creates, 1);
  assert.equal(f.git('--git-dir', f.remote, 'rev-parse', 'refs/heads/feature').trim(), p.head);
  const exposed = JSON.stringify(publicWorkTask(readWorkTask(f.taskId, f)));
  assert.doesNotMatch(exposed, /patchDigest|approvedRevision|guardRevision/);
});
test('PR create timeout reconciles existing PR, without duplicate create or another push', () => {
  const f = fixture(), request = f.request(f.preview()); f.timeout = true;
  assert.throws(() => publishPublication(request, f), /output withheld/);
  assert.equal(readWorkTask(f.taskId, f).publication.state, 'pushed');
  assert.doesNotMatch(JSON.stringify(readWorkTask(f.taskId, f)), /PRIVATE_OUTPUT/);
  f.timeout = false;
  assert.equal(publishPublication(request, f).publication.state, 'pr-linked');
  assert.equal(f.pushes, 1); assert.equal(f.creates, 1);
});
test('uncertain create with no visible PR refuses blind duplication', () => {
  const f = fixture(), request = f.request(f.preview()); f.timeout = true;
  assert.throws(() => publishPublication(request, f)); f.invisible = true;
  assert.throws(() => publishPublication(request, f), /uncertain/); assert.equal(f.creates, 1);
});
test('changed task revision or diff rejects approval before external writes', () => {
  for (const change of ['revision','tree']) {
    const f = fixture(), request = f.request(f.preview());
    if (change === 'revision') mutateWorkTask(f.taskId, t => { t.goal = 'Changed goal'; }, f);
    else writeFileSync(join(f.root, 'src', 'feature.txt'), 'Edited later');
    assert.throws(() => publishPublication(request, f), /stale|clean/); assert.equal(f.pushes, 0); assert.equal(f.creates, 0);
  }
});
test('project lease and pending decisions prevent publication', () => {
  const f = fixture(), request = f.request(f.preview()), lease = acquireProjectLease(f.root, f);
  assert.throws(() => publishPublication(request, f), /owned/); lease.release();
  mutateWorkTask(f.taskId, t => { t.decisions = [{ decisionId: 'a'.repeat(64), engine: 'codex' }]; }, f);
  assert.throws(() => f.preview(), /pending/); assert.equal(f.pushes, 0);
});
test('remote base movement or feature collision blocks without force push', () => {
  for (const branch of ['main','feature']) {
    const f = fixture(), request = f.request(f.preview()), base = f.git('rev-parse', 'origin/main').trim();
    if (branch === 'main') { f.git('--git-dir', f.remote, 'fetch', '-q', f.root, 'HEAD'); f.git('--git-dir', f.remote, 'update-ref', 'refs/heads/main', f.git('rev-parse', 'HEAD').trim()); }
    else f.git('--git-dir', f.remote, 'update-ref', `refs/heads/${branch}`, base);
    assert.throws(() => publishPublication(request, f), /remote base moved|remote feature branch differs/);
    assert.equal(f.pushes, 0); assert.equal(f.creates, 0);
  }
});
test('all historical touched paths and secrets are checked, including reverted changes', () => {
  const f = fixture(); writeFileSync(join(f.root, 'outside.txt'), 'Temporary'); f.git('add', '.'); f.git('commit', '-qm', 'outside');
  f.git('rm', '-q', 'outside.txt'); f.git('commit', '-qm', 'remove outside'); f.verify();
  assert.throws(() => f.preview(), /outside/);
  const secret = fixture(); writeFileSync(join(secret.root, 'src', 'token.txt'), 'ghp_' + 'a'.repeat(36)); secret.git('add', '.'); secret.git('commit', '-qm', 'temporary token');
  secret.git('rm', '-q', 'src/token.txt'); secret.git('commit', '-qm', 'remove token'); secret.verify();
  assert.throws(() => secret.preview(), /possible secret/);
});
test('unverified, dirty, protected branch, ambiguous origins and changed PR identity fail closed', () => {
  const f = fixture(); mutateWorkTask(f.taskId, t => { t.phase = 'waiting'; }, f); assert.throws(() => f.preview(), /verified delivery/);
  f.verify(); f.git('checkout', '-q', 'main'); f.verify(); assert.throws(() => f.preview(), /feature branch/);
  const dirty = fixture(); writeFileSync(join(dirty.root, 'untracked'), 'unreviewed'); assert.throws(() => dirty.preview(), /stale|clean/);
  const origin = fixture(), execute = origin.execute; origin.execute = (bin, args, options) => bin === 'git' && args[0] === 'remote' ? 'https://github.com/example/fixture.git\nhttps://github.com/other/fixture.git' : execute(bin, args, options);
  assert.throws(() => origin.preview(), /exactly one/);
  const pr = fixture(), request = pr.request(pr.preview()); pr.prs = [{ url: 'https://github.com/example/fixture/pull/1', headRefOid: 'wrong', headRefName: 'feature', baseRefName: 'main', state: 'OPEN', isDraft: true }];
  assert.throws(() => publishPublication(request, pr), /does not match/); assert.equal(pr.creates, 0);
});
test('metadata changes during remote writes revoke retry authority instead of renewing guard', () => {
  const f = fixture(), request = f.request(f.preview()), original = f.execute;
  f.execute = (bin, args, opts) => { if (bin === 'git' && args[0] === 'push') mutateWorkTask(f.taskId, t => { t.goal = 'Intervened'; }, f); return original(bin, args, opts); };
  assert.throws(() => publishPublication(request, f), /revision changed/);
  assert.throws(() => publishPublication(request, f), /task changed/); assert.equal(f.creates, 0);
});

test('create-only push lease refuses a competing ancestor created after the remote read', () => {
  const f = fixture(), request = f.request(f.preview()), original = f.execute;
  const ancestor = f.git('rev-parse', 'origin/main').trim();
  f.execute = (bin, args, opts) => {
    if (bin === 'git' && args[0] === 'push') {
      assert.ok(args.includes('--force-with-lease=refs/heads/feature:'));
      f.git('--git-dir', f.remote, 'update-ref', 'refs/heads/feature', ancestor);
    }
    return original(bin, args, opts);
  };
  assert.throws(() => publishPublication(request, f), /push failed/);
  assert.equal(f.git('--git-dir', f.remote, 'rev-parse', 'refs/heads/feature').trim(), ancestor);
  assert.equal(f.creates, 0);
});

test('saved checkpoint corruption cannot change the content authorized by the original digest', () => {
  const f = fixture(), request = f.request(f.preview()); f.timeout = true;
  assert.throws(() => publishPublication(request, f));
  mutateWorkTask(f.taskId, t => { t.publication.head = 'c'.repeat(40); t.publication.guardRevision = t.revision + 1; }, f);
  assert.throws(() => publishPublication(request, f), /inputs changed|unfinished publication changed/);
  assert.equal(f.creates, 1); assert.equal(f.pushes, 1);
});

test('SSH alias resolves only to GitHub and custom transport is refused', () => {
  const f = fixture(), original = f.execute;
  let hostname = 'github.com', custom = false;
  f.execute = (bin, args, opts) => {
    if (bin === 'ssh') { assert.equal(args[0], '-G'); return `hostname ${hostname}\nuser git\nport 22\nidentityfile /private/key\n`; }
    if (bin === 'git' && args[0] === 'remote') return 'git@github-work:example/fixture.git\n';
    if (bin === 'git' && args[0] === 'config') return custom ? 'core.sshcommand\nevil\0' : '';
    return original(bin, args, opts);
  };
  assert.equal(f.preview().repository, 'example/fixture'); assert.doesNotMatch(JSON.stringify(f.preview()), /private\/key/);
  hostname = 'evil.test'; assert.throws(() => f.preview(), /does not resolve/);
  hostname = 'github.com'; custom = true; assert.throws(() => f.preview(), /custom SSH/);
});
test('fresh preview after an uncertain publication retains the original confirmation identity', () => {
  const f = fixture(), preview = f.preview(); f.timeout = true;
  assert.throws(() => publishPublication(f.request(preview), f));
  const retry = f.preview(); assert.notEqual(retry.revision, preview.revision);
  assert.equal(retry.confirmation.expectedRevision, preview.revision);
  assert.equal(retry.confirmation.approval, preview.approval);
  f.timeout = false; assert.equal(publishPublication({ ...f.request(preview), ...retry.confirmation }, f).publication.state, 'pr-linked');
  assert.equal(f.creates, 1);
});
