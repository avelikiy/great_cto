// devops deployed on "the newest QA file says PASS". That says what QA saw, not what
// ships: a commit after gate:ship, or a fix after review, went out under an old
// approval. And `receipt.mjs --verify` checked only the newest approval of ANY stage,
// so a review of today's tree stood in for a QA pass on yesterday's.
// Found by an external review of public agent repositories (gstack's readiness
// gate), 01.11.2026. The devops step is extracted from the prompt and executed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { treeReceipt } from '../../scripts/lib/receipt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts/lib/receipt.mjs');

function fixture(t) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gc-fresh-')));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  const git = (...a) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=f', '-c', 'user.email=f@f.invalid', ...a], { cwd: d, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(d, '.gitignore'), '.great_cto/\n');
  fs.writeFileSync(path.join(d, 'app.js'), 'v1\n');
  git('add', '.'); git('commit', '-qm', 'base');
  fs.mkdirSync(path.join(d, '.great_cto/verdicts'), { recursive: true });
  let n = 0;
  const approve = (agent) => {
    n += 1;
    fs.appendFileSync(path.join(d, '.great_cto/verdicts', `${agent}.log`), JSON.stringify({
      v: 1, ts: `2026-11-01T00:00:${String(n).padStart(2, '0')}Z`, agent, verdict: 'APPROVED', receipt: treeReceipt(d),
    }) + '\n');
  };
  const verify = (...extra) => spawnSync(process.execPath, [SCRIPT, '--verify', ...extra], { cwd: d, encoding: 'utf8', env: { ...process.env, GREAT_CTO_DIR: '' } });
  return { d, git, approve, verify };
}

test('a newer review must not stand in for an older QA pass', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.d, 'app.js'), 'v2\n');
  f.approve('qa-engineer');
  fs.writeFileSync(path.join(f.d, 'app.js'), 'v3 — fixed after QA\n');
  f.approve('code-reviewer');
  assert.equal(f.verify().status, 0, 'the newest approval of any stage matches — the old question');
  const qa = f.verify('--agent', 'qa-engineer');
  assert.equal(qa.status, 1, qa.stdout + qa.stderr);
  assert.match(qa.stdout, /qa-engineer APPROVED/);
  assert.match(qa.stdout, /app\.js/);
});

test('--require turns "nothing to compare" into exit 3; without it, the old exit 0', (t) => {
  const f = fixture(t);
  assert.equal(f.verify('--agent', 'security-officer').status, 0);
  const r = f.verify('--agent', 'security-officer', '--require');
  assert.equal(r.status, 3);
  assert.match(r.stdout, /no approving security-officer verdict carries a receipt/);
});

test('--agent accepts only an approving stage', (t) => {
  const f = fixture(t);
  const r = f.verify('--agent', 'architect');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /must be one of code-reviewer, security-officer, qa-engineer/);
});

// The step as devops runs it: cut from the prompt, executed against the fixture.
function devopsStep() {
  const t = fs.readFileSync(path.join(ROOT, 'agents/devops.md'), 'utf8');
  const at = t.indexOf('**2b. The approvals are of THIS tree.**');
  assert.ok(at > 0, 'devops carries step 2b');
  const block = t.slice(at).match(/```bash\n([\s\S]*?)```/);
  assert.ok(block, 'step 2b has a bash block');
  return block[1];
}
const runStep = (f, env) => spawnSync('bash', ['-c', devopsStep()], {
  cwd: f.d, encoding: 'utf8', env: { ...process.env, GREAT_CTO_DIR: '', CLAUDE_PLUGIN_ROOT: ROOT, ...env },
});

test('devops step 2b: every approval on this tree → proceeds', (t) => {
  const f = fixture(t);
  f.approve('qa-engineer'); f.approve('security-officer'); f.approve('code-reviewer');
  const r = runStep(f, { TIER_EFFECTIVE: 'standard', PROJECT_SIZE: 'medium' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /BLOCKED|NOT VERIFIED/);
});

test('devops step 2b: a change after QA blocks the deploy and names the stage', (t) => {
  const f = fixture(t);
  f.approve('qa-engineer'); f.approve('security-officer');
  fs.writeFileSync(path.join(f.d, 'app.js'), 'changed after QA\n');
  f.approve('code-reviewer');
  const r = runStep(f, { TIER_EFFECTIVE: 'standard', PROJECT_SIZE: 'medium' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /BLOCKED: files changed or added after qa-engineer approved/);
});

test('devops step 2b: a stage with no receipt is said, not passed as verified', (t) => {
  const f = fixture(t);
  f.approve('qa-engineer');
  const r = runStep(f, { TIER_EFFECTIVE: 'standard', PROJECT_SIZE: 'medium' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /FRESHNESS NOT VERIFIED: no security-officer approval carries a receipt/);
});

test('devops step 2b: a nano project skips QA, baseline tier skips security', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.d, 'app.js'), 'nobody approved this\n');
  const r = runStep(f, { TIER_EFFECTIVE: 'baseline', PROJECT_SIZE: 'nano' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /qa-engineer|security-officer/);
});

test('devops never accepts a drifted state on the operator\'s behalf', () => {
  const step = devopsStep();
  assert.doesNotMatch(step.split('\n').filter((l) => !/echo/.test(l)).join('\n'), /--accept/, 'only the echoed instruction may name --accept');
  for (const file of ['agents/devops.md', 'agents-full/devops.md']) {
    assert.match(fs.readFileSync(path.join(ROOT, file), 'utf8'), /never run `--accept`\s+yourself/, file);
  }
});

test('--require counts a file added after the approval as drift; a plain verify does not', (t) => {
  // Approved on a clean tree, then a new change: before a push that is work
  // continuing; before a deploy it is unreviewed code shipping.
  const f = fixture(t);
  f.approve('qa-engineer');
  fs.writeFileSync(path.join(f.d, 'new.js'), 'never reviewed\n');
  assert.equal(f.verify('--agent', 'qa-engineer').status, 0);
  const r = f.verify('--agent', 'qa-engineer', '--require');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /added/);
});

test('devops step 2b: a receipt that cannot be compared blocks — unread is not a match', (t) => {
  const f = fixture(t);
  f.approve('security-officer');
  // A QA verdict whose receipt names a base no git revision can be: the comparison cannot run.
  const rec = { ...treeReceipt(f.d), base: 'not-a-revision!' };
  fs.appendFileSync(path.join(f.d, '.great_cto/verdicts/qa-engineer.log'),
    JSON.stringify({ v: 1, ts: '2026-11-01T00:01:00Z', agent: 'qa-engineer', verdict: 'APPROVED', receipt: rec }) + '\n');
  const r = runStep(f, { TIER_EFFECTIVE: 'standard', PROJECT_SIZE: 'medium' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /BLOCKED: could not compare qa-engineer's receipt/);
});
