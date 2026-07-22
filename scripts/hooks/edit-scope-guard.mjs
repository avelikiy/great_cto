#!/usr/bin/env node
/**
 * edit-scope-guard.mjs — PreToolUse (Edit|Write|MultiEdit).
 *
 * Enforces an IMPL-BRIEF's file scope at the moment of the write, not after it.
 * great_cto already PARSES scope (`## Files to modify` / `## Files NOT to modify`)
 * and already CHECKS it — but only post-hoc, in senior-dev Step 6b, run by the
 * agent itself at task close. So an agent could edit a forbidden file and only
 * learn about it in review. This closes that: `changedFiles ⊆ allowedEditScope`
 * becomes a hard constraint on the write, exactly as the clean-up-agents
 * literature argues it should be.
 *
 * Scope is deliberately conservative:
 *   - a file on the brief's DENYLIST → hard deny (permissionDecision:"deny", exit 2),
 *     always. That list says "definitely not here"; there is no honest reason to
 *     write it mid-slice.
 *   - a file on NEITHER list → advisory by default (possible scope creep, stderr
 *     note, allowed). Allowlists are routinely incomplete — a new test file, a
 *     generated artifact — so blocking on "not listed" would train people to
 *     disable the hook. `GREAT_CTO_ENFORCE_EDIT_SCOPE=block` upgrades this to a
 *     hard block for teams that keep exhaustive allowlists.
 *   - no active brief → allow. Enforcement only applies while a brief is active.
 *
 * The active brief is located via `GREAT_CTO_ACTIVE_BRIEF` (a path) or the
 * pointer file `.great_cto/active-brief` that senior-dev writes when it claims a
 * task. A stale pointer can only ever block a denylisted path — fail-safe — and
 * `GREAT_CTO_DISABLE_EDIT_SCOPE=1` is the escape hatch.
 *
 * stdout: silent on allow; on deny, hookSpecificOutput JSON. Exit 2 = block.
 */
import { readFileSync, existsSync } from 'node:fs';
import { isAbsolute, resolve, join } from 'node:path';
import { parseBrief, checkScope } from '../lib/impl-brief.mjs';

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

function filePathFrom(raw) {
  let d;
  try { d = JSON.parse(raw); } catch { return null; }
  const ti = d.tool_input || d.toolInput || {};
  return d.file_path || ti.file_path || ti.path || null;
}

/** Resolve the active IMPL-BRIEF path, or null when none is active. */
export function activeBriefPath(env = process.env, cwd = process.cwd()) {
  if (env.GREAT_CTO_ACTIVE_BRIEF) return env.GREAT_CTO_ACTIVE_BRIEF;
  const pointer = join(cwd, '.great_cto', 'active-brief');
  if (existsSync(pointer)) {
    const p = readFileSync(pointer, 'utf8').trim();
    if (p) return isAbsolute(p) ? p : join(cwd, p);
  }
  return null;
}

/**
 * Pure decision. `brief` is a parsed brief (or null for "no active scope").
 * @returns {{ decision:'allow'|'warn'|'deny', kind:string|null, reason:string|null }}
 */
export function decideEditScope(filePath, brief, { mode = 'advisory' } = {}) {
  if (!filePath || !brief) return { decision: 'allow', kind: null, reason: null };
  const { violations, warnings } = checkScope([filePath], brief);
  if (violations.length) return { decision: 'deny', kind: 'denylist', reason: violations[0] };
  if (warnings.length) {
    return mode === 'block'
      ? { decision: 'deny', kind: 'allowlist-strict', reason: warnings[0] }
      : { decision: 'warn', kind: 'allowlist-advisory', reason: warnings[0] };
  }
  return { decision: 'allow', kind: null, reason: null };
}

function main() {
  if (process.env.GREAT_CTO_DISABLE_EDIT_SCOPE === '1') return process.exit(0);
  const raw = readStdin();
  if (!raw) return process.exit(0);
  const filePath = filePathFrom(raw);
  if (!filePath) return process.exit(0);

  const briefPath = activeBriefPath();
  if (!briefPath || !existsSync(briefPath)) return process.exit(0); // no active scope → allow

  let brief;
  try { brief = parseBrief(readFileSync(briefPath, 'utf8')); } catch { return process.exit(0); }

  const mode = process.env.GREAT_CTO_ENFORCE_EDIT_SCOPE === 'block' ? 'block' : 'advisory';
  const { decision, reason } = decideEditScope(filePath, brief, { mode });

  if (decision === 'deny') {
    const msg =
      `${reason}. The active IMPL-BRIEF (${briefPath}) scopes this task; writing outside ` +
      `that scope is how a minimal change turns into an un-reviewable one. If the scope is ` +
      `genuinely wrong, have pm re-issue the brief — do not widen it mid-slice. ` +
      `(Override: GREAT_CTO_DISABLE_EDIT_SCOPE=1.)`;
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `great_cto edit-scope guard blocked the edit — ${msg}`,
      },
    }) + '\n');
    process.stderr.write(`[great_cto:edit-scope] BLOCKED — ${msg}\n`);
    return process.exit(2);
  }
  if (decision === 'warn') {
    process.stderr.write(`[great_cto:edit-scope] ${reason} — allowed (advisory; set GREAT_CTO_ENFORCE_EDIT_SCOPE=block to enforce)\n`);
  }
  return process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
