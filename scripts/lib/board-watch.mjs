#!/usr/bin/env node
/**
 * board-watch — wait until something in this project needs the caller, then say
 * what. One blocking call instead of a polling loop.
 *
 * Why this exists
 * ---------------
 * An orchestrator waiting on parallel work (coordinator, codex-host) has no way to
 * wait: it sleeps, lists, sleeps, lists, and every round trip is a turn. On the
 * projects measured on 2026-09-21, 69 agent runs ended at their turn cap.
 * fynnfluegge/agtx (Apache-2.0) counted the same cost in one 14-task run — 73
 * sleeps and 96 listings — and replaced it with `wait_for_board_change`: block,
 * and return only the changes that need the caller. Written here, from files the
 * project already has, so it needs no board process:
 *
 *   verdict   an agent wrote a new verdict (its value and kind: negative first)
 *   blocked   a session stopped on a permission prompt or an unanswered wait
 *
 * The cursor is the snapshot the caller last saw, so a change that happens between
 * two calls is never missed: pass back the `cursor` from the previous answer.
 *
 * Usage:
 *   node scripts/lib/board-watch.mjs [--since <cursor>] [--timeout 300] [--cwd DIR]
 *   → one JSON line: { cursor, changes: [...], timedOut }
 *   With no --since it answers at once with the current cursor and nothing else.
 */
import { fileURLToPath } from 'node:url';
import { latestVerdicts } from './ship-evidence.mjs';
import { readSessionStatus } from './session-status.mjs';

export const MAX_TIMEOUT_S = 600;

/** What the caller could need to react to, reduced to comparable keys. */
export function snapshot(cwd, { now = Date.now() } = {}) {
  const verdicts = {};
  for (const [agent, v] of latestVerdicts(cwd)) verdicts[agent] = { verdict: v.verdict, ts: v.ts, kind: v.kind };
  const blocked = {};
  for (const s of readSessionStatus(cwd, { now })) {
    if (s.state === 'blocked') blocked[s.session] = { since: s.since, reason: s.reason || '' };
  }
  return { verdicts, blocked };
}

/** Changes from `prev` to `next` that need the caller, most urgent first. */
export function diffSnapshots(prev, next) {
  const out = [];
  for (const [agent, v] of Object.entries(next.verdicts || {})) {
    const p = prev.verdicts?.[agent];
    if (!p || p.ts !== v.ts || p.verdict !== v.verdict) out.push({ type: 'verdict', agent, verdict: v.verdict, kind: v.kind, ts: v.ts });
  }
  for (const [session, b] of Object.entries(next.blocked || {})) {
    const p = prev.blocked?.[session];
    if (!p || p.since !== b.since) out.push({ type: 'blocked', session, reason: b.reason, since: b.since });
  }
  const rank = (c) => (c.type === 'blocked' ? 0 : c.kind === 'negative' ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b));
}

export const encodeCursor = (snap) => Buffer.from(JSON.stringify(snap)).toString('base64url');
export function decodeCursor(c) {
  try { return JSON.parse(Buffer.from(String(c), 'base64url').toString('utf8')); } catch { return null; }
}

/**
 * Block until a change needs the caller, or the timeout passes.
 * @returns {Promise<{cursor:string, changes:object[], timedOut:boolean, note?:string}>}
 */
export async function waitForChange({ cwd = process.cwd(), since = null, timeoutS = 300, pollMs = 2000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const first = snapshot(cwd);
  const prev = since ? decodeCursor(since) : null;
  if (!prev) {
    return { cursor: encodeCursor(first), changes: [], timedOut: false, note: since ? 'unreadable cursor — here is a fresh one' : 'first call — pass this cursor back to wait' };
  }
  const deadline = Date.now() + Math.min(MAX_TIMEOUT_S, Math.max(1, timeoutS)) * 1000;
  let snap = first;
  for (;;) {
    const changes = diffSnapshots(prev, snap);
    if (changes.length) return { cursor: encodeCursor(snap), changes, timedOut: false };
    if (Date.now() >= deadline) return { cursor: encodeCursor(snap), changes: [], timedOut: true };
    await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())));
    snap = snapshot(cwd);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const r = await waitForChange({ cwd: opt('--cwd', process.cwd()), since: opt('--since', null), timeoutS: Number(opt('--timeout', 300)) });
  process.stdout.write(`${JSON.stringify(r)}\n`);
}
