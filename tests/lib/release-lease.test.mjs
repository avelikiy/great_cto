// great_cto-inty: one writer per release version on this machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acquire, bind, check, release, status, holderFrom, leaseDir } from '../../scripts/lib/release-lease.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const C1 = 'a'.repeat(40), C2 = 'b'.repeat(40);
const T0 = new Date('2026-11-01T10:00:00Z');
const later = (h) => new Date(T0.getTime() + h * 3600000);

function tmp(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-lease-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}
const free = () => ({ calls: 0, tag() { this.calls += 1; return 'free'; }, async npm() { this.calls += 1; return 'free'; } });
const journal = (dir) => fs.readFileSync(path.join(dir, 'journal.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('a fresh claim is created atomically, private, and journaled', async (t) => {
  const dir = tmp(t);
  const r = await acquire({ version: '9.9.9', holder: 'claude:A', now: T0, dir, checks: free() });
  assert.equal(r.state, 'ACQUIRED');
  assert.equal(fs.statSync(r.file).mode & 0o777, 0o600);
  assert.deepEqual(journal(dir).map((e) => e.op), ['acquire']);
});

test('another session cannot claim a version that is held, and is told by whom', async (t) => {
  const dir = tmp(t);
  await acquire({ version: '9.9.9', holder: 'claude:A', now: T0, dir, checks: free() });
  const checks = free();
  const r = await acquire({ version: '9.9.9', holder: 'codex:B', now: later(1), dir, checks });
  assert.equal(r.state, 'HELD');
  assert.equal(r.by, 'claude:A');
  assert.equal(checks.calls, 0, 'a held version needs no network to refuse');
});

test('the holder renews its own claim without re-checking the remote it may have tagged', async (t) => {
  const dir = tmp(t);
  await acquire({ version: '9.9.9', holder: 'claude:A', now: T0, dir, checks: free() });
  const taken = { tag: () => 'taken', npm: async () => 'taken' };
  const r = await acquire({ version: '9.9.9', holder: 'claude:A', now: later(2), dir, checks: taken });
  assert.equal(r.state, 'RENEWED');
  assert.equal(r.expiresAt, later(14).toISOString());
});

test('an expired claim is taken over, and the old one is kept aside, not deleted', async (t) => {
  const dir = tmp(t);
  await acquire({ version: '9.9.9', holder: 'claude:A', now: T0, dir, checks: free() });
  const r = await acquire({ version: '9.9.9', holder: 'codex:B', now: later(13), dir, checks: free() });
  assert.equal(r.state, 'ACQUIRED');
  assert.equal(fs.readdirSync(dir).filter((f) => f.includes('.expired-')).length, 1);
  const takeover = journal(dir).find((e) => e.op === 'expired-takeover');
  assert.equal(takeover.previous, 'claude:A');
});

test('a version whose tag or npm version is taken is not claimed', async (t) => {
  const dir = tmp(t);
  for (const checks of [{ tag: () => 'taken', npm: async () => 'free' }, { tag: () => 'free', npm: async () => 'taken' }]) {
    const r = await acquire({ version: '9.9.9', holder: 'claude:A', now: T0, dir, checks });
    assert.equal(r.state, 'CLAIMED_REMOTELY');
  }
  assert.equal(status({ version: '9.9.9', dir }).state, 'FREE');
});

test('a remote that could not be read is not "free"', async (t) => {
  const dir = tmp(t);
  const r = await acquire({ version: '9.9.9', holder: 'claude:A', now: T0, dir, checks: { tag: () => 'unknown', npm: async () => 'free' } });
  assert.equal(r.state, 'REMOTE_UNKNOWN');
  assert.equal(status({ version: '9.9.9', dir }).state, 'FREE');
});

test('losing the race between read and create reports the winner', async (t) => {
  const dir = tmp(t);
  const racing = { tag: () => 'free', async npm() {
    fs.writeFileSync(path.join(dir, 'great-cto@9.9.9.json'), JSON.stringify({ holder: 'codex:B', acquiredAt: T0.toISOString(), expiresAt: later(12).toISOString() }));
    return 'free';
  } };
  const r = await acquire({ version: '9.9.9', holder: 'claude:A', now: T0, dir, checks: racing });
  assert.equal(r.state, 'HELD');
  assert.equal(r.by, 'codex:B');
});

test('check: a live claim, ours, bound to the approved commit — and nothing less', async (t) => {
  const dir = tmp(t);
  const v = '9.9.9', at = { now: later(1), dir };
  assert.match(check({ version: v, commit: C1, holder: 'claude:A', ...at }).why, /no release lease/);
  await acquire({ version: v, holder: 'claude:A', now: T0, dir, checks: free() });
  assert.match(check({ version: v, commit: C1, holder: 'claude:A', ...at }).why, /names no commit/);
  assert.equal(bind({ version: v, commit: C1, holder: 'claude:A', ...at }).state, 'BOUND');
  assert.equal(check({ version: v, commit: C1, holder: 'claude:A', ...at }).ok, true);
  assert.match(check({ version: v, commit: C2, holder: 'claude:A', ...at }).why, /bound to a{12}, not b{12}/);
  assert.match(check({ version: v, commit: C1, holder: 'codex:B', ...at }).why, /being released by claude:A/);
  assert.match(check({ version: v, commit: C1, holder: 'claude:A', now: later(13), dir }).why, /expired/);
  assert.equal(bind({ version: v, commit: C1, holder: 'codex:B', ...at }).state, 'REFUSED', 'only the holder binds');
});

test('a rebind to a new candidate is allowed and journaled', async (t) => {
  const dir = tmp(t);
  await acquire({ version: '9.9.9', holder: 'claude:A', now: T0, dir, checks: free() });
  bind({ version: '9.9.9', commit: C1, holder: 'claude:A', now: T0, dir });
  bind({ version: '9.9.9', commit: C2, holder: 'claude:A', now: T0, dir });
  assert.deepEqual(journal(dir).find((e) => e.op === 'rebind'), { at: T0.toISOString(), op: 'rebind', version: '9.9.9', holder: 'claude:A', from: C1, to: C2 });
});

test('release frees the version and keeps the record', async (t) => {
  const dir = tmp(t);
  await acquire({ version: '9.9.9', holder: 'claude:A', now: T0, dir, checks: free() });
  assert.equal(release({ version: '9.9.9', holder: 'codex:B', now: T0, dir }).state, 'REFUSED');
  assert.equal(release({ version: '9.9.9', holder: 'claude:A', now: T0, dir }).state, 'RELEASED');
  assert.equal(status({ version: '9.9.9', dir }).state, 'FREE');
  assert.equal(fs.readdirSync(dir).filter((f) => f.includes('.done-')).length, 1);
});

test('a lease file that does not parse stops the release rather than reading as free', async (t) => {
  const dir = tmp(t);
  fs.writeFileSync(path.join(dir, 'great-cto@9.9.9.json'), '{not json');
  await assert.rejects(acquire({ version: '9.9.9', holder: 'claude:A', now: T0, dir, checks: free() }), /unreadable/);
  assert.throws(() => check({ version: '9.9.9', commit: C1, holder: 'claude:A', dir }), /unreadable/);
});

test('the holder is the host session, stable across calls, distinct between hosts', () => {
  assert.equal(holderFrom({ GREAT_CTO_RELEASE_HOLDER: 'me', CLAUDE_CODE_SESSION_ID: 'x' }), 'me');
  assert.equal(holderFrom({ CLAUDE_CODE_SESSION_ID: 'x', CODEX_THREAD_ID: 'y' }), 'claude:x');
  assert.equal(holderFrom({ CODEX_THREAD_ID: 'y' }), 'codex:y');
  assert.equal(holderFrom({ CODEX_SESSION_ID: 'z' }), 'codex:z');
  assert.equal(holderFrom({ USER: 'u' }), 'operator:u');
  assert.equal(leaseDir({ GREAT_CTO_HOME: '/g' }), '/g/release-lease');
  assert.equal(leaseDir({ HOME: '/h' }), '/h/.great_cto/release-lease');
});

test('bump-version.sh refuses before touching a file when another session holds the version', (t) => {
  // The wiring itself, not the library: a copy of the real script in a scratch tree.
  const tree = tmp(t), home = tmp(t);
  fs.mkdirSync(path.join(tree, 'scripts/lib'), { recursive: true });
  fs.mkdirSync(path.join(tree, '.claude-plugin'));
  fs.copyFileSync(path.join(ROOT, 'scripts/bump-version.sh'), path.join(tree, 'scripts/bump-version.sh'));
  fs.copyFileSync(path.join(ROOT, 'scripts/lib/release-lease.mjs'), path.join(tree, 'scripts/lib/release-lease.mjs'));
  const plugin = path.join(tree, '.claude-plugin/plugin.json');
  fs.writeFileSync(plugin, JSON.stringify({ version: '9.9.8' }) + '\n');
  const dir = path.join(home, 'release-lease');
  fs.mkdirSync(dir, { recursive: true });
  const until = new Date(Date.now() + 3600000).toISOString();
  fs.writeFileSync(path.join(dir, 'great-cto@9.9.9.json'), JSON.stringify({ holder: 'codex:B', acquiredAt: new Date().toISOString(), expiresAt: until }));
  const r = spawnSync('bash', [path.join(tree, 'scripts/bump-version.sh'), '9.9.9'], {
    encoding: 'utf8', env: { ...process.env, GREAT_CTO_HOME: home, GREAT_CTO_RELEASE_HOLDER: 'claude:A' },
  });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /being released by codex:B/);
  assert.match(r.stderr, /could not claim the release lease for 9\.9\.9/);
  assert.equal(JSON.parse(fs.readFileSync(plugin, 'utf8')).version, '9.9.8', 'nothing was bumped');
});
