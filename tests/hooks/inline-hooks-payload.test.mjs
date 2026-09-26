// Inline hooks in plugin.json must read the payload Claude Code actually sends.
//
// Two of them never did (found 2026-09-26): the PreToolUse "Dangerous command"
// check read a top-level `command` and blocked nothing, and the PostToolUse write
// log read a top-level `file_path` and never wrote a line. Claude Code sends
// `{ tool_name, tool_input: { command | file_path | … } }`. Their only tests, if
// any, used the shape the hook expected — so they passed while the hooks were dead.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const plugin = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

// Fields Claude Code nests under tool_input. `tool_name` is genuinely top-level.
const NESTED = ['command', 'file_path', 'content', 'old_string', 'new_string', 'path'];

function inlineCommands() {
  const out = [];
  for (const [event, entries] of Object.entries(plugin.hooks)) {
    for (const e of entries) for (const h of e.hooks) out.push({ event, matcher: e.matcher, command: h.command });
  }
  return out;
}

test('no inline hook reads a tool_input field from the top level of the payload', () => {
  const bad = [];
  for (const h of inlineCommands()) {
    for (const f of NESTED) {
      const topLevelOnly = new RegExp(`(?<!get\\('tool_input'\\) or \\{\\}\\)\\.)\\bd\\.get\\('${f}'`);
      if (topLevelOnly.test(h.command) && !h.command.includes(`get('tool_input')`)) bad.push(`${h.event} ${h.matcher || ''}: reads d.get('${f}')`);
    }
  }
  assert.deepEqual(bad, [], 'read it from tool_input — Claude Code nests it there');
});

test('the write log records a write, given the payload Claude Code sends', () => {
  const hook = inlineCommands().find((h) => h.event === 'PostToolUse' && h.command.includes('agent-writes.log'));
  assert.ok(hook, 'the write-log hook is registered');
  const proj = mkdtempSync(join(tmpdir(), 'wlog-')); made.push(proj);
  mkdirSync(join(proj, '.great_cto'));
  writeFileSync(join(proj, '.great_cto', 'PROJECT.md'), '# probe\n');
  const r = spawnSync('bash', ['-c', hook.command], {
    cwd: proj, encoding: 'utf8',
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: join(proj, 'src', 'a.ts'), old_string: 'a', new_string: 'b' } }),
  });
  assert.equal(r.status, 0);
  const log = join(proj, '.great_cto', 'agent-writes.log');
  assert.ok(existsSync(log), 'the log was written');
  assert.match(readFileSync(log, 'utf8'), /Edit .*src\/a\.ts/);
});
