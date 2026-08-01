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
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, resolve, join } from 'node:path';
import { parseBrief, checkScope, toRepoRelative } from '../lib/impl-brief.mjs';

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


// ── volume ──────────────────────────────────────────────────────────────────
//
// The scope check answers WHICH files a slice may touch and never HOW MANY. A
// slice that rewrites two hundred allowlisted files passes every check here,
// and `src/**` in a brief is an allowlist that says yes to most of a repo.
//
// Which and how-many are different questions, and the second one is the one a
// reviewer feels: a diff nobody can hold in their head gets approved on trust.
// So the count is tracked across the slice and reported once it crosses a line —
// advisory by default, like the allowlist rule, because a legitimate wide change
// exists and a guard that blocks it is a guard people turn off.

const DEFAULT_MAX_SLICE_FILES = 30;

export function maxSliceFiles(env = process.env) {
  const raw = env.GREAT_CTO_MAX_SLICE_FILES;
  if (raw === undefined || raw === '') return DEFAULT_MAX_SLICE_FILES;
  const n = Number(raw);
  // 0 disables the check outright; anything unparseable falls back rather than
  // silently becoming NaN, which compares false and disables it by accident.
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MAX_SLICE_FILES;
  return n;
}

/**
 * Fold one write into the slice's file set.
 *
 * Pure: takes the prior state and returns the next one, so the counting rule is
 * testable without a filesystem. State resets when the active brief changes —
 * a new brief is a new slice, and carrying the old count into it would report a
 * number that belongs to finished work.
 *
 * @returns {{ state: {brief: string, files: string[]}, count: number, exceeded: boolean }}
 */
export function recordSliceWrite(prior, briefPath, file, max = DEFAULT_MAX_SLICE_FILES) {
  const fresh = !prior || prior.brief !== briefPath || !Array.isArray(prior.files);
  const files = fresh ? [] : prior.files.slice();
  const key = toRepoRelative(file);
  // Distinct files, not writes: editing one file forty times is not a wide change.
  if (key && !files.includes(key)) files.push(key);
  return {
    state: { brief: briefPath, files },
    count: files.length,
    exceeded: max > 0 && files.length > max,
  };
}

function sliceStatePath(cwd = process.cwd()) {
  return join(cwd, '.great_cto', 'edit-scope-slice.json');
}

function readSliceState(cwd) {
  try { return JSON.parse(readFileSync(sliceStatePath(cwd), 'utf8')); } catch { return null; }
}

function writeSliceState(cwd, state) {
  // Best-effort: a guard that cannot persist its count must not block the write
  // it was only counting.
  try {
    mkdirSync(join(cwd, '.great_cto'), { recursive: true });
    writeFileSync(sliceStatePath(cwd), JSON.stringify(state));
  } catch { /* counting is advisory; failing to count is not a reason to fail the edit */ }
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

  // Count before deciding, so a denied write is not counted — it never happened.
  let volume = null;
  if (decision !== 'deny') {
    const max = maxSliceFiles();
    volume = recordSliceWrite(readSliceState(process.cwd()), briefPath, filePath, max);
    writeSliceState(process.cwd(), volume.state);
    if (volume.exceeded && mode === 'block') {
      const msg =
        `this slice has now touched ${volume.count} distinct files (limit ${max}). ` +
        `Scope is not only WHICH files a brief allows but HOW MANY a reviewer can hold ` +
        `in their head — a diff this wide gets approved on trust rather than read. ` +
        `Split the slice, or raise GREAT_CTO_MAX_SLICE_FILES if this width is intended.`;
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
  }

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
  // Reported once per write past the line, not once — the count keeps climbing
  // and so does the reason to split.
  if (volume && volume.exceeded) {
    process.stderr.write(
      `[great_cto:edit-scope] this slice has touched ${volume.count} distinct files ` +
      `(limit ${maxSliceFiles()}) — a diff this wide is reviewed on trust. Consider splitting it. ` +
      `(advisory; GREAT_CTO_ENFORCE_EDIT_SCOPE=block to enforce, GREAT_CTO_MAX_SLICE_FILES to retune)\n`,
    );
  }
  return process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
