/**
 * workspace — one task, one worktree (ADR-047, phase 1).
 *
 * This module decides; it does not act. It answers three questions and leaves
 * the doing to the callers phase 3 adds:
 *
 *   claimState      which of five states a task's workspace is in
 *   archiveVerdict  whether a worktree may be removed
 *   allocatePort    which port a workspace gets (the one thing written here)
 *
 * The rule throughout: a read that failed is not an empty answer. A worktree
 * listing git would not give is not "no worktrees", so it does not lead to
 * creating one. A status git would not give is not "clean", so it does not lead
 * to removing one. Uncommitted and untracked agent output is in no index and no
 * history; a removal built on a wrong "clean" cannot be undone.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { worktreePath, integrationRef } from './worktree-state.mjs';
import { isLinkedWorktree, WORKSPACE_PORT_FIRST, WORKSPACE_PORT_LAST } from './handoff-state.mjs';

const OPTS = { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] };
const PROVENANCE_FILE = 'great-cto-workspace.json';
const PROVENANCES = new Set(['created', 'adopted']);
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)*$/;

/** A task id is used in a path and a branch name, so it must be safe as both. */
export function validTaskId(id) {
  return typeof id === 'string' && id.length <= 120 && TASK_ID.test(id) && !id.endsWith('.lock');
}

/** One git command in `dir`, as { ok, out, status }. `status` is the exit code; null after a timeout. */
function gitIn(dir, exec) {
  return (...args) => {
    try {
      return { ok: true, out: String(exec('git', ['-C', dir, ...args], OPTS)).trim(), status: 0 };
    } catch (e) {
      return { ok: false, out: '', status: e.status ?? null };
    }
  };
}

function real(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

/** The host that already made this workspace, or null. Whoever made it removes it. */
export function detectHost({ cwd, env = process.env, git, exists = fs.existsSync, commonRoot = null }) {
  if (Object.keys(env).some((k) => k.startsWith('CONDUCTOR_'))) return { host: 'conductor', signal: 'CONDUCTOR_* in the environment' };
  if (commonRoot && exists(path.join(commonRoot, '.conductor'))) return { host: 'conductor', signal: '.conductor/ at the common root' };
  if (isLinkedWorktree(git)) return { host: 'linked-worktree', signal: 'git-dir differs from git-common-dir' };
  if (`${cwd.split(path.sep).join('/')}/`.includes('/.claude/worktrees/')) return { host: 'claude-code', signal: 'path under .claude/worktrees' };
  return null;
}

function parseWorktreeList(text) {
  return String(text).split('\n\n').filter(Boolean).map((block) => ({
    path: /^worktree (.+)$/m.exec(block)?.[1] || null,
    branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] || null,
  })).filter((w) => w.path);
}

/**
 * Which of the five states a task's workspace is in. Creates nothing.
 * { state: 'adopt' | 'reuse' | 'conflict' | 'create' | 'unavailable', ... }
 */
export function claimState({ taskId, cwd = process.cwd(), env = process.env, exec = execFileSync, exists = fs.existsSync }) {
  const unavailable = (reason) => ({ state: 'unavailable', reason });
  if (!validTaskId(taskId)) return unavailable('the task id cannot name a directory and a branch');

  const git = gitIn(cwd, exec);
  const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  if (!common.ok) return unavailable('not a git repository');
  if (path.basename(common.out) !== '.git') return unavailable('cannot name the main checkout of this repository');
  const root = real(path.dirname(common.out));

  const host = detectHost({ cwd, env, git, exists, commonRoot: root });
  if (host) {
    const top = git('rev-parse', '--show-toplevel');
    if (!top.ok) return unavailable('git would not name the current worktree');
    return { state: 'adopt', path: top.out, branch: git('branch', '--show-current').out || null, ...host };
  }

  const listed = git('worktree', 'list', '--porcelain');
  if (!listed.ok) return unavailable('git worktree list failed, so what exists is not known');
  const worktrees = parseWorktreeList(listed.out);

  const target = worktreePath(root, taskId);
  const branch = 'task/' + taskId;
  const conflict = (reason) => ({ state: 'conflict', path: target, branch, reason });
  const known = worktrees.find((w) => real(w.path) === target);

  if (exists(target)) {
    if (!known) return conflict('the directory exists but git does not know it');
    if (known.branch !== branch) return conflict('the worktree is on ' + (known.branch || 'a detached HEAD') + ', not ' + branch);
    return { state: 'reuse', path: target, branch };
  }
  if (known) return conflict('git lists this worktree but its directory is gone');
  const elsewhere = worktrees.find((w) => w.branch === branch);
  if (elsewhere) return conflict(branch + ' is already checked out at ' + elsewhere.path);

  if (!git('rev-parse', '--verify', '--quiet', 'HEAD').ok) return unavailable('the repository has no commits');
  const from = integrationRef((args) => git(...args).out);
  if (!from) return unavailable('no integration branch to start from');
  const branchExists = git('rev-parse', '--verify', '--quiet', 'refs/heads/' + branch).ok;
  return { state: 'create', path: target, branch, from, branchExists };
}

function provenancePath(dir, git) {
  const where = git('rev-parse', '--git-path', PROVENANCE_FILE);
  return where.ok && where.out ? path.resolve(dir, where.out) : null;
}

/**
 * Records who made this worktree, in its private git directory: it never shows
 * in `git status`, and it goes when the worktree goes.
 */
export function recordProvenance(dir, provenance, { taskId, exec = execFileSync, now = new Date() }) {
  if (!PROVENANCES.has(provenance)) throw new Error('unknown provenance: ' + provenance);
  const file = provenancePath(dir, gitIn(dir, exec));
  if (!file) throw new Error('git would not name the worktree directory');
  fs.writeFileSync(file, JSON.stringify({ provenance, taskId, at: now.toISOString() }) + '\n');
}

/** The recorded provenance, or null when there is none or it cannot be read. */
export function readProvenance(dir, { exec = execFileSync } = {}) {
  const file = provenancePath(dir, gitIn(dir, exec));
  if (!file) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return PROVENANCES.has(parsed?.provenance) ? parsed : null;
  } catch { return null; } // archiveVerdict refuses on null, so no read here ever permits a removal
}

/**
 * May this worktree be removed? Only when we created it, it has no uncommitted
 * or untracked file, and its HEAD is on the integration branch. Every other
 * answer, including every probe that could not answer, is { remove: false }.
 */
export function archiveVerdict(dir, { exec = execFileSync } = {}) {
  const refuse = (reason) => ({ remove: false, reason });
  if (readProvenance(dir, { exec })?.provenance !== 'created') return refuse('great_cto did not create this worktree');

  const git = gitIn(dir, exec);
  const status = git('status', '--porcelain');
  if (!status.ok) return refuse('could not read the worktree status');
  if (status.out) return refuse('the worktree has uncommitted or untracked files');

  const ref = integrationRef((args) => git(...args).out);
  if (!ref) return refuse('no integration branch to check against');
  const merged = git('merge-base', '--is-ancestor', 'HEAD', ref);
  if (merged.status === 1) return refuse('HEAD is not merged into ' + ref);
  if (!merged.ok) return refuse('could not check whether HEAD is merged');
  return { remove: true, ref };
}

/** The port a task tries first: the same one every time. */
export function preferredPort(taskId) {
  const size = WORKSPACE_PORT_LAST - WORKSPACE_PORT_FIRST + 1;
  return WORKSPACE_PORT_FIRST + (createHash('sha256').update(taskId).digest().readUInt32BE(0) % size);
}

/** Pids listening on a port; [] when nobody is; null when lsof could not say. */
export function listeners(port, { exec = execFileSync } = {}) {
  try {
    const out = String(exec('lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN', '-t'], OPTS));
    return out.split('\n').filter(Boolean).map(Number);
  } catch (e) {
    return e.status === 1 ? [] : null; // lsof exits 1 when it finds nothing
  }
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

export function portsFile(env = process.env) {
  return env.GREAT_CTO_PORTS_FILE || path.join(os.homedir(), '.great_cto', 'ports.json');
}

/** Claims in the file, or { refused } when the file exists and cannot be trusted. */
function readClaims(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    return e.code === 'ENOENT' ? { claims: [] } : { refused: 'could not read the file: ' + e.code };
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { return { refused: 'not valid JSON: ' + e.message }; }
  if (!Array.isArray(parsed?.claims)) return { refused: 'no claims[] list' };
  if (!parsed.claims.every((c) => c && typeof c.taskId === 'string' && Number.isInteger(c.port))) return { refused: 'a claim is malformed' };
  return { claims: parsed.claims };
}

/**
 * Gives a task its port and records the claim. The file says who claimed what;
 * what is listening decides whether a port is actually free.
 * { state: 'allocated' | 'reused' | 'refused' | 'exhausted' | 'failed', port?, file, reason? }
 */
export function allocatePort({
  taskId, path: workspace, pid = process.pid, env = process.env, now = new Date(),
  isAlive = processAlive, listening = (port) => listeners(port),
}) {
  const file = portsFile(env);
  const refused = (reason) => ({ state: 'refused', file, reason });
  if (!validTaskId(taskId)) return refused('the task id is not valid');
  const read = readClaims(file);
  if (read.refused) return refused(read.refused);

  const couldNotCheck = (port) => refused('could not check who is listening on port ' + port);
  const own = read.claims.find((c) => c.taskId === taskId);
  let port = null;
  let state = 'allocated';
  if (own) {
    const held = isAlive(own.pid) ? [] : listening(own.port);
    if (held === null) return couldNotCheck(own.port);
    if (!held.length) { port = own.port; state = 'reused'; }
  }
  const dropped = new Set();
  if (port === null) {
    const size = WORKSPACE_PORT_LAST - WORKSPACE_PORT_FIRST + 1;
    const start = preferredPort(taskId) - WORKSPACE_PORT_FIRST;
    for (let i = 0; i < size && port === null; i += 1) {
      const candidate = WORKSPACE_PORT_FIRST + ((start + i) % size);
      const other = read.claims.find((c) => c.port === candidate && c.taskId !== taskId);
      if (other && isAlive(other.pid)) continue;
      const held = listening(candidate);
      if (held === null) return couldNotCheck(candidate);
      if (held.length) continue;
      if (other) dropped.add(other.taskId);
      port = candidate;
    }
    if (port === null) return { state: 'exhausted', file };
  }

  const claims = read.claims.filter((c) => c.taskId !== taskId && !dropped.has(c.taskId));
  claims.push({ taskId, port, path: workspace, pid, at: now.toISOString() });
  try {
    // Write-then-rename: a crash mid-write must not leave a truncated file that reads as "nothing allocated".
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ claims }, null, 2) + '\n');
    fs.renameSync(tmp, file);
  } catch (e) {
    return { state: 'failed', file, reason: e.message };
  }
  return { state, port, file };
}

/** The environment a workspace's servers get: one new name, and the one the board already honours. */
export function workspaceEnv(port) {
  return { GREAT_CTO_WORKSPACE_PORT: String(port), BOARD_PORT: String(port) };
}
