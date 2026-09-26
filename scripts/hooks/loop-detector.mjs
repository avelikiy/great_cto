#!/usr/bin/env node
/**
 * loop-detector — PostToolUse hook (all tools) that notices an agent going in
 * circles and says so, once.
 *
 * An agent stuck on a problem tends to do one of two things: run the same call
 * again expecting a different answer, or keep editing one file while the tests
 * stay red. Neither is visible from inside a single turn. This hook keeps a
 * short memory of the session's calls and injects a one-line nudge when it
 * sees either pattern:
 *
 *   repeat — the same (tool, normalised input) 5 times within the last 12
 *            calls, with no edit to anything else in between (a test re-run
 *            after an edit is progress, not a loop).
 *   churn  — the same file edited 8 times within the last 30 calls, with at
 *            least 3 failing test runs between those edits.
 *
 * Each signal fires at most once per session per key. The hook never blocks:
 * it always exits 0, prints nothing when nothing fires, and fails open on any
 * error. Idea from ECC's metrics-bridge + context-monitor pair; this is one
 * file with its own state.
 *
 * State: <os tmpdir>/great_cto-loop-<session>[-<agent_id>].json — the last 30
 * calls (tool + short hash, never the command text) and the keys already fired.
 * Local only; nothing leaves the machine.
 *
 * I/O (Claude Code PostToolUse):
 *   stdin:  { session_id, agent_id?, tool_name, tool_input, tool_response, … }
 *   stdout: silent, or {"hookSpecificOutput":{"hookEventName":"PostToolUse",
 *            "additionalContext":"<notice ≤200 chars>"}}
 *   exit:   always 0
 *
 * Opt out: GREAT_CTO_DISABLE_LOOP_DETECTOR=1
 */

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_ENTRIES = 30;
export const NOTICE_MAX = 200;
const REPEAT_WINDOW = 12;
const REPEAT_MIN = 5;
const CHURN_MIN_EDITS = 8;
const CHURN_MIN_FAILS = 3;
const MAX_FIRED = 50;

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
// Polling a background job with the same input is the job's contract, not a loop.
const IGNORED_TOOLS = new Set(['BashOutput', 'TaskOutput', 'TaskGet', 'TaskList', 'Monitor']);

const TEST_FAILURE = [
  /^# fail [1-9]/m,        // node:test / TAP summary
  /^not ok \d+/m,          // TAP
  /\bFAILED\b/,            // pytest, cargo, go
  /✗|✘/,                   // mocha, bats, vitest reporters
  /\b[1-9]\d* failed\b/,   // jest, vitest, pytest summaries
  /^--- FAIL:/m,           // go test
];

const h = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 12);

function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Stable short hash of the parts of a tool call that decide its result. */
export function callKey(tool, input = {}) {
  const inp = input && typeof input === 'object' ? input : {};
  let basis;
  switch (tool) {
    case 'Bash':
      basis = String(inp.command ?? '').replace(/\s+/g, ' ').trim();
      break;
    case 'Read':
      basis = `${inp.file_path ?? ''}#${inp.offset ?? 0}`;
      break;
    case 'Edit':
      basis = `${inp.file_path ?? ''}#${h(inp.old_string ?? '')}`;
      break;
    case 'Write':
      basis = `${inp.file_path ?? ''}#${h(inp.content ?? '')}`;
      break;
    case 'MultiEdit':
      basis = `${inp.file_path ?? ''}#${h(stable(inp.edits ?? []))}`;
      break;
    default:
      basis = stable(inp);
  }
  return h(`${tool}\0${basis}`);
}

function responseText(resp) {
  if (resp == null) return '';
  if (typeof resp === 'string') return resp;
  if (typeof resp === 'object') {
    const parts = [resp.stdout, resp.stderr, resp.output].filter((x) => typeof x === 'string');
    return parts.length ? parts.join('\n') : JSON.stringify(resp);
  }
  return String(resp);
}

/** True when a tool response carries a test-runner failure marker. */
export function isTestFailure(resp) {
  const text = responseText(resp).slice(-20000); // runners print the summary last
  return TEST_FAILURE.some((re) => re.test(text));
}

function freshState() {
  return { v: 1, calls: [], fired: [] };
}

/** Pure: returns a new state with this PostToolUse payload appended (bounded). */
export function recordCall(state, payload = {}) {
  const s = state && Array.isArray(state.calls) && Array.isArray(state.fired)
    ? { v: 1, calls: [...state.calls], fired: [...state.fired] }
    : freshState();
  const tool = String(payload.tool_name || '');
  if (!tool || IGNORED_TOOLS.has(tool)) return s;
  const input = payload.tool_input || {};
  const entry = { t: tool, k: callKey(tool, input) };
  if (EDIT_TOOLS.has(tool)) {
    const fp = input.file_path || input.notebook_path;
    if (typeof fp === 'string' && fp) entry.f = fp.slice(-160);
  }
  if (tool === 'Bash' && isTestFailure(payload.tool_response)) entry.x = 1;
  s.calls.push(entry);
  if (s.calls.length > MAX_ENTRIES) s.calls = s.calls.slice(-MAX_ENTRIES);
  if (s.fired.length > MAX_FIRED) s.fired = s.fired.slice(-MAX_FIRED);
  return s;
}

function clip(text) {
  return text.length <= NOTICE_MAX ? text : `${text.slice(0, NOTICE_MAX - 1)}…`;
}

function baseName(fp) {
  const b = fp.split(/[\\/]/).pop() || fp;
  return b.length > 40 ? `…${b.slice(-39)}` : b;
}

function repeatSignal(calls) {
  if (!calls.length) return null;
  const last = calls[calls.length - 1];
  const window = calls.slice(-REPEAT_WINDOW);
  // Count back to the last edit of something else: after it the world changed.
  let n = 0;
  for (let i = window.length - 1; i >= 0; i--) {
    const c = window[i];
    if (c.k === last.k) n++;
    else if (EDIT_TOOLS.has(c.t)) break;
  }
  if (n < REPEAT_MIN) return null;
  return {
    kind: 'repeat',
    key: `repeat:${last.k}`,
    text: clip(`LOOP: ${last.t.slice(0, 30)} ran ${n}× with the same input in the last ${REPEAT_WINDOW} calls — the result will not change. ` +
      'Change approach, or report BLOCKED (done-blocked).'),
  };
}

function churnSignal(calls) {
  const last = calls[calls.length - 1];
  if (!last || !last.f) return null;
  const idx = calls.map((c, i) => (c.f === last.f ? i : -1)).filter((i) => i >= 0);
  if (idx.length < CHURN_MIN_EDITS) return null;
  const between = calls.slice(idx[0] + 1, idx[idx.length - 1]);
  if (between.filter((c) => c.x).length < CHURN_MIN_FAILS) return null;
  return {
    kind: 'churn',
    key: `churn:${h(last.f)}`,
    text: clip(`EDIT CHURN: ${baseName(last.f)} edited ${idx.length}× while tests keep failing. ` +
      'Step back: re-read the failing assertion and write down your hypothesis before the next edit.'),
  };
}

/** Pure: the first signal the latest call completes that has not fired yet, or null. */
export function detect(state) {
  if (!state || !Array.isArray(state.calls)) return null;
  const fired = new Set(state.fired || []);
  for (const sig of [churnSignal(state.calls), repeatSignal(state.calls)]) {
    if (sig && !fired.has(sig.key)) return sig;
  }
  return null;
}

function statePath(payload) {
  const clean = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  const sid = clean(payload.session_id || '');
  if (!sid) return null;
  const agent = payload.agent_id ? clean(payload.agent_id) : '';
  return join(tmpdir(), `great_cto-loop-${sid}${agent ? `-${agent}` : ''}.json`);
}

function main() {
  if (process.env.GREAT_CTO_DISABLE_LOOP_DETECTOR === '1') return;
  let payload;
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { return; }
  if (!payload || typeof payload !== 'object') return;
  const file = statePath(payload);
  if (!file) return;

  let prev = null;
  try { prev = JSON.parse(readFileSync(file, 'utf8')); } catch { /* fresh session */ }
  const state = recordCall(prev, payload);
  const hit = detect(state);
  if (hit) state.fired.push(hit.key);

  try {
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, file);
  } catch { /* state is a convenience; the notice still goes out */ }

  if (hit) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: hit.text },
    }));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main(); } catch { /* fail open */ }
  process.exitCode = 0;
}
