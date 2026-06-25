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

const GATE_DIR = 'docs/gates/';

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
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
  const filePath = filePathFrom(raw);
  if (!filePath) return process.exit(0);

  const exists = existsSync(isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath));
  if (!isFrozenGateEdit(filePath, exists)) return process.exit(0);

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
