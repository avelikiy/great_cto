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

test('an unpriced model logs cost null and prints "unpriced" — never $0', () => {
  // The fake codex reports usage; the model it claims is not in the price
  // table. The first real run logged 0 here.
  const dir = project('capabilities:\n  second_opinion: codex\n');
  const r = run(dir, ['--model', 'gpt-5.6-terra'], { GREAT_CTO_CODEX_BIN: fakeCodex(dir, ['VERDICT: PASS']) });
  assert.equal(r.status, EXIT.PASS, r.stdout + r.stderr);
  assert.match(r.stdout, /cost unpriced/);
  const last = JSON.parse(readFileSync(path.join(dir, '.great_cto', 'cross-review.log'), 'utf8').trim().split('\n').at(-1));
  assert.equal(last.cost, null);
  assert.equal(last.model, 'gpt-5.6-terra');
});

// A review that did not happen must say WHY, and the why must be the cause —
// not whatever the provider happened to mention first. On 2026-09-06 an
// exhausted plan quota displayed "Skill descriptions were shortened to fit the
// skills context budget", so the reader is sent to disable skills over a
// problem that fixes itself on a date the real message names.
test('the skipped reason is the ranked cause, not the first message, and the log carries its kind', () => {
  const dir = project('capabilities:\n  second_opinion: codex\n');
  // The stream is written to a file and the fake codex cats it. Building it as
  // shell `printf` arguments broke on the apostrophe in "You've" — the fixture
  // failed while the product was correct, which is the worst way for a test to
  // fail.
  const noise = 'Skill descriptions were shortened to fit the skills context budget. Codex can still see every skill.';
  const cause = "You've hit your usage limit. Upgrade to Plus to continue using Codex, or try again at Oct 5th, 2026 9:41 AM.";
  const stream = path.join(dir, 'stream.jsonl');
  writeFileSync(stream, [noise, cause]
    .map((message) => JSON.stringify({ type: 'item.completed', item: { type: 'error', message } }))
    .join('\n') + '\n');
  const bin = path.join(dir, 'codex');
  writeFileSync(bin, `#!/bin/sh\ncat >/dev/null\ncat ${stream}\n`);
  chmodSync(bin, 0o755);

  const r = run(dir, [], { GREAT_CTO_CODEX_BIN: bin });
  assert.equal(r.status, EXIT.SKIPPED, r.stdout + r.stderr);
  assert.match(r.stdout, /quota:/, 'names the kind');
  assert.match(r.stdout, /Oct 5th, 2026/, 'and the date the reader actually needs');
  const headline = r.stdout.split('\n').find((l) => l.includes('SKIPPED')) ?? '';
  assert.doesNotMatch(headline, /Skill descriptions/, 'the advisory noise is not presented as the cause');
  assert.match(r.stdout, /other message\(s\) from codex, not the cause/, 'but it is not hidden either');

  const last = JSON.parse(readFileSync(path.join(dir, '.great_cto', 'cross-review.log'), 'utf8').trim().split('\n').at(-1));
  assert.equal(last.error_kind, 'quota');
  assert.equal(last.resets_at, 'Oct 5th, 2026 9:41 AM');
  assert.equal(last.verdict, null, 'still no verdict — a skipped review has none');
});
