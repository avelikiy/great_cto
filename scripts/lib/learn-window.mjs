/**
 * learn-window — run the session learner on a long session in windows.
 *
 * The SessionEnd learner reads the last 8 MB of the transcript. On 2026-10-01
 * that was 3% of a 270 MB session, and it added no lesson from a day that had
 * several. With `learn_every_n` set, every N main-session tool calls start the
 * learner on the part of the transcript written since the previous window, and
 * SessionEnd reads only what no window has read. Idea from autoharness, which
 * triggers reflection on work done (tool calls) rather than on session end.
 *
 * OFF by default: each window is a paid learner run (capped by run-learner's
 * budget, $0.5). On only when auto-learn is on AND learn_every_n > 0, from
 * GREAT_CTO_LEARN_EVERY_N or "learn_every_n" in ~/.great_cto/config.json.
 *
 * Called from loop-detector (already a PostToolUse hook on every call) so it
 * adds no process per tool call. Subagent calls are not counted. State is one
 * small JSON file per session in the OS temp dir: {calls, offset, busyUntil}.
 * Never throws; a failure here must not affect a tool call.
 */
import { readFileSync, writeFileSync, renameSync, statSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { autoLearnEnabled } from './learn-worth-it.mjs';

const BUSY_MS = 15 * 60_000;   // a learner run times out at 5 minutes; leave room

export function learnEvery({ env = process.env, home = homedir() } = {}) {
  if (env.GREAT_CTO_LEARN_EVERY_N !== undefined) return Math.max(0, Number(env.GREAT_CTO_LEARN_EVERY_N) || 0);
  try { return Math.max(0, Number(JSON.parse(readFileSync(join(home, '.great_cto', 'config.json'), 'utf8')).learn_every_n) || 0); } catch { return 0; }
}

const clean = (s) => String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
const statePath = (sid, stateDir = tmpdir()) => join(stateDir, `great_cto-learn-window-${clean(sid)}.json`);

function load(sid, stateDir) {
  try { return JSON.parse(readFileSync(statePath(sid, stateDir), 'utf8')); } catch { return { calls: 0, offset: 0, busyUntil: 0 }; }
}
function save(sid, stateDir, state) {
  const p = statePath(sid, stateDir);
  writeFileSync(`${p}.tmp`, JSON.stringify(state));
  renameSync(`${p}.tmp`, p);
}

/** Where SessionEnd's read should start: the end of the last window, or 0. */
export function windowStart(sid, { stateDir = tmpdir() } = {}) {
  return Number(load(sid, stateDir).offset) || 0;
}

/** Drop a session's window state (SessionEnd, after reading windowStart). */
export function forget(sid, { stateDir = tmpdir() } = {}) {
  try { rmSync(statePath(sid, stateDir), { force: true }); } catch { /* nothing to forget */ }
}

function defaultSpawn({ cwd, transcript, fromOffset }) {
  const runner = join(dirname(fileURLToPath(import.meta.url)), 'run-learner.mjs');
  const child = nodeSpawn(process.execPath, [runner, JSON.stringify({ cwd, transcript, reason: 'window', fromOffset })],
    { detached: true, stdio: 'ignore', cwd });
  child.unref();
}

/**
 * Count one tool call; start a window when N have passed.
 * @returns {{action: 'off'|'subagent'|'count'|'busy'|'spawn'|'error'}}
 */
export function tick(payload, { cwd = process.cwd(), stateDir = tmpdir(), home = homedir(), env = process.env,
  now = Date.now(), spawn = defaultSpawn } = {}) {
  try {
    if (env.GREAT_CTO_DISABLE_SESSION_LEARNING === '1') return { action: 'off' };
    const every = learnEvery({ env, home });
    if (!every || !autoLearnEnabled(env, home)) return { action: 'off' };
    if (payload?.agent_id) return { action: 'subagent' };
    const sid = payload?.session_id;
    const transcript = payload?.transcript_path;
    if (!sid || !transcript) return { action: 'off' };
    const state = load(sid, stateDir);
    state.calls = (state.calls || 0) + 1;
    if (state.calls < every) { save(sid, stateDir, state); return { action: 'count' }; }
    if (now < (state.busyUntil || 0)) { save(sid, stateDir, state); return { action: 'busy' }; }
    const size = statSync(transcript).size;
    spawn({ cwd, transcript, fromOffset: state.offset || 0 });
    save(sid, stateDir, { calls: 0, offset: size, busyUntil: now + BUSY_MS });
    return { action: 'spawn' };
  } catch {
    return { action: 'error' };
  }
}
