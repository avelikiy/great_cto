#!/usr/bin/env node
/**
 * shared-tree-guard — PreToolUse hook for Bash.
 *
 * Several Claude Code sessions on one machine often work in ONE working tree.
 * Uncommitted edits there belong to whichever session made them, and they are
 * in neither the index nor the history — so a command that resets the tree
 * destroys another session's work with no way back. This hook refuses those
 * commands at the tool layer:
 *
 *   git stash …            (any form but `list` / `show` — pop and apply write
 *                           into the tree, drop and clear lose entries, and the
 *                           stash stack is shared by every worktree)
 *   git checkout -- <path> (also `<ref> -- <path>`, `.`, and `-f`)
 *   git restore <path>     (unless it is --staged only)
 *   git reset --hard
 *   git clean -f
 *
 * Bought by a measurement: in the S3 effort A/B
 * (docs/plans/PLAN-2026-09-23-agent-speed.md) senior-dev at effort MEDIUM ran
 * `git stash -u && npm test; git stash pop` in 2 of 3 runs to check its
 * baseline. A prompt rule did not move behaviour in S2; a hook does.
 *
 * The command is parsed, not grepped: quotes, comments and heredoc bodies are
 * words, so a commit message that MENTIONS `git stash` passes, while `a && git
 * stash -u`, `(cd x && git stash)`, `$(…)`, `bash -c '…'` and `eval` are all seen.
 *
 * I/O (Claude Code PreToolUse):
 *   stdin:  { tool_name, tool_input: { command } }  (also tolerates top-level command)
 *   stdout: silent on allow; on block, hookSpecificOutput JSON (permissionDecision="deny")
 *   exit:   0 = allow, 2 = block (fail-safe alongside the structured deny)
 *
 * Opt out (a tree nobody else works in): GREAT_CTO_DISABLE_SHARED_TREE_GUARD=1
 */

import { readFileSync } from 'node:fs';
import { simpleCommands, gitParts } from '../lib/shell-commands.mjs';

// ── Classifier: one simple command → the rule it breaks, if any ──────────────

/** Returns a rule name if `args` (after `git <sub>`) destroy uncommitted work. */
function gitRule(sub, args) {
  const short = (letter) => args.some((a) => /^-[A-Za-z]+$/.test(a) && a.includes(letter));
  const has = (...flags) => args.some((a) => flags.includes(a) || flags.some((f) => f.startsWith('--') && a.startsWith(`${f}=`)));
  switch (sub) {
    case 'stash':
      return ['list', 'show'].includes(args[0]) ? null : 'stash';
    case 'checkout': {
      const dd = args.indexOf('--');
      if (dd !== -1 && dd < args.length - 1) return 'checkout';
      if (args.includes('.') || has('--force') || short('f')) return 'checkout';
      return null;
    }
    case 'restore': {
      const staged = has('--staged') || short('S');
      const worktree = has('--worktree') || short('W');
      return staged && !worktree ? null : 'restore';
    }
    case 'reset':
      return has('--hard') ? 'reset' : null;
    case 'clean':
      if (has('--dry-run') || short('n')) return null;
      return has('--force') || short('f') ? 'clean' : null;
    default:
      return null;
  }
}

function inspect(src) {
  for (const { words } of simpleCommands(src)) {
    const git = gitParts(words);
    const rule = git && git.sub ? gitRule(git.sub, git.args) : null;
    if (rule) return { rule, command: words.join(' ') };
  }
  return null;
}

/** Pure decision: the first simple command in `cmd` that destroys uncommitted work, or null. */
export function findDestructive(cmd) {
  if (typeof cmd !== 'string' || !cmd.trim()) return null;
  return inspect(cmd);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

const WHY = {
  stash: 'stashes (or pops into) the WHOLE tree, including edits another session has not committed; the stash stack is shared by every worktree',
  checkout: 'overwrites files in the tree with the committed version — another session\'s uncommitted edits in them are gone',
  restore: 'overwrites files in the tree with the committed version — another session\'s uncommitted edits in them are gone',
  reset: 'discards every uncommitted change in the tree, not only yours',
  clean: 'deletes untracked files, including ones another session just created',
};

export function blockReason(hit) {
  return (
    `\`${hit.command}\` ${WHY[hit.rule]}. Several sessions share this working tree, and ` +
    `uncommitted work is in neither the index nor the history — it cannot be recovered. ` +
    `Safe instead: to set aside or undo only YOUR edits, save a patch first ` +
    `(\`git diff > /tmp/x.patch\`, restore with \`git apply /tmp/x.patch\`, undo with ` +
    `\`git apply -R /tmp/x.patch\`); to test the baseline, use a separate tree ` +
    `(\`git worktree add "$(mktemp -d)" HEAD\`, run the tests there, then \`git worktree remove\`); ` +
    `to unstage, \`git restore --staged <path>\` is allowed. ` +
    `(Override for a tree nobody else uses: GREAT_CTO_DISABLE_SHARED_TREE_GUARD=1.)`
  );
}

function commandFrom(raw) {
  let d;
  try { d = JSON.parse(raw); } catch { return null; }
  if (d.tool_name && d.tool_name !== 'Bash') return null;
  const ti = d.tool_input || d.toolInput || {};
  return ti.command || d.command || null;
}

function main() {
  if (process.env.GREAT_CTO_DISABLE_SHARED_TREE_GUARD === '1') return process.exit(0);
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  const cmd = raw ? commandFrom(raw) : null;
  const hit = cmd ? findDestructive(cmd) : null;
  if (!hit) return process.exit(0);

  const reason = blockReason(hit);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `great_cto shared-tree guard blocked the command — ${reason}`,
    },
  }) + '\n');
  process.stderr.write(`[great_cto:shared-tree] BLOCKED — ${reason}\n`);
  return process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
