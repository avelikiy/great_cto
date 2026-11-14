// ADR-051 slice 3: on a regulated archetype the deploy question (`receipt.mjs --verify
// --require`) needs the reviewer's approval to be attested by the harness. Elsewhere the
// attestation is said, not required; on a host that cannot attest it is "not verified".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts/lib/receipt.mjs');
const SEAL_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-attest-req-'));
process.env.GREAT_CTO_SEAL_KEY = path.join(SEAL_DIR, 'verdict-seal.key');
test.after(() => fs.rmSync(SEAL_DIR, { recursive: true, force: true }));
const { sealVerdict, sealAttestation } = await import('../../scripts/lib/verdict-seal.mjs');
const awaitReceipt = await import('../../scripts/lib/receipt.mjs');
const { treeReceipt, projectArchetype, attestableHost } = awaitReceipt;
const { lineDigest, ATTESTATIONS_FILE } = await import('../../scripts/lib/verdict-attestation.mjs');

function fixture(t, archetype) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gc-attest-req-')));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  const git = (...a) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=f', '-c', 'user.email=f@f.invalid', ...a], { cwd: d, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(d, '.gitignore'), '.great_cto/\n');
  fs.writeFileSync(path.join(d, 'app.js'), 'v1\n');
  git('add', '.'); git('commit', '-qm', 'base');
  fs.mkdirSync(path.join(d, '.great_cto/verdicts'), { recursive: true });
  if (archetype) fs.writeFileSync(path.join(d, '.great_cto/PROJECT.md'), `# P\narchetype: ${archetype}\n`);
  const approve = (agent, { attest = false } = {}) => {
    const rec = { v: 1, ts: new Date().toISOString(), agent, verdict: 'APPROVED', receipt: treeReceipt(d) };
    rec.seal = sealVerdict(rec);
    fs.appendFileSync(path.join(d, '.great_cto/verdicts', `${agent}.log`), JSON.stringify(rec) + '\n');
    if (attest) {
      const att = { ts: rec.ts, role: agent, agent_id: 'sub-1', agent_type: `great-cto:${agent}`, line: lineDigest(rec) };
      att.seal = sealAttestation(att);
      fs.appendFileSync(path.join(d, '.great_cto', ATTESTATIONS_FILE), JSON.stringify(att) + '\n');
    }
  };
  const verify = (env = {}) => spawnSync(process.execPath, [SCRIPT, '--verify', '--agent', 'code-reviewer', '--require'],
    { cwd: d, encoding: 'utf8', env: { ...process.env, GREAT_CTO_DIR: '', GREAT_CTO_HOST: '', CLAUDECODE: '1', ...env } });
  return { d, approve, verify };
}

test('regulated archetype: a self-reported approval blocks the deploy question with exit 5', (t) => {
  const f = fixture(t, 'fintech');
  f.approve('code-reviewer');
  const r = f.verify();
  assert.equal(r.status, 5, r.stdout + r.stderr);
  assert.match(r.stdout, /self-reported/);
  assert.match(r.stdout, /BLOCKED: fintech is a regulated archetype — the code-reviewer approval must be written by a code-reviewer subagent/);
});

test('regulated archetype: an attested approval passes', (t) => {
  const f = fixture(t, 'healthcare');
  f.approve('code-reviewer', { attest: true });
  const r = f.verify();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /attested: written by a great-cto:code-reviewer subagent \(sub-1\)/);
});

test('a non-regulated archetype, or none: self-reported is said, not blocked', (t) => {
  for (const archetype of ['web-service', null]) {
    const f = fixture(t, archetype);
    f.approve('code-reviewer');
    const r = f.verify();
    assert.equal(r.status, 0, `${archetype}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /self-reported/);
  }
});

test('a host that cannot attest (Codex, or no Claude Code) gets "not verified", exit 3 — never a block, never a pass', (t) => {
  const f = fixture(t, 'fintech');
  f.approve('code-reviewer');
  for (const env of [{ GREAT_CTO_HOST: 'codex' }, { CLAUDECODE: '' }]) {
    const r = f.verify(env);
    assert.equal(r.status, 3, `${JSON.stringify(env)}: ${r.stdout}`);
    assert.match(r.stdout, /cannot be attested here; not verified/);
  }
});

test('without --require nothing changes: the attestation is said, the exit is the receipt\'s', (t) => {
  const f = fixture(t, 'fintech');
  f.approve('code-reviewer');
  const r = spawnSync(process.execPath, [SCRIPT, '--verify', '--agent', 'code-reviewer'], { cwd: f.d, encoding: 'utf8', env: { ...process.env, GREAT_CTO_DIR: '', CLAUDECODE: '1' } });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /self-reported/);
});

test('projectArchetype and attestableHost read what they say', (t) => {
  const f = fixture(t, 'Fintech');
  assert.equal(projectArchetype(f.d, path.join(f.d, '.great_cto')), 'fintech');
  assert.equal(attestableHost({ CLAUDECODE: '1' }), true);
  assert.equal(attestableHost({ CLAUDECODE: '1', GREAT_CTO_HOST: 'codex' }), false);
  assert.equal(attestableHost({}), false);
});

test('devops step 2b blocks on exit 5 and names the stage', () => {
  const t = fs.readFileSync(path.join(ROOT, 'agents/devops.md'), 'utf8');
  assert.match(t, /5\) echo "BLOCKED: regulated archetype — the \$S approval was not written by a \$S subagent[^"]*"; exit 1 ;;/);
});

test('devops step 2b, executed: a self-reported code-reviewer approval on fintech stops the deploy', (t) => {
  const prompt = fs.readFileSync(path.join(ROOT, 'agents/devops.md'), 'utf8');
  const block = prompt.slice(prompt.indexOf('**2b. The approvals are of THIS tree.**')).match(/```bash\n([\s\S]*?)```/)[1];
  const run = (f) => spawnSync('bash', ['-c', block], { cwd: f.d, encoding: 'utf8',
    env: { ...process.env, GREAT_CTO_DIR: '', GREAT_CTO_HOST: '', CLAUDECODE: '1', CLAUDE_PLUGIN_ROOT: ROOT, PROJECT_SIZE: 'nano', TIER_EFFECTIVE: 'baseline' } });
  const blocked = fixture(t, 'fintech');
  blocked.approve('code-reviewer');
  const r = run(blocked);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /BLOCKED: regulated archetype — the code-reviewer approval was not written by a code-reviewer subagent/);
  const ok = fixture(t, 'fintech');
  ok.approve('code-reviewer', { attest: true });
  const r2 = run(ok);
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  assert.doesNotMatch(r2.stdout, /BLOCKED/);
});

// Codex review on #291: the host exception (exit 3) was returned before the drift and
// truncation checks, so a file changed after the approval stopped blocking on Codex.
test('a blocking receipt answer wins over the attestation answer: drift after the approval still exits 1', (t) => {
  for (const env of [{ GREAT_CTO_HOST: 'codex' }, { CLAUDECODE: '' }, {}]) {
    const f = fixture(t, 'fintech');
    f.approve('code-reviewer');
    fs.writeFileSync(path.join(f.d, 'app.js'), 'v2 — changed after the review\n');
    const r = f.verify(env);
    assert.equal(r.status, 1, `${JSON.stringify(env)}: ${r.stdout}`);
    assert.match(r.stdout, /app\.js/);
  }
});

test('an operator\'s acceptance of drift is not an attestation: the regulated answer stands', (t) => {
  const f = fixture(t, 'fintech');
  f.approve('code-reviewer');
  fs.writeFileSync(path.join(f.d, 'app.js'), 'v2\n');
  // Record an acceptance of exactly this state, hashed the way --verify hashes it.
  const { receiptHash, writeAcceptance, pipelineOutputPaths } = awaitReceipt;
  const approval = JSON.parse(fs.readFileSync(path.join(f.d, '.great_cto/verdicts/code-reviewer.log'), 'utf8').trim());
  const current = treeReceipt(f.d, { base: approval.receipt.base || null, exclude: pipelineOutputPaths(f.d) });
  writeAcceptance(f.d, { hash: receiptHash(current), why: 'looked at it', agent: 'code-reviewer' });
  const r = f.verify();
  assert.match(r.stdout, /accepted by the operator for this exact state/, 'the acceptance was honoured for the drift');
  assert.equal(r.status, 5, r.stdout);
});

test('devops step 2b on a host that cannot attest: drift after the approval blocks the deploy', (t) => {
  const prompt = fs.readFileSync(path.join(ROOT, 'agents/devops.md'), 'utf8');
  const block = prompt.slice(prompt.indexOf('**2b. The approvals are of THIS tree.**')).match(/```bash\n([\s\S]*?)```/)[1];
  const f = fixture(t, 'fintech');
  f.approve('code-reviewer');
  fs.writeFileSync(path.join(f.d, 'app.js'), 'v2 — unreviewed\n');
  const r = spawnSync('bash', ['-c', block], { cwd: f.d, encoding: 'utf8',
    env: { ...process.env, GREAT_CTO_DIR: '', GREAT_CTO_HOST: 'codex', CLAUDECODE: '', CLAUDE_PLUGIN_ROOT: ROOT, PROJECT_SIZE: 'nano', TIER_EFFECTIVE: 'baseline' } });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /BLOCKED: files changed or added after code-reviewer approved/);
});

// Codex review on #291: fintech and healthcare default to the baseline tier, and step 2b
// skipped security-officer on baseline — so its attestation was never asked for.
function step2b() {
  const prompt = fs.readFileSync(path.join(ROOT, 'agents/devops.md'), 'utf8');
  return prompt.slice(prompt.indexOf('**2b. The approvals are of THIS tree.**')).match(/```bash\n([\s\S]*?)```/)[1];
}
const runStep2b = (f, env) => spawnSync('bash', ['-c', step2b()], { cwd: f.d, encoding: 'utf8',
  env: { ...process.env, GREAT_CTO_DIR: '', GREAT_CTO_HOST: '', CLAUDECODE: '1', CLAUDE_PLUGIN_ROOT: ROOT, PROJECT_SIZE: 'medium', TIER_EFFECTIVE: 'baseline', ...env } });

test('regulated on the baseline tier: a self-reported security approval blocks the deploy', (t) => {
  const f = fixture(t, 'fintech');
  f.approve('qa-engineer', { attest: true });
  f.approve('code-reviewer', { attest: true });
  f.approve('security-officer');
  const r = runStep2b(f);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /BLOCKED: regulated archetype — the security-officer approval was not written by a security-officer subagent/);
  f.approve('security-officer', { attest: true });
  const ok = runStep2b(f);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
});

test('a non-regulated baseline project still skips the security stage, as before', (t) => {
  const f = fixture(t, 'web-service');
  f.approve('qa-engineer');
  f.approve('code-reviewer');
  const r = runStep2b(f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /security-officer/);
});

test('--regulated answers from the one list in approval-level.mjs', (t) => {
  const ask = (archetype) => {
    const f = fixture(t, archetype);
    return spawnSync(process.execPath, [SCRIPT, '--regulated'], { cwd: f.d, encoding: 'utf8', env: { ...process.env, GREAT_CTO_DIR: '' } });
  };
  const yes = ask('healthcare');
  assert.equal(yes.status, 0); assert.equal(yes.stdout.trim(), 'healthcare');
  assert.equal(ask('web-service').status, 1);
  assert.equal(ask(null).status, 1);
});
