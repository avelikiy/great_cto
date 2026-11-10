// ADR-047 phases 2 and 3: what a claim actually does on disk. Real git, real
// worktrees. The cases that matter: a project that did not opt in sees nothing,
// a command we cannot read does not run, and nothing removes unmerged work.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  workspaceMode, parseWorkspaceToml, claimWorkspace, archiveWorkspace, mainRoot,
} from '../../scripts/lib/workspace-actions.mjs';
import { readProvenance, allocatePort } from '../../scripts/lib/workspace.mjs';
import { worktreePath } from '../../scripts/lib/worktree-state.mjs';
import { scratchReason } from '../../scripts/lib/project-registry.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const made = [];
const tmp = () => { const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wsa-'))); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && !k.startsWith('CONDUCTOR_')));
const realGit = (cmd, args, opts = {}) => execFileSync(cmd, args, { ...opts, env: cleanEnv });
const git = (dir, ...args) => String(realGit('git', ['-C', dir, '-c', 'commit.gpgsign=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim();

function repo({ mode = 'per-task', toml = null, files = {} } = {}) {
  const root = tmp();
  git(root, 'init', '-q', '-b', 'main');
  for (const [name, text] of Object.entries({ 'a.txt': 'a\n', ...files })) fs.writeFileSync(path.join(root, name), text);
  if (toml !== null) { fs.mkdirSync(path.join(root, '.great_cto')); fs.writeFileSync(path.join(root, '.great_cto', 'workspace.toml'), toml); }
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'init');
  if (mode) {
    fs.mkdirSync(path.join(root, '.great_cto'), { recursive: true });
    fs.writeFileSync(path.join(root, '.great_cto', 'PROJECT.md'), 'slug: t\nworkspace: ' + mode + '\n');
    fs.appendFileSync(path.join(root, '.git', 'info', 'exclude'), '\n.great_cto/PROJECT.md\n');
  }
  return root;
}
function harness() {
  const commands = [];
  const portsDir = tmp();
  return {
    commands,
    env: { GREAT_CTO_PORTS_FILE: path.join(portsDir, 'ports.json') },
    run: (command) => { commands.push(command); return !command.startsWith('fail'); },
  };
}
function claim(root, id, h, extra = {}) {
  return claimWorkspace({
    taskId: id, cwd: root, env: h.env, exec: realGit, run: h.run,
    allocate: (a) => allocatePort({ ...a, listening: () => [] }), ...extra,
  });
}
const archive = (root, id, h) => archiveWorkspace({ taskId: id, cwd: root, env: h.env, exec: realGit, run: h.run });
function land(root, dir) {
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'work');
  git(root, 'merge', '-q', '--ff-only', git(dir, 'branch', '--show-current'));
}

test('a project that did not opt in gets nothing created', () => {
  for (const mode of [null, 'shared']) {
    const root = repo({ mode, toml: '[scripts]\nsetup = ["echo no"]\n' });
    const h = harness();
    assert.deepEqual(claim(root, 't-1', h), { mode: 'shared' });
    assert.equal(fs.existsSync(worktreePath(root, 't-1')), false);
    assert.deepEqual(h.commands, []);
  }
});

test('workspace mode: a value we do not know and an unreadable file are reported', () => {
  const r = claim(repo({ mode: 'pertask' }), 't-1', harness());
  assert.equal(r.state, 'unavailable');
  assert.match(r.reason, /pertask/);
  const denied = workspaceMode('/x', { read: () => { throw Object.assign(new Error('no'), { code: 'EACCES' }); } });
  assert.equal(denied.mode, 'unknown');
  assert.equal(workspaceMode('/x', { read: () => { throw Object.assign(new Error('no'), { code: 'ENOENT' }); } }).mode, 'shared');
});

test('workspace.toml: commands keep their commas and hashes, and a line we cannot read throws', () => {
  const s = parseWorkspaceToml('# c\n[scripts]\nsetup = ["echo a, b # c", "x"]  # note\nrun = []\n');
  assert.deepEqual(s.setup, ['echo a, b # c', 'x']);
  assert.deepEqual(s.run, []);
  for (const bad of ['setup = ["x"]\n', '[scripts]\nsetup = "x"\n', '[scripts]\nother = ["x"]\n', '[other]\nsetup = ["x"]\n']) {
    assert.throws(() => parseWorkspaceToml(bad), /not understood/, bad);
  }
});

test('create: one worktree, one branch, provenance, a port, setup with the port in its environment', () => {
  const root = repo({ toml: '[scripts]\nsetup = ["echo hi"]\n' });
  const h = harness();
  let seen = null;
  const r = claim(root, 't-1', h, { run: (c, o) => { seen = o; return h.run(c); } });
  assert.equal(r.state, 'create');
  assert.equal(r.ok, true);
  assert.equal(r.path, worktreePath(root, 't-1'));
  assert.equal(git(r.path, 'branch', '--show-current'), 'task/t-1');
  assert.equal(readProvenance(r.path, { exec: realGit }).provenance, 'created');
  assert.ok(r.port >= 3142 && r.port <= 3241);
  assert.equal(seen.env.GREAT_CTO_WORKSPACE_PORT, String(r.port));
  assert.equal(seen.cwd, r.path);
  assert.deepEqual(h.commands, ['echo hi']);
});

test('claiming again returns the same worktree and port and does not rerun setup', () => {
  const root = repo({ toml: '[scripts]\nsetup = ["echo hi"]\n' });
  const h = harness();
  const a = claim(root, 't-1', h);
  const b = claim(root, 't-1', h);
  assert.equal(b.state, 'reuse');
  assert.equal(b.path, a.path);
  assert.equal(b.port, a.port);
  assert.deepEqual(h.commands, ['echo hi']);
});

test('a failed setup leaves the worktree and says not ok', () => {
  const root = repo({ toml: '[scripts]\nsetup = ["fail now", "echo never"]\n' });
  const h = harness();
  const r = claim(root, 't-1', h);
  assert.equal(r.ok, false);
  assert.equal(r.setup.failed, 'fail now');
  assert.deepEqual(h.commands, ['fail now']);
  assert.equal(fs.existsSync(r.path), true);
});

test('a workspace.toml we cannot read runs nothing', () => {
  const root = repo({ toml: '[scripts]\nsetup = "echo hi"\n' });
  const h = harness();
  const r = claim(root, 't-1', h);
  assert.equal(r.ok, false);
  assert.match(r.setup.error, /not understood/);
  assert.deepEqual(h.commands, []);
});

test('a directory git does not know is reported and left alone', () => {
  const root = repo();
  const dir = worktreePath(root, 't-1');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'keep.txt'), 'x');
  const r = claim(root, 't-1', harness());
  assert.equal(r.state, 'conflict');
  assert.equal(fs.readFileSync(path.join(dir, 'keep.txt'), 'utf8'), 'x');
});

test('losing a race to the same task returns the winner\'s worktree', () => {
  const root = repo();
  const h = harness();
  const dir = worktreePath(root, 't-1');
  const racing = (cmd, args, opts) => {
    if (args.includes('add') && args.includes('worktree')) {
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      git(root, 'worktree', 'add', '-q', '-b', 'task/t-1', dir, 'main');
      throw Object.assign(new Error('exists'), { status: 128 });
    }
    return realGit(cmd, args, opts);
  };
  const r = claim(root, 't-1', h, { exec: racing });
  assert.equal(r.state, 'reuse');
  assert.equal(r.path, dir);
});

test('a port problem is a warning: the worktree is still usable', () => {
  const root = repo();
  const r = claim(root, 't-1', harness(), { allocate: () => ({ state: 'refused', reason: 'bad file' }) });
  assert.equal(r.ok, true);
  assert.equal(r.port, null);
  assert.match(r.warnings[0], /bad file/);
});

test('same lockfile: node_modules is linked, stays out of git status, and archive still works', () => {
  const root = repo({ files: { 'package-lock.json': '{}\n', '.gitignore': 'node_modules/\n' } });
  fs.mkdirSync(path.join(root, 'node_modules'));
  const h = harness();
  const r = claim(root, 't-1', h);
  assert.equal(r.dependencies[0].action, 'linked');
  assert.equal(fs.lstatSync(path.join(r.path, 'node_modules')).isSymbolicLink(), true);
  assert.equal(git(r.path, 'status', '--porcelain'), '');
  land(root, r.path);
  assert.equal(archive(root, 't-1', h).archived, true);
});

test('a different lockfile gets a real install, never a link', () => {
  const root = repo({ files: { 'package-lock.json': '{}\n' } });
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"changed":1}\n'); // main checkout moved on, uncommitted
  const h = harness();
  const r = claim(root, 't-1', h);
  assert.equal(r.dependencies[0].action, 'installed');
  assert.deepEqual(h.commands, ['npm ci']);
  assert.equal(fs.lstatSync(path.join(r.path, 'node_modules'), { throwIfNoEntry: false }), undefined);
});

test('a failed install is not ok and setup does not run on top of it', () => {
  const root = repo({ files: { 'package-lock.json': '{}\n' }, toml: '[scripts]\nsetup = ["echo hi"]\n' });
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"changed":1}\n');
  const h = harness();
  const r = claim(root, 't-1', h, { run: (c) => { h.commands.push(c); return false; } });
  assert.equal(r.ok, false);
  assert.deepEqual(h.commands, ['npm ci']);
});

test('archive: unmerged work and untracked files stay, merged clean work goes, the branch stays', () => {
  const root = repo({ toml: '[scripts]\narchive = ["echo bye"]\n' });
  const h = harness();
  const r = claim(root, 't-1', h);
  fs.writeFileSync(path.join(r.path, 'n.txt'), 'x');
  assert.match(archive(root, 't-1', h).reason, /untracked/);
  fs.rmSync(path.join(r.path, 'n.txt'));
  fs.writeFileSync(path.join(r.path, 'c.txt'), 'c\n');
  git(r.path, 'add', '.');
  git(r.path, 'commit', '-q', '-m', 'unmerged');
  assert.match(archive(root, 't-1', h).reason, /not merged/);
  assert.deepEqual(h.commands, []);
  assert.equal(fs.existsSync(r.path), true);

  git(root, 'merge', '-q', '--ff-only', 'task/t-1');
  const done = archive(root, 't-1', h);
  assert.equal(done.archived, true);
  assert.equal(done.port, 'released');
  assert.deepEqual(h.commands, ['echo bye']);
  assert.equal(fs.existsSync(r.path), false);
  assert.equal(git(root, 'rev-parse', '--verify', '--quiet', 'refs/heads/task/t-1').length > 0, true);
  const left = JSON.parse(fs.readFileSync(h.env.GREAT_CTO_PORTS_FILE, 'utf8')).claims;
  assert.deepEqual(left, []);
});

test('a failing archive script keeps the worktree', () => {
  const root = repo({ toml: '[scripts]\narchive = ["fail bye"]\n' });
  const h = harness();
  const r = claim(root, 't-1', h);
  land(root, r.path);
  assert.match(archive(root, 't-1', h).reason, /archive script/);
  assert.equal(fs.existsSync(r.path), true);
});

test('a host\'s worktree is adopted, recorded for the board, and never archived by us', () => {
  const root = repo({ toml: '[scripts]\nsetup = ["echo hi"]\n' });
  const host = worktreePath(root, 't-1');
  fs.mkdirSync(path.dirname(host), { recursive: true });
  git(root, 'worktree', 'add', '-q', '-b', 'host-branch', host, 'main');
  const h = harness();
  const r = claim(host, 't-1', h);
  assert.equal(r.state, 'adopt');
  assert.equal(r.path, host);
  assert.equal(readProvenance(host, { exec: realGit }).provenance, 'adopted');
  assert.deepEqual(h.commands, ['echo hi']);
  claim(host, 't-1', h);
  assert.deepEqual(h.commands, ['echo hi'], 'setup runs once');
  const recorded = JSON.parse(fs.readFileSync(path.join(root, '.git', 'great-cto-workspaces', 't-1.json'), 'utf8'));
  assert.equal(recorded.branch, 'host-branch');
  land(root, host);
  assert.match(archive(root, 't-1', h).reason, /did not create/);
  assert.equal(fs.existsSync(host), true);
});

test('claiming from inside our own worktree does not rewrite its provenance', () => {
  const root = repo();
  const h = harness();
  const r = claim(root, 't-1', h);
  const inner = claim(r.path, 't-1', h);
  assert.equal(inner.state, 'adopt');
  assert.equal(readProvenance(r.path, { exec: realGit }).provenance, 'created');
});

test('a committed .conductor/ does not adopt the main checkout', () => {
  const root = repo({ files: { 'a.txt': 'a\n' } });
  fs.mkdirSync(path.join(root, '.conductor'));
  const r = claim(root, 't-1', harness());
  assert.equal(r.state, 'create');
  assert.equal(mainRoot(r.path, realGit), root);
});

test('the command prints one JSON object and its exit code carries the outcome', () => {
  const cli = path.join(REPO, 'scripts', 'workspace.mjs');
  const go = (cwd, ...args) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', env: { ...cleanEnv, GREAT_CTO_PORTS_FILE: path.join(tmp(), 'p.json') } });
  const shared = repo({ mode: null });
  const a = go(shared, 'claim', 't-1');
  assert.equal(a.status, 0);
  assert.deepEqual(JSON.parse(a.stdout), { mode: 'shared' });

  const root = repo();
  const b = go(root, 'claim', 't-1');
  assert.equal(b.status, 0, b.stderr);
  assert.equal(JSON.parse(b.stdout).state, 'create');
  const refused = go(root, 'claim', '../evil');
  assert.equal(refused.status, 3);
  assert.equal(JSON.parse(refused.stdout).state, 'unavailable');
  assert.equal(go(root, 'archive', 'no-such-task').status, 3);
  assert.equal(go(root, 'nonsense').status, 2);
});

test('a verdict-less phase task lands in the main checkout, not the worktree', () => {
  const root = repo({ mode: null });
  const dir = worktreePath(root, 't-1');
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  git(root, 'worktree', 'add', '-q', '-b', 'task/t-1', dir, 'main');
  const bin = tmp();
  fs.writeFileSync(path.join(bin, 'bd'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const r = spawnSync('bash', [path.join(REPO, 'scripts', 'phase-task.sh'), 'open', 'qa-engineer', 'feat'], {
    cwd: dir, encoding: 'utf8', env: { ...cleanEnv, PATH: bin + path.delimiter + cleanEnv.PATH },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(path.join(root, '.great_cto', 'tasks.md'), 'utf8'), /qa-engineer: feat/);
  assert.equal(fs.existsSync(path.join(dir, '.great_cto', 'tasks.md')), false);
});

test('a workspace is skipped by the registry under its own reason', () => {
  assert.equal(scratchReason('/home/x/repo/.claude/worktrees/t-1', {}), 'workspace');
  assert.equal(scratchReason('/home/x/repo', {}), null);
});
