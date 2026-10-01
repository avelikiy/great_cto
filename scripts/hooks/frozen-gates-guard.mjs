#!/usr/bin/env node
/**
 * frozen-gates-guard — PreToolUse hook for Edit | Write | MultiEdit.
 *
 * Makes the architect-loop "frozen gates" rule MECHANICAL (R2), not just prompt
 * advice: once an acceptance-gate file exists under `docs/gates/`, no agent may
 * edit it. The criteria live where the builder can't move them — a write to an
 * existing gate file is denied at the tool layer, so "the build can't game the
 * gate" is enforced, not requested. Creating a NEW gate file is allowed (that's
 * the architect freezing it before dispatch).
 *
 * I/O (Claude Code PreToolUse):
 *   stdin:  { tool_name, tool_input: { file_path, ... } }  (also tolerates top-level file_path)
 *   stdout: silent on allow; on block, hookSpecificOutput JSON (permissionDecision="deny")
 *   exit:   0 = allow, 2 = block (fail-safe alongside the structured deny)
 *
 * Opt out (e.g. deliberately revising a gate during planning):
 *   GREAT_CTO_DISABLE_FROZEN_GATES=1
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { simpleCommands, base } from '../lib/shell-commands.mjs';

const GATE_DIR = 'docs/gates/';

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

/**
 * Files a shell command writes, truncates, replaces or deletes — the ways to change a
 * gate without the Edit tool: `> f`, `>> f`, `sed -i … f`, `perl -pi -e … f`, `tee f`,
 * `cp|mv|install … f`, `rm f`, `truncate … f`, `dd of=f`, `git checkout|restore -- f`.
 * A reader (`cat f`, `grep x f`) is not a write. Words, not strings: a commit message
 * that mentions `docs/gates/` is not a target.
 */
export function shellWriteTargets(command) {
  const out = [];
  const opts = (w) => w.startsWith('-');
  for (const c of simpleCommands(String(command ?? ''))) {
    const w = c.words;
    for (let i = 0; i < w.length; i++) {
      const m = /^\d*(>>?|>\|)(.*)$/.exec(w[i]);
      if (!m) continue;
      const target = m[2] || w[i + 1];
      if (target && !target.startsWith('&') && target !== '/dev/null') out.push(target);
    }
    const redir = /^(\d*(>>?|>\|)|<<?<?)$/; // a redirection word, whose next word is its target or source
    const args = w.slice(1).filter((x, k, all) => !/^\d*(>>?|>\|)/.test(x) && !/^<<?<?$/.test(x) && !redir.test(all[k] === x ? (all[k - 1] ?? '') : ''));
    const cmd = base(w[0]);
    const files = args.filter((x) => !opts(x));
    if ((cmd === 'sed' || cmd === 'gsed') && args.some((x) => /^-[A-Za-z]*i|^--in-place/.test(x))) {
      const eIdx = args.findIndex((x) => x === '-e' || x === '--expression');
      out.push(...(eIdx >= 0 ? files.filter((x) => x !== args[eIdx + 1]) : files.slice(1)));
    } else if (cmd === 'perl' && args.some((x) => /^-[A-Za-z]*i/.test(x))) {
      const eIdx = args.findIndex((x) => /^-[A-Za-z]*e$/.test(x));
      out.push(...files.filter((x) => x !== args[eIdx + 1]));
    } else if (cmd === 'tee' || cmd === 'rm' || cmd === 'unlink' || cmd === 'truncate' || cmd === 'shred') {
      out.push(...files.filter((x) => !/^\d+[KMG]?$/.test(x)));
    } else if ((cmd === 'cp' || cmd === 'mv' || cmd === 'install' || cmd === 'ln' || cmd === 'rsync') && files.length >= 2) {
      out.push(files[files.length - 1]);
      if (cmd === 'mv') out.push(...files.slice(0, -1)); // moving a gate away is changing it too
    } else if (cmd === 'dd') {
      for (const x of args) if (x.startsWith('of=')) out.push(x.slice(3));
    } else if (cmd === 'git' && (w.includes('checkout') || w.includes('restore'))) {
      const dd = w.indexOf('--');
      out.push(...(dd >= 0 ? w.slice(dd + 1) : w.slice(w.indexOf('restore') >= 0 ? w.indexOf('restore') + 1 : w.length).filter((x) => !opts(x))));
    }
  }
  return [...new Set(out)];
}

function filePathFrom(raw) {
  let d;
  try { d = JSON.parse(raw); } catch { return null; }
  const ti = d.tool_input || d.toolInput || {};
  return d.file_path || ti.file_path || ti.path || null;
}

/** Pure decision: is this write a forbidden edit of an already-frozen gate file? */
export function isFrozenGateEdit(filePath, exists) {
  if (!filePath) return false;
  const norm = (isAbsolute(filePath) ? resolve(filePath) : filePath).replace(/\\/g, '/');
  const underGates = norm.includes(`/${GATE_DIR}`) || norm.startsWith(GATE_DIR);
  return underGates && exists; // editing an EXISTING gate; creating a new one is fine
}

function main() {
  if (process.env.GREAT_CTO_DISABLE_FROZEN_GATES === '1') return process.exit(0);
  const raw = readStdin();
  if (!raw) return process.exit(0);
  let d = {};
  try { d = JSON.parse(raw); } catch { /* not a tool call */ }
  const cwd = d.cwd || process.cwd();
  const onDisk = (p) => existsSync(isAbsolute(p) ? p : resolve(cwd, p));
  // A shell call is checked by what it writes; an edit tool by its file_path.
  const candidates = d.tool_name === 'Bash'
    ? shellWriteTargets(d.tool_input?.command)
    : [filePathFrom(raw)].filter(Boolean);
  const filePath = candidates.find((p) => isFrozenGateEdit(p, onDisk(p)));
  if (!filePath) return process.exit(0);

  const reason =
    `${filePath} is a FROZEN acceptance gate (docs/gates/). Gates are read-only once ` +
    `committed — a builder edit to a gate is an automatic slice FAIL. If the gate is ` +
    `genuinely wrong, raise it in Phase 0 for the architect to re-issue; do not move the ` +
    `goalposts. (Override only for deliberate re-planning: GREAT_CTO_DISABLE_FROZEN_GATES=1.)`;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `great_cto frozen-gates guard blocked the edit — ${reason}`,
    },
  }) + '\n');
  process.stderr.write(`[great_cto:frozen-gates] BLOCKED — ${reason}\n`);
  return process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
