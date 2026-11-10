// ADR-047 phase 1: which of five states a claim is in, when a worktree may be
// removed, and which port a workspace gets. The failures that matter are the quiet
// ones: a read that failed being taken for "nothing there", and an untracked file
// being taken for "clean".
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validTaskId, detectHost, claimState, archiveVerdict, recordProvenance, readProvenance,
  preferredPort, listeners, allocatePort, workspaceEnv, portsFile,
} from '../../scripts/lib/workspace.mjs';
import { WORKTREE_DIR, worktreePath, integrationRef } from '../../scripts/lib/worktree-state.mjs';
import { isLinkedWorktree, parseLsof, DEV_PORTS, WORKSPACE_PORT_FIRST, WORKSPACE_PORT_LAST } from '../../scripts/lib/handoff-state.mjs';

const made = [];
const tmp = () => { const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-'))); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

// A gate can run under a git hook, whose GIT_* variables would point these at the real repo.
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && !k.startsWith('CONDUCTOR_')));
const realGit = (cmd, args, opts = {}) => execFileSync(cmd, args, { ...opts, env: cleanEnv });
const git = (dir, ...args) => String(realGit('git', ['-C', dir, '-c', 'commit.gpgsign=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim();
const NO_HOST = {};

function repo({ commit = true } = {}) {
  const root = tmp();
  git(root, 'init', '-q', '-b', 'main');
  if (commit) { fs.writeFileSync(path.join(root, 'a.txt'), 'a\n'); git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'init'); }
  return root;
}
function addWorktree(root, id, branch = 'task/' + id) {
  const dir = worktreePath(root, id);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  git(root, 'worktree', 'add', '-q', '-b', branch, dir, 'main');
  return dir;
}
/** Real git, except that one subcommand fails the way a broken git does. */
const failing = (word, status = 128) => (cmd, args, opts) => {
  if (args.includes(word)) throw Object.assign(new Error('git failed'), { status });
  return realGit(cmd, args, opts);
};
const claim = (root, id, extra = {}) => claimState({ taskId: id, cwd: root, env: NO_HOST, exec: realGit, ...extra });

test('task ids that would escape the workspace directory or break a ref are refused', () => {
  for (const good of ['great_cto-ldws.3', 'a', 'A-1_b.2']) assert.equal(validTaskId(good), true, good);
  for (const bad of ['', '../x', 'a/b', 'a..b', '.a', 'a.', 'a.lock', '-a', 'a b', 'x'.repeat(121), null]) assert.equal(validTaskId(bad), false, String(bad));
});

test('claim: an invalid task id is unavailable and names no path', () => {
  const c = claim(repo(), '../evil');
  assert.equal(c.state, 'unavailable');
  assert.equal(c.path, undefined);
});

test('claim: create, from the integration ref, when nothing exists yet', () => {
  const root = repo();
  const c = claim(root, 't-1');
  assert.equal(c.state, 'create');
  assert.equal(c.path, path.join(root, WORKTREE_DIR, 't-1'));
  assert.equal(c.branch, 'task/t-1');
  assert.equal(c.from, 'refs/heads/main');
  assert.equal(c.branchExists, false);
  assert.equal(fs.existsSync(c.path), false, 'deciding creates nothing');
});

test('claim: after an archive the kept branch is picked up again', () => {
  const root = repo();
  const dir = addWorktree(root, 't-1');
  git(root, 'worktree', 'remove', dir);
  const c = claim(root, 't-1');
  assert.equal(c.state, 'create');
  assert.equal(c.branchExists, true);
});

test('claim: reuse is idempotent and asked the same from any directory in the main checkout', () => {
  const root = repo();
  const dir = addWorktree(root, 't-1');
  assert.deepEqual([claim(root, 't-1').state, claim(root, 't-1').path], ['reuse', dir]);
});

test('claim: a directory git does not know is a conflict and is left alone', () => {
  const root = repo();
  const dir = worktreePath(root, 't-1');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'unexplained'), 'x');
  const c = claim(root, 't-1');
  assert.equal(c.state, 'conflict');
  assert.match(c.reason, /does not know/);
  assert.equal(fs.existsSync(path.join(dir, 'unexplained')), true);
});

test('claim: the right directory on the wrong branch is a conflict', () => {
  const root = repo();
  addWorktree(root, 't-1', 'other');
  const c = claim(root, 't-1');
  assert.equal(c.state, 'conflict');
  assert.match(c.reason, /other/);
});

test('claim: the task branch checked out elsewhere is a conflict, so one task never has two worktrees', () => {
  const root = repo();
  const elsewhere = path.join(tmp(), 'wt');
  git(root, 'worktree', 'add', '-q', '-b', 'task/t-1', elsewhere, 'main');
  const c = claim(root, 't-1');
  assert.equal(c.state, 'conflict');
  assert.match(c.reason, /already checked out/);
});

test('claim: git still listing a worktree whose directory is gone is a conflict', () => {
  const root = repo();
  const dir = addWorktree(root, 't-1');
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(claim(root, 't-1').state, 'conflict');
});

test('claim: not a repository is unavailable', () => {
  assert.equal(claim(tmp(), 't-1').state, 'unavailable');
});

test('claim: a repository with no commits is unavailable', () => {
  const c = claim(repo({ commit: false }), 't-1');
  assert.equal(c.state, 'unavailable');
  assert.match(c.reason, /no commits/);
});

test('claim: a failed worktree listing is unavailable, never "nothing there, create it"', () => {
  const c = claim(repo(), 't-1', { exec: failing('list') });
  assert.equal(c.state, 'unavailable');
  assert.match(c.reason, /worktree list/);
});

test('claim: no integration ref to branch from is unavailable', () => {
  const root = repo();
  git(root, 'branch', '-m', 'main', 'trunk');
  assert.equal(claim(root, 't-1').state, 'unavailable');
});

test('claim: inside a linked worktree it adopts and creates nothing nested', () => {
  const root = repo();
  const elsewhere = path.join(tmp(), 'wt');
  git(root, 'worktree', 'add', '-q', '-b', 'host-branch', elsewhere, 'main');
  const c = claim(elsewhere, 't-1');
  assert.equal(c.state, 'adopt');
  assert.equal(c.path, elsewhere);
  assert.equal(c.branch, 'host-branch', 'a host branch name is not ours to require');
  assert.equal(c.host, 'linked-worktree');
});

test('claim: the Conductor environment adopts', () => {
  const c = claim(repo(), 't-1', { env: { CONDUCTOR_PORT: '4000' } });
  assert.equal(c.state, 'adopt');
  assert.equal(c.host, 'conductor');
});

test('detectHost names each signal, and no signal is null', () => {
  const noLink = () => ({ ok: true, out: '/same' });
  const base = { cwd: '/r', env: {}, git: noLink, exists: () => false, commonRoot: '/r' };
  assert.equal(detectHost(base), null);
  assert.equal(detectHost({ ...base, env: { CONDUCTOR_WORKSPACE: 'x' } }).host, 'conductor');
  // A committed .conductor/ must not turn the shared main checkout into an adopted workspace.
  assert.equal(detectHost({ ...base, exists: (p) => p === path.join('/r', '.conductor') }), null);
  let linked = 0;
  assert.equal(detectHost({ ...base, git: () => ({ ok: true, out: '/q' + (linked += 1) }), exists: (p) => p === path.join('/r', '.conductor') }).host, 'conductor');
  assert.equal(detectHost({ ...base, cwd: '/r/.claude/worktrees/x/sub' }).host, 'claude-code');
  assert.equal(detectHost({ ...base, env: { NOT_CONDUCTOR_PORT: '1' } }), null);
  let n = 0;
  assert.equal(detectHost({ ...base, git: () => ({ ok: true, out: '/p' + (n += 1) }) }).host, 'linked-worktree');
});

function landed(root, id = 't-1') {
  const dir = addWorktree(root, id);
  recordProvenance(dir, 'created', { taskId: id, exec: realGit });
  return dir;
}
const verdict = (dir, extra = {}) => archiveVerdict(dir, { exec: realGit, ...extra });

test('archive: merged, clean and created by us may be removed', () => {
  const v = verdict(landed(repo()));
  assert.equal(v.remove, true);
  assert.equal(v.ref, 'refs/heads/main');
});

test('archive: an untracked file counts as dirty', () => {
  const dir = landed(repo());
  fs.writeFileSync(path.join(dir, 'new.test.mjs'), 'x');
  const v = verdict(dir);
  assert.equal(v.remove, false);
  assert.match(v.reason, /uncommitted or untracked/);
});

test('archive: a modified tracked file blocks', () => {
  const dir = landed(repo());
  fs.writeFileSync(path.join(dir, 'a.txt'), 'changed\n');
  assert.equal(verdict(dir).remove, false);
});

test('archive: a commit the integration branch lacks blocks', () => {
  const dir = landed(repo());
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'work');
  const v = verdict(dir);
  assert.equal(v.remove, false);
  assert.match(v.reason, /not merged/);
});

test('archive: the same commit passes once merged', () => {
  const root = repo();
  const dir = landed(root);
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'work');
  git(root, 'merge', '-q', '--no-edit', 'task/t-1');
  assert.equal(verdict(dir).remove, true);
});

for (const [name, word, status] of [
  ['status fails', 'status', 128],
  ['the merge probe fails', 'merge-base', 128],
  ['the merge probe times out', 'merge-base', null],
]) {
  test(`archive: a probe that cannot answer is a refusal: ${name}`, () => {
    const v = verdict(landed(repo()), { exec: failing(word, status) });
    assert.equal(v.remove, false);
    assert.match(v.reason, /could not/);
  });
}

test('archive: no integration ref is a refusal', () => {
  const root = repo();
  const dir = landed(root);
  git(root, 'branch', '-m', 'main', 'trunk');
  const v = verdict(dir);
  assert.equal(v.remove, false);
  assert.match(v.reason, /integration/);
});

test('archive: an adopted worktree is never ours to remove, however landed', () => {
  const dir = addWorktree(repo(), 't-1');
  recordProvenance(dir, 'adopted', { taskId: 't-1', exec: realGit });
  const v = verdict(dir);
  assert.equal(v.remove, false);
  assert.match(v.reason, /did not create/);
});

test('archive: a worktree with no provenance record is not ours either', () => {
  assert.equal(verdict(addWorktree(repo(), 't-1')).remove, false);
});

test('archive: an unreadable provenance record is a refusal', () => {
  const dir = landed(repo());
  fs.writeFileSync(path.resolve(dir, git(dir, 'rev-parse', '--git-path', 'great-cto-workspace.json')), '{not json');
  assert.equal(readProvenance(dir, { exec: realGit }), null);
  assert.equal(verdict(dir).remove, false);
});

test('provenance lives outside the tree, so recording it does not make the worktree dirty', () => {
  const dir = landed(repo());
  assert.equal(git(dir, 'status', '--porcelain'), '');
  assert.equal(readProvenance(dir, { exec: realGit }).provenance, 'created');
  assert.throws(() => recordProvenance(dir, 'mine', { taskId: 't', exec: realGit }));
});

test('the preferred port is stable and inside the workspace range', () => {
  assert.equal(preferredPort('t-1'), preferredPort('t-1'));
  for (let i = 0; i < 500; i += 1) {
    const p = preferredPort('task-' + i);
    assert.ok(p >= 3142 && p <= 3241, String(p));
  }
  assert.equal(WORKSPACE_PORT_FIRST, 3142);
  assert.equal(WORKSPACE_PORT_LAST, 3241);
});

test('listeners: lsof exit 1 is nobody; any other failure is unknown, not nobody', () => {
  assert.deepEqual(listeners(3142, { exec: () => '123\n456\n' }), [123, 456]);
  const thrower = (status) => () => { throw Object.assign(new Error('x'), { status }); };
  assert.deepEqual(listeners(3142, { exec: thrower(1) }), []);
  assert.equal(listeners(3142, { exec: thrower(127) }), null);
  assert.equal(listeners(3142, { exec: thrower(undefined) }), null);
});

function ports(extra = {}) {
  const file = path.join(tmp(), 'nested', 'ports.json');
  const base = { taskId: 't-1', path: '/w', pid: 100, env: { GREAT_CTO_PORTS_FILE: file }, isAlive: () => true, listening: () => [] };
  return { file, base: { ...base, ...extra }, write: (claims) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ claims })); } };
}

test('ports: the first claim gets the preferred port and writes it without a leftover temp file', () => {
  const { file, base } = ports();
  const r = allocatePort(base);
  assert.deepEqual([r.state, r.port], ['allocated', preferredPort('t-1')]);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).claims[0].taskId, 't-1');
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['ports.json']);
});

test('ports: the same task gets the same port back, also after its session died', () => {
  const { base } = ports();
  const first = allocatePort(base).port;
  const again = allocatePort({ ...base, pid: 200, isAlive: () => false });
  assert.deepEqual([again.state, again.port], ['reused', first]);
});

test('ports: a live claim holds its port even while a server is listening on it', () => {
  const { base } = ports();
  const first = allocatePort(base).port;
  const again = allocatePort({ ...base, listening: () => [999] });
  assert.deepEqual([again.state, again.port], ['reused', first]);
});

test('ports: a dead claim whose port something took moves up', () => {
  const { base } = ports();
  const first = allocatePort(base).port;
  const again = allocatePort({ ...base, isAlive: () => false, listening: (p) => (p === first ? [999] : []) });
  assert.equal(again.state, 'allocated');
  assert.notEqual(again.port, first);
});

test('ports: another live task on the preferred port moves this one up', () => {
  const { base, write } = ports();
  const want = preferredPort('t-1');
  write([{ taskId: 'other', port: want, path: '/o', pid: 5 }]);
  const r = allocatePort(base);
  assert.equal(r.port, want === 3241 ? 3142 : want + 1);
});

test('ports: a port something listens on is taken, whatever the file says', () => {
  const { base } = ports();
  const want = preferredPort('t-1');
  assert.notEqual(allocatePort({ ...base, listening: (p) => (p === want ? [7] : []) }).port, want);
});

test('ports: a dead claim of another task whose port is free is reclaimed and dropped', () => {
  const { file, base, write } = ports();
  const want = preferredPort('t-1');
  write([{ taskId: 'other', port: want, path: '/o', pid: 5 }]);
  const r = allocatePort({ ...base, isAlive: (pid) => pid !== 5 });
  assert.equal(r.port, want);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).claims.map((c) => c.taskId), ['t-1']);
});

test('ports: probing wraps from the top of the range', () => {
  const taskId = Array.from({ length: 5000 }, (_, i) => 'w' + i).find((id) => preferredPort(id) === 3241);
  const { base } = ports({ taskId });
  assert.equal(allocatePort({ ...base, listening: (p) => (p === 3241 ? [7] : []) }).port, 3142);
});

test('ports: every port taken is exhausted, and nothing is written', () => {
  const { file, base } = ports({ listening: () => [7] });
  assert.equal(allocatePort(base).state, 'exhausted');
  assert.equal(fs.existsSync(file), false);
});

test('ports: an lsof that cannot answer refuses rather than guessing free', () => {
  const { file, base } = ports({ listening: () => null });
  const r = allocatePort(base);
  assert.equal(r.state, 'refused');
  assert.match(r.reason, /could not check/);
  assert.equal(fs.existsSync(file), false);
});

for (const [name, text] of [['invalid JSON', '{trunc'], ['no claims list', '{"x":1}'], ['a malformed claim', '{"claims":[{"port":"x"}]}']]) {
  test(`ports: ${name} is refused and left as it was`, () => {
    const { file, base } = ports();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    assert.equal(allocatePort(base).state, 'refused');
    assert.equal(fs.readFileSync(file, 'utf8'), text);
  });
}

test('ports: a file that exists and cannot be read is refused, not treated as empty', () => {
  const { file, base } = ports();
  fs.mkdirSync(file, { recursive: true }); // reading a directory fails with EISDIR
  assert.equal(allocatePort(base).state, 'refused');
});

test('ports: an invalid task id allocates nothing', () => {
  const { file, base } = ports({ taskId: '../x' });
  assert.equal(allocatePort(base).state, 'refused');
  assert.equal(fs.existsSync(file), false);
});

test('the default ports file is machine-global; the environment can point elsewhere', () => {
  assert.equal(portsFile({}), path.join(os.homedir(), '.great_cto', 'ports.json'));
  assert.equal(portsFile({ GREAT_CTO_PORTS_FILE: '/x' }), '/x');
});

test('the workspace environment adds one new name and reuses the one the board honours', () => {
  assert.deepEqual(workspaceEnv(3150), { GREAT_CTO_WORKSPACE_PORT: '3150', BOARD_PORT: '3150' });
});

test('/save reports a server on a workspace port, at both ends of the range', () => {
  for (const p of [3142, 3241]) assert.ok(DEV_PORTS.has(p), String(p));
  assert.ok(!DEV_PORTS.has(3242));
  const out = 'node 123 me 12u IPv4 0x1 0t0 TCP *:3150 (LISTEN)\n';
  assert.deepEqual(parseLsof(out), [{ command: 'node', pid: 123, port: 3150 }]);
});

test('the linked-worktree probe says no when git cannot answer', () => {
  assert.equal(isLinkedWorktree(() => ({ ok: false, out: '' })), false);
  assert.equal(isLinkedWorktree(() => ({ ok: true, out: '/same' })), false);
  let n = 0;
  assert.equal(isLinkedWorktree(() => ({ ok: true, out: '/p' + (n += 1) })), true);
});

test('worktree-state exports the one reading of the path and of the integration ref', () => {
  assert.equal(worktreePath('/r', 'x'), path.join('/r', WORKTREE_DIR, 'x'));
  assert.equal(integrationRef(() => ''), null);
  assert.equal(integrationRef((a) => (a[0] === 'symbolic-ref' ? 'refs/remotes/origin/main' : '')), 'refs/remotes/origin/main');
});
