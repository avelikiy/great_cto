// One process for every PreToolUse check of a Bash call. What must not change in
// the merge: the first refusal decides, a pass leaves the reminder, a check that
// crashes is not a block — and the six checks still refuse what they refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBashGuards, BASH_CHECKS } from '../../scripts/hooks/bash-guards.mjs';
import { PASS } from '../../scripts/lib/guard-result.mjs';

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/hooks/bash-guards.mjs');
const bash = (command) => JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: process.cwd(), session_id: 't' });
const spawn = (raw, env = {}) => spawnSync(process.execPath, [HOOK], { input: raw, encoding: 'utf8', env: { ...process.env, ...env } });

test('the first refusal decides, and later checks are not asked', () => {
  const asked = [];
  const refuse = (n) => () => { asked.push(n); return { code: 2, stdout: `{"deny":"${n}"}`, stderr: `${n}\n` }; };
  const pass = (n) => () => { asked.push(n); return PASS; };
  const r = runBashGuards('{}', {}, { checks: [['a', pass('a')], ['b', refuse('b')], ['c', refuse('c')]], reminders: [] });
  assert.equal(r.code, 2);
  assert.equal(r.stdout, '{"deny":"b"}');
  assert.deepEqual(asked, ['a', 'b']);
});

test('a check that throws is named and passed over — never a block', () => {
  const r = runBashGuards('{}', {}, { checks: [['boom', () => { throw new Error('broken'); }]], reminders: [] });
  assert.equal(r.code, 0);
  assert.match(r.stderr, /boom could not run — broken/);
});

test('with every check passing, the reminder speaks', () => {
  const r = runBashGuards('{}', {}, { checks: [['a', () => PASS]], reminders: [['r', () => ({ code: 0, stdout: '{"ctx":1}', stderr: '' })]] });
  assert.deepEqual([r.code, r.stdout], [0, '{"ctx":1}']);
});

test('a host can be spared a rule it never had', () => {
  const r = runBashGuards('{}', { GREAT_CTO_HOST: 'codex' }, { checks: [['x', () => ({ code: 2, stdout: '', stderr: '' }), { skipOnHost: 'codex' }]], reminders: [] });
  assert.equal(r.code, 0);
});

test('the real checks, end to end: refusals still refuse, ordinary commands pass', () => {
  const ok = spawn(bash('ls -la'));
  assert.equal(ok.status, 0, ok.stderr);
  const stash = spawn(bash('git stash'));
  assert.equal(stash.status, 2, 'shared-tree refuses git stash');
  assert.match(stash.stdout, /shared-tree guard blocked/);
  const noVerify = spawn(bash('git commit --no-verify -m x'));
  assert.equal(noVerify.status, 2, 'gate-bypass refuses --no-verify');
  const inline = spawn(bash('claude -p "do it"'));
  assert.equal(inline.status, 2, 'the contract forbids an inline subagent');
  assert.match(inline.stderr, /ORCHESTRATOR-BLOCK/);
  assert.equal(spawn(bash('claude -p "do it"'), { GREAT_CTO_HOST: 'codex' }).status, 0, 'not on Codex, which never had the rule');
  assert.equal(spawn(bash('mkdir -p ~/.claude/agents')).status, 0, 'a .claude path and a -p flag are not an inline subagent');
});

test('the list is the six hooks it replaces, minus the reminder', () => {
  assert.deepEqual(BASH_CHECKS.map(([n]) => n), ['inline-subagent', 'shared-tree', 'gate-bypass', 'destructive', 'frozen-gates']);
});
