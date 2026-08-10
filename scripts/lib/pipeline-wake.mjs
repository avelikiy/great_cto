// An approval is evidence that work is waiting. Record it where the next
// session will look.
//
// The hole
// --------
// `session-pipeline-resume` opens with a cheap freshness question: if the newest
// verdict is more than a day old, the pipeline is "history, not work waiting",
// and the hook returns before reading a single gate. That is the right default
// for the case it was written for — most sessions start on a project with
// nothing in flight, and reading gate state costs half a second of shelling out
// to `bd`.
//
// But it answers the wrong question when a gate is approved late. Approve
// `gate:arch` on a stage that ran three days ago and the strongest possible
// evidence that the pipeline is waiting — a human just said "go" — is the one
// thing the hook never consults. It stats the verdict logs, sees three days,
// and calls the whole thing history.
//
// So the board records the approval as a fact when it happens, and the hook
// treats that fact as the freshness signal it is.
//
// What this does NOT do
// ---------------------
// It does not decide anything. `tickDecision` still runs with every refusal it
// has: only `ready-to-dispatch` moves, `devops` and `infra-provisioner` are
// never dispatched unattended whatever the gates say (ADR-009), the same
// transition is never dispatched twice, and the minimum interval still applies.
// A wake only says "look properly, the freshness shortcut does not apply here".
//
// It also does not spawn anything. The board cannot — this repository's own
// `orchestrator-check` hook treats `claude -p` from a tool as an anti-pattern
// and blocks it. What this removes is the second DECISION, not the second
// action: you approve, and the next session already knows what it is for.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

/**
 * How long an approval stays a reason to look.
 *
 * Long enough that approving on Friday still works on Monday; short enough that
 * an approval nobody acted on in a fortnight stops re-announcing itself. A wake
 * that never expires becomes a permanent "there is work waiting" that stops
 * meaning anything.
 */
export const WAKE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const FILE = '.pipeline-wake';

function wakePath(cwd, projDir = '.great_cto') {
  return path.join(cwd, projDir, FILE);
}

/**
 * Record that a human approved a gate.
 *
 * Best-effort by design: a board that cannot write this must still complete the
 * approval. The approval is the decision; this is only a note about where to
 * look for its consequence.
 *
 * @returns {{ok: boolean, why?: string, wake?: object}}
 */
export function recordWake(cwd, { gate, id, at = Date.now(), by = 'board' } = {}) {
  const wake = { gate: gate || null, id: id || null, at, by };
  try {
    mkdirSync(path.join(cwd, '.great_cto'), { recursive: true });
    writeFileSync(wakePath(cwd), `${JSON.stringify(wake)}\n`);
    return { ok: true, wake };
  } catch (e) {
    return { ok: false, why: String(e?.message || e) };
  }
}

/**
 * The pending approval, or why there is none.
 *
 * Returns a reason rather than null-for-everything: "no approval recorded",
 * "the record is unreadable" and "the approval is three weeks old" are three
 * different states, and a caller that collapses them is the defect this
 * repository keeps removing.
 */
export function readWake(cwd, { now = Date.now(), ttlMs = WAKE_TTL_MS } = {}) {
  let raw;
  try {
    raw = readFileSync(wakePath(cwd), 'utf8');
  } catch {
    return { pending: false, why: 'no approval recorded' };
  }
  let wake;
  try {
    wake = JSON.parse(raw.trim());
  } catch {
    return { pending: false, why: 'the approval record could not be parsed', unreadable: true };
  }
  if (!wake || typeof wake.at !== 'number' || !Number.isFinite(wake.at)) {
    return { pending: false, why: 'the approval record has no usable timestamp', unreadable: true };
  }
  const age = now - wake.at;
  if (age > ttlMs) {
    return { pending: false, why: `the approval is ${Math.round(age / 86400_000)} days old — past the ${Math.round(ttlMs / 86400_000)}-day window`, wake, expired: true };
  }
  if (age < 0) {
    // A clock that moved backwards, or a file written by another machine. Treat
    // it as pending rather than discarding a human's decision over arithmetic.
    return { pending: true, wake, age: 0, why: 'approval recorded in the future — honouring it anyway' };
  }
  return { pending: true, wake, age, why: `approved ${Math.round(age / 60_000)} minute(s) ago` };
}

/**
 * Consume the approval.
 *
 * Called once the decision has been handed to a session, so the same approval
 * does not re-announce itself at every session start for a week. Failure to
 * clear is not fatal — `tickDecision`'s own marker still refuses to dispatch the
 * same transition twice.
 */
export function clearWake(cwd) {
  try { rmSync(wakePath(cwd), { force: true }); return true; } catch { return false; }
}
