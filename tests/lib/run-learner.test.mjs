// run-learner: continuous-learner runs for real, and the marker says what happened.
//
// SessionEnd used to spawn `claude --agent continuous-learner` with no prompt and
// no -p, and write `ran` on spawn. The CLI exits 1 without a prompt, so across 28
// projects not one lessons.md ever got an entry — and the only test here used a
// fake `claude` that exited 0 whatever it was given, so it passed.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { learnerArgs, redact, digestTranscript, runLearner, learnerPrompt } from '../../scripts/lib/run-learner.mjs';

const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };

// A stand-in that behaves like the real CLI where it matters: without -p and a
// prompt it fails the way the real one does. It records its argv and env, and can
// add a lesson, the way the real learner would.
function fakeClaude({ addLesson = false, fail = false } = {}) {
  const dir = tmp('fake-claude-');
  const bin = join(dir, 'claude');
  writeFileSync(bin, `#!/usr/bin/env node
const fs = require('fs');
const a = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(join(dir, 'argv.json'))}, JSON.stringify({ a, noLearn: process.env.GREAT_CTO_DISABLE_SESSION_LEARNING,
  digest: (() => { const i = a.indexOf('--add-dir'); if (i < 0) return null; const p = a[i + 1] + '/session-digest.md'; return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : 'MISSING'; })() }));
const pi = a.indexOf('-p');
if (pi < 0 || !a[pi + 1]) { console.error('Error: Input must be provided either through stdin or as a prompt argument when using --print'); process.exit(1); }
if (${fail}) { console.error('Error: budget exceeded'); process.exit(2); }
if (${addLesson}) fs.appendFileSync('.great_cto/lessons.md', '\\n---\\npattern: verify-deploy-landed\\noccurrences: 1\\n---\\nA deploy is done when the served revision equals the commit.\\n');
`);
  chmodSync(bin, 0o755);
  return { bin, argv: () => JSON.parse(readFileSync(join(dir, 'argv.json'), 'utf8')) };
}

function project() {
  const d = tmp('learn-proj-');
  mkdirSync(join(d, '.great_cto'), { recursive: true });
  return d;
}

function transcript() {
  const f = join(tmp('learn-tx-'), 't.jsonl');
  const lines = [
    { type: 'user', message: { content: 'деплой не встал, проверь на проде' } },
    { type: 'user', message: { content: '<command-name>/save</command-name>' } },
    { type: 'user', message: { content: [{ type: 'text', text: '<system-reminder>ignore me</system-reminder>' }] } },
    { type: 'user', message: { content: `ключ sk-or-v1-${'a'.repeat(40)} не работает` } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'devops', description: 'deploy preview' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', is_error: true, content: 'Error: wrangler: functions/ not deployed\nstack…' }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'ok output that is not an operator message' }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Root cause: the gate test inherited commit.gpgsign and ssh-keygen hung.' }] } },
  ];
  writeFileSync(f, lines.map((l) => JSON.stringify(l)).join('\n'));
  return f;
}

test('the learner is run in print mode, with a prompt and a spending cap', () => {
  const a = learnerArgs({ prompt: 'learn', budgetUsd: 0.4 });
  assert.equal(a[a.indexOf('-p') + 1], 'learn', 'the prompt follows -p — without it the CLI exits 1');
  assert.equal(a[a.indexOf('--agent') + 1], 'continuous-learner');
  assert.equal(a[a.indexOf('--max-budget-usd') + 1], '0.4');
});

test('secrets are redacted by kind, never kept', () => {
  const out = redact(`a sk-or-v1-${'b'.repeat(40)} and ghp_${'c'.repeat(36)}`);
  assert.doesNotMatch(out, /sk-or-v1-b|ghp_c/);
  assert.match(out, /\[REDACTED OpenRouter API key\]/);
  assert.match(out, /\[REDACTED GitHub PAT/);
});

test('the digest keeps what the operator said, what was dispatched, what failed and what was concluded — and nothing else', () => {
  const { text, counts } = digestTranscript(readFileSync(transcript(), 'utf8'));
  assert.deepEqual(counts, { operator: 2, dispatches: 1, failures: 1, conclusions: 1 });
  assert.match(text, /проверь на проде/);
  assert.match(text, /devops: deploy preview/);
  assert.match(text, /functions\/ not deployed/);
  assert.doesNotMatch(text, /system-reminder|\/save|ok output/, 'wrappers and tool output are not the operator');
  assert.doesNotMatch(text, /sk-or-v1-a/, 'a key the operator pasted does not reach the learner');
});

test('a learner that adds a lesson is recorded as done, with the count — and gets the digest', () => {
  const cwd = project();
  const fake = fakeClaude({ addLesson: true });
  const r = runLearner({ cwd, transcript: transcript(), reason: 'logout', claude: fake.bin });
  assert.equal(r.state, 'done');
  assert.equal(r.added, 1);
  assert.match(readFileSync(join(cwd, '.great_cto', '.last-auto-learn'), 'utf8'), /done: lessons\+1 digest=2msg\/1agents\/1fail/);
  const seen = fake.argv();
  assert.equal(seen.noLearn, '1', "the learner's own session must not start another learner");
  assert.match(seen.digest, /проверь на проде/, 'the digest existed while the learner ran');
  assert.match(seen.a[seen.a.indexOf('-p') + 1], /session-digest\.md/, 'and the prompt names it');
});

test('the digest does not outlive the run', () => {
  const cwd = project();
  const fake = fakeClaude();
  runLearner({ cwd, transcript: transcript(), claude: fake.bin });
  const i = fake.argv().a.indexOf('--add-dir');
  assert.ok(i > 0);
  assert.equal(existsSync(fake.argv().a[i + 1]), false);
});

test('a learner that fails is recorded as failed with its first error line — never as ran', () => {
  const cwd = project();
  const r = runLearner({ cwd, transcript: transcript(), claude: fakeClaude({ fail: true }).bin });
  assert.equal(r.state, 'failed');
  const marker = readFileSync(join(cwd, '.great_cto', '.last-auto-learn'), 'utf8');
  assert.match(marker, /failed: exit=2 Error: budget exceeded digest=2msg/);
  assert.doesNotMatch(marker, /\bran\b/);
});

test('a missing CLI is failed, not done', () => {
  const cwd = project();
  const r = runLearner({ cwd, transcript: transcript(), claude: join(tmpdir(), 'no-such-claude-bin') });
  assert.equal(r.state, 'failed');
  assert.match(readFileSync(join(cwd, '.great_cto', '.last-auto-learn'), 'utf8'), /failed: exit=null ENOENT/);
});

test('without a transcript the prompt says so instead of pointing at nothing', () => {
  assert.match(learnerPrompt({ digestPath: null }), /No transcript was available/);
});

test('no transcript, or a session the operator barely spoke in, is skipped — the model is never called', () => {
  const cwd = project();
  const fake = fakeClaude();
  const r = runLearner({ cwd, transcript: null, claude: fake.bin });
  assert.equal(r.state, 'skipped');
  assert.match(readFileSync(join(cwd, '.great_cto', '.last-auto-learn'), 'utf8'), /skipped: no transcript/);
  assert.throws(() => fake.argv(), 'the fake claude was never started');
  const one = join(tmp('learn-tx1-'), 't.jsonl');
  writeFileSync(one, JSON.stringify({ type: 'user', message: { content: 'ok' } }));
  assert.equal(runLearner({ cwd, transcript: one, claude: fake.bin }).state, 'skipped');
  assert.match(readFileSync(join(cwd, '.great_cto', '.last-auto-learn'), 'utf8'), /skipped: 1 operator message/);
});

// 2026-10-01: a 270 MB session ended with "lessons+0". The digest held 19
// operator messages (1.4k chars); the lessons of that day — a hung signing agent,
// a plugin install with no build — were found in the assistant's own conclusions,
// which the digest dropped. They are kept now, newest first within a budget.
test('the assistant\'s conclusions reach the learner, newest kept when they overflow', () => {
  const lines = [];
  for (let i = 0; i < 400; i++) lines.push(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: `conclusion ${i} ${'x'.repeat(300)}` }] } }));
  const { text, counts } = digestTranscript(lines.join('\n'));
  assert.equal(counts.conclusions, 400);
  assert.match(text, /## What the assistant concluded/);
  assert.match(text, /conclusion 399 /, 'the newest conclusion is kept');
  assert.doesNotMatch(text, /conclusion 0 /, 'the oldest goes first when the budget is spent');
  assert.ok(text.length <= 62_000, `digest ${text.length} chars`);
});

test('a conclusion carrying a secret is redacted like everything else', () => {
  const l = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: `use sk-or-v1-${'b'.repeat(40)} for the router` }] } });
  assert.doesNotMatch(digestTranscript(l).text, /sk-or-v1-b/);
});

test('a window run reads the transcript from its offset, not the whole tail', async () => {
  const { readWindow } = await import('../../scripts/lib/run-learner.mjs');
  const f = join(tmp('learn-win-'), 't.jsonl');
  const early = JSON.stringify({ type: 'user', message: { content: 'early message' } });
  const late = JSON.stringify({ type: 'user', message: { content: 'late message' } });
  writeFileSync(f, `${early}\n`);
  const offset = Buffer.byteLength(`${early}\n`);
  writeFileSync(f, `${early}\n${late}\n`);
  const w = readWindow(f, offset, 8 * 1024 * 1024);
  assert.match(w, /late message/);
  assert.doesNotMatch(w, /early message/);
  assert.match(readWindow(f, 0, 8 * 1024 * 1024), /early message/);
});

test('a window of mostly autonomous work is learned from when it has conclusions', () => {
  const cwd = project();
  const fake = fakeClaude({ addLesson: true });
  const f = join(tmp('learn-auto-'), 't.jsonl');
  const lines = [JSON.stringify({ type: 'user', message: { content: 'делай' } })];
  for (let i = 0; i < 6; i++) lines.push(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: `finding ${i}: the gate inherited commit signing` }] } }));
  writeFileSync(f, lines.join('\n'));
  const r = runLearner({ cwd, transcript: f, reason: 'window', claude: fake.bin });
  assert.equal(r.state, 'done', 'one operator message and six conclusions is something to learn from');
});

test('a window with neither operator messages nor conclusions is still skipped', () => {
  const cwd = project();
  const f = join(tmp('learn-empty-'), 't.jsonl');
  writeFileSync(f, JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } }));
  assert.equal(runLearner({ cwd, transcript: f, reason: 'window', claude: '/nonexistent' }).state, 'skipped');
});

// Card numbers: since 3.48 the digest carries the assistant's conclusions, so a
// card number that appeared in a session could reach the learner and its lessons.
// Gated on the Luhn checksum (autoharness #180): a long id, a millisecond
// timestamp or a primary key that fails the checksum stays as evidence.
test('a card number is redacted from the digest; a long id that is not one is kept', () => {
  const line = (text) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
  const out = digestTranscript([
    line('paid with 4242 4242 4242 4242 in the test'),
    line('fallback card 4111-1111-1111-1111 also failed'),
    line('order id 1234567890123456 and snowflake 1790939104017'),
  ].join('\n')).text;
  assert.doesNotMatch(out, /4242 4242 4242 4242|4111-1111-1111-1111/);
  assert.match(out, /\[REDACTED card number\]/);
  assert.match(out, /1234567890123456/, 'a 16-digit id that fails Luhn is not a card');
  assert.match(out, /1790939104017/, 'a timestamp that fails Luhn is not a card');
});
