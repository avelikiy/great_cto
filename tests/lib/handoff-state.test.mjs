// /save wrote what was done; it never wrote WHERE the work stood. Several
// sessions share one working tree, so the next session inherits a branch, a
// dirty tree and a dev server it did not start — and a note that says "done"
// with nothing a later session can run to prove it. /resume then summarised
// that note as current even when other sessions had committed on top of it.
//
// handoff-state is the deterministic half: capture the run state at save time,
// and at resume time say how far the tree has moved since.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  captureState, staleness, parseLsof, parseLog, classifyVerify, renderRunState,
} from '../../scripts/lib/handoff-state.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/lib/handoff-state.mjs');

// A commit in a temp repo must not depend on the machine's git identity, its
// signing setup, or its hooks.
Object.assign(process.env, {
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
});

const made = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

function tmp(prefix) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  made.push(d);
  return d;
}
function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
function repo() {
  const d = tmp('gcto-handoff-');
  git(d, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(d, 'a.txt'), 'one\n');
  git(d, 'add', '.');
  git(d, 'commit', '-q', '-m', 'first');
  return d;
}
function commit(d, file, msg) {
  fs.writeFileSync(path.join(d, file), `${msg}\n`);
  git(d, 'add', file);
  git(d, 'commit', '-q', '-m', msg);
}
const NO_SERVERS = { probeServers: false };

// ── capture ────────────────────────────────────────────────────────────────

test('a clean tree: branch, sha, nothing dirty, no stash', () => {
  const d = repo();
  const s = captureState({ cwd: d, ...NO_SERVERS });
  assert.equal(s.inRepo, true);
  assert.equal(s.branch, 'main');
  assert.equal(s.sha, git(d, 'rev-parse', 'HEAD'));
  assert.equal(s.shortSha, git(d, 'rev-parse', '--short', 'HEAD'));
  assert.deepEqual(s.dirty, []);
  assert.equal(s.dirtyTotal, 0);
  assert.equal(s.stashCount, 0);
  assert.equal(s.upstream, null);
  assert.equal(s.worktree, d);
  assert.match(s.capturedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

test('a dirty tree lists each file with its status, renames and odd names intact', () => {
  const d = repo();
  fs.writeFileSync(path.join(d, 'a.txt'), 'changed\n');
  fs.writeFileSync(path.join(d, 'new file.txt'), 'x\n');
  commit(d, 'b.txt', 'second');
  git(d, 'mv', 'b.txt', 'c.txt');
  const s = captureState({ cwd: d, ...NO_SERVERS });
  const byPath = Object.fromEntries(s.dirty.map((f) => [f.path, f.status]));
  assert.equal(byPath['a.txt'], 'M');
  assert.equal(byPath['new file.txt'], '??');
  assert.equal(byPath['c.txt'], 'R');
  assert.equal(s.dirty.find((f) => f.path === 'c.txt').from, 'b.txt');
  assert.equal(s.dirtyTotal, 3);
});

test('the dirty list is capped at 30 and says how many it left out', () => {
  const d = repo();
  for (let i = 0; i < 35; i++) fs.writeFileSync(path.join(d, `f${String(i).padStart(2, '0')}.txt`), 'x');
  const s = captureState({ cwd: d, ...NO_SERVERS });
  assert.equal(s.dirty.length, 30);
  assert.equal(s.dirtyTotal, 35);
  assert.match(renderRunState(s), /and 5 more/);
});

test('ahead/behind is read against the upstream when there is one', () => {
  const origin = repo();
  const clone = tmp('gcto-handoff-clone-');
  git(clone, 'clone', '-q', origin, '.');
  commit(clone, 'mine.txt', 'local only');
  commit(origin, 'theirs.txt', 'remote only');
  git(clone, 'fetch', '-q');
  const s = captureState({ cwd: clone, ...NO_SERVERS });
  assert.equal(s.upstream, 'origin/main');
  assert.equal(s.ahead, 1);
  assert.equal(s.behind, 1);
});

test('the stash is counted and never touched', () => {
  const d = repo();
  fs.writeFileSync(path.join(d, 'a.txt'), 'stashed\n');
  git(d, 'stash', 'push', '-q', '-m', 'someone else\'s work');
  const before = git(d, 'stash', 'list');
  const refBefore = git(d, 'rev-parse', 'refs/stash');
  const s = captureState({ cwd: d, ...NO_SERVERS });
  assert.equal(s.stashCount, 1);
  assert.equal(git(d, 'stash', 'list'), before);
  assert.equal(git(d, 'rev-parse', 'refs/stash'), refBefore);
  assert.equal(fs.readFileSync(path.join(d, 'a.txt'), 'utf8'), 'one\n', 'the working tree is not restored from the stash');
});

test('a linked worktree is reported as one', () => {
  const d = repo();
  const wt = path.join(tmp('gcto-handoff-wt-'), 'linked');
  git(d, 'worktree', 'add', '-q', '-b', 'side', wt);
  const s = captureState({ cwd: wt, ...NO_SERVERS });
  assert.equal(s.branch, 'side');
  assert.equal(s.worktree, wt);
  assert.equal(s.linkedWorktree, true);
  assert.equal(captureState({ cwd: d, ...NO_SERVERS }).linkedWorktree, false);
});

test('outside a git repository: no crash, and it says so', () => {
  const d = tmp('gcto-handoff-nogit-');
  const s = captureState({ cwd: d, ...NO_SERVERS, env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(d) } });
  assert.equal(s.inRepo, false);
  assert.equal(s.branch, null);
  assert.equal(s.sha, null);
  assert.deepEqual(s.dirty, []);
  assert.match(renderRunState(s), /not a git repository/);
});

test('a detached HEAD is named, not reported as an empty branch', () => {
  const d = repo();
  commit(d, 'b.txt', 'second');
  git(d, 'checkout', '-q', 'HEAD~1');
  const s = captureState({ cwd: d, ...NO_SERVERS });
  assert.equal(s.branch, null);
  assert.equal(s.detached, true);
  assert.match(renderRunState(s), /detached/);
});

test('the rendered block carries a machine-readable marker /resume can check against', () => {
  const d = repo();
  const s = captureState({ cwd: d, ...NO_SERVERS });
  const md = renderRunState(s);
  assert.match(md, /^## Run state/m);
  assert.ok(md.includes(`<!-- handoff-state saved_at=${s.capturedAt} sha=${s.sha} branch=main -->`));
  assert.ok(md.includes(`main\` @ \`${s.shortSha}`));
});

test('the home directory is written as ~ so a committed log leaks no user path', () => {
  const s = { inRepo: true, branch: 'main', sha: 'a'.repeat(40), shortSha: 'aaaaaaa', dirty: [], dirtyTotal: 0,
    stashCount: 0, upstream: null, worktree: path.join(os.homedir(), 'proj'), linkedWorktree: true,
    servers: [], capturedAt: '2026-09-27T10:00:00.000Z' };
  const md = renderRunState(s);
  assert.ok(!md.includes(os.homedir()), md);
  assert.match(md, /~\/proj/);
});

// ── servers ────────────────────────────────────────────────────────────────

test('lsof output: only dev ports, no OS daemons, deduplicated across IPv4/IPv6', () => {
  const out = [
    'COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME',
    'node    41200 me   23u  IPv4 0x1      0t0  TCP 127.0.0.1:5173 (LISTEN)',
    'node    41200 me   24u  IPv6 0x2      0t0  TCP [::1]:5173 (LISTEN)',
    'Python  41300 me    3u  IPv4 0x3      0t0  TCP *:8000 (LISTEN)',
    'rapportd  500 me    4u  IPv4 0x4      0t0  TCP *:49152 (LISTEN)',
    'ControlCe 714 me    9u  IPv4 0x5      0t0  TCP *:5000 (LISTEN)',
  ].join('\n');
  assert.deepEqual(parseLsof(out), [
    { command: 'node', pid: 41200, port: 5173 },
    { command: 'Python', pid: 41300, port: 8000 },
  ]);
  assert.deepEqual(parseLsof(''), []);
  assert.deepEqual(parseLsof('garbage\nmore garbage'), []);
});

test('a missing or failing lsof never fails the capture', () => {
  const d = repo();
  const s = captureState({ cwd: d, lsof: () => { throw new Error('lsof: not found'); } });
  assert.deepEqual(s.servers, []);
  const s2 = captureState({ cwd: d, lsof: () => 'node 1 me 3u IPv4 0 0t0 TCP *:3000 (LISTEN)' });
  assert.deepEqual(s2.servers, [{ command: 'node', pid: 1, port: 3000 }]);
});

// ── staleness ──────────────────────────────────────────────────────────────

test('nothing since the note: not stale', () => {
  const d = repo();
  const s = captureState({ cwd: d, ...NO_SERVERS });
  const st = staleness({ cwd: d, savedAt: s.capturedAt, sha: s.sha, branch: 'main' });
  assert.equal(st.stale, false);
  assert.equal(st.commitsSince, 0);
  assert.equal(st.branchChanged, false);
});

test('commits after the note are counted and listed, newest first, capped at 10', () => {
  const d = repo();
  const s = captureState({ cwd: d, ...NO_SERVERS });
  for (let i = 1; i <= 12; i++) commit(d, `n${i}.txt`, `later ${i}`);
  const st = staleness({ cwd: d, savedAt: s.capturedAt, sha: s.sha, branch: 'main' });
  assert.equal(st.stale, true);
  assert.equal(st.commitsSince, 12);
  assert.equal(st.commits.length, 10);
  assert.equal(st.commits[0].subject, 'later 12');
  assert.match(st.commits[0].sha, /^[0-9a-f]{7,}$/);
});

test('a branch switch is detected by name', () => {
  const d = repo();
  const s = captureState({ cwd: d, ...NO_SERVERS });
  git(d, 'checkout', '-q', '-b', 'other');
  const st = staleness({ cwd: d, savedAt: s.capturedAt, sha: s.sha, branch: 'main' });
  assert.equal(st.branchChanged, true);
  assert.equal(st.currentBranch, 'other');
  assert.equal(st.stale, true);
});

test('a saved sha that is no longer under HEAD counts as the branch having moved away', () => {
  const d = repo();
  git(d, 'checkout', '-q', '-b', 'feature');
  commit(d, 'f.txt', 'feature work');
  const s = captureState({ cwd: d, ...NO_SERVERS });
  git(d, 'checkout', '-q', 'main');
  // No branch recorded (an older note) — ancestry still tells.
  const st = staleness({ cwd: d, savedAt: s.capturedAt, sha: s.sha });
  assert.equal(st.branchChanged, true);
  assert.equal(st.shaOnHead, false);
});

test('a sha git does not know falls back to the saved time', () => {
  const d = repo();
  commit(d, 'late.txt', 'after the note');
  const st = staleness({ cwd: d, savedAt: '2000-01-01T00:00:00Z', sha: 'f'.repeat(40) });
  assert.equal(st.shaKnown, false);
  assert.equal(st.commitsSince, 2);
  assert.equal(st.stale, true);
});

test('staleness outside a repository does not throw', () => {
  const d = tmp('gcto-handoff-nogit-');
  const st = staleness({ cwd: d, savedAt: '2026-01-01T00:00:00Z', sha: 'abc',
    env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(d) } });
  assert.equal(st.inRepo, false);
  assert.equal(st.stale, false);
});

// ── the log ────────────────────────────────────────────────────────────────

const LOG = `---
date: 2026-09-27
time: 10:00
---

# Session: handoff fields

## Goal

Make /resume say when its note is stale.

## Start here

1. Run the resume command against a note two commits old.
2. Then this.

## Run state

<!-- handoff-state saved_at=2026-09-27T10:00:00.000Z sha=${'a'.repeat(40)} branch=tw/x -->
- branch: \`tw/x\` @ \`aaaaaaa\`

## Done

- added handoff-state.mjs
  Verify: \`node --test tests/lib/handoff-state.test.mjs\` → all pass
- wired the deploy
  Verify: \`./deploy.sh --check\`
- wrote the docs
  Verify: not verified — nothing to run for prose
- touched the site
`;

test('the log is read back: marker, goal, first step, and each done item with its Verify', () => {
  const p = parseLog(LOG);
  assert.equal(p.savedAt, '2026-09-27T10:00:00.000Z');
  assert.equal(p.sha, 'a'.repeat(40));
  assert.equal(p.branch, 'tw/x');
  assert.equal(p.goal, 'Make /resume say when its note is stale.');
  assert.equal(p.firstStep, 'Run the resume command against a note two commits old.');
  assert.equal(p.done.length, 4);
  assert.deepEqual(p.done[0], { item: 'added handoff-state.mjs',
    verify: { command: 'node --test tests/lib/handoff-state.test.mjs', expect: 'all pass', kind: 'cheap' } });
  assert.equal(p.done[1].verify.kind, 'unsafe');
  assert.equal(p.done[2].verify.kind, 'none');
  assert.match(p.done[2].verify.reason, /nothing to run/);
  assert.equal(p.done[3].verify, null, 'a done item with no Verify line is reported as such');
});

test('an older note with no marker still yields a saved time from its frontmatter', () => {
  const p = parseLog('---\ndate: 2026-09-01\ntime: 14:30\n---\n# Session: x\n## Done\n- y\n');
  assert.equal(p.sha, null);
  assert.ok(p.savedAt && !Number.isNaN(Date.parse(p.savedAt)));
  assert.equal(new Date(p.savedAt).getDate(), 1);
});

test('re-running a Verify is only offered for commands that cannot change anything', () => {
  for (const c of ['node --test tests/lib/x.test.mjs', 'git log --oneline -3', 'grep -n foo bar.md',
    'npm test -- tests/lib/x.test.mjs', 'git status --short']) {
    assert.equal(classifyVerify(c), 'cheap', c);
  }
  for (const c of ['git push', 'rm -rf dist', './deploy.sh', 'npm publish', 'git commit -am x',
    'gcloud builds submit .', 'git stash', 'git checkout -- a.txt', 'node x.mjs > out.txt', 'curl -X POST https://x']) {
    assert.equal(classifyVerify(c), 'unsafe', c);
  }
  for (const c of ['bash scripts/ci-local.sh', 'npx playwright test', 'npm run build', 'npm test']) {
    assert.equal(classifyVerify(c), 'slow', c);
  }
});

// ── CLI ────────────────────────────────────────────────────────────────────

function cli(cwd, ...args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

test('CLI capture prints the Run state block; --json prints the object', () => {
  const d = repo();
  const md = cli(d, 'capture', '--no-servers');
  assert.equal(md.status, 0, md.stderr);
  assert.match(md.stdout, /^## Run state/m);
  const js = cli(d, 'capture', '--no-servers', '--json');
  assert.equal(JSON.parse(js.stdout).branch, 'main');
});

test('CLI check against a log file says how many commits landed since, at the top', () => {
  const d = repo();
  const s = captureState({ cwd: d, ...NO_SERVERS });
  fs.mkdirSync(path.join(d, '.great_cto/logs'), { recursive: true });
  const log = path.join(d, '.great_cto/logs/session-x.md');
  fs.writeFileSync(log, `# Session: x\n\n${renderRunState(s)}\n## Done\n\n- a thing\n  Verify: \`git log -1\`\n`);
  commit(d, 'n.txt', 'someone else landed this');
  const r = cli(d, 'check', '--log', log);
  assert.equal(r.status, 0, r.stderr);
  const first = r.stdout.split('\n')[0];
  assert.match(first, /1 commit since this note/);
  assert.match(first, /may be stale/);
  assert.match(r.stdout, /someone else landed this/);
  const j = JSON.parse(cli(d, 'check', '--log', log, '--json').stdout);
  assert.equal(j.staleness.commitsSince, 1);
  assert.equal(j.log.done[0].verify.kind, 'cheap');
});

test('CLI check with --saved-at/--sha and nothing new reports the note current', () => {
  const d = repo();
  const s = captureState({ cwd: d, ...NO_SERVERS });
  const r = cli(d, 'check', '--saved-at', s.capturedAt, '--sha', s.sha);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout.split('\n')[0], /current/);
});

test('CLI with no usable input exits 2 with usage, not a stack trace', () => {
  const d = repo();
  const r = cli(d, 'check');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage/i);
  assert.equal(cli(d, 'bogus').status, 2);
});
