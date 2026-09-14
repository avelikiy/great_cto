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

import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
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
    if (size > 0 && size + line.length > maxBytes) renameSync(file, join(dir, 'events.1.jsonl'));
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
  const events = [];
  let bad = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { bad++; continue; }
    if (rec && EVENT_KINDS.includes(rec.kind)) events.push(rec); else bad++;
  }
  return { state: 'live', events: events.slice(-Math.max(1, limit)), bad };
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
