// ADR-051 slice 2: the harness records which subagent wrote a verdict line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KEYDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-attest-key-'));
process.env.GREAT_CTO_SEAL_KEY = path.join(KEYDIR, 'verdict-seal.key');

const { makeVerdict } = await import('../../scripts/lib/verdict-record.mjs');
const { sealVerdict, sealAttestation } = await import('../../scripts/lib/verdict-seal.mjs');
const { notePre, attestAfter, attestationOf, readAttestations, lineDigest, ATTESTATIONS_FILE } = await import('../../scripts/lib/verdict-attestation.mjs');
const { pre } = await import('../../scripts/hooks/verdict-attest.mjs');
const { BASH_REMINDERS } = await import('../../scripts/hooks/bash-guards.mjs');
const { run: guard, runsAttestHook, isVerdictPath } = await import('../../scripts/hooks/verdict-authorship-guard.mjs');
const { readReviewerAttestations } = await import('../../packages/board/lib/merge-readiness.mjs');

function world(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-attest-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stateDir = path.join(root, '.great_cto');
  const tmp = path.join(root, 'tmp');
  fs.mkdirSync(path.join(stateDir, 'verdicts'), { recursive: true });
  fs.mkdirSync(tmp);
  let n = 0; // distinct timestamps: two byte-identical lines share a digest, by design
  const append = (role, { agent = role, verdict = 'APPROVED', sealed = true, head = 'a'.repeat(40) } = {}) => {
    const rec = makeVerdict({ ts: new Date(Date.UTC(2026, 10, 13, 12, 0, n++)).toISOString(), agent, verdict, receipt: { head, files: {} } });
    if (sealed) rec.seal = sealVerdict(rec);
    fs.appendFileSync(path.join(stateDir, 'verdicts', `${role}.log`), JSON.stringify(rec) + '\n');
    return rec;
  };
  const call = (agentType, command = 'scripts/log-verdict.sh x', agentId = 'agent-1') => ({ stateDir, agentType, agentId, session: 's1', command, tmp });
  return { root, stateDir, tmp, append, call };
}

test('a subagent writing its own sealed verdict is attested, and the attestation names it', (t) => {
  const w = world(t);
  const c = w.call('great-cto:code-reviewer');
  assert.equal(notePre(c).ok, true);
  const rec = w.append('code-reviewer');
  const got = attestAfter(c);
  assert.equal(got.length, 1);
  assert.equal(got[0].role, 'code-reviewer');
  assert.equal(got[0].agent_type, 'great-cto:code-reviewer');
  assert.equal(got[0].agent_id, 'agent-1');
  assert.equal(got[0].line, lineDigest(rec));
  assert.equal(attestationOf(rec, w.stateDir).state, 'attested');
  assert.equal(fs.statSync(path.join(w.stateDir, ATTESTATIONS_FILE)).mode & 0o777, 0o600);
});

test('it does not depend on the command line: a writer called through a variable is attested too', (t) => {
  const w = world(t);
  const c = w.call('qa-engineer', '"$LV" qa-engineer PASS auto');
  notePre(c);
  const rec = w.append('qa-engineer', { verdict: 'PASS' });
  attestAfter(c);
  assert.equal(attestationOf(rec, w.stateDir).state, 'attested');
});

test('lines the call did not write as that role stay self-reported', (t) => {
  const w = world(t);
  const before = w.append('code-reviewer');                    // already there before the call
  const c = w.call('code-reviewer');
  notePre(c);
  const unsealed = w.append('code-reviewer', { sealed: false }); // hand-written
  const foreign = w.append('code-reviewer', { agent: 'qa-engineer' }); // another role's line in this log
  const other = w.append('qa-engineer');                         // another role's log
  assert.deepEqual(attestAfter(c), []);
  for (const rec of [before, unsealed, foreign, other]) assert.equal(attestationOf(rec, w.stateDir).state, 'self-reported');
});

test('no snapshot, the main session, or a second Post for the same call: nothing is attested', (t) => {
  const w = world(t);
  const c = w.call('code-reviewer');
  const rec = w.append('code-reviewer');
  assert.deepEqual(attestAfter(c), [], 'no PreToolUse snapshot');
  assert.equal(notePre({ ...c, agentId: '' }).ok, false, 'the main session has no agent id');
  notePre(c);
  w.append('code-reviewer');
  assert.equal(attestAfter(c).length, 1);
  assert.deepEqual(attestAfter(c), [], 'the snapshot is used once');
  assert.equal(attestationOf(rec, w.stateDir).state, 'self-reported');
});

test('a forged or replayed attestation does not attest', (t) => {
  const w = world(t);
  const rec = w.append('code-reviewer');
  const file = path.join(w.stateDir, ATTESTATIONS_FILE);
  // Hand-written, no valid seal.
  fs.appendFileSync(file, JSON.stringify({ ts: 'x', role: 'code-reviewer', agent_id: 'a', agent_type: 'code-reviewer', line: lineDigest(rec), seal: 'v1:00' }) + '\n');
  assert.equal(attestationOf(rec, w.stateDir).state, 'self-reported');
  assert.equal(readAttestations(w.stateDir).invalid, 1);
  // A validly sealed attestation for one role does not vouch for a line of another.
  const qa = w.append('qa-engineer');
  const att = { ts: 'x', role: 'code-reviewer', agent_id: 'a', agent_type: 'code-reviewer', line: lineDigest(qa) };
  att.seal = sealAttestation(att);
  fs.appendFileSync(file, JSON.stringify(att) + '\n');
  assert.equal(attestationOf(qa, w.stateDir).state, 'self-reported');
  // A verdict seal is not an attestation seal.
  const reused = { ts: 'x', role: 'code-reviewer', agent_id: 'a', agent_type: 'code-reviewer', line: lineDigest(rec), seal: rec.seal };
  fs.appendFileSync(file, JSON.stringify(reused) + '\n');
  assert.equal(attestationOf(rec, w.stateDir).state, 'self-reported');
});

test('the hooks end to end: bash-guards takes the snapshot, the PostToolUse hook attests', (t) => {
  const w = world(t);
  const env = { ...process.env, GREAT_CTO_DIR: w.stateDir, TMPDIR: w.tmp };
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'bash scripts/log-verdict.sh code-reviewer APPROVED auto' }, cwd: w.root, session_id: 's9', agent_id: 'sub-7', agent_type: 'great-cto:code-reviewer' });
  const savedTmp = process.env.TMPDIR;
  process.env.TMPDIR = w.tmp;
  try { assert.equal(pre(payload, env).code, 0); } finally { if (savedTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = savedTmp; }
  const rec = w.append('code-reviewer');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/hooks/verdict-attest.mjs')], { input: payload, env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '', 'the hook never prints to the model');
  assert.equal(attestationOf(rec, w.stateDir).state, 'attested');
});

test('wiring: bash-guards runs the snapshot, plugin.json runs the PostToolUse hook on Bash', () => {
  assert.ok(BASH_REMINDERS.some(([n]) => n === 'verdict-attest'));
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf8'));
  const group = plugin.hooks.PostToolUse.find((g) => g.matcher === 'Bash' && g.hooks.some((h) => h.command.includes('verdict-attest.mjs')));
  assert.ok(group, 'PostToolUse Bash runs verdict-attest.mjs');
  assert.match(group.hooks[0].command, /\|\| true$/, 'it can never block a call');
});

test('the guard refuses an agent running the attest hook or writing the attestation log', () => {
  for (const cmd of ['node scripts/hooks/verdict-attest.mjs < forged.json', 'node --no-warnings /x/scripts/hooks/verdict-attest.mjs', './scripts/hooks/verdict-attest.mjs']) {
    assert.equal(runsAttestHook(cmd), true, cmd);
    assert.equal(guard(JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd }, cwd: '/proj' }), {}).code, 2, cmd);
  }
  assert.equal(runsAttestHook('cat scripts/hooks/verdict-attest.mjs'), false);
  assert.equal(isVerdictPath('.great_cto/verdict-attestations.jsonl', { cwd: '/proj' }), true);
  assert.equal(isVerdictPath('/state/p/verdict-attestations.jsonl', { cwd: '/proj', dir: '/state/p' }), true);
  assert.equal(guard(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'echo {} >> .great_cto/verdict-attestations.jsonl' }, cwd: '/proj' }), {}).code, 2);
  assert.equal(guard(JSON.stringify({ tool_name: 'Write', tool_input: { file_path: '/proj/.great_cto/verdict-attestations.jsonl' }, cwd: '/proj' }), {}).code, 2);
});

test('the board reads attested vs self-reported for each reviewer on the head', (t) => {
  const w = world(t);
  const head = 'b'.repeat(40);
  const c = w.call('code-reviewer');
  notePre(c);
  w.append('code-reviewer', { head });
  attestAfter(c);
  w.append('qa-engineer', { verdict: 'PASS', head });
  assert.deepEqual(readReviewerAttestations([w.root], head), { 'code-reviewer': 'attested', 'qa-engineer': 'self-reported' });
  assert.deepEqual(readReviewerAttestations([w.root], 'c'.repeat(40)), { 'code-reviewer': null, 'qa-engineer': null });
});
