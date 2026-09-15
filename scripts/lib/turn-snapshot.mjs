#!/usr/bin/env node
// turn-snapshot — what each agent turn changed, kept as a git ref (ADR-023, step 1).
//
// A receipt (receipt.mjs) answers "is this the tree that was reviewed?". It cannot
// say which turn introduced a change, or what to look at to see it. A turn snapshot
// is a commit under refs/great-cto/turns/<session>/<n>, whose parent is the previous
// turn (or HEAD for the first), so `git diff <n-1> <n>` is exactly that turn.
//
// Measured before writing it (ADR-023): built through a TEMPORARY index, a snapshot
// leaves the user's index and working tree untouched; `add -A` records new files
// (`git stash create` does not); gitignored files and the activity logs stay out;
// the refs do not travel on a default push or a clone — a mirror push would carry
// them, and the pre-push hook refuses that. About 300 ms on 1,543 files, so it runs
// once per turn in an async hook, never per tool call.
//
// Never throws. States: recorded · none (not a git repository) · refused (a session
// name that could leave its namespace) · disabled (GREAT_CTO_DISABLE_TURNS=1) ·
// failed (git refused, with the reason).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ACTIVITY_LOGS } from './receipt.mjs';

export const TURN_REF_PREFIX = 'refs/great-cto/turns/';
const SESSION = /^[A-Za-z0-9_-]{1,80}$/;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const ZERO_OID = '0000000000000000000000000000000000000000';

function git(cwd, args, { env = null, input = null } = {}) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    ...(input == null ? {} : { input }),
    ...(env ? { env: { ...process.env, ...env } } : {}),
  });
}
const tryGit = (cwd, args, opts) => { try { return git(cwd, args, opts); } catch { return null; } };

function checkSession(session) {
  return typeof session === 'string' && SESSION.test(session);
}

/** @returns {{turn:number, ref:string, commit:string}[]} oldest first */
export function listTurns(cwd, { session } = {}) {
  if (!checkSession(session)) return [];
  const out = tryGit(cwd, ['for-each-ref', '--format=%(refname) %(objectname)', `${TURN_REF_PREFIX}${session}/`]);
  if (!out) return [];
  return out.split('\n').filter(Boolean).map((line) => {
    const [ref, commit] = line.split(' ');
    return { turn: Number(ref.slice(`${TURN_REF_PREFIX}${session}/`.length)), ref, commit };
  }).filter((t) => Number.isInteger(t.turn) && t.turn >= 0).sort((a, b) => a.turn - b.turn);
}

/**
 * Snapshot the working tree as the next turn of `session`.
 * @returns {{state:'recorded', turn:number, ref:string, commit:string, parent:string}
 *         | {state:'none'|'refused'|'disabled'|'failed', why:string}}
 */
export function snapshotTurn(cwd, { session, env = process.env } = {}) {
  if (env.GREAT_CTO_DISABLE_TURNS === '1') return { state: 'disabled', why: 'GREAT_CTO_DISABLE_TURNS=1' };
  if (!checkSession(session)) return { state: 'refused', why: `session must match ${SESSION}` };
  const top = tryGit(cwd, ['rev-parse', '--show-toplevel']);
  if (!top) return { state: 'none', why: 'not a git repository' };
  const root = top.trim();
  const head = tryGit(root, ['rev-parse', '--verify', '-q', 'HEAD'])?.trim() || null;

  const scratch = mkdtempSync(join(tmpdir(), 'gcto-turn-index-'));
  const index = { GIT_INDEX_FILE: join(scratch, 'index') };
  try {
    git(root, ['read-tree', head || EMPTY_TREE], { env: index });
    git(root, ['add', '-A', '--', '.', ...ACTIVITY_LOGS.map((p) => `:(exclude)${p}`)], { env: index });
    const tree = git(root, ['write-tree'], { env: index }).trim();
    // Stop and SubagentStop can fire together for one session. Both would read
    // "the next turn is n", and a plain update-ref lets the second silently replace
    // the first. So the ref is created only if it does not exist (old value = zeros),
    // and a lost race moves to the next number.
    for (let attempt = 0; attempt < 10; attempt++) {
      const prior = listTurns(root, { session });
      const turn = prior.length ? prior.at(-1).turn + 1 : 0;
      const parent = prior.length ? prior.at(-1).commit : head;
      const commit = git(root, ['commit-tree', tree, ...(parent ? ['-p', parent] : [])], {
        input: `great_cto turn ${turn} (${session})\n`,
        env: { GIT_AUTHOR_NAME: 'great_cto', GIT_AUTHOR_EMAIL: 'turns@great-cto.local', GIT_COMMITTER_NAME: 'great_cto', GIT_COMMITTER_EMAIL: 'turns@great-cto.local' },
      }).trim();
      const ref = `${TURN_REF_PREFIX}${session}/${turn}`;
      if (tryGit(root, ['update-ref', ref, commit, ZERO_OID]) !== null) {
        return { state: 'recorded', turn, ref, commit, parent };
      }
    }
    return { state: 'failed', why: 'another snapshot kept taking the next turn number' };
  } catch (err) {
    return { state: 'failed', why: String(err?.stderr || err?.message || err).trim().slice(0, 300) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Paths one turn changed, against the turn before it (or its recorded parent). */
export function turnDiff(cwd, { session, turn } = {}) {
  const t = listTurns(cwd, { session }).find((x) => x.turn === turn);
  if (!t) return { state: 'none', paths: [], why: `no turn ${turn} for ${session}` };
  const parent = tryGit(cwd, ['rev-parse', '--verify', '-q', `${t.commit}^`])?.trim();
  const out = parent
    ? tryGit(cwd, ['diff', '--name-only', parent, t.commit])
    : tryGit(cwd, ['ls-tree', '-r', '--name-only', t.commit]);
  if (out == null) return { state: 'failed', paths: [], why: 'git could not diff the turn' };
  return { state: 'ok', paths: out.split('\n').filter(Boolean), ref: t.ref };
}

// ── reading turns for the board ────────────────────────────────────────────

/** Sessions with turns, newest first: {session, turns, newestTurn, newestAt}. */
export function listSessions(cwd, { limit = 10 } = {}) {
  const out = tryGit(cwd, ['for-each-ref', '--format=%(refname) %(committerdate:unix)', TURN_REF_PREFIX]);
  if (!out) return [];
  const bySession = new Map();
  for (const line of out.split('\n').filter(Boolean)) {
    const [ref, unix] = line.split(' ');
    const [session, n] = ref.slice(TURN_REF_PREFIX.length).split('/');
    const turn = Number(n);
    if (!checkSession(session) || !Number.isInteger(turn) || turn < 0) continue;
    const at = Number(unix) * 1000;
    const s = bySession.get(session) || { session, turns: 0, newestTurn: -1, newestAt: 0 };
    s.turns += 1;
    if (turn > s.newestTurn) s.newestTurn = turn;
    if (Number.isFinite(at) && at > s.newestAt) s.newestAt = at;
    bySession.set(session, s);
  }
  return [...bySession.values()].sort((a, b) => b.newestAt - a.newestAt || a.session.localeCompare(b.session)).slice(0, Math.max(1, limit));
}

/**
 * The board's view of a project's turns, in three states: `none` (not a git
 * repository — no history, not an empty one), `unreadable` (git refused), `live`.
 */
export function readTurns(cwd, { limit = 10 } = {}) {
  if (!tryGit(cwd, ['rev-parse', '--git-dir'])) return { state: 'none', why: 'not a git repository — turns are recorded as git refs', sessions: [] };
  try {
    git(cwd, ['for-each-ref', '--count=1', TURN_REF_PREFIX]);
  } catch (err) {
    return { state: 'unreadable', why: String(err?.stderr || err?.message || err).trim().slice(0, 300), sessions: [] };
  }
  return { state: 'live', sessions: listSessions(cwd, { limit }) };
}

export const MAX_PATCH_BYTES = 200_000;

/**
 * One turn as a unified diff against the turn before it (or its recorded parent),
 * with the full list of paths. A patch past `maxBytes` is cut at a line boundary and
 * says so; the paths are never cut.
 * @returns {{state:'ok', paths:string[], patch:string, truncated:boolean}
 *         | {state:'invalid'|'none', why:string}}
 */
export function turnPatch(cwd, { session, turn, maxBytes = MAX_PATCH_BYTES } = {}) {
  if (!checkSession(session) || !Number.isInteger(turn) || turn < 0) return { state: 'invalid', why: 'session must be a turn session id and turn a non-negative integer' };
  const t = listTurns(cwd, { session }).find((x) => x.turn === turn);
  if (!t) return { state: 'none', why: `no turn ${turn} recorded for this session` };
  const base = tryGit(cwd, ['rev-parse', '--verify', '-q', `${t.commit}^`])?.trim() || EMPTY_TREE;
  const names = tryGit(cwd, ['diff', '--name-only', base, t.commit]);
  const full = tryGit(cwd, ['diff', '--no-color', '--no-ext-diff', base, t.commit]);
  if (names == null || full == null) return { state: 'none', why: 'git could not diff this turn' };
  const buf = Buffer.from(full, 'utf8');
  let patch = full;
  let truncated = false;
  if (buf.length > maxBytes) {
    const cut = buf.subarray(0, maxBytes);
    const lastNl = cut.lastIndexOf(0x0a);
    patch = cut.subarray(0, lastNl >= 0 ? lastNl + 1 : 0).toString('utf8');
    truncated = true;
  }
  return { state: 'ok', paths: names.split('\n').filter(Boolean), patch, truncated, ref: t.ref };
}

/**
 * Remove whole sessions whose newest turn is older than `maxAgeDays` (ADR-023: 14).
 * Age is the snapshot commit's own committer date, so it is what was recorded, not
 * when a file on disk was last touched. A session with any recent turn is kept whole.
 */
export function pruneStaleSessions(cwd, { maxAgeDays = 14, now = Date.now() } = {}) {
  const out = tryGit(cwd, ['for-each-ref', '--format=%(refname) %(committerdate:unix)', TURN_REF_PREFIX]);
  if (!out) return { deleted: [] };
  const newest = new Map();
  const refs = new Map();
  for (const line of out.split('\n').filter(Boolean)) {
    const [ref, unix] = line.split(' ');
    const session = ref.slice(TURN_REF_PREFIX.length).split('/')[0];
    if (!checkSession(session)) continue;
    const at = Number(unix) * 1000;
    newest.set(session, Math.max(newest.get(session) ?? 0, Number.isFinite(at) ? at : 0));
    refs.set(session, [...(refs.get(session) || []), ref]);
  }
  const cutoff = now - maxAgeDays * 24 * 60 * 60 * 1000;
  const deleted = [];
  for (const [session, at] of newest) {
    if (at >= cutoff) continue;
    for (const ref of refs.get(session)) tryGit(cwd, ['update-ref', '-d', ref]);
    deleted.push(session);
  }
  return { deleted: deleted.sort() };
}

/** Keep the newest `keep` turns of a session; delete the rest. */
export function pruneTurns(cwd, { session, keep = 50 } = {}) {
  const turns = listTurns(cwd, { session });
  const drop = turns.slice(0, Math.max(0, turns.length - Math.max(0, keep)));
  const deleted = [];
  for (const t of drop) if (tryGit(cwd, ['update-ref', '-d', t.ref]) !== null) deleted.push(t.turn);
  return { deleted };
}
