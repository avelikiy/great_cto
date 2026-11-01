import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, realpathSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { latestApproval, treeReceipt, compareReceipts, verdictStateDir } from '../../scripts/lib/receipt.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/lib/receipt.mjs');

function fixture(t) {
  const temp = realpathSync(mkdtempSync(join(tmpdir(), 'receipt-worktree-')));
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

test('CLI compares the recorded stage base, not earlier work from the branch fork', t => {
  const f = fixture(t);
  writeFileSync(join(f.wt, 'prior.txt'), 'previous stage\n');
  f.git(f.wt, 'add', 'prior.txt'); f.git(f.wt, 'commit', '-qm', 'prior stage');
  mkdirSync(join(f.main, '.great_cto/verdicts'));
  writeFileSync(join(f.main, '.great_cto/verdicts/senior-dev.log'), JSON.stringify({
    v: 1, ts: '2000-01-01T00:00:00Z', agent: 'senior-dev', verdict: 'DONE', receipt: treeReceipt(f.wt),
  }) + '\n');
  writeFileSync(join(f.wt, 'delta.txt'), 'reviewed stage\n');
  f.git(f.wt, 'add', 'delta.txt'); f.git(f.wt, 'commit', '-qm', 'reviewed stage');
  f.review();
  const r = f.verify();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /every reviewed file is byte-identical/);
  assert.doesNotMatch(r.stdout, /were added after the approval/);
  const receiptFile = join(f.temp, 'recorded.json');
  writeFileSync(receiptFile, JSON.stringify(latestApproval(f.wt, { stateDir: join(f.main, '.great_cto') }).receipt));
  const check = spawnSync(process.execPath, [SCRIPT, '--check', receiptFile], { cwd: f.wt, encoding: 'utf8', env: f.env });
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /every reviewed file is byte-identical/);
  const noWrite = join(f.temp, 'must-not-write');
  const recorded = latestApproval(f.wt, { stateDir: join(f.main, '.great_cto') }).receipt;
  writeFileSync(receiptFile, JSON.stringify({ ...recorded, base: '--output=' + noWrite }));
  const invalid = spawnSync(process.execPath, [SCRIPT, '--check', receiptFile], { cwd: f.wt, encoding: 'utf8', env: f.env });
  assert.equal(invalid.status, 2, 'invalid evidence must not report a successful check');
  assert.match(invalid.stdout, /could not be read|unreadable/);
  assert.equal(existsSync(noWrite), false, 'a persisted base cannot become a Git write option');
  writeFileSync(join(f.wt, 'delta.txt'), 'changed after review\n');
  assert.equal(f.verify().status, 1, 'using the recorded base must still detect real drift');
  const accept = spawnSync(process.execPath, [SCRIPT, '--accept'], { cwd: f.wt, encoding: 'utf8', input: '', env: f.env });
  assert.equal(accept.status, 2, 'an agent cannot accept drift through a noninteractive process');
  assert.match(accept.stderr, /needs a terminal/);
  assert.equal(existsSync(join(f.wt, '.great_cto/.receipt-accept')), false);
});

test('legacy HEAD base on a nonstandard branch remains verifiable and detects committed drift', t => {
  const f = fixture(t);
  f.git(f.main, 'branch', '-m', 'experimental');
  writeFileSync(join(f.wt, 'sample.txt'), 'reviewed dirty bytes\n');
  assert.equal(treeReceipt(f.wt).base, 'HEAD', 'exercise the emitter own legacy format');
  f.review();
  assert.match(f.verify().stdout, /every reviewed file is byte-identical/);
  const recorded = latestApproval(f.wt, { stateDir: join(f.main, '.great_cto') }).receipt;
  const receiptFile = join(f.temp, 'head-receipt.json'); writeFileSync(receiptFile, JSON.stringify(recorded));
  writeFileSync(join(f.wt, 'sample.txt'), 'changed and committed after review\n');
  f.git(f.wt, 'add', 'sample.txt'); f.git(f.wt, 'commit', '-qm', 'post-review drift');
  assert.equal(f.verify().status, 1);
  const check = spawnSync(process.execPath, [SCRIPT, '--check', receiptFile], { cwd: f.wt, encoding: 'utf8', env: f.env });
  assert.equal(check.status, 1, check.stdout + check.stderr);
  writeFileSync(receiptFile, JSON.stringify({ ...recorded, head: null }));
  const missingHead = spawnSync(process.execPath, [SCRIPT, '--check', receiptFile], { cwd: f.wt, encoding: 'utf8', env: f.env });
  assert.equal(missingHead.status, 2, 'legacy HEAD without its recorded commit cannot fall back to current HEAD');
  writeFileSync(join(f.main, '.great_cto/verdicts/code-reviewer.log'), JSON.stringify({
    v: 1, ts: '2000-01-01T00:00:00Z', agent: 'code-reviewer', verdict: 'APPROVED',
    receipt: { ...recorded, base: 'f'.repeat(40) },
  }) + '\n');
  assert.equal(f.verify().status, 2, 'a missing Git object cannot make an unreadable check successful');
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
  cpSync(join(ROOT, 'scripts/lib/is-main.mjs'), join(f.wt, 'scripts/lib/is-main.mjs'));
  const r = spawnSync('bash', [join(ROOT, 'scripts/hooks/pre-push.sh')], {
    cwd: f.wt, encoding: 'utf8', input: '',
    env: { ...f.env, GREAT_CTO_SKIP_RECEIPT_CHECK: '', GREAT_CTO_ENFORCE_RECEIPT: '', GREAT_CTO_WORKSPACE: join(f.temp, 'no-workspace'),
      GREAT_CTO_PRIVATE_TERMS: join(f.temp, 'no-private-terms') },
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /BLOCKED — re-review/);
  const approval = latestApproval(f.wt, { stateDir: join(f.main, '.great_cto') });
  writeFileSync(join(f.main, '.great_cto/verdicts/code-reviewer.log'), JSON.stringify({
    ...approval, receipt: { ...approval.receipt, base: 'f'.repeat(40) },
  }) + '\n');
  const unreadable = spawnSync('bash', [join(ROOT, 'scripts/hooks/pre-push.sh')], {
    cwd: f.wt, encoding: 'utf8', input: '',
    env: { ...f.env, GREAT_CTO_SKIP_RECEIPT_CHECK: '', GREAT_CTO_ENFORCE_RECEIPT: '',
      GREAT_CTO_WORKSPACE: join(f.temp, 'no-workspace'), GREAT_CTO_PRIVATE_TERMS: join(f.temp, 'no-private-terms') },
  });
  assert.equal(unreadable.status, 1, unreadable.stdout + unreadable.stderr);
  assert.match(unreadable.stderr, /evidence could not be verified/);
  assert.doesNotMatch(unreadable.stderr, /--accept/, 'unreadable evidence cannot be accepted as a known state');
});
