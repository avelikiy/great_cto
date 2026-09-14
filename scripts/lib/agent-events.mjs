#!/usr/bin/env node
// agent-events — what agents are doing, recorded as it happens (ADR-021, phase 1).
//
// The board showed outcomes after the fact. On 2026-09-14 a live pipeline run
// stopped after its first stage and nothing said so: the only record was a
// journal line, found by reading the file by hand. The hooks the plugin already
// runs now append one line per event to <project>/.great_cto/events.jsonl, and the
// board streams the file.
//
// Three rules, each one the reason this is a separate module rather than a
// appendFileSync in five hooks:
//
//   - An event carries FACTS, never content. Command text, file contents, prompts
//     and tool output can hold secrets; the transcript already has them for anyone
//     who needs them. `makeEvent` keeps an allowlist and types every value, so a
//     caller that passes the whole hook payload still records only facts.
//   - Recording never breaks a hook. Every failure comes back as `{ok:false, why}`.
//   - The reader reports which of three things it found. No file is `none` — not an
//     idle agent. A file it cannot read is `unreadable` — not zero events.
//
// Local only: the file stays in the project and nothing is sent anywhere.
// GREAT_CTO_DISABLE_EVENTS=1 turns recording off.
//
// CLI (for hooks written in shell):
//   node scripts/lib/agent-events.mjs --emit <kind> [--tool <name>] [--agent <name>]

import { appendFileSync, closeSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const EVENTS_FILE = 'events.jsonl';
export const EVENT_KINDS = Object.freeze(['agent-start', 'agent-stop', 'tool', 'denied', 'stop', 'pipeline']);
export const EVENT_FIELDS = Object.freeze(['v', 'ts', 'kind', 'session', 'agent', 'tool', 'paths', 'ok', 'duration_ms', 'outcome', 'verdict']);
export const MAX_BYTES = 5 * 1024 * 1024;

const MAX_PATHS = 10;
const short = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');

/**
 * One event, reduced to the allowed fields. Null for a kind that is not an event.
 * Values that are not the expected type are dropped, not coerced: a string "yes"
 * is not `ok: true`.
 */
export function makeEvent(input, { now = Date.now() } = {}) {
  if (!input || !EVENT_KINDS.includes(input.kind)) return null;
  const e = { v: 1, ts: iso(now), kind: input.kind };
  const session = short(input.session, 80); if (session) e.session = session;
  const agent = short(input.agent, 80); if (agent) e.agent = agent;
  const tool = short(input.tool, 80); if (tool) e.tool = tool;
  if (Array.isArray(input.paths)) {
    const paths = input.paths.filter((p) => typeof p === 'string' && p.trim()).map((p) => p.slice(0, 300)).slice(0, MAX_PATHS);
    if (paths.length) e.paths = paths;
  }
  if (typeof input.ok === 'boolean') e.ok = input.ok;
  if (Number.isFinite(input.duration_ms) && input.duration_ms >= 0) e.duration_ms = Math.round(input.duration_ms);
  if (typeof input.outcome === 'string' && /^[a-z][a-z-]{0,39}$/.test(input.outcome)) e.outcome = input.outcome;
  if (typeof input.verdict === 'string' && /^[A-Z][A-Z_-]{0,39}$/.test(input.verdict)) e.verdict = input.verdict;
  return e;
}

/**
 * Append one event to <dir>/events.jsonl. Never throws.
 *
 * @param {string} dir  the project's .great_cto directory
 * @returns {{ok:true} | {ok:false, why:string}}
 */
export function appendEvent(dir, input, { now = Date.now(), env = process.env, maxBytes = MAX_BYTES } = {}) {
  try {
    if (env.GREAT_CTO_DISABLE_EVENTS === '1') return { ok: false, why: 'disabled by GREAT_CTO_DISABLE_EVENTS=1' };
    const e = makeEvent(input, { now });
    if (!e) return { ok: false, why: `not an event kind: ${JSON.stringify(input?.kind)}` };
    const line = JSON.stringify(e) + '\n';
    mkdirSync(dir, { recursive: true });
    const file = join(dir, EVENTS_FILE);
    let size = 0;
    try { size = statSync(file).size; } catch { /* no file yet */ }
    // One previous generation: enough for the board to replay a restart, small
    // enough that a busy project cannot fill a disk with its own activity log.
    // Bytes, not characters: a path in Cyrillic is two bytes a letter, and the
    // board's replay cursor is a byte offset into this file.
    if (size > 0 && size + Buffer.byteLength(line) > maxBytes) renameSync(file, join(dir, 'events.1.jsonl'));
    appendFileSync(file, line);
    return { ok: true };
  } catch (err) {
    return { ok: false, why: String(err?.code || err?.message || err) };
  }
}

/**
 * The newest events, oldest first.
 *
 * @returns {{state:'live'|'none'|'unreadable', events:object[], bad?:number, why?:string}}
 */
export function readEvents(dir, { limit = 50 } = {}) {
  let text;
  try {
    text = readFileSync(join(dir, EVENTS_FILE), 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return { state: 'none', events: [] };
    return { state: 'unreadable', events: [], why: String(err?.code || err?.message || err) };
  }
  const { events, bad } = parseLines(text);
  return { state: 'live', events: events.slice(-Math.max(1, limit)), bad };
}

/** Events and the count of lines that were not one. Shared, so both readers agree. */
function parseLines(text) {
  const events = [];
  let bad = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { bad++; continue; }
    if (rec && EVENT_KINDS.includes(rec.kind)) events.push(rec); else bad++;
  }
  return { events, bad };
}

// ── resuming (ADR-021 phase 2, great_cto-c0hb) ─────────────────────────────

/** The most events one replay sends before it gives up and sends a snapshot. */
export const MAX_DELTA = 500;

function parseCursor(cursor) {
  const m = /^(\d+)-(\d+)$/.exec(String(cursor ?? ''));
  return m ? { ino: Number(m[1]), offset: Number(m[2]) } : null;
}

/**
 * Events after a cursor, or a snapshot when the cursor no longer points into this file.
 *
 * The cursor is `<inode>-<byte offset>`: the offset just past the last complete line
 * consumed. A snapshot — never a read from the wrong place — when there is no cursor,
 * it is not one of ours, the inode differs (the file rotated or was replaced), the
 * file is shorter than the offset (truncated), the offset does not sit just after a
 * newline (truncated and grown back past it), or the gap holds more than maxDelta
 * events (then `gap: true`, so the board can say events were skipped).
 *
 * Not caught: a file truncated and regrown so that a newline lands exactly on the old
 * offset. Same inode, a plausible boundary — indistinguishable from a real resume.
 * Nothing in the plugin truncates this file; rotation renames it.
 *
 * @returns {{state:'live'|'none'|'unreadable', mode?:'delta'|'snapshot', events:object[],
 *            cursor:string|null, bad?:number, gap?:boolean, why?:string}}
 */
export function readEventsSince(dir, cursor, { limit = 50, maxDelta = MAX_DELTA } = {}) {
  let buf, ino;
  try {
    const fd = openSync(join(dir, EVENTS_FILE), 'r');
    try {
      const st = fstatSync(fd);
      ino = st.ino;
      buf = Buffer.alloc(st.size);
      let read = 0;
      while (read < st.size) {
        const n = readSync(fd, buf, read, st.size - read, read);
        if (n === 0) break;
        read += n;
      }
      buf = buf.subarray(0, read);
    } finally { closeSync(fd); }
  } catch (err) {
    if (err?.code === 'ENOENT') return { state: 'none', events: [], cursor: null };
    return { state: 'unreadable', events: [], cursor: null, why: String(err?.code || err?.message || err) };
  }
  // Only complete lines: a hook may be mid-append.
  const end = buf.lastIndexOf(0x0a) + 1;
  const next = `${ino}-${end}`;
  const snapshot = (extra = {}) => {
    const { events, bad } = parseLines(buf.subarray(0, end).toString('utf8'));
    return { state: 'live', mode: 'snapshot', events: events.slice(-Math.max(1, limit)), cursor: next, bad, ...extra };
  };
  const c = parseCursor(cursor);
  if (!c || c.ino !== ino || c.offset > end || (c.offset > 0 && buf[c.offset - 1] !== 0x0a)) return snapshot();
  const { events, bad } = parseLines(buf.subarray(c.offset, end).toString('utf8'));
  if (events.length > maxDelta) return snapshot({ gap: true });
  return { state: 'live', mode: 'delta', events, cursor: next, bad };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const argv = process.argv.slice(2);
    const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
    if (argv.includes('--emit')) {
      appendEvent(process.env.GREAT_CTO_DIR || '.great_cto', {
        kind: arg('--emit'), tool: arg('--tool'), agent: arg('--agent'), session: arg('--session'),
      });
    }
  } catch { /* a hook must never fail because an event could not be recorded */ }
  process.exit(0);
}
