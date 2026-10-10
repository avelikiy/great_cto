#!/usr/bin/env node
/**
 * bash-guards — every PreToolUse check of a Bash call, in one process.
 *
 * Six hooks used to run per Bash call, each its own Node process with a five
 * second limit. They take ~50 ms each (p95 ~220 ms), but on days a gate loaded
 * the machine they did not all finish: Claude Code cancelled the late ones, and
 * a cancelled guard does not block. "Inline subagent check" was cancelled 126
 * times in 90 days, the destructive-command check 8 — 8 commands nobody checked.
 * One process starts once and runs the checks back to back.
 *
 * Order: the refusals first (inline subagent, shared tree, gate bypass,
 * destructive command, frozen gates); the first that refuses decides, exactly as
 * a deny from any one of the six did. Then the reminder (lesson-tripwire), which
 * never blocks. A check that throws is reported and passed over — a crashing
 * guard script was a pass before, and stays one; only its name is now known.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { emit, readStdinOnce } from '../lib/guard-result.mjs';
import { run as inlineSubagent } from '../lib/inline-subagent.mjs';
import { run as sharedTree } from './shared-tree-guard.mjs';
import { run as gateBypass } from './gate-bypass-guard.mjs';
import { run as destructive } from './destructive-guard.mjs';
import { run as frozenGates } from './frozen-gates-guard.mjs';
import { run as lessonTripwire } from './lesson-tripwire.mjs';

export const BASH_CHECKS = Object.freeze([
  // Codex never ran this rule; its host flows may call the Claude CLI on purpose.
  ['inline-subagent', inlineSubagent, { skipOnHost: 'codex' }],
  ['shared-tree', sharedTree],
  ['gate-bypass', gateBypass],
  ['destructive', destructive],
  ['frozen-gates', frozenGates],
]);
export const BASH_REMINDERS = Object.freeze([['lesson-tripwire', lessonTripwire]]);

export function runBashGuards(raw, env = process.env, { checks = BASH_CHECKS, reminders = BASH_REMINDERS } = {}) {
  let notes = '';
  for (const [name, check, opts = {}] of checks) {
    if (opts.skipOnHost && env.GREAT_CTO_HOST === opts.skipOnHost) continue;
    let r;
    try { r = check(raw, env); } catch (e) {
      notes += `[great_cto:bash-guards] ${name} could not run — ${String(e?.message || e).split('\n')[0]}\n`;
      continue;
    }
    if (r && r.code === 2) return { ...r, stderr: notes + (r.stderr || '') };
  }
  let stdout = '';
  for (const [name, remind] of reminders) {
    try {
      const r = remind(raw, env);
      if (r?.stdout) stdout = r.stdout;
    } catch (e) {
      notes += `[great_cto:bash-guards] ${name} could not run — ${String(e?.message || e).split('\n')[0]}\n`;
    }
  }
  return { code: 0, stdout, stderr: notes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  emit(runBashGuards(readStdinOnce()));
}
