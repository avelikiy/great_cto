/**
 * session-status — which sessions in this project are waiting for a person.
 *
 * Nothing showed it. On the projects measured on 2026-09-21 the operator was the
 * approval loop (1,181 "делай" in 5,126 messages), and the board could not say
 * which session was sitting on a permission prompt or had finished its turn and
 * was waiting for an answer. Idea from fynnfluegge/agtx (Apache-2.0), which drives
 * its board from the same hook events; the code here is written for this project.
 *
 * Three hook events write one small file per session, `.great_cto/status/<id>.json`:
 *
 *   Notification      → blocked  (a permission prompt, or idle waiting for input;
 *                                 the notification's own message is the reason)
 *   Stop              → waiting  (the turn ended; the next move is the operator's)
 *   UserPromptSubmit  → working
 *   SessionEnd        → the file is removed
 *
 * A hook only fires on the transitions it is told about, so a state can go stale:
 * a permission granted fires no event. The reader therefore checks the session's
 * transcript — if it was written after the blocked/waiting moment, the session has
 * moved on and is reported as working. A `working` with a silent transcript for
 * five minutes is `unknown`, not working (agtx uses the same bound).
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from './project-root.mjs';

export const STALE_WORKING_MS = 5 * 60 * 1000;
export const MOVED_ON_SLACK_MS = 2000;
export const DROP_AFTER_MS = 24 * 60 * 60 * 1000;

const EVENT_STATE = { Notification: 'blocked', Stop: 'waiting', UserPromptSubmit: 'working' };

const safeId = (id) => String(id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);

/** Apply one hook payload. Returns what was written, or null when nothing applies. */
export function recordHookEvent(payload, { now = Date.now() } = {}) {
  // The session's cwd wanders into subdirectories; state belongs at the project root.
  const cwd = projectRoot(payload?.cwd || process.cwd());
  const id = safeId(payload?.session_id);
  if (!id) return null;
  const dir = join(cwd, '.great_cto', 'status');
  const file = join(dir, `${id}.json`);
  const event = payload?.hook_event_name;
  if (event === 'SessionEnd') { rmSync(file, { force: true }); return { removed: true }; }
  const state = EVENT_STATE[event];
  if (!state) return null;
  try { statSync(join(cwd, '.great_cto')); } catch { return null; } // not a great_cto project
  const rec = {
    session: id,
    state,
    since: new Date(now).toISOString(),
    transcript: payload.transcript_path || null,
  };
  if (state === 'blocked') {
    rec.reason = String(payload.message || 'waiting for you').slice(0, 300);
    if (payload.notification_type) rec.kind = String(payload.notification_type).slice(0, 40);
  }
  mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(rec));
  renameSync(tmp, file);
  return rec;
}

/**
 * The effective state of every session with a status file.
 * @returns {{session:string, state:'blocked'|'waiting'|'working'|'unknown', reason?:string, kind?:string, since:string}[]}
 */
export function readSessionStatus(projectDir, { now = Date.now() } = {}) {
  const dir = join(projectDir, '.great_cto', 'status');
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const f of files) {
    let rec;
    try { rec = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
    const since = Date.parse(rec.since);
    if (!Number.isFinite(since) || now - since > DROP_AFTER_MS) continue;
    let moved = null;
    if (rec.transcript) {
      try { moved = statSync(rec.transcript).mtimeMs; } catch { moved = null; }
    }
    let state = rec.state;
    if ((state === 'blocked' || state === 'waiting') && moved !== null && moved > since + MOVED_ON_SLACK_MS) state = 'working';
    if (state === 'working' && now - Math.max(since, moved || 0) > STALE_WORKING_MS) state = 'unknown';
    const row = { session: rec.session, state, since: rec.since };
    if (state === 'blocked') { row.reason = rec.reason; if (rec.kind) row.kind = rec.kind; }
    out.push(row);
  }
  const rank = { blocked: 0, waiting: 1, working: 2, unknown: 3 };
  return out.sort((a, b) => rank[a.state] - rank[b.state] || (a.since < b.since ? -1 : 1));
}
