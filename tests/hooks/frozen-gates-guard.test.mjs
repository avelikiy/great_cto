// Tests for frozen-gates-guard PreToolUse hook (architect-loop R2, mechanical):
// editing an existing docs/gates/ file is denied; creating a new one is allowed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFrozenGateEdit } from '../../scripts/hooks/frozen-gates-guard.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('frozen-gates-guard: editing an EXISTING gate is denied', () => {
  assert.equal(isFrozenGateEdit('docs/gates/slice-1.md', true), true);
  assert.equal(isFrozenGateEdit('/abs/repo/docs/gates/x.md', true), true);
});

test('frozen-gates-guard: CREATING a new gate is allowed', () => {
  assert.equal(isFrozenGateEdit('docs/gates/slice-2.md', false), false);
});

test('frozen-gates-guard: non-gate files are never the guard concern', () => {
  assert.equal(isFrozenGateEdit('src/foo.ts', true), false);
  assert.equal(isFrozenGateEdit('docs/plans/PLAN-x.md', true), false);
  assert.equal(isFrozenGateEdit(null, true), false);
});

test('frozen-gates-guard: is WIRED as a PreToolUse Edit|Write|MultiEdit hook (not just present)', () => {
  const plugin = JSON.parse(readFileSync(join(REPO, '.claude-plugin', 'plugin.json'), 'utf8'));
  const pre = plugin.hooks.PreToolUse.find((e) => e.matcher === 'Edit|Write|MultiEdit');
  assert.ok(pre, 'PreToolUse Edit|Write|MultiEdit matcher exists');
  const wired = pre.hooks.some((h) => h.command.includes('frozen-gates-guard.mjs'));
  assert.ok(wired, 'frozen-gates-guard.mjs must be wired into the PreToolUse hook chain');
});

// ── Shell writes ─────────────────────────────────────────────────────────────
// The Edit tool is one way to change a gate. `sed -i`, `>`, `tee`, `cp` and `mv`
// are the others, and the guard used to see none of them: a write through Bash was
// caught only after the fact, by the git-diff check. Since 3.42 it sees the targets.

import { shellWriteTargets } from '../../scripts/hooks/frozen-gates-guard.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('shellWriteTargets finds every way a shell command writes a file, and no reader', () => {
  const writes = {
    'sed -i "s/a/b/" docs/gates/a.md': ['docs/gates/a.md'],
    'echo x > docs/gates/a.md': ['docs/gates/a.md'],
    'echo x >>docs/gates/a.md': ['docs/gates/a.md'],
    'tee -a docs/gates/b.md < y': ['docs/gates/b.md'],
    'cp /tmp/x docs/gates/a.md': ['docs/gates/a.md'],
    'perl -pi -e "s/a/b/" docs/gates/a.md': ['docs/gates/a.md'],
    'git checkout -- docs/gates/a.md': ['docs/gates/a.md'],
    'rm -f docs/gates/a.md': ['docs/gates/a.md'],
    'dd if=/dev/zero of=docs/gates/a.md': ['docs/gates/a.md'],
    'cd x && bash -c "echo y > docs/gates/a.md"': ['docs/gates/a.md'],
  };
  for (const [cmd, want] of Object.entries(writes)) assert.deepEqual(shellWriteTargets(cmd), want, cmd);
  assert.ok(shellWriteTargets('mv docs/gates/a.md /tmp/').includes('docs/gates/a.md'), 'moving a gate away changes it');
  for (const reader of ['cat docs/gates/a.md', 'grep x docs/gates/a.md', 'git commit -m "touch docs/gates/a.md"', 'echo x 2>&1', 'echo x > /dev/null']) {
    assert.ok(!shellWriteTargets(reader).some((t) => t.includes('docs/gates')), `${reader} writes no gate`);
  }
});

test('the guard denies a Bash write to an existing gate and lets a new gate or a read through', () => {
  const dir = mkdtempSync(join(tmpdir(), 'frozen-bash-'));
  try {
    mkdirSync(join(dir, 'docs', 'gates'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'gates', 'slice-1.md'), '- [ ] works\n');
    const run = (command) => spawnSync(process.execPath, [join(REPO, 'scripts', 'hooks', 'frozen-gates-guard.mjs')], {
      input: JSON.stringify({ tool_name: 'Bash', cwd: dir, tool_input: { command } }), encoding: 'utf8',
      env: { ...process.env, GREAT_CTO_DISABLE_FROZEN_GATES: '' },
    });
    const sed = run('sed -i "s/\\[ \\]/[x]/" docs/gates/slice-1.md');
    assert.equal(sed.status, 2);
    assert.match(sed.stdout, /"permissionDecision":"deny"/);
    assert.equal(run('echo "- [ ] new" > docs/gates/slice-2.md').status, 0, 'a new gate may be written');
    assert.equal(run('cat docs/gates/slice-1.md').status, 0, 'reading is not editing');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('frozen-gates-guard is wired on Bash too, in Claude Code and in the Codex hooks', () => {
  const plugin = JSON.parse(readFileSync(join(REPO, '.claude-plugin', 'plugin.json'), 'utf8'));
  const bash = plugin.hooks.PreToolUse.find((e) => e.matcher === 'Bash');
  assert.ok(bash.hooks.some((h) => h.command.includes('frozen-gates-guard.mjs')));
  const codex = JSON.parse(readFileSync(join(REPO, '.codex-plugin', 'hooks.json'), 'utf8'));
  const cb = codex.hooks.PreToolUse.find((e) => e.matcher === 'Bash');
  assert.match(cb.hooks[0].command, /frozen-gates-guard/);
});
