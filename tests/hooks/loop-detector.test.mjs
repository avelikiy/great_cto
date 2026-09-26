// Tests for scripts/hooks/loop-detector.mjs — the PostToolUse hook that notices
// an agent repeating itself and says so once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, '../../scripts/hooks/loop-detector.mjs');
const { recordCall, detect, callKey, isTestFailure, MAX_ENTRIES, NOTICE_MAX } = await import(HOOK);

// One simulated tool call through the pure API, the way main() does it:
// record, detect, mark fired. Returns [nextState, noticeOrNull].
function step(state, payload) {
  const next = recordCall(state, payload);
  const hit = detect(next);
  if (hit) next.fired.push(hit.key);
  return [next, hit];
}

const bash = (command, response = { stdout: '', stderr: '' }) =>
  ({ session_id: 's1', hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, tool_response: response });
const edit = (file_path, old_string, new_string = 'x') =>
  ({ session_id: 's1', hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path, old_string, new_string }, tool_response: {} });

// ─── Signal A: repeat ───────────────────────────────────────────────────────

test('5 identical Bash calls → exactly one notice, on the 5th; the 6th says nothing', () => {
  let state; const hits = [];
  for (let i = 1; i <= 6; i++) {
    let hit; [state, hit] = step(state, bash('npm test'));
    hits.push(hit);
  }
  assert.deepEqual(hits.slice(0, 4), [null, null, null, null]);
  assert.ok(hits[4], '5th identical call fires');
  assert.equal(hits[4].kind, 'repeat');
  assert.match(hits[4].text, /Bash/);
  assert.match(hits[4].text, /done-blocked/);
  assert.ok(hits[4].text.length <= NOTICE_MAX, `notice ≤ ${NOTICE_MAX} chars`);
  assert.equal(hits[5], null, '6th identical call does not fire again');
});

test('4 identical calls → nothing', () => {
  let state; let hit;
  for (let i = 0; i < 4; i++) { [state, hit] = step(state, bash('ls -la')); assert.equal(hit, null); }
});

test('different commands → nothing', () => {
  let state; let hit;
  for (let i = 0; i < 20; i++) { [state, hit] = step(state, bash(`echo ${i}`)); assert.equal(hit, null); }
});

test('whitespace differences in a Bash command count as the same call', () => {
  assert.equal(callKey('Bash', { command: 'npm   test\n' }), callKey('Bash', { command: ' npm test' }));
  assert.notEqual(callKey('Bash', { command: 'npm test' }), callKey('Bash', { command: 'npm run test' }));
});

test('5 identical calls spread wider than the 12-call window → nothing', () => {
  let state; let hit;
  for (let i = 0; i < 5; i++) {
    [state, hit] = step(state, bash('git status'));
    assert.equal(hit, null);
    for (let j = 0; j < 3; j++) [state] = step(state, bash(`echo filler-${i}-${j}`));
  }
});

test('the same test command re-run after each edit is not a repeat (something changed)', () => {
  let state; let hit;
  for (let i = 0; i < 8; i++) {
    [state, hit] = step(state, edit(`/repo/src/f${i}.js`, 'a')); assert.equal(hit, null);
    [state, hit] = step(state, bash('npm test')); assert.equal(hit, null);
  }
});

test('the same failing Edit retried 5 times is a repeat', () => {
  let state; const hits = [];
  for (let i = 0; i < 5; i++) { let hit; [state, hit] = step(state, edit('/repo/a.js', 'same')); hits.push(hit); }
  assert.equal(hits.filter(Boolean).length, 1);
  assert.equal(hits[4].kind, 'repeat');
});

test('Read keys on file_path + offset; Edit on file_path + old_string', () => {
  assert.equal(callKey('Read', { file_path: '/a.js' }), callKey('Read', { file_path: '/a.js', limit: 50 }));
  assert.notEqual(callKey('Read', { file_path: '/a.js', offset: 1 }), callKey('Read', { file_path: '/a.js', offset: 200 }));
  assert.notEqual(callKey('Edit', { file_path: '/a.js', old_string: 'a' }), callKey('Edit', { file_path: '/a.js', old_string: 'b' }));
});

// ─── Signal B: edit churn ───────────────────────────────────────────────────

const FAIL = { stdout: 'ok 1 - a\nnot ok 2 - b\n# pass 1\n# fail 1\n', stderr: '' };
const PASS = { stdout: '# pass 2\n# fail 0\n', stderr: '' };

test('isTestFailure recognises common runners and ignores green output', () => {
  assert.equal(isTestFailure(FAIL), true);
  assert.equal(isTestFailure('FAILED tests/test_x.py::test_y - AssertionError'), true);
  assert.equal(isTestFailure({ stdout: '  ✗ renders the header' }), true);
  assert.equal(isTestFailure(PASS), false);
  assert.equal(isTestFailure({ stdout: 'all good' }), false);
});

test('same file edited 8 times with failing tests in between → one churn notice', () => {
  let state; const hits = [];
  for (let i = 1; i <= 9; i++) {
    let hit;
    [state, hit] = step(state, edit('/repo/src/parser.js', `attempt ${i}`));
    hits.push(hit);
    [state, hit] = step(state, bash('node --test', FAIL));
    hits.push(hit);
  }
  const fired = hits.filter(Boolean);
  assert.equal(fired.length, 1, 'fires once');
  assert.equal(fired[0].kind, 'churn');
  assert.match(fired[0].text, /parser\.js/);
  assert.ok(fired[0].text.length <= NOTICE_MAX);
  // It fires on the 8th edit (index 14 = edit #8), not before.
  assert.equal(hits.findIndex(Boolean), 14);
});

test('8 edits of one file with green tests in between → nothing', () => {
  let state; let hit;
  for (let i = 1; i <= 8; i++) {
    [state, hit] = step(state, edit('/repo/src/parser.js', `attempt ${i}`)); assert.equal(hit, null);
    [state, hit] = step(state, bash(`node --test ${i}`, PASS)); assert.equal(hit, null);
  }
});

// ─── State bound ────────────────────────────────────────────────────────────

test(`state keeps at most ${MAX_ENTRIES} calls`, () => {
  let state;
  for (let i = 0; i < 100; i++) [state] = step(state, bash(`echo ${i}`));
  assert.equal(state.calls.length, MAX_ENTRIES);
  assert.ok(JSON.stringify(state).length < 8000, 'state stays small');
});

// ─── The real hook, as Claude Code runs it ──────────────────────────────────

function runHook(payload, env) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...env },
  });
}

// Payload shape Claude Code sends to a PostToolUse hook for Bash.
const realPayload = (session_id, command) => ({
  session_id,
  transcript_path: '/tmp/transcript.jsonl',
  cwd: '/tmp/project',
  permission_mode: 'default',
  hook_event_name: 'PostToolUse',
  tool_name: 'Bash',
  tool_input: { command, description: 'Run tests' },
  tool_response: { stdout: '# fail 1', stderr: '', interrupted: false, isImage: false },
  tool_use_id: 'toolu_01',
});

test('hook process: silent ×4, PostToolUse additionalContext on the 5th, silent on the 6th', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loop-det-'));
  const env = { TMPDIR: dir, GREAT_CTO_DISABLE_LOOP_DETECTOR: '' };
  try {
    const outs = [];
    for (let i = 0; i < 6; i++) {
      const r = runHook(realPayload('sess-abc', 'npm test'), env);
      assert.equal(r.status, 0, r.stderr);
      outs.push(r.stdout);
    }
    assert.deepEqual(outs.slice(0, 4), ['', '', '', '']);
    const parsed = JSON.parse(outs[4]);
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.equal(typeof parsed.hookSpecificOutput.additionalContext, 'string');
    assert.ok(parsed.hookSpecificOutput.additionalContext.length <= NOTICE_MAX);
    assert.equal(outs[5], '');
    // State lives in the tmpdir, one file per session.
    const files = readdirSync(dir).filter((f) => f.startsWith('great_cto-loop-'));
    assert.deepEqual(files, ['great_cto-loop-sess-abc.json']);
    const st = JSON.parse(readFileSync(join(dir, files[0]), 'utf8'));
    assert.equal(st.calls.length, 6);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('hook process: a subagent (agent_id) keeps its own state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loop-det-'));
  try {
    for (let i = 0; i < 4; i++) runHook(realPayload('sess-x', 'npm test'), { TMPDIR: dir });
    const r = runHook({ ...realPayload('sess-x', 'npm test'), agent_id: 'agent-7' }, { TMPDIR: dir });
    assert.equal(r.stdout, '', 'the subagent call does not count toward the parent');
    assert.equal(readdirSync(dir).filter((f) => f.startsWith('great_cto-loop-')).length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('hook process: opt-out env, garbage stdin and missing session all exit 0 silently', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loop-det-'));
  try {
    for (let i = 0; i < 6; i++) {
      const r = runHook(realPayload('sess-off', 'npm test'), { TMPDIR: dir, GREAT_CTO_DISABLE_LOOP_DETECTOR: '1' });
      assert.equal(r.status, 0); assert.equal(r.stdout, '');
    }
    const g = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8', env: { ...process.env, TMPDIR: dir } });
    assert.equal(g.status, 0); assert.equal(g.stdout, '');
    const { session_id, ...noSession } = realPayload('x', 'npm test');
    const n = runHook(noSession, { TMPDIR: dir });
    assert.equal(n.status, 0); assert.equal(n.stdout, '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
