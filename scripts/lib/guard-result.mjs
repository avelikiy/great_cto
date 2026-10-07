/**
 * What a PreToolUse check decided, as a value instead of a process exit.
 *
 * Each check was its own script — read stdin, decide, print, exit — so every
 * Bash call started six Node processes. Under a running gate they did not all
 * finish in five seconds, Claude Code cancelled the late ones, and a cancelled
 * guard does not block: the destructive-command check was cancelled 8 times in
 * 90 days on this machine, which is 8 commands it never looked at. A check that
 * returns a value can run inside one process with the others
 * (scripts/hooks/bash-guards.mjs) and still be run on its own.
 */
import { readFileSync } from 'node:fs';

export const PASS = Object.freeze({ code: 0, stdout: '', stderr: '' });

/** The deny every great_cto guard writes: a JSON decision for the host, a line for the log. */
export function deny({ guard, tag, reason, what = 'command' }) {
  return {
    code: 2,
    stdout: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `great_cto ${guard} guard blocked the ${what} — ${reason}`,
      },
    }) + '\n',
    stderr: `[great_cto:${tag}] BLOCKED — ${reason}\n`,
  };
}

export function readStdinOnce() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

/** Print a result and leave with its code — what a check's own main() does. */
export function emit(r) {
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.code);
}
