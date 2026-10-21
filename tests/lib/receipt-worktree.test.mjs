import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { latestApproval, treeReceipt, compareReceipts, verdictStateDir } from '../../scripts/lib/receipt.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/lib/receipt.mjs');

function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'receipt-worktree-'));
  t.after(() => rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const main = join(temp, 'main'), wt = join(temp, 'linked checkout');
  mkdirSync(main);
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  git(main, 'init', '-q', '-b', 'main');
  git(main, 'config', 'user.name', 'Fixture');
  git(main, 'config', 'user.email', 'fixture@example.invalid');
  writeFileSync(join(main, '.gitignore'), '.great_cto/\n');
  writeFileSync(join(main, 'sample.txt'), 'reviewed\n');
  git(main, 'add', '.'); git(main, 'commit', '-qm', 'baseline');
  git(main, 'worktree', 'add', '-q', wt, 'HEAD');
  mkdirSync(join(main, '.great_cto'));
  writeFileSync(join(main, '.great_cto/PROJECT.md'), 'slug: fixture\nreceipt-gate: enforce\n');
  const env = { ...process.env, GREAT_CTO_DIR: '' };
  const review = (state = '') => {
    const r = spawnSync('bash', [join(ROOT, 'scripts/log-verdict.sh'), 'code-reviewer', 'APPROVED', 'auto', 'scope=isolated-fixture'], {
      cwd: wt, encoding: 'utf8', env: { ...env, GREAT_CTO_DIR: state },
    });
    assert.equal(r.status, 0, r.stderr);
  };
  const verify = (cwd = wt, state = '') => spawnSync(process.execPath, [SCRIPT, '--verify'], {
    cwd, encoding: 'utf8', env: { ...env, GREAT_CTO_DIR: state },
  });
  return { temp, main, wt, git, env, review, verify };
}

test('linked worktree reader finds the real writer receipt in shared project state', t => {
  const f = fixture(t); f.review();
  const stateDir = verdictStateDir(f.wt, {});
  assert.equal(stateDir, join(f.main, '.great_cto'));
  const approval = latestApproval(f.wt, { stateDir });
  assert.equal(approval?.agent, 'code-reviewer');
  assert.equal(approval.receipt.head, treeReceipt(f.wt).head);
  assert.equal(compareReceipts(approval.receipt, treeReceipt(f.wt), { cwd: f.wt }).state, 'matches');
  const r = f.verify();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /every reviewed file is byte-identical/);
  assert.doesNotMatch(r.stdout, /no approving verdict/);
});

test('shared receipt still compares candidate bytes, not main checkout bytes', t => {
  const f = fixture(t);
  writeFileSync(join(f.wt, 'sample.txt'), 'candidate reviewed\n');
  f.review();
  writeFileSync(join(f.wt, 'sample.txt'), 'candidate changed after review\n');
  const r = f.verify();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /sample\.txt/);
  assert.match(r.stdout, /reviewed file\(s\) changed after the approval/);
});

test('explicit state directory wins and an absent override never falls back', t => {
  const f = fixture(t); f.review();
  const override = join(f.temp, 'explicit state');
  f.review(override);
  const r = f.verify(f.wt, override);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /byte-identical/);
  const absent = f.verify(f.wt, join(f.temp, 'absent'));
  assert.equal(absent.status, 0);
  assert.match(absent.stdout, /no approving verdict carries a receipt/);
  // The writer resolves a relative override against the candidate cwd too.
  const relative = resolve(f.wt, '../relative-state');
  f.review('../relative-state');
  assert.match(f.verify(f.wt, relative).stdout, /byte-identical/);
});

test('no approval remains explicitly not verified and another clone cannot supply it', t => {
  const f = fixture(t); f.review();
  const other = join(f.temp, 'other-clone');
  f.git(f.temp, 'clone', '-q', f.main, other);
  const r = f.verify(other);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no approving verdict carries a receipt/);
});

test('worktree-local approval does not mask missing authoritative shared review', t => {
  const f = fixture(t);
  f.review(join(f.wt, '.great_cto'));
  assert.match(f.verify().stdout, /no approving verdict carries a receipt/);
});

test('pre-push retains shared receipt-gate enforcement from the main project', t => {
  const f = fixture(t);
  writeFileSync(join(f.wt, 'sample.txt'), 'candidate reviewed\n'); f.review();
  writeFileSync(join(f.wt, 'sample.txt'), 'candidate drift\n');
  // The hook invokes relative scripts from the fixture checkout.
  mkdirSync(join(f.wt, 'scripts/lib'), { recursive: true });
  cpSync(join(ROOT, 'scripts/lib/receipt.mjs'), join(f.wt, 'scripts/lib/receipt.mjs'));
  const r = spawnSync('bash', [join(ROOT, 'scripts/hooks/pre-push.sh')], {
    cwd: f.wt, encoding: 'utf8', input: '',
    env: { ...f.env, GREAT_CTO_SKIP_RECEIPT_CHECK: '', GREAT_CTO_ENFORCE_RECEIPT: '', GREAT_CTO_WORKSPACE: join(f.temp, 'no-workspace'),
      GREAT_CTO_PRIVATE_TERMS: join(f.temp, 'no-private-terms') },
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /BLOCKED — re-review/);
});
