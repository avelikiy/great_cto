// The orchestrator contract forbids `claude -p` from a Bash call. The rule read
// the command from a field Claude Code never fills, so it never fired; fixed,
// its old pattern would have refused ordinary commands that merely mention a
// .claude path and a -p flag. Both halves are tested here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isInlineSubagent, commandOf, run } from '../../scripts/lib/inline-subagent.mjs';

test('the CLI invoked with -p / --print is an inline subagent', () => {
  for (const c of ['claude -p "review this"', 'claude --print hi', 'claude -c -p go', 'cd x && claude -p y',
    'FOO=1 claude -p y', 'npx claude -p y', '/usr/local/bin/claude -p y', 'echo a | claude -p', 'claude -cp go']) {
    assert.equal(isInlineSubagent(c), true, c);
  }
});

test('a .claude path next to a -p flag is not', () => {
  for (const c of ['ls ~/.claude && mkdir -p x', 'mkdir -p ~/.claude/agents', 'grep -rn claude docs -p',
    'git log --grep claude -p', 'cat ~/.claude/projects/x.jsonl | head -p', 'echo "claude -p is forbidden"', 'claude --version',
    'node scripts/claude-p.mjs -p']) {
    assert.equal(isInlineSubagent(c), false, c);
  }
});

test('the command is read where Claude Code puts it', () => {
  assert.equal(commandOf(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'claude -p x' } })), 'claude -p x');
  assert.equal(commandOf('claude -p raw'), 'claude -p raw');
});

test('blocked only when the contract forbids it', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'inl-'));
  const no = path.join(d, 'no.toml'); fs.writeFileSync(no, '[parallelism]\ninline_subagents_allowed = false\n');
  const yes = path.join(d, 'yes.toml'); fs.writeFileSync(yes, '[parallelism]\ninline_subagents_allowed = true\n');
  const payload = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'claude -p hi' } });
  assert.equal(run(payload, {}, { toml: no }).code, 2);
  assert.equal(run(payload, {}, { toml: yes }).code, 0);
  assert.equal(run(payload, {}, { toml: null }).code, 0, 'no contract, no rule');
  fs.rmSync(d, { recursive: true, force: true });
});
