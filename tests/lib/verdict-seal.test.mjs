// ADR-046 / great_cto-dv3b: seals on verdict lines and acceptances.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadSealKey, sealKeyPath, sealVerdict, checkVerdictSeal, sealAcceptance, checkAcceptanceSeal } from '../../scripts/lib/verdict-seal.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function keyEnv(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-seal-unit-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return { GREAT_CTO_SEAL_KEY: path.join(d, 'keys', 'verdict-seal.key') };
}

test('the key is created once, private, and reused', (t) => {
  const env = keyEnv(t);
  assert.equal(loadSealKey({ env }), null, 'no key until a writer asks for one');
  const a = loadSealKey({ create: true, env });
  const b = loadSealKey({ create: true, env });
  assert.ok(a.equals(b));
  assert.equal(fs.statSync(sealKeyPath(env)).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(sealKeyPath(env))).mode & 0o777, 0o700);
});

test('a sealed verdict checks valid; any covered field changed, it does not', (t) => {
  const key = loadSealKey({ create: true, env: keyEnv(t) });
  const rec = { agent: 'qa-engineer', verdict: 'PASS', ts: '2026-11-01T10:00:00Z', receipt: { head: 'a'.repeat(40), files: {} } };
  const seal = sealVerdict(rec, { key });
  assert.match(seal, /^v1:[0-9a-f]{64}$/);
  assert.equal(checkVerdictSeal({ ...rec, seal }, { key }), 'valid');
  for (const change of [{ verdict: 'APPROVED' }, { agent: 'code-reviewer' }, { ts: '2026-11-01T10:00:01Z' }, { receipt: { head: 'b'.repeat(40), files: {} } }]) {
    assert.equal(checkVerdictSeal({ ...rec, ...change, seal }, { key }), 'invalid', JSON.stringify(change));
  }
  assert.equal(checkVerdictSeal(rec, { key }), 'unsealed');
  assert.equal(checkVerdictSeal({ ...rec, seal }, { key: null }), 'unknown', 'no key: cannot tell, not valid');
});

test('a seal made with another key does not check', (t) => {
  const k1 = loadSealKey({ create: true, env: keyEnv(t) });
  const k2 = loadSealKey({ create: true, env: keyEnv(t) });
  const rec = { agent: 'qa-engineer', verdict: 'PASS', ts: '2026-11-01T10:00:00Z' };
  assert.equal(checkVerdictSeal({ ...rec, seal: sealVerdict(rec, { key: k1 }) }, { key: k2 }), 'invalid');
});

test('acceptances are sealed over hash, stage and time', (t) => {
  const key = loadSealKey({ create: true, env: keyEnv(t) });
  const acc = { hash: 'h'.repeat(64), agent: 'qa-engineer', at: 1793520000000 };
  const seal = sealAcceptance(acc, { key });
  assert.equal(checkAcceptanceSeal({ ...acc, seal }, { key }), 'valid');
  assert.equal(checkAcceptanceSeal({ ...acc, agent: 'code-reviewer', seal }, { key }), 'invalid');
  assert.equal(checkAcceptanceSeal(acc, { key }), 'unsealed');
});

test('log-verdict.sh writes a sealed line that checks valid', (t) => {
  const env = keyEnv(t);
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-seal-proj-'));
  t.after(() => fs.rmSync(proj, { recursive: true, force: true }));
  spawnSync('git', ['init', '-q'], { cwd: proj });
  fs.mkdirSync(path.join(proj, '.great_cto'));
  const r = spawnSync('bash', [path.join(ROOT, 'scripts/log-verdict.sh'), 'qa-engineer', 'PASS', 'auto', 'scope=unit'],
    { cwd: proj, encoding: 'utf8', env: { ...process.env, ...env, GREAT_CTO_DIR: '' } });
  assert.equal(r.status, 0, r.stderr);
  const line = JSON.parse(fs.readFileSync(path.join(proj, '.great_cto/verdicts/qa-engineer.log'), 'utf8').trim().split('\n').pop());
  assert.match(line.seal, /^v1:/);
  assert.equal(checkVerdictSeal(line, { key: loadSealKey({ env }) }), 'valid');
});

test('m1: a damaged key is said on stderr, not silently "no key"', (t) => {
  const env = keyEnv(t);
  fs.mkdirSync(path.dirname(env.GREAT_CTO_SEAL_KEY), { recursive: true });
  fs.writeFileSync(env.GREAT_CTO_SEAL_KEY, '');
  const r = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import('${path.join(ROOT, 'scripts/lib/verdict-seal.mjs')}').then(m => process.stdout.write(String(m.loadSealKey())))`],
    { encoding: 'utf8', env: { ...process.env, ...env } });
  assert.equal(r.stdout, 'null');
  assert.match(r.stderr, /is not a valid key/);
});

test('m1: the key is linked into place whole — no temporary file is left', (t) => {
  const env = keyEnv(t);
  loadSealKey({ create: true, env });
  assert.deepEqual(fs.readdirSync(path.dirname(env.GREAT_CTO_SEAL_KEY)), ['verdict-seal.key']);
});
