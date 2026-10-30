// project-auditor Phase 4A.0 (review follow-up F5, great_cto-dzoa): the prompt told the
// auditor to mark a hotspot with no test beside it "characterize before change", but
// nothing looked for the test — the agent guessed per file. The scan now says, per
// hotspot, whether a test file exists and which one.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = path.resolve('scripts/auditor-architectural-debt-scan.sh');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-hotspot-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });

function repo() {
  const dir = path.join(tmp, 'repo');
  fs.mkdirSync(path.join(dir, 'src', 'billing'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'app'), { recursive: true });
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 't@example.invalid');
  git(dir, 'config', 'user.name', 't');
  git(dir, 'config', 'commit.gpgsign', 'false');
  const body = (n) => Array.from({ length: 50 }, (_, i) => `export const v${n}_${i} = ${i};`).join('\n');
  // Two hotspots (large and churned): one with a test beside it, one without.
  for (let i = 0; i < 3; i++) {
    fs.writeFileSync(path.join(dir, 'src', 'billing', 'invoice.ts'), body(i));
    fs.writeFileSync(path.join(dir, 'app', 'orders.py'), body(i).replace(/export const/g, 'x'));
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', `c${i}`);
  }
  fs.writeFileSync(path.join(dir, 'src', 'billing', 'invoice.test.ts'), 'test');
  return dir;
}

test('4A.0 says, per hotspot, whether a test exists beside it', () => {
  const dir = repo();
  const r = spawnSync('bash', [SCRIPT], { cwd: dir, encoding: 'utf8', env: { ...process.env, AUDIT_TMP: path.join(tmp, 'scratch') } });
  assert.equal(r.status, 0, r.stderr);
  const section = r.stdout.slice(r.stdout.indexOf('4A.0'), r.stdout.indexOf('=== 4A. '));
  assert.match(section, /TESTED\s+src\/billing\/invoice\.ts\s+\(src\/billing\/invoice\.test\.ts\)/);
  assert.match(section, /NO TEST\s+app\/orders\.py\s+→ characterize before change/);
});

test('4A.0 scratch files go where AUDIT_TMP points, not a shared /tmp path', () => {
  const scratch = path.join(tmp, 'scratch2');
  spawnSync('bash', [SCRIPT], { cwd: path.join(tmp, 'repo'), encoding: 'utf8', env: { ...process.env, AUDIT_TMP: scratch } });
  assert.ok(fs.existsSync(path.join(scratch, 'audit-hotspots.txt')));
});
