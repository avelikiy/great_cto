// Whether a Codex is here to give a second opinion, in three states — because
// "codex is not installed" must never render as "codex agreed".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codexStatusFrom, parseCodexStream, runCodexExec } from '../../scripts/lib/codex-exec.mjs';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('no binary is absent, and says how to get one', () => {
  const r = codexStatusFrom({ versionOut: null, authJson: null, configToml: null });
  assert.equal(r.state, 'absent');
  assert.match(r.why, /not on PATH/);
});

test('a binary without a login is no-auth, not available', () => {
  const r = codexStatusFrom({ versionOut: 'codex-cli 0.153.4', authJson: null, configToml: 'model = "gpt-5.6-terra"\n' });
  assert.equal(r.state, 'no-auth');
  assert.equal(r.version, '0.153.4');
  assert.equal(r.model, 'gpt-5.6-terra', 'the model is still read — it is what WOULD run');
  assert.match(r.why, /codex login/);
});

test('a logged-in install is available, with version, auth mode and model', () => {
  const r = codexStatusFrom({
    versionOut: 'codex-cli 0.153.4\n',
    authJson: JSON.stringify({ auth_mode: 'chatgpt', tokens: {} }),
    configToml: 'model = "gpt-5.6-terra"\nmodel_reasoning_effort = "medium"\n\n[profiles.fast]\nmodel = "gpt-5-mini"\n',
  });
  assert.deepEqual(r, { state: 'available', version: '0.153.4', auth: 'chatgpt', model: 'gpt-5.6-terra', why: '' });
});

test('an unparseable auth.json is no-auth — a broken login is not a login', () => {
  const r = codexStatusFrom({ versionOut: 'codex-cli 0.153.4', authJson: '{not json', configToml: null });
  assert.equal(r.state, 'no-auth');
});

test('the runner passes a read-only sandbox and the prompt on stdin, and parses what comes back', async () => {
  // A fake `codex` that records its argv and answers with a canned stream.
  const dir = mkdtempSync(path.join(tmpdir(), 'gc-codex-'));
  const bin = path.join(dir, 'codex');
  writeFileSync(bin, [
    '#!/bin/sh',
    `printf '%s\\n' "$@" > "${dir}/argv"`,
    `cat > "${dir}/stdin"`,
    'echo \'{"type":"item.completed","item":{"type":"agent_message","text":"VERDICT: PASS"}}\'',
    'echo \'{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2}}\'',
  ].join('\n'));
  chmodSync(bin, 0o755);
  const r = await runCodexExec({ prompt: 'hello', cwd: dir, bin, model: 'gpt-x', timeoutMs: 10000 });
  assert.equal(r.state, 'ok');
  assert.equal(r.text, 'VERDICT: PASS');
  assert.deepEqual(r.usage, { input_tokens: 10, output_tokens: 2 });
  const argv = (await import('node:fs')).readFileSync(path.join(dir, 'argv'), 'utf8').split('\n');
  assert.ok(argv.includes('-s') && argv[argv.indexOf('-s') + 1] === 'read-only', 'read-only sandbox');
  assert.ok(argv.includes('--ephemeral'));
  assert.ok(argv.includes('-m') && argv[argv.indexOf('-m') + 1] === 'gpt-x');
  assert.equal(argv[argv.length - 2], '-', 'prompt comes on stdin');
  assert.equal((await import('node:fs')).readFileSync(path.join(dir, 'stdin'), 'utf8'), 'hello');
});

test('a binary that is not there is unreadable with the reason, not a hang and not empty', async () => {
  const r = await runCodexExec({ prompt: 'x', cwd: tmpdir(), bin: '/nonexistent/codex', timeoutMs: 5000 });
  assert.equal(r.state, 'unreadable');
  assert.ok(r.errors.length >= 1);
  assert.equal(r.text, null);
});

test('an empty stream is empty, not an answer', () => {
  assert.equal(parseCodexStream('{"type":"turn.completed","usage":{}}').state, 'empty');
  assert.equal(parseCodexStream('garbage').state, 'unreadable');
});

test('a timed-out run leaves no process behind, and is not an answer', async (t) => {
  // A fake `codex` that starts a child and waits on it — the shape of a CLI whose
  // tool or MCP server is still running when the review runs out of time. Killing
  // only the CLI left that child alive: the same orphan that wedged a release gate.
  if (process.platform === 'win32') return t.skip('process groups are POSIX');
  const dir = mkdtempSync(path.join(tmpdir(), 'gc-codex-timeout-'));
  const bin = path.join(dir, 'codex');
  const pidFile = path.join(dir, 'child.pid');
  writeFileSync(bin, [
    '#!/bin/sh',
    'cat > /dev/null',
    'echo \'{"type":"item.completed","item":{"type":"agent_message","text":"VERDICT: PASS"}}\'',
    `sleep 30 & echo $! > "${pidFile}"`,
    'wait',
  ].join('\n'));
  chmodSync(bin, 0o755);
  const started = Date.now();
  const r = await runCodexExec({ prompt: 'x', cwd: dir, bin, timeoutMs: 800 });
  const elapsed = Date.now() - started;
  // Time is the witness, not only liveness. With the CLI alone killed, the child
  // keeps stdout open, so the result arrives when the child ends ON ITS OWN —
  // 30 s later — and by then it is gone, so a liveness check alone passes.
  assert.ok(elapsed < 5000, `resolved after ${elapsed}ms — the child held the run open until it exited by itself`);
  assert.equal(r.timedOut, true);
  assert.notEqual(r.state, 'ok', 'a truncated answer read as an answer');
  assert.ok(r.errors.some((e) => /timed out after 800ms/.test(e)), JSON.stringify(r.errors));
  const fs = await import('node:fs');
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  let alive = true;
  for (let i = 0; i < 20 && alive; i += 1) {
    try { process.kill(pid, 0); await new Promise((res) => setTimeout(res, 50)); } catch { alive = false; }
  }
  if (alive) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
  assert.equal(alive, false, `child ${pid} of the timed-out codex is still running`);
});

test('a run that finishes in time says it did not time out', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gc-codex-intime-'));
  const bin = path.join(dir, 'codex');
  writeFileSync(bin, ['#!/bin/sh', 'cat > /dev/null',
    'echo \'{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}\''].join('\n'));
  chmodSync(bin, 0o755);
  const r = await runCodexExec({ prompt: 'x', cwd: dir, bin, timeoutMs: 10000 });
  assert.equal(r.state, 'ok');
  assert.equal(r.timedOut, false);
});

test('the runner exposes the final protocol message without losing prose messages', () => {
  const raw = [
    '{"type":"item.completed","item":{"type":"agent_message","text":"Inspecting files"}}',
    '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"verdict\\":\\"DONE\\"}"}}',
    '{"type":"turn.completed","usage":{"input_tokens":3,"output_tokens":2}}',
  ].join('\n');
  const result = parseCodexStream(raw);
  assert.equal(result.finalText, '{"verdict":"DONE"}');
  assert.equal(result.text, 'Inspecting files\n{"verdict":"DONE"}');
  assert.deepEqual(result.messages, ['Inspecting files', '{"verdict":"DONE"}']);
});
