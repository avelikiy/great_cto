// The receipt log-verdict.sh records measures the change from where the previous
// stage stood (great_cto-zfsj).
//
// Reproduces the 2026-09-14 live run through the real helper: qa-engineer records
// FAIL, senior-dev commits a fix, senior-dev records TASK_DONE. Before the fix the
// senior-dev receipt measured against HEAD — there is no upstream — and named only
// uncommitted leftovers, so the independent judge never saw the code.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TMP_DIRS = [];
after(() => { for (const d of TMP_DIRS) rmSync(d, { recursive: true, force: true }); });

function project() {
  const d = mkdtempSync(join(tmpdir(), 'gcto-taskbase-'));
  TMP_DIRS.push(d);
  const g = (...a) => execFileSync('git', a, { cwd: d, stdio: 'ignore' });
  g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@e.x'); g('config', 'user.name', 'T');
  writeFileSync(join(d, '.gitignore'), '.great_cto/\n');
  mkdirSync(join(d, 'src'));
  writeFileSync(join(d, 'src/cart.mjs'), 'export const total = (s, p) => s - p;\n');
  g('add', '-A'); g('commit', '-qm', 'cart');
  return { d, g };
}

function logVerdict(d, ...args) {
  const r = spawnSync('bash', [join(ROOT, 'scripts/log-verdict.sh'), ...args], {
    cwd: d, encoding: 'utf8', env: { ...process.env, GREAT_CTO_DIR: join(d, '.great_cto') },
  });
  assert.equal(r.status, 0, `log-verdict failed: ${r.stderr}`);
}

const lastRecord = (d, agent) => {
  const lines = readFileSync(join(d, '.great_cto/verdicts', `${agent}.log`), 'utf8').trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
};

test('senior-dev’s receipt includes the fix it committed before recording its verdict', () => {
  const { d, g } = project();
  logVerdict(d, 'qa-engineer', 'FAIL', '0.10', 'feature=checkout', 'need=implementer', 'finding=F1');
  const qaHead = lastRecord(d, 'qa-engineer').receipt?.head;
  assert.ok(qaHead, 'qa-engineer’s verdict carries a receipt');

  writeFileSync(join(d, 'src/cart.mjs'), 'export const total = (s, p) => s - Math.round(s * p / 100);\n');
  g('add', '-A'); g('commit', '-qm', 'fix: percentage discount');
  logVerdict(d, 'senior-dev', 'TASK_DONE', '0.20', 'feature=checkout', 'task=T-1');

  const rc = lastRecord(d, 'senior-dev').receipt;
  assert.equal(rc.base, qaHead, 'measured from where qa-engineer stood');
  assert.equal(rc.base_from, 'task');
  assert.ok('src/cart.mjs' in rc.files, 'the committed fix is in the change the judge reads');
});
