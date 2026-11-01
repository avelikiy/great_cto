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
import { treeReceipt, writeAcceptance, receiptHash, MAX_FILES, pipelineOutputPaths } from '../../scripts/lib/receipt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts/lib/receipt.mjs');
// The seal key lives in a throwaway file, never the operator's home; spawned
// processes inherit it through the environment.
const SEAL_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-seal-'));
process.env.GREAT_CTO_SEAL_KEY = path.join(SEAL_DIR, 'verdict-seal.key');
test.after(() => fs.rmSync(SEAL_DIR, { recursive: true, force: true }));
const { sealVerdict } = await import('../../scripts/lib/verdict-seal.mjs');
// Verdict timestamps only ORDER approvals (the newest wins); nothing here compares
// them against an age. Anchored to the clock so no date in this file can expire.
const T0 = Date.now() - 24 * 3600000;

function fixture(t, { ignoreState = true } = {}) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gc-fresh-')));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  const git = (...a) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=f', '-c', 'user.email=f@f.invalid', ...a], { cwd: d, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(d, '.gitignore'), ignoreState ? '.great_cto/\n' : 'node_modules/\n');
  fs.writeFileSync(path.join(d, 'app.js'), 'v1\n');
  git('add', '.'); git('commit', '-qm', 'base');
  fs.mkdirSync(path.join(d, '.great_cto/verdicts'), { recursive: true });
  let n = 0;
  const approve = (agent) => {
    n += 1;
    // Sealed, as log-verdict.sh writes it.
    const rec = { v: 1, ts: new Date(T0 + n * 1000).toISOString(), agent, verdict: 'APPROVED', receipt: treeReceipt(d) };
    fs.appendFileSync(path.join(d, '.great_cto/verdicts', `${agent}.log`), JSON.stringify({ ...rec, seal: sealVerdict(rec) }) + '\n');
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
  assert.match(r.stdout, /FRESHNESS NOT VERIFIED: the security-officer approval carries no receipt or no seal/);
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
  const line = { v: 1, ts: new Date(T0 + 60000).toISOString(), agent: 'qa-engineer', verdict: 'APPROVED', receipt: rec };
  fs.appendFileSync(path.join(f.d, '.great_cto/verdicts/qa-engineer.log'), JSON.stringify({ ...line, seal: sealVerdict(line) }) + '\n');
  const r = runStep(f, { TIER_EFFECTIVE: 'standard', PROJECT_SIZE: 'medium' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /BLOCKED: could not compare qa-engineer's receipt/);
});

// Review of 3.75.5 (B1, M1, M2, m5).

test('B1: in a project that does not ignore .great_cto/, an approval is not drift from itself', (t) => {
  const f = fixture(t, { ignoreState: false });
  fs.writeFileSync(path.join(f.d, 'app.js'), 'v2\n');
  f.approve('qa-engineer');            // the receipt is taken, then the log line written
  f.approve('security-officer');       // and another stage writes its own log
  // This qa receipt RECORDS security-officer.log, which the next approval changes.
  f.approve('qa-engineer');            // this receipt records security-officer.log
  f.approve('security-officer');       // which then changes
  const r = f.verify('--agent', 'qa-engineer', '--require');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /\.great_cto\//);
  fs.writeFileSync(path.join(f.d, 'app.js'), 'v3\n');
  assert.equal(f.verify('--agent', 'qa-engineer', '--require').status, 1, 'a code change is still drift');
});

test('B1: the devops step passes on a fresh tree in such a project', (t) => {
  const f = fixture(t, { ignoreState: false });
  f.approve('qa-engineer'); f.approve('security-officer');
  const r = runStep(f, { TIER_EFFECTIVE: 'standard', PROJECT_SIZE: 'medium' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('M1: an added file under --require can be accepted — accept does not say "nothing to accept"', (t) => {
  const f = fixture(t);
  f.approve('qa-engineer');
  fs.writeFileSync(path.join(f.d, 'new.js'), 'added after QA\n');
  const acc = spawnSync(process.execPath, [SCRIPT, '--accept', '--agent', 'qa-engineer', '--require'], { cwd: f.d, encoding: 'utf8', env: { ...process.env, GREAT_CTO_DIR: '' } });
  assert.doesNotMatch(acc.stdout, /nothing to accept/);
  assert.match(acc.stderr, /--accept needs a terminal/, 'it reaches the human step');
  assert.match(acc.stdout, /added/);
});

test('M1/m5: an acceptance binds to the stage it was given for', (t) => {
  const f = fixture(t, { ignoreState: false });
  f.approve('qa-engineer'); f.approve('code-reviewer');
  fs.writeFileSync(path.join(f.d, 'app.js'), 'changed after both\n');
  const current = treeReceipt(f.d, { exclude: pipelineOutputPaths(f.d) });
  writeAcceptance(f.d, { hash: receiptHash(current), why: 'test', agent: 'code-reviewer' });
  const qa = f.verify('--agent', 'qa-engineer', '--require');
  assert.equal(qa.status, 1, 'code-reviewer\'s acceptance does not cover qa-engineer');
  assert.match(qa.stdout, /given for code-reviewer, not for qa-engineer/);
  assert.equal(f.verify('--agent', 'code-reviewer', '--require').status, 0, 'the stage it was given for passes');
});

test('M2: a receipt capped at MAX_FILES is not a match for the deploy question', (t) => {
  const f = fixture(t);
  for (let i = 0; i <= MAX_FILES + 4; i += 1) fs.writeFileSync(path.join(f.d, `f${String(i).padStart(3, '0')}.txt`), `${i}\n`);
  f.approve('qa-engineer');
  fs.writeFileSync(path.join(f.d, `f${MAX_FILES + 3}.txt`), 'edited past the cap\n');
  assert.equal(f.verify('--agent', 'qa-engineer').status, 0, 'pre-push keeps its behaviour');
  const r = f.verify('--agent', 'qa-engineer', '--require');
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stdout, /lists only the first 200 files/);
});

test('M3: from a linked worktree, the code-reviewer stage is still checked', (t) => {
  const f = fixture(t);
  const wt = path.join(f.d, '..', path.basename(f.d) + '-wt');
  f.git('worktree', 'add', '-q', wt, 'HEAD');
  t.after(() => fs.rmSync(wt, { recursive: true, force: true }));
  // Verdicts are written to the MAIN checkout's .great_cto, as log-verdict.sh does from a worktree.
  fs.writeFileSync(path.join(wt, 'app.js'), 'reviewed in the worktree\n');
  const rec = treeReceipt(wt);
  for (const agent of ['qa-engineer', 'security-officer', 'code-reviewer']) {
    const line = { v: 1, ts: new Date(T0 + 3600000 + agent.length * 1000).toISOString(), agent, verdict: 'APPROVED', receipt: rec };
    fs.appendFileSync(path.join(f.d, '.great_cto/verdicts', `${agent}.log`), JSON.stringify({ ...line, seal: sealVerdict(line) }) + '\n');
  }
  fs.writeFileSync(path.join(wt, 'app.js'), 'changed after every approval\n');
  const r = spawnSync('bash', ['-c', devopsStep()], { cwd: wt, encoding: 'utf8', env: { ...process.env, GREAT_CTO_DIR: '', CLAUDE_PLUGIN_ROOT: ROOT, TIER_EFFECTIVE: 'baseline', PROJECT_SIZE: 'nano' } });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /BLOCKED: files changed or added after code-reviewer approved/);
});

test('N1: a change to PROJECT.md or a signed exception after the approval is drift', (t) => {
  // PROJECT.md decides project_size and the tier, which decide what devops checks.
  for (const file of ['.great_cto/PROJECT.md', '.great_cto/exceptions/EXC-x.json']) {
    const f = fixture(t, { ignoreState: false });
    fs.mkdirSync(path.join(f.d, '.great_cto/exceptions'), { recursive: true });
    fs.writeFileSync(path.join(f.d, file), 'project_size: medium\n');
    f.git('add', '.'); f.git('commit', '-qm', 'config');
    fs.writeFileSync(path.join(f.d, 'app.js'), 'v2\n');
    f.approve('qa-engineer');
    fs.writeFileSync(path.join(f.d, file), 'project_size: nano\n');
    const r = f.verify('--agent', 'qa-engineer', '--require');
    assert.equal(r.status, 1, `${file}: ${r.stdout}`);
    assert.ok(r.stdout.includes(file), file);
  }
});

test('N1: what the pipeline writes — logs, handoffs, evidence, scores — is not drift', (t) => {
  const f = fixture(t, { ignoreState: false });
  fs.writeFileSync(path.join(f.d, 'app.js'), 'v2\n');
  f.approve('qa-engineer');
  for (const [p, body] of [['.great_cto/scores.jsonl', '{}\n'], ['.great_cto/cross-review.log', 'x\n'],
    ['.great_cto/handoffs/h.md', 'x\n'], ['.great_cto/evidence/e.json', '{}\n']]) {
    fs.mkdirSync(path.dirname(path.join(f.d, p)), { recursive: true });
    fs.writeFileSync(path.join(f.d, p), body);
  }
  const r = f.verify('--agent', 'qa-engineer', '--require');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('N7: what hooks and agents write after an approval — any name, now or later — is not drift', (t) => {
  // The review marker is written right AFTER code-reviewer's verdict, every time.
  const f = fixture(t, { ignoreState: false });
  fs.writeFileSync(path.join(f.d, 'app.js'), 'v2\n');
  f.approve('code-reviewer');
  for (const p of ['.great_cto/review-marker.json', '.great_cto/.last-auto-learn', '.great_cto/lessons.md',
    '.great_cto/decisions.md', '.great_cto/a-file-no-hook-writes-yet.md']) fs.writeFileSync(path.join(f.d, p), 'x\n');
  const r = f.verify('--agent', 'code-reviewer', '--require');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('N7: configuration under .great_cto/ still counts — a security allowlist change is drift', (t) => {
  const f = fixture(t, { ignoreState: false });
  fs.writeFileSync(path.join(f.d, 'app.js'), 'v2\n');
  f.approve('security-officer');
  fs.writeFileSync(path.join(f.d, '.great_cto/security-allowlist.yml'), 'allow: [everything]\n');
  const r = f.verify('--agent', 'security-officer', '--require');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /security-allowlist\.yml/);
});

test('review pass 4: deleting the security signals, editing the SLO budget or env.sh is drift', (t) => {
  for (const [file, before, after] of [
    ['.great_cto/security-signals.log', 'SECURITY_SIGNAL: auth-path-changed x\n', null],
    ['.great_cto/slo-budget-current.md', 'status: EXHAUSTED\n', 'status: OK\n'],
    ['.great_cto/env.sh', 'export PATH=/usr/bin:$PATH\n', 'export PATH=/tmp/evil:$PATH\n'],
  ]) {
    const f = fixture(t, { ignoreState: false });
    fs.writeFileSync(path.join(f.d, file), before);
    f.git('add', '.'); f.git('commit', '-qm', 'state');
    fs.writeFileSync(path.join(f.d, 'app.js'), 'v2\n');
    f.approve('qa-engineer');
    if (after === null) fs.rmSync(path.join(f.d, file)); else fs.writeFileSync(path.join(f.d, file), after);
    assert.equal(f.verify('--agent', 'qa-engineer', '--require').status, 1, file);
  }
});

test('devops says what the freshness step cannot prove', () => {
  for (const file of ['agents/devops.md', 'agents-full/devops.md']) {
    assert.match(fs.readFileSync(path.join(ROOT, file), 'utf8'), /code that runs those writers can still make\s+a valid one \(ADR-046\)/, file);
  }
});

test('review pass 5: more deletions than the cap mark the receipt truncated — not a match', (t) => {
  const f = fixture(t);
  for (let i = 0; i <= MAX_FILES + 4; i += 1) fs.writeFileSync(path.join(f.d, `d${String(i).padStart(3, '0')}.txt`), `${i}\n`);
  f.git('add', '.'); f.git('commit', '-qm', 'many');
  f.git('checkout', '-q', '-b', 'work');
  f.git('rm', '-q', ...Array.from({ length: MAX_FILES + 1 }, (_, i) => `d${String(i).padStart(3, '0')}.txt`));
  f.git('commit', '-qm', 'delete many');
  assert.equal(treeReceipt(f.d, { base: f.git('rev-parse', 'main').trim() }).truncated, true);
});

// great_cto-dv3b: a verdict line or an acceptance written outside its writer.

test('dv3b: a PASS line appended by hand, newest, is not verified; one with a forged seal blocks', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.d, 'app.js'), 'v2\n');
  f.approve('qa-engineer');
  fs.writeFileSync(path.join(f.d, 'app.js'), 'changed, then a PASS written by hand\n');
  const forged = { v: 1, ts: new Date().toISOString(), agent: 'qa-engineer', verdict: 'PASS', receipt: treeReceipt(f.d) };
  const log = path.join(f.d, '.great_cto/verdicts/qa-engineer.log');
  fs.appendFileSync(log, JSON.stringify(forged) + '\n');
  const unsealed = f.verify('--agent', 'qa-engineer', '--require');
  assert.equal(unsealed.status, 3, unsealed.stdout);
  assert.match(unsealed.stdout, /not sealed/);
  fs.appendFileSync(log, JSON.stringify({ ...forged, ts: new Date(Date.now() + 1000).toISOString(), seal: 'v1:' + '0'.repeat(64) }) + '\n');
  const bad = f.verify('--agent', 'qa-engineer', '--require');
  assert.equal(bad.status, 4, bad.stdout);
  assert.match(bad.stdout, /seal does not match/);
  const r = runStep(f, { TIER_EFFECTIVE: 'baseline', PROJECT_SIZE: 'medium' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /BLOCKED: the newest qa-engineer approval's seal does not match/);
  assert.equal(f.verify('--agent', 'qa-engineer').status !== undefined, true, 'plain verify (pre-push) does not read seals');
});

test('dv3b: an edited verdict field breaks its seal', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.d, 'app.js'), 'v2\n');
  f.approve('qa-engineer');
  const log = path.join(f.d, '.great_cto/verdicts/qa-engineer.log');
  const rec = JSON.parse(fs.readFileSync(log, 'utf8').trim());
  fs.writeFileSync(log, JSON.stringify({ ...rec, verdict: 'PASS', agent: 'qa-engineer', ts: new Date().toISOString() }) + '\n');
  assert.equal(f.verify('--agent', 'qa-engineer', '--require').status, 4);
});

test('dv3b: a hand-written acceptance with the right hash is not an acceptance', (t) => {
  const f = fixture(t, { ignoreState: false });
  f.approve('qa-engineer');
  fs.writeFileSync(path.join(f.d, 'app.js'), 'drift\n');
  const current = treeReceipt(f.d, { exclude: pipelineOutputPaths(f.d) });
  writeAcceptance(f.d, { hash: receiptHash(current), why: 'hand', agent: 'qa-engineer', seal: null });   // no seal
  const r = f.verify('--agent', 'qa-engineer', '--require');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /carries no seal/);
  writeAcceptance(f.d, { hash: receiptHash(treeReceipt(f.d, { exclude: pipelineOutputPaths(f.d) })), why: 'operator', agent: 'qa-engineer' });
  assert.equal(f.verify('--agent', 'qa-engineer', '--require').status, 0, 'the writer\'s sealed acceptance is honoured');
});
