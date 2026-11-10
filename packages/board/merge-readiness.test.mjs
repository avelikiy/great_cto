// The merge-readiness card (design v12): seven checks bound to the branch head.
// What must never happen: a check that could not be read counting as passed, a
// green gate on an older head counting for this one, or a merge command shown
// while any row is open.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  evaluate, resolveBranch, readReviewerVerdicts, readFacts, readinessFor, readGateQueue, startGate,
} from './lib/merge-readiness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HEAD = 'a'.repeat(40);
const madeDirs = [];
const tmp = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-')); madeDirs.push(dir); return dir; };
after(() => { for (const dir of madeDirs) fs.rmSync(dir, { recursive: true, force: true }); });

const allPass = (over = {}) => ({
  branch: 'task/x', integration: 'origin/main', head: HEAD, ahead: 2, worktree: '/w', dirty: 0,
  pr: { number: 7, state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE', url: 'https://github.com/o/r/pull/7', headRefOid: HEAD, body: '' },
  threads: 0, files: ['scripts/a.mjs'], designLink: null,
  gateRuns: [{ sha: HEAD.slice(0, 8), branch: 'task/x', result: 'green', failed: [] }],
  gateQueue: null, gateRunnable: true,
  verdicts: { 'code-reviewer': 'APPROVED', 'qa-engineer': 'PASS' },
  linkedIssues: true, subtasks: [], checkedAt: '2026-11-08T10:00:00.000Z', ...over,
});
const rowOf = (card, id) => card.rows.find((r) => r.id === id);

test('every row passing makes the card ready and gives the command pinned to the head', () => {
  const card = evaluate(allPass());
  assert.equal(card.blockers, 0);
  assert.equal(card.ready, true);
  assert.equal(card.mergeCommand, `gh pr merge 7 --merge --match-head-commit ${HEAD}`);
  assert.deepEqual(card.rows.map((r) => r.id), ['branch', 'pr', 'gate', 'reviewers', 'comments', 'subtasks', 'design']);
});

for (const [name, over, id] of [
  ['git could not count commits', { ahead: null }, 'branch'],
  ['gh failed', { pr: null, threads: null }, 'pr'],
  ['the gate history is unreadable', { gateRuns: null }, 'gate'],
  ['the verdict logs are unreadable', { verdicts: null }, 'reviewers'],
  ['review threads could not be read', { threads: null }, 'comments'],
  ['Beads could not be read', { subtasks: null }, 'subtasks'],
  ['the changed files could not be read', { files: null }, 'design'],
]) {
  test(`a check that was not read is a blocker, never a pass: ${name}`, () => {
    const card = evaluate(allPass(over));
    assert.equal(rowOf(card, id).state, 'not-read');
    assert.match(rowOf(card, id).detail, /Not read/);
    assert.equal(card.ready, false);
    assert.equal(card.mergeCommand, null, 'no command while a row is open');
  });
}

test('GitHub not having computed conflicts is not read, not "no conflicts"', () => {
  const card = evaluate(allPass({ pr: { ...allPass().pr, mergeable: 'UNKNOWN' } }));
  assert.equal(rowOf(card, 'pr').state, 'not-read');
});

for (const [name, pr, text] of [
  ['draft', { isDraft: true }, /draft/],
  ['conflicting', { mergeable: 'CONFLICTING' }, /conflicts/],
  ['stale head', { headRefOid: 'b'.repeat(40) }, /is on bbbbbbb/],
  ['closed', { state: 'CLOSED' }, /closed/],
]) {
  test(`pull request blocks when ${name}`, () => {
    const row = rowOf(evaluate(allPass({ pr: { ...allPass().pr, ...pr } })), 'pr');
    assert.equal(row.state, 'fail');
    assert.match(row.detail, text);
  });
}

test('a branch with no PR blocks, and review comments are then not applicable', () => {
  const card = evaluate(allPass({ pr: { missing: true }, threads: null }));
  assert.equal(rowOf(card, 'pr').state, 'fail');
  assert.equal(rowOf(card, 'comments').state, 'na');
  assert.equal(card.mergeCommand, null);
});

test('branch row: zero ahead and uncommitted changes block; the boundary of one commit passes', () => {
  assert.equal(rowOf(evaluate(allPass({ ahead: 0 })), 'branch').state, 'fail');
  assert.equal(rowOf(evaluate(allPass({ dirty: 1 })), 'branch').state, 'fail');
  assert.equal(rowOf(evaluate(allPass({ ahead: 1 })), 'branch').state, 'pass');
});

test('a green gate on an older head does not count for this one', () => {
  const row = rowOf(evaluate(allPass({ gateRuns: [{ sha: 'cccccccc', branch: 'task/x', result: 'green' }] })), 'gate');
  assert.equal(row.state, 'fail');
  assert.match(row.detail, /older head \(ccccccc\)/);
  assert.deepEqual(row.action, { kind: 'run-gate', label: 'Run gate' });
});

test('the newest run on the head decides: red after green is red, and names the step', () => {
  const sha = HEAD.slice(0, 8);
  const row = rowOf(evaluate(allPass({ gateRuns: [{ sha, result: 'green' }, { sha, result: 'red', failed: ['lib tests'] }] })), 'gate');
  assert.equal(row.state, 'fail');
  assert.match(row.detail, /Red on this head: lib tests/);
});

test('a skipped-tests run on the head passes and says so', () => {
  const row = rowOf(evaluate(allPass({ gateRuns: [{ sha: HEAD.slice(0, 8), result: 'skipped' }] })), 'gate');
  assert.equal(row.state, 'pass');
  assert.match(row.detail, /some tests skipped/);
});

test('a queued run is shown with its reason and blocks a second start', () => {
  const row = rowOf(evaluate(allPass({ gateRuns: [], gateQueue: { branch: 'task/x', state: 'queued', idle: 4, ahead: 1 } })), 'gate');
  assert.equal(row.queue, 'queued — waiting for a quiet machine (CPU 4% idle, 1 gate ahead)');
  assert.deepEqual(row.action, { kind: 'disabled', label: 'Queued' });
});

test('a gate queued on another branch hides Run gate on this one', () => {
  const row = rowOf(evaluate(allPass({ gateRuns: [], gateQueue: { branch: 'other', state: 'running' } })), 'gate');
  assert.equal(row.action, null);
  assert.equal(row.queue, undefined);
});

test('Run gate needs a worktree with a local gate', () => {
  assert.equal(rowOf(evaluate(allPass({ gateRuns: [], gateRunnable: false })), 'gate').action, null);
});

test('reviewers: one missing verdict blocks and names who', () => {
  const row = rowOf(evaluate(allPass({ verdicts: { 'code-reviewer': 'APPROVED', 'qa-engineer': null } })), 'reviewers');
  assert.equal(row.state, 'fail');
  assert.match(row.detail, /qa-engineer: no verdict on this head/);
});

test('review threads: an open thread blocks and offers text for an agent, without merging', () => {
  const row = rowOf(evaluate(allPass({ threads: 2 })), 'comments');
  assert.equal(row.state, 'fail');
  assert.equal(row.action.kind, 'copy');
  assert.match(row.action.text, /Do not merge/);
});

test('subtasks: an open child blocks; no linked issue is not applicable', () => {
  assert.equal(rowOf(evaluate(allPass({ subtasks: ['x.1'] })), 'subtasks').action.issue, 'x.1');
  assert.equal(rowOf(evaluate(allPass({ linkedIssues: false })), 'subtasks').state, 'na');
});

test('design: board files need an approval link; other files need none', () => {
  const board = ['packages/board/public/index.html'];
  assert.equal(rowOf(evaluate(allPass({ files: board })), 'design').state, 'fail');
  assert.equal(rowOf(evaluate(allPass({ files: board, designLink: 'https://claude.ai/artifact/x' })), 'design').state, 'pass');
  assert.equal(rowOf(evaluate(allPass()), 'design').state, 'na');
});

test('every row that passes carries the short line the phone layout shows', () => {
  for (const r of evaluate(allPass()).rows) assert.ok(r.brief, `${r.id} has a brief`);
  assert.equal(rowOf(evaluate(allPass()), 'branch').brief, '2 ahead, clean');
  assert.equal(rowOf(evaluate(allPass()), 'design').brief, 'not required');
});

test('a blocker keeps its shorter phone wording from the approved design', () => {
  const gate = rowOf(evaluate(allPass({ gateRuns: [{ sha: 'cccccccc', branch: 'task/x', result: 'green' }], gateQueue: { branch: 'task/x', state: 'queued', idle: 4, ahead: 1 } })), 'gate');
  assert.equal(gate.brief, 'Green only on an older head.');
  assert.equal(gate.queueBrief, 'queued — waiting for a quiet machine');
  const sub = rowOf(evaluate(allPass({ subtasks: ['x.1'] })), 'subtasks');
  assert.equal(sub.brief, '1 open in Beads');
  assert.equal(sub.action.narrowLabel, 'Show subtask');
});

test('resolveBranch: a workspace a host made is found through its record, and a stale record is not', async () => {
  const common = tmp();
  fs.mkdirSync(path.join(common, 'great-cto-workspaces'));
  const record = (branch) => fs.writeFileSync(path.join(common, 'great-cto-workspaces', 't-1.json'), JSON.stringify({ branch }));
  const exec = (known) => async (_cmd, args) => {
    if (args.includes('rev-parse')) return common + '\n';
    if (args.includes('refs/heads/' + known)) return '';
    throw new Error('no such ref');
  };
  record('host-branch');
  assert.equal(await resolveBranch({ issueIds: ['t-1'] }, { root: '/r', exec: exec('host-branch') }), 'host-branch');
  assert.equal(await resolveBranch({ issueIds: ['t-1'] }, { root: '/r', exec: exec('other') }), null);
  record('--upload-pack=x');
  assert.equal(await resolveBranch({ issueIds: ['t-1'] }, { root: '/r', exec: exec('--upload-pack=x') }), null);
  assert.equal(await resolveBranch({ issueIds: ['../x'] }, { root: '/r', exec: exec('host-branch') }), null);
});

test('resolveBranch: a recorded publication wins, an unsafe one is ignored, then task/<id>, else null', async () => {
  const none = async () => { throw new Error('no ref'); };
  const some = async () => '';
  assert.equal(await resolveBranch({ publication: { branch: 'feat/a' } }, { root: '/r', exec: none }), 'feat/a');
  assert.equal(await resolveBranch({ publication: { branch: '--upload-pack=x' } }, { root: '/r', exec: none }), null);
  assert.equal(await resolveBranch({ issueIds: ['great_cto-1'] }, { root: '/r', exec: some }), 'task/great_cto-1');
  assert.equal(await resolveBranch({ issueIds: ['great_cto-1'] }, { root: '/r', exec: none }), null);
  assert.equal(await resolveBranch({}, { root: '/r', exec: some }), null);
});

test('readinessFor: a task with no branch gets no card', async () => {
  assert.deepEqual(await readinessFor('/r', { key: 'task:1' }, { exec: async () => { throw new Error('x'); } }), { branch: null });
});

test('readReviewerVerdicts takes the newest verdict on this head and skips plain-text lines', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.great_cto', 'verdicts'), { recursive: true });
  const line = (verdict, head) => JSON.stringify({ verdict, receipt: { head } });
  fs.writeFileSync(path.join(dir, '.great_cto', 'verdicts', 'code-reviewer.log'),
    ['old plain text', line('BLOCKED', HEAD), line('APPROVED', HEAD), line('BLOCKED', 'f'.repeat(40))].join('\n'));
  assert.deepEqual(readReviewerVerdicts([dir], HEAD), { 'code-reviewer': 'APPROVED', 'qa-engineer': null });
});

function fakeExec({ gh } = {}) {
  return async (cmd, args) => {
    if (cmd === 'gh') return gh(args);
    const joined = args.join(' ');
    if (joined.includes('rev-parse')) return HEAD;
    if (joined.includes('rev-list')) return '2';
    if (joined.includes('worktree list')) return '';
    if (joined.includes('symbolic-ref')) return 'refs/remotes/origin/main';
    return '';
  };
}

test('readFacts: GitHub saying there is no PR is a fact; any other gh failure is not read', async () => {
  const root = tmp();
  const missing = await readFacts(root, { branch: 'b', exec: fakeExec({ gh: async () => { throw Object.assign(new Error('x'), { stderr: 'no pull requests found for branch' }); } }) });
  assert.deepEqual(missing.pr, { missing: true });
  const down = await readFacts(root, { branch: 'b', exec: fakeExec({ gh: async () => { throw Object.assign(new Error('x'), { stderr: 'HTTP 502' }); } }) });
  assert.equal(down.pr, null);
  assert.equal(rowOf(evaluate(down), 'pr').state, 'not-read');
});

test('readGateQueue: no file or a dead pid is nothing queued; a live pid is', () => {
  const root = tmp();
  assert.equal(readGateQueue(root), null);
  fs.mkdirSync(path.join(root, '.great_cto'));
  const file = path.join(root, '.great_cto', 'gate-queue.json');
  fs.writeFileSync(file, JSON.stringify({ branch: 'b', pid: 2 ** 30 }));
  assert.equal(readGateQueue(root), null);
  fs.writeFileSync(file, JSON.stringify({ branch: 'b', pid: process.pid }));
  assert.equal(readGateQueue(root).branch, 'b');
});

function gateFixture() {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.writeFileSync(path.join(root, 'scripts', 'ci-local.sh'), '');
  const porcelain = [`worktree ${root}`, `HEAD ${HEAD}`, 'branch refs/heads/feat/a', '', ''].join('\n');
  const list = async () => porcelain;
  return { root, exec: list, entry: { publication: { branch: 'feat/a' } } };
}

test('startGate runs detached on the worktree git reports and records the queue', async () => {
  const { root, exec, entry } = gateFixture();
  let call;
  const result = await startGate(root, entry, { exec, spawnFn: (...a) => { call = a; return { pid: process.pid, unref() {} }; } });
  assert.equal(result.status, 202);
  assert.equal(call[0], 'bash');
  assert.match(call[1][0], /gate-run\.sh$/);
  assert.deepEqual(call[1].slice(1), [root, 'feat/a', root]);
  assert.equal(call[2].detached, true);
  assert.equal(readGateQueue(root).state, 'queued');
});

test('startGate refuses a second run, a branch without a worktree and a task without a branch', async () => {
  const { root, exec, entry } = gateFixture();
  const spawnFn = () => { throw new Error('must not start'); };
  fs.mkdirSync(path.join(root, '.great_cto'));
  fs.writeFileSync(path.join(root, '.great_cto', 'gate-queue.json'), JSON.stringify({ branch: 'other', pid: process.pid }));
  assert.equal((await startGate(root, entry, { exec, spawnFn })).status, 409);
  assert.equal((await startGate(root, entry, { exec: async () => '', spawnFn })).status, 409);
  assert.equal((await startGate(root, {}, { exec, spawnFn })).status, 404);
});

test('gate-run.sh waits for a quiet machine, cleans its queue file and removes only what it linked', () => {
  const src = fs.readFileSync(path.join(HERE, 'lib', 'gate-run.sh'), 'utf8');
  assert.match(src, /trap cleanup EXIT/);
  assert.match(src, /-ge 30/);
  assert.match(src, /ci-local\.sh --e2e --jobs=8/);
  assert.match(src, /\[ -L "\$W\/\$d" \] && rm -f/);
});

function viewContext() {
  const sandbox = { window: {}, document: {}, setInterval() {}, setTimeout() {}, URLSearchParams, encodeURIComponent };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(HERE, 'public', 'assets', 'work-view.js'), 'utf8'), sandbox);
  return sandbox.window.GctoWork;
}

test('the card renders the approved wording, puts no script through, and shows the command only when ready', () => {
  const view = viewContext();
  const blocked = view.renderReadiness(evaluate(allPass({ threads: 3, ahead: 0 })));
  assert.match(blocked, /Ready to merge\? Not yet — 2 blockers/);
  assert.match(blocked, /Not ready — 2 blockers/);
  assert.match(blocked, /BLOCKERS FIRST/);
  assert.match(blocked, /counts as a blocker, never as passed/);
  assert.doesNotMatch(blocked, /rdy-ok"/);
  const ready = view.renderReadiness(evaluate(allPass()));
  assert.match(ready, /Copy command/);
  assert.match(ready, new RegExp(`--match-head-commit ${HEAD}`));
  const hostile = evaluate(allPass({ subtasks: ['<img src=x onerror=1>'] }));
  assert.doesNotMatch(view.renderReadiness(hostile), /<img/);
});

test('a link action outside GitHub or Claude is dropped', () => {
  const view = viewContext();
  const card = evaluate(allPass({ pr: { ...allPass().pr, url: 'javascript:alert(1)' } }));
  assert.doesNotMatch(view.renderReadiness(card), /javascript:/);
});

test('copy says Copied only when the clipboard took the text', () => {
  const src = fs.readFileSync(path.join(HERE, 'public', 'assets', 'work-view.js'), 'utf8');
  const body = src.slice(src.indexOf('async function readinessClick'), src.indexOf("copy.textContent = 'Copied'"));
  assert.match(body, /await navigator\.clipboard\.writeText[\s\S]*catch \{ status\([^)]*\); return; \}/);
});

let child, port;
before(async () => {
  port = await new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  child = spawn(process.execPath, [path.join(HERE, 'server.mjs'), '--no-open'], { cwd: tmp(), env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  for (let i = 0; i < 100; i += 1) {
    const up = await new Promise((resolve) => { const r = http.get({ host: '127.0.0.1', port, path: '/' }, (res) => { res.resume(); resolve(true); }); r.on('error', () => resolve(false)); });
    if (up) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('board did not start');
});
after(() => child?.kill());

function call(method, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: pathname, method, headers, timeout: 20000 }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', reject); r.end();
  });
}

test('route: an unknown task is 404 and the wrong method is 405', async () => {
  assert.equal((await call('GET', '/api/work/readiness?task=nope')).status, 404);
  assert.equal((await call('POST', '/api/work/readiness?task=nope')).status, 405);
  assert.equal((await call('GET', '/api/work/readiness/run-gate?task=nope')).status, 405);
});

test('route: starting a gate from another origin is refused before anything else', async () => {
  const res = await call('POST', '/api/work/readiness/run-gate?task=nope', { Origin: 'https://evil.example', Host: 'evil.example' });
  assert.equal(res.status, 403);
});
