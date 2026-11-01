// great_cto-hu2l follow-up: a receipt check that did not run is not a pass.
//
// pre-push read `node scripts/lib/receipt.mjs --verify` with stderr discarded
// and acted only when it printed something. --verify prints a line in every
// state it reaches, so empty output means it never got there: a crash, a
// missing import, or a main guard that did not recognise itself through a
// symlink. All of those skipped the review check without a word.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HOOK = join(ROOT, 'scripts/hooks/pre-push.sh');

function project(t, receiptSource, projectMd = 'slug: fixture\n') {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pre-push-receipt-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  writeFileSync(join(dir, '.gitignore'), '.great_cto/\n');
  mkdirSync(join(dir, 'scripts/lib'), { recursive: true });
  writeFileSync(join(dir, 'scripts/lib/receipt.mjs'), receiptSource);
  mkdirSync(join(dir, '.great_cto'));
  writeFileSync(join(dir, '.great_cto/PROJECT.md'), projectMd);
  git('add', '.'); git('commit', '-qm', 'baseline');
  return dir;
}

const push = (cwd, env = {}) => spawnSync('bash', [HOOK], {
  cwd, encoding: 'utf8', input: '', timeout: 60_000,
  env: { ...process.env, GREAT_CTO_DIR: '', GREAT_CTO_SKIP_RECEIPT_CHECK: '', GREAT_CTO_ENFORCE_RECEIPT: '',
    GREAT_CTO_WORKSPACE: join(cwd, 'no-workspace'), GREAT_CTO_PRIVATE_TERMS: join(cwd, 'no-private-terms'), ...env },
});

const CRASH = "throw new Error('receipt fixture crashed at import');\n";
const SILENT = '// a main guard that never matched: exits 0 and prints nothing\n';

test('a crashed receipt check is reported, with its error, not skipped', (t) => {
  const r = push(project(t, CRASH));
  assert.equal(r.status, 0, 'warn posture still allows the push');
  assert.match(r.stderr, /Review evidence could not be verified/);
  assert.match(r.stderr, /did not run/);
  assert.match(r.stderr, /receipt fixture crashed at import/, 'the cause is shown, not discarded');
  assert.match(r.stderr, /warn-only/);
});

test('a receipt check that exits 0 and prints nothing is reported too', (t) => {
  const r = push(project(t, SILENT));
  assert.equal(r.status, 0);
  assert.match(r.stderr, /Review evidence could not be verified/);
  assert.match(r.stderr, /did not run/);
});

test('under enforce, a receipt check that did not run blocks the push', (t) => {
  const r = push(project(t, CRASH), { GREAT_CTO_ENFORCE_RECEIPT: '1' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /BLOCKED — restore readable review evidence/);
});

test('enforce declared in PROJECT.md holds even when receipt.mjs cannot name its state dir', (t) => {
  const r = push(project(t, CRASH, 'slug: fixture\nreceipt-gate: enforce\n'));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /BLOCKED — restore readable review evidence/);
});
