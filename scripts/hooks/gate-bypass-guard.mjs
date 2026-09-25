#!/usr/bin/env node
/**
 * gate-bypass-guard — PreToolUse hook for Bash.
 *
 * The git hooks are where great_cto keeps its last line: pre-push refuses a
 * private project name headed for a public repo and a push over a red gate. One
 * flag switched all of it off, and the hook's own advice on a match named that
 * flag. This refuses the ways of skipping the hooks from an agent's shell:
 *
 *   git … --no-verify                 (commit, push, merge, rebase, am, …)
 *   git commit -n                     (commit's short form; on push -n is --dry-run and passes)
 *   git -c core.hooksPath=…           (point the hooks somewhere empty for one command)
 *   git config [--scope] core.hooksPath <value> | --unset core.hooksPath
 *   HUSKY=0 git … / SKIP=… git …      (husky's and pre-commit's own off switches)
 *
 * The command is parsed (scripts/lib/shell-commands.mjs), so a commit message or
 * an echo that mentions `--no-verify` passes, and `bash -c`, `eval` and chains
 * are seen.
 *
 * The sanctioned route is a signed, expiring exception for gate `git-hooks`
 * (`/exception`, scripts/lib/exceptions.mjs) — recorded, attributed, visible.
 * An env prefix inside the agent's own command is not a way past: the hook reads
 * its own environment, which the agent does not set.
 *
 * I/O (Claude Code PreToolUse):
 *   stdin:  { tool_name, tool_input: { command } }
 *   stdout: silent on allow; on block, hookSpecificOutput JSON (permissionDecision="deny")
 *   exit:   0 = allow, 2 = block
 *
 * Opt out for a whole session (operator's environment): GREAT_CTO_DISABLE_GATE_BYPASS_GUARD=1
 */
import { readFileSync } from 'node:fs';
import { simpleCommands, gitParts } from '../lib/shell-commands.mjs';
import { isCovered } from '../lib/exceptions.mjs';

const GATE = 'git-hooks';
// Short options of `git commit` that take a value: letters after them are the value.
const COMMIT_VALUE_FLAGS = new Set(['m', 'F', 'c', 'C', 't', 'S']);

function commitShortN(args) {
  for (const a of args) {
    if (a === '--') break;
    if (!/^-[A-Za-z]+$/.test(a)) continue;
    for (const ch of a.slice(1)) {
      if (COMMIT_VALUE_FLAGS.has(ch)) break;
      if (ch === 'n') return true;
    }
  }
  return false;
}

/** Pure decision: the first command in `cmd` that skips the git hooks, as { what, command }, or null. */
export function findBypass(cmd) {
  if (typeof cmd !== 'string' || !cmd.trim()) return null;
  for (const { words, env } of simpleCommands(cmd)) {
    const git = gitParts(words);
    if (!git) continue;
    const command = words.join(' ');
    if ('HUSKY' in env && env.HUSKY === '0') return { what: 'HUSKY=0 turns husky\'s hooks off', command };
    if ('SKIP' in env && env.SKIP) return { what: 'SKIP=… tells pre-commit to skip hooks', command };
    for (let i = 0; i < git.globals.length; i++) {
      if (git.globals[i] === '-c' && /^core\.hookspath=/i.test(git.globals[i + 1] || '')) {
        return { what: '-c core.hooksPath=… points the hooks away for this command', command };
      }
    }
    if (git.args.includes('--no-verify')) return { what: '--no-verify skips the hooks', command };
    if (git.sub === 'commit' && commitShortN(git.args)) return { what: 'commit -n is --no-verify', command };
    if (git.sub === 'config') {
      const a = git.args.filter((x) => !/^--(local|global|system|worktree|file=.*)$/.test(x));
      const k = a.findIndex((x) => /^core\.hookspath$/i.test(x));
      if (k !== -1) {
        if (a.includes('--unset') || a.includes('--unset-all')) return { what: 'unsetting core.hooksPath moves the hooks', command };
        if (!a.includes('--get') && !a.includes('--get-all') && a.length > k + 1) {
          return { what: 'setting core.hooksPath moves the hooks', command };
        }
      }
    }
  }
  return null;
}

export function blockReason(hit) {
  return (
    `\`${hit.command}\` — ${hit.what}. The hooks are the gate that keeps private names out of a ` +
    `public push and a red gate out of a release; skipping them is not the agent's call. ` +
    `Fix what the hook reports instead. If the hook itself is wrong, say so to the operator; ` +
    `a bypass they approve is a signed, expiring exception for gate "${GATE}" ` +
    `(\`/exception\`, or \`node scripts/lib/exceptions.mjs create --gate ${GATE} --reason "…"\`).`
  );
}

function main() {
  if (process.env.GREAT_CTO_DISABLE_GATE_BYPASS_GUARD === '1') return process.exit(0);
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  let d = {};
  try { d = JSON.parse(raw || '{}'); } catch { return process.exit(0); }
  if (d.tool_name && d.tool_name !== 'Bash') return process.exit(0);
  const cmd = (d.tool_input || d.toolInput || {}).command || d.command;
  const hit = cmd ? findBypass(cmd) : null;
  if (!hit) return process.exit(0);
  if (isCovered(GATE)) return process.exit(0);

  const reason = blockReason(hit);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `great_cto gate-bypass guard blocked the command — ${reason}`,
    },
  }) + '\n');
  process.stderr.write(`[great_cto:gate-bypass] BLOCKED — ${reason}\n`);
  return process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
