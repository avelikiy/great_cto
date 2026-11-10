/**
 * The three alerts that speak at once (owner-approved design v16):
 *
 *   agent.blocked   — a session is sitting on a permission prompt or waiting for
 *                     input (state written by the Notification hook through
 *                     scripts/lib/session-status.mjs);
 *   gate.local_red  — a ci-local run finished with failures (one line per run in
 *                     <project>/.great_cto/gate-runs.jsonl, written by
 *                     scripts/lib/gate-run-record.mjs);
 *   gate.waiting    — a gate opened and is waiting for the operator, reported
 *                     when it opens instead of after gate.stale's 2 hours.
 *
 * These functions only DECIDE what to send; alerts.mjs sends it. Each event
 * carries a dedupe key that names one instance, so a 1-minute sweep reports an
 * instance once.
 *
 * Fresh-only on purpose: a board that starts, or a trigger that is switched on,
 * must not replay a backlog. Older gates are gate.stale's job; older runs and
 * older blocked sessions are history.
 */
import fs from 'node:fs';
import path from 'node:path';

/** gate.waiting covers the gap before gate.stale's 2-hour floor. */
export const GATE_WAITING_WINDOW_MS = 2 * 3600_000;
/** A red run older than this is history, not news. */
export const GATE_RUN_WINDOW_MS = 24 * 3600_000;
/** A blocked state older than this is the session-status DROP horizon anyway. */
export const BLOCKED_WINDOW_MS = 24 * 3600_000;

export const INSTANT_TRIGGERS = Object.freeze(['agent.blocked', 'gate.local_red', 'gate.waiting']);

const boardLink = (slug, task) =>
  `http://localhost:3141/?project=${encodeURIComponent(slug)}${task ? `&task=${encodeURIComponent(task)}` : ''}#inbox`;

/**
 * @param {string} slug
 * @param {{session:string,state:string,reason?:string,since:string}[]} sessions readSessionStatus() rows
 */
export function blockedAgentEvents(slug, sessions, { now = Date.now() } = {}) {
  if (!Array.isArray(sessions)) return [];
  const out = [];
  for (const s of sessions) {
    if (!s || s.state !== 'blocked' || !s.session) continue;
    // idle_prompt is Claude Code's reminder that a finished turn is still
    // unanswered — it follows every turn. That is a session done, not an agent
    // stuck; alerting on it would page the operator after every reply.
    if (s.kind === 'idle_prompt') continue;
    const since = Date.parse(s.since);
    if (!Number.isFinite(since) || now - since > BLOCKED_WINDOW_MS) continue;
    const reason = String(s.reason || 'waiting for your input').slice(0, 160);
    out.push({
      event: 'agent.blocked',
      dedupeKey: `agent.blocked:${slug}:${s.session}:${s.since}`,
      payload: {
        title: `An agent is blocked — ${slug}`,
        body: `${slug} · ${reason}\n\nOpens the board. Nothing is approved from a notification.`,
        level: 'warning',
        project: slug,
        link: boardLink(slug),
        action: 'Open in board',
        kv: { session: String(s.session).slice(0, 12), since: s.since, reason },
      },
    });
  }
  return out;
}

/**
 * @param {string} slug
 * @param {object[]|null} runs readGateRuns() records
 */
export function redGateRunEvents(slug, runs, { now = Date.now() } = {}) {
  if (!Array.isArray(runs)) return [];
  const out = [];
  for (const r of runs) {
    if (!r || r.result !== 'red' || !r.ts) continue;
    const ts = Date.parse(r.ts);
    if (!Number.isFinite(ts) || now - ts > GATE_RUN_WINDOW_MS) continue;
    const failed = Array.isArray(r.failed) ? r.failed.map(String).slice(0, 8) : [];
    const where = [r.branch, r.sha].filter(Boolean).join(' @ ') || 'unknown commit';
    out.push({
      event: 'gate.local_red',
      dedupeKey: `gate.local_red:${slug}:${r.ts}:${r.sha || ''}`,
      payload: {
        title: `Local gate red — ${slug} · ${where}`,
        body: `A ci-local run finished with failures.\n\n${failed.length ? `Failed steps:\n- ${failed.join('\n- ')}` : 'Failed steps were not recorded.'}`,
        level: 'error',
        project: slug,
        link: boardLink(slug),
        action: 'Open in board',
        kv: { branch: r.branch || 'unknown', sha: r.sha || 'unknown', failed: failed.length ? failed.join(', ') : 'not recorded', ts: r.ts },
      },
    });
  }
  return out;
}

/**
 * @param {string} slug
 * @param {object[]|null} tasks getTasks() rows
 */
export function waitingGateEvents(slug, tasks, { now = Date.now() } = {}) {
  if (!Array.isArray(tasks)) return [];
  const out = [];
  for (const t of tasks) {
    if (!t || !t.is_gate || !t.id) continue;
    const status = String(t.raw_status || t.status || '').toLowerCase();
    if (status === 'closed' || status === 'done') continue;
    const created = Date.parse(t.created_at || t.updated_at || 0);
    if (!Number.isFinite(created) || now - created > GATE_WAITING_WINDOW_MS) continue;
    const title = String(t.title || t.id).slice(0, 80);
    out.push({
      event: 'gate.waiting',
      dedupeKey: `gate.waiting:${slug}:${t.id}`,
      payload: {
        title: `Gate waiting — ${title} (${slug})`,
        body: `A gate opened and is waiting for your decision. Nothing downstream of it moves until you decide.\n\nGate: ${t.id}\nProject: ${slug}`,
        level: 'warning',
        project: slug,
        link: boardLink(slug, t.id),
        action: 'Review in board',
        kv: { gate: t.id, opened: new Date(created).toISOString().slice(0, 16) },
      },
    });
  }
  return out;
}

/**
 * Which instant triggers the operator switched on, from ~/.great_cto/notifications.json.
 * These triggers are opt-in on EVERY channel (email, push, the in-app list):
 * unlike the five older ones they can fire many times a day, and a channel
 * that pages for what nobody asked for gets switched off.
 */
export function selectedInstantTriggers(greatCtoDir) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(greatCtoDir, 'notifications.json'), 'utf8'));
    return new Set((s.triggers || []).filter((t) => INSTANT_TRIGGERS.includes(t)));
  } catch { return new Set(); } // display-only: no settings file = nothing switched on; nothing is written from this
}

/**
 * The project's ci-local run log. `null` when it exists and cannot be read —
 * a failed read is never an empty history. A missing file is [] (no runs yet).
 * Malformed lines are skipped: one bad line must not hide the rest.
 */
export function readGateRuns(projectDir) {
  const file = path.join(projectDir, '.great_cto', 'gate-runs.jsonl');
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch (e) { return e.code === 'ENOENT' ? [] : null; }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r && typeof r === 'object') out.push(r); } catch { /* skip */ }
  }
  return out;
}
