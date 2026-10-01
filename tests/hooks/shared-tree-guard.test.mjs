// Tests for shared-tree-guard — the PreToolUse Bash hook that refuses commands
// which throw away uncommitted work in a working tree other sessions share.
//
// Bought by a measurement, not a design: in the S3 effort A/B
// (docs/plans/PLAN-2026-09-23-agent-speed.md) senior-dev at effort MEDIUM ran
// `git stash -u && npm test; git stash pop` in 2 of 3 runs to see its baseline.
// In a shared tree that stashes — and may pop into — another session's edits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findDestructive } from '../../scripts/hooks/shared-tree-guard.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(REPO, 'scripts', 'hooks', 'shared-tree-guard.mjs');

const ALLOWED = [
  'git stash list',
  'git stash show -p stash@{0}',
  'git stash show',
  'git diff',
  'git diff > /tmp/x.patch',
  'git diff -- src/a.ts > /tmp/a.patch && git apply -R /tmp/a.patch',
  'git restore --staged src/a.ts',
  'git restore -S src/a.ts',
  'git status --short',
  'git checkout main',
  'git checkout -b feat/x origin/main',
  'git checkout --',
  'git reset HEAD~1',
  'git reset --soft HEAD~1',
  'git clean -n',
  'git clean -nd',
  'git worktree add ../baseline HEAD && (cd ../baseline && npm test)',
  'git log --grep=stash --oneline',
  'npm test',
  'ls -la',
  '',
];

// Words, not commands: the dangerous text sits inside a quoted argument, a
// comment, or a heredoc body — the forms a commit message about this very hook takes.
const MENTIONS = [
  'git commit -m "never run git stash -u in a shared tree"',
  "echo 'git reset --hard'",
  'grep -rn "git clean -f" docs/',
  'echo ok # then git stash',
  "git commit -F - <<'EOF'\nfix: refuse destructive commands\n\ngit stash -u\ngit reset --hard\nEOF",
  'git commit -m "$(cat <<\'EOF\'\nfix: guard\n\ngit stash -u && npm test; git stash pop\n(2 of 3 runs)\nEOF\n)"',
  'git log --format=%s | grep "git checkout -- "',
];

const BLOCKED = [
  ['git stash', 'stash'],
  ['git stash -u', 'stash'],
  ['git stash push -m wip', 'stash'],
  ['git stash push -u -m "tag" -- src/a.ts', 'stash'],
  ['git stash save wip', 'stash'],
  ['git stash pop', 'stash'],
  ['git stash apply stash@{0}', 'stash'],
  ['git stash drop', 'stash'],
  ['git stash clear', 'stash'],
  ['git checkout -- src/a.ts', 'checkout'],
  ['git checkout HEAD -- src/a.ts', 'checkout'],
  ['git checkout .', 'checkout'],
  ['git checkout -f main', 'checkout'],
  ['git restore src/a.ts', 'restore'],
  ['git restore .', 'restore'],
  ['git restore --staged --worktree src/a.ts', 'restore'],
  ['git restore -SW src/a.ts', 'restore'],
  ['git restore --source=HEAD~1 src/a.ts', 'restore'],
  ['git reset --hard', 'reset'],
  ['git reset --hard origin/main', 'reset'],
  ['git clean -f', 'clean'],
  ['git clean -fd', 'clean'],
  ['git clean -xdf', 'clean'],
  ['git clean --force -d', 'clean'],
];

// The same commands reached through the shapes an agent actually writes them in.
const CHAINED = [
  'git stash -u && npm test; git stash pop',
  'npm test && git stash -u',
  'a && git stash -u',
  'npm test || git reset --hard',
  'echo start; git clean -fd',
  'npm test | tee log && git stash',
  'npm test\ngit stash -u',
  '(cd packages/cli && git stash)',
  'echo "$(git stash)"',
  'echo `git stash`',
  'bash -c "git stash -u && npm test"',
  "sh -lc 'git checkout -- .'",
  'eval "git reset --hard"',
  'FOO=1 git stash',
  'env CI=1 git clean -f',
  'git -C packages/cli stash -u',
  'git --no-pager -c core.pager=cat stash',
  '/usr/bin/git reset --hard',
  'if true; then git stash; fi',
  'npm test 2>&1 | tail -5 && git restore src/a.ts',
];

test('allowed: read-only and staged-only git, and unrelated commands', () => {
  for (const cmd of ALLOWED) assert.equal(findDestructive(cmd), null, `should allow: ${cmd}`);
});

test('allowed: a destructive command only MENTIONED in quotes, comments or a heredoc', () => {
  for (const cmd of MENTIONS) assert.equal(findDestructive(cmd), null, `should allow: ${JSON.stringify(cmd)}`);
});

test('blocked: every form of stash / checkout -- / restore / reset --hard / clean -f', () => {
  for (const [cmd, rule] of BLOCKED) {
    const hit = findDestructive(cmd);
    assert.ok(hit, `should block: ${cmd}`);
    assert.equal(hit.rule, rule, `rule for: ${cmd}`);
  }
});

test('blocked: the destructive part of a chained, nested or wrapped command', () => {
  for (const cmd of CHAINED) assert.ok(findDestructive(cmd), `should block: ${JSON.stringify(cmd)}`);
});

test('the finding names the offending simple command, not the whole chain', () => {
  const hit = findDestructive('npm run build && git stash -u && npm test');
  assert.equal(hit.command, 'git stash -u');
});

function runHook(input, env = {}) {
  return spawnSync(process.execPath, [HOOK], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, GREAT_CTO_DISABLE_SHARED_TREE_GUARD: '', ...env },
  });
}

test('hook process: blocks with exit 2 and names the safe alternatives', () => {
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'git stash -u && npm test; git stash pop' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /git stash -u/);
  assert.match(r.stderr, /git diff > \/tmp\/[\w.-]+\.patch/, 'suggests saving a patch');
  assert.match(r.stderr, /git worktree add/, 'suggests a separate worktree for the baseline');
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /git worktree add/);
});

test('hook process: allows safe commands silently with exit 0', () => {
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'git stash list && git diff' } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('hook process: GREAT_CTO_DISABLE_SHARED_TREE_GUARD=1 turns it off', () => {
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'git reset --hard' } }, { GREAT_CTO_DISABLE_SHARED_TREE_GUARD: '1' });
  assert.equal(r.status, 0);
});

test('hook process: empty or malformed stdin, or a non-Bash tool, is not its concern', () => {
  assert.equal(runHook('').status, 0);
  assert.equal(runHook('not json').status, 0);
  assert.equal(runHook({ tool_name: 'Write', tool_input: { file_path: 'a', content: 'git stash' } }).status, 0);
});

test('wired: the plugin.json Bash command blocks the REAL PreToolUse input shape', () => {
  // The inline "Safety check" beside it reads a top-level `command`, which
  // Claude Code never sends — it has been passing everything. Prove this one
  // is wired end to end with the shape Claude Code actually sends.
  const plugin = JSON.parse(readFileSync(join(REPO, '.claude-plugin', 'plugin.json'), 'utf8'));
  const bash = plugin.hooks.PreToolUse.find((e) => e.matcher === 'Bash');
  const hook = bash.hooks.find((h) => h.command.includes('shared-tree-guard.mjs'));
  assert.ok(hook, 'shared-tree-guard.mjs is in the PreToolUse Bash chain');
  const cwd = mkdtempSync(join(tmpdir(), 'stg-'));
  try {
    const run = (command) => spawnSync('sh', ['-c', hook.command], {
      cwd,
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: REPO, GREAT_CTO_DISABLE_SHARED_TREE_GUARD: '' },
    });
    const blocked = run('npm test && git stash -u');
    assert.equal(blocked.status, 2, blocked.stderr);
    // On exit 2 Claude Code reads only stderr — a `2>&1` in the wrapper would
    // hand the agent a refusal with no reason and no alternative.
    assert.match(blocked.stderr, /git worktree add/);
    assert.equal(run('git stash list').status, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
