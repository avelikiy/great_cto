// The cross-model reviewer, with Codex as a provider and a third exit code.
//
// Before this, a missing OPENROUTER_API_KEY exited 1 — the BLOCK code. "The
// review blocked this" and "the review did not happen" were the same number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { decideProvider, reviewLogLine, EXIT } from '../../scripts/lib/cross-model-review.mjs';

const SCRIPT = path.resolve(import.meta.dirname, '../../scripts/lib/cross-model-review.mjs');
const AVAILABLE = { state: 'available', version: '0.153.4', auth: 'chatgpt', model: 'gpt-5.6-terra', why: '' };

test('--provider wins, then PROJECT.md, then the OpenRouter env — and each says which', () => {
  const md = 'capabilities:\n  second_opinion: codex\n';
  assert.equal(decideProvider({ argv: ['--provider', 'openrouter'], projectMd: md, env: { OPENROUTER_API_KEY: 'k' } }).source, '--provider');
  const p = decideProvider({ projectMd: md, codex: AVAILABLE, env: {} });
  assert.equal(p.provider, 'codex'); assert.equal(p.source, 'PROJECT.md');
  const e = decideProvider({ projectMd: '', env: { OPENROUTER_API_KEY: 'k' } });
  assert.equal(e.provider, 'openrouter'); assert.match(e.source, /OPENROUTER_API_KEY/);
  assert.equal(decideProvider({ projectMd: '', env: {} }).state, 'undeclared');
});

test('the exit codes are three distinct numbers, and SKIPPED is not PASS', () => {
  assert.equal(EXIT.PASS, 0); assert.equal(EXIT.BLOCK, 1); assert.equal(EXIT.SKIPPED, 3);
  assert.equal(new Set(Object.values(EXIT)).size, Object.keys(EXIT).length);
});

test('the log line carries provider, state, verdict and the P0 count', () => {
  const l = JSON.parse(reviewLogLine({ provider: 'codex', model: 'm', state: 'ok', verdict: 'BLOCK', findings: [{ severity: 'P0' }, { severity: 'P2' }], cost: 0.01, source: 'PROJECT.md' }));
  assert.equal(l.findings, 2); assert.equal(l.p0, 1); assert.equal(l.verdict, 'BLOCK');
  const skipped = JSON.parse(reviewLogLine({ provider: 'codex', state: 'unavailable', findings: null }));
  assert.equal(skipped.findings, null, 'a skipped review has no finding count, not zero');
});

function project(withMd) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gc-xr-'));
  mkdirSync(path.join(dir, '.great_cto'));
  if (withMd) writeFileSync(path.join(dir, '.great_cto', 'PROJECT.md'), withMd);
  return dir;
}
function fakeCodex(dir, lines) {
  const bin = path.join(dir, 'codex');
  const body = lines.map((t) => `echo '${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: t } })}'`).join('\n');
  writeFileSync(bin, `#!/bin/sh\ncat >/dev/null\n${body}\necho '{"type":"turn.completed","usage":{"input_tokens":5,"output_tokens":1}}'\n`);
  chmodSync(bin, 0o755);
  return bin;
}
function run(dir, extra = [], env = {}) {
  const diff = path.join(dir, 'd.diff'); writeFileSync(diff, '--- a/x.js\n+++ b/x.js\n@@ -1 +1 @@\n-1\n+2\n');
  return spawnSync('node', [SCRIPT, '--diff', diff, '--root', dir, ...extra], { encoding: 'utf8', env: { ...process.env, OPENROUTER_API_KEY: '', ...env } });
}

test('codex declared: the review runs through the fake codex and a P0 blocks', () => {
  const dir = project('capabilities:\n  second_opinion: codex\n');
  const r = run(dir, [], { GREAT_CTO_CODEX_BIN: fakeCodex(dir, ['x.js:1 | P0 | drops the table', 'VERDICT: BLOCK']) });
  assert.equal(r.status, EXIT.BLOCK, r.stdout + r.stderr);
  assert.match(r.stdout, /P0 x\.js:1/);
  const log = readFileSync(path.join(dir, '.great_cto', 'cross-review.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(log.at(-1).provider, 'codex'); assert.equal(log.at(-1).verdict, 'BLOCK'); assert.equal(log.at(-1).p0, 1);
});

test('nothing declared and no key: SKIPPED with its own exit code, and the log says undeclared', () => {
  const dir = project('capabilities:\n  logs: loki\n');
  const r = run(dir);
  assert.equal(r.status, EXIT.SKIPPED, r.stdout + r.stderr);
  assert.match(r.stdout, /SKIPPED \(undeclared\)/);
  assert.match(r.stdout, /not declared is not none/);
  const last = JSON.parse(readFileSync(path.join(dir, '.great_cto', 'cross-review.log'), 'utf8').trim().split('\n').at(-1));
  assert.equal(last.state, 'undeclared'); assert.equal(last.verdict, null);
});

test('codex declared but the binary is dead: SKIPPED, not PASS and not BLOCK', () => {
  const dir = project('capabilities:\n  second_opinion: codex\n');
  const r = run(dir, [], { GREAT_CTO_CODEX_BIN: '/nonexistent/codex' });
  assert.equal(r.status, EXIT.SKIPPED, r.stdout + r.stderr);
  assert.match(r.stdout, /SKIPPED/);
});

test('second_opinion: none is honoured as a decision — SKIPPED (none), no provider consulted', () => {
  const dir = project('capabilities:\n  second_opinion: none\n');
  const r = run(dir, [], { GREAT_CTO_CODEX_BIN: '/nonexistent/codex' });
  assert.equal(r.status, EXIT.SKIPPED);
  assert.match(r.stdout, /SKIPPED \(none\)/);
});
