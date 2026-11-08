/**
 * workspace-actions — the doing half of ADR-047. workspace.mjs decides; this
 * creates the worktree, links dependencies, runs the project's scripts, and
 * removes the worktree when archiveVerdict allows it.
 *
 * Nothing here runs unless the project opted in with `workspace: per-task`.
 * The commands come from `.great_cto/workspace.toml`, which is committed and
 * reviewed like any other code (ADR-047 section 6).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { worktreePath } from './worktree-state.mjs';
import {
  gitIn, validTaskId, claimState, archiveVerdict, recordProvenance, readProvenance,
  allocatePort, releasePort, workspaceEnv,
} from './workspace.mjs';

const LOCKFILES = [
  ['package-lock.json', 'npm ci'],
  ['pnpm-lock.yaml', 'pnpm install --frozen-lockfile'],
  ['yarn.lock', 'yarn install --frozen-lockfile'],
  ['bun.lock', 'bun install --frozen-lockfile'],
  ['bun.lockb', 'bun install --frozen-lockfile'],
];
const COMMAND_TIMEOUT_MS = 15 * 60 * 1000;
const SCRIPT_KEYS = new Set(['setup', 'run', 'archive']);

/** Absent or `shared` keeps today's behaviour. A value we do not know is reported, not guessed at. */
export function workspaceMode(root, { read = fs.readFileSync } = {}) {
  let text;
  try {
    text = read(path.join(root, '.great_cto', 'PROJECT.md'), 'utf8');
  } catch (e) {
    return e.code === 'ENOENT' ? { mode: 'shared' } : { mode: 'unknown', reason: 'could not read PROJECT.md: ' + e.code };
  }
  const value = /^workspace:[ \t]*(\S*)/m.exec(text)?.[1];
  if (!value || value === 'shared') return { mode: 'shared' };
  if (value === 'per-task') return { mode: 'per-task' };
  return { mode: 'unknown', reason: 'PROJECT.md says workspace: ' + value + ', expected per-task or shared' };
}

/** The three string arrays of workspace.toml. Throws on anything else: a command we misread must not run. */
export function parseWorkspaceToml(text) {
  const scripts = { setup: [], run: [], archive: [] };
  let inScripts = false;
  String(text).split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    if (line === '[scripts]') { inScripts = true; return; }
    const m = /^(\w+)\s*=\s*\[((?:\s*"(?:[^"\\]|\\.)*"\s*,?)*)\s*\]\s*(?:#.*)?$/.exec(line);
    if (!inScripts || !m || !SCRIPT_KEYS.has(m[1])) throw new Error('workspace.toml line ' + (i + 1) + ' is not understood');
    scripts[m[1]] = (m[2].match(/"(?:[^"\\]|\\.)*"/g) || []).map((s) => JSON.parse(s));
  });
  return scripts;
}

function readScripts(dir) {
  let text;
  try {
    text = fs.readFileSync(path.join(dir, '.great_cto', 'workspace.toml'), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { scripts: { setup: [], run: [], archive: [] } };
    return { error: 'could not read workspace.toml: ' + e.code };
  }
  try { return { scripts: parseWorkspaceToml(text) }; } catch (e) { return { error: e.message }; }
}

/** One shell command. Its output goes to stderr, so stdout stays the one JSON answer. */
function runShell(command, { cwd, env }) {
  const r = spawnSync('sh', ['-c', command], { cwd, env, stdio: ['ignore', 2, 2], timeout: COMMAND_TIMEOUT_MS });
  return r.status === 0;
}

function runAll(commands, opts, run) {
  for (const command of commands) {
    if (!run(command, opts)) return { ok: false, failed: command };
  }
  return { ok: true, ran: commands.length };
}

/** The main checkout's root, or null. Paths are real, so they compare with what git prints. */
export function mainRoot(cwd, exec = execFileSync) {
  const common = gitIn(cwd, exec)('rev-parse', '--path-format=absolute', '--git-common-dir');
  if (!common.ok || path.basename(common.out) !== '.git') return null;
  return fs.realpathSync(path.dirname(common.out));
}

function lockfile(base, rel) {
  for (const dir of [path.join(base, rel), base]) {
    for (const [name, install] of LOCKFILES) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) return { install, hash: createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
    }
  }
  return null;
}

/** A symlink is not matched by the usual `node_modules/`, and an unignored one would refuse archive forever. */
function ignoreLink(dir, rel, exec) {
  const git = gitIn(dir, exec);
  const ignored = git('check-ignore', '-q', path.join(rel, 'node_modules'));
  if (ignored.ok) return;
  if (ignored.status !== 1) throw new Error('git could not say whether node_modules is ignored');
  const where = git('rev-parse', '--git-path', 'info/exclude');
  if (!where.ok) throw new Error('git would not name info/exclude');
  const file = path.resolve(dir, where.out);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, '\nnode_modules\n');
}

function linkOne(root, dir, rel, { exec, run, env }) {
  const source = path.join(root, rel, 'node_modules');
  const target = path.join(dir, rel, 'node_modules');
  if (!fs.existsSync(path.join(dir, rel))) return { path: rel, action: 'skipped', reason: 'not on this branch' };
  if (fs.lstatSync(target, { throwIfNoEntry: false })) return { path: rel, action: 'present' };
  if (!fs.existsSync(source)) return { path: rel, action: 'skipped', reason: 'the main checkout has none' };
  const mine = lockfile(dir, rel);
  const main = lockfile(root, rel);
  if (!mine || !main) return { path: rel, action: 'skipped', reason: 'no lockfile to compare' };
  if (mine.hash !== main.hash) {
    // A symlink here would be a worktree testing someone else's dependencies.
    const ok = run(mine.install, { cwd: path.join(dir, rel), env });
    return ok ? { path: rel, action: 'installed' } : { path: rel, action: 'failed', reason: mine.install + ' failed' };
  }
  fs.symlinkSync(source, target);
  ignoreLink(dir, rel, exec);
  return { path: rel, action: 'linked' };
}

export function linkDependencies({ root, dir, exec = execFileSync, run = runShell, env = process.env }) {
  const rels = ['.'];
  try {
    for (const name of fs.readdirSync(path.join(root, 'packages'))) {
      if (fs.existsSync(path.join(root, 'packages', name, 'node_modules'))) rels.push(path.join('packages', name));
    }
  } catch (e) {
    if (e.code !== 'ENOENT') return [{ path: 'packages', action: 'failed', reason: e.message }];
  }
  return rels.map((rel) => {
    try { return linkOne(root, dir, rel, { exec, run, env }); } catch (e) { return { path: rel, action: 'failed', reason: e.message }; }
  });
}

function createWorktree(claim, { root, taskId, cwd, env, exec, exists }) {
  const add = claim.branchExists
    ? ['worktree', 'add', claim.path, claim.branch]
    : ['worktree', 'add', '-b', claim.branch, claim.path, claim.from];
  fs.mkdirSync(path.dirname(claim.path), { recursive: true });
  const added = gitIn(root, exec)(...add);
  if (!added.ok) {
    // Another session may have won the race: then this is its worktree, and one task still has one.
    const again = claimState({ taskId, cwd, env, exec, exists });
    return again.state === 'create' ? { state: 'unavailable', reason: 'git worktree add failed' } : again;
  }
  try {
    recordProvenance(claim.path, 'created', { taskId, exec });
  } catch (e) {
    return { state: 'unavailable', reason: 'the worktree exists but its provenance was not recorded: ' + e.message, path: claim.path };
  }
  return claim;
}

/** Lets the board find a workspace a host created under a branch name of its own. */
function recordAdoptedBranch(root, taskId, claim, exec) {
  if (!claim.branch || claim.branch === 'task/' + taskId) return;
  const common = gitIn(root, exec)('rev-parse', '--path-format=absolute', '--git-common-dir');
  if (!common.ok) throw new Error('git would not name the common directory');
  const dir = path.join(common.out, 'great-cto-workspaces');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, taskId + '.json'), JSON.stringify({ branch: claim.branch, path: claim.path }) + '\n');
}

/**
 * The whole claim: decide, create if that is the answer, then port, dependencies
 * and setup. `ok` is false when the workspace exists but is not usable yet.
 */
export function claimWorkspace({
  taskId, cwd = process.cwd(), env = process.env, exec = execFileSync, run = runShell,
  exists = fs.existsSync, allocate = allocatePort,
}) {
  const root = mainRoot(cwd, exec);
  const mode = workspaceMode(root || cwd);
  if (mode.mode === 'shared') return { mode: 'shared' };
  if (mode.mode === 'unknown') return { mode: 'unknown', state: 'unavailable', reason: mode.reason };

  const first = claimState({ taskId, cwd, env, exec, exists });
  const claim = first.state === 'create' ? createWorktree(first, { root, taskId, cwd, env, exec, exists }) : first;
  const base = { mode: 'per-task', ...claim };
  if (claim.state === 'conflict' || claim.state === 'unavailable') return base;

  const warnings = [];
  const fresh = claim.state === 'create' || (claim.state === 'adopt' && !readProvenance(claim.path, { exec }));
  if (claim.state === 'adopt') {
    try {
      if (fresh) recordProvenance(claim.path, 'adopted', { taskId, exec });
      recordAdoptedBranch(root, taskId, claim, exec);
    } catch (e) { warnings.push('adoption was not recorded: ' + e.message); }
  }

  const port = allocate({ taskId, path: claim.path, env });
  if (port.port === undefined) warnings.push('no port: ' + port.state + (port.reason ? ', ' + port.reason : ''));
  const portEnv = port.port === undefined ? {} : workspaceEnv(port.port);
  const childEnv = { ...env, ...portEnv };

  const dependencies = claim.path === root ? [] : linkDependencies({ root, dir: claim.path, exec, run, env: childEnv });
  const depsOk = !dependencies.some((d) => d.action === 'failed');

  let setup = { ok: true, ran: 0 };
  if (fresh && depsOk) {
    const read = readScripts(claim.path);
    setup = read.error ? { ok: false, error: read.error } : runAll(read.scripts.setup, { cwd: claim.path, env: childEnv }, run);
  }
  return { ...base, ok: depsOk && setup.ok, port: port.port ?? null, env: portEnv, dependencies, setup, warnings };
}

/** Removes a worktree only on archiveVerdict's yes. The branch stays: it is the last pointer to the work. */
export function archiveWorkspace({ taskId, cwd = process.cwd(), env = process.env, exec = execFileSync, run = runShell }) {
  const refuse = (reason) => ({ archived: false, reason });
  if (!validTaskId(taskId)) return refuse('the task id is not valid');
  const root = mainRoot(cwd, exec);
  if (!root) return refuse('could not name the main checkout');
  const target = worktreePath(root, taskId);
  if (!fs.existsSync(target)) return refuse('no workspace at ' + target);

  const verdict = archiveVerdict(target, { exec });
  if (!verdict.remove) return refuse(verdict.reason);
  const read = readScripts(target);
  if (read.error) return refuse(read.error);
  const done = runAll(read.scripts.archive, { cwd: target, env }, run);
  if (!done.ok) return refuse('the archive script failed: ' + done.failed);

  // No --force: if an archive script left something behind, git refuses and so do we.
  if (!gitIn(root, exec)('worktree', 'remove', target).ok) return refuse('git worktree remove refused');
  const released = releasePort(taskId, { env });
  return { archived: true, path: target, branch: 'task/' + taskId, ref: verdict.ref, port: released.state };
}
