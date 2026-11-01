#!/usr/bin/env node
// scripts/lib/release-lease.mjs — one writer per release version on this machine.
//
// great_cto-inty. Codex and Claude Code both release great_cto from the same
// machine, and nothing told one that the other had started. During the PR195
// release both prepared 3.68.0 in parallel; on 3.71.0 a Codex session claimed
// the version halfway through a Claude chain. The remote tag already stops the
// second PUBLISH (publish-local-release refuses a tag that resolves to another
// commit), but only after both sides have bumped, written a changelog and run a
// thirty-minute gate.
//
// So the version is claimed at the first step, before any of that:
//
//   acquire  — bump-version.sh calls it. Atomic create (O_EXCL) of
//              ~/.great_cto/release-lease/<package>@<version>.json. A fresh claim
//              also checks that the remote tag and the npm version are still
//              free; a check that could not be made refuses, because "could not
//              read" is not "free".
//   bind     — record the exact commit before the tag, so the claim names what
//              will be published.
//   check    — publish-local-release calls it before npm publish: a live lease,
//              held by this holder, bound to the approved commit.
//   release  — after the GitHub release; the file is kept as <...>.done-<ts>.json.
//
// A lease expires (12 h by default) so a crashed chain does not block the
// version for ever. An expired lease is moved aside, not deleted, and every
// change is appended to journal.jsonl — who held what, when, and who took it over.
//
// The holder is the host session: Claude Code's CLAUDE_CODE_SESSION_ID, Codex's
// thread or session id, or GREAT_CTO_RELEASE_HOLDER when a human runs the chain.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const DEFAULT_TTL_HOURS = 12;
const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const PACKAGE = 'great-cto';

export function leaseDir(env = process.env) {
  return path.join(env.GREAT_CTO_HOME || path.join(env.HOME || os.homedir(), '.great_cto'), 'release-lease');
}

/** Who is releasing. Stable across the Bash calls of one session, different between sessions. */
export function holderFrom(env = process.env) {
  if (env.GREAT_CTO_RELEASE_HOLDER) return env.GREAT_CTO_RELEASE_HOLDER;
  if (env.CLAUDE_CODE_SESSION_ID) return `claude:${env.CLAUDE_CODE_SESSION_ID}`;
  const codex = env.CODEX_THREAD_ID || env.CODEX_SESSION_ID;
  if (codex) return `codex:${codex}`;
  return `operator:${env.USER || 'unknown'}`;
}

const fileFor = (dir, version) => path.join(dir, `${PACKAGE}@${version}.json`);
const stamp = (now) => now.toISOString().replace(/[:.]/g, '-');

function journal(dir, entry) {
  fs.appendFileSync(path.join(dir, 'journal.jsonl'), JSON.stringify(entry) + '\n', { mode: 0o600 });
}

function readLease(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  // A lease that does not parse is not "no lease": someone wrote it.
  try { return JSON.parse(text); } catch { throw Error(`release lease ${file} is unreadable — inspect it before releasing`); }
}

const live = (lease, now) => lease && Date.parse(lease.expiresAt) > now.getTime();

/** Default remote checks. Each answers free | taken | unknown. */
export const remote = {
  tag(version, { root = process.cwd() } = {}) {
    try {
      const out = execFileSync('git', ['-C', root, 'ls-remote', '--tags', 'origin', `refs/tags/v${version}`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 });
      return out.trim() ? 'taken' : 'free';
    } catch { return 'unknown'; }
  },
  async npm(version, { fetchFn = fetch } = {}) {
    try {
      const r = await fetchFn(`https://registry.npmjs.org/${PACKAGE}/${version}`, { redirect: 'error', signal: AbortSignal.timeout(30000) });
      await r.body?.cancel?.();
      return r.status === 404 ? 'free' : r.status === 200 ? 'taken' : 'unknown';
    } catch { return 'unknown'; }
  },
};

export async function acquire({ version, holder = holderFrom(), ttlHours = DEFAULT_TTL_HOURS, now = new Date(),
  dir = leaseDir(), checks = remote, root = process.cwd() } = {}) {
  if (!STABLE.test(version || '')) throw Error(`release lease needs a stable version, got ${version}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = fileFor(dir, version);
  const current = readLease(file);
  const expiresAt = new Date(now.getTime() + ttlHours * 3600000).toISOString();

  if (live(current, now)) {
    if (current.holder !== holder) {
      return { state: 'HELD', version, by: current.holder, since: current.acquiredAt, expiresAt: current.expiresAt, file };
    }
    // Ours already: renew. The remote is not re-checked — after our own tag it is "taken" by us.
    const renewed = { ...current, expiresAt, renewedAt: now.toISOString() };
    fs.writeFileSync(file, JSON.stringify(renewed, null, 2) + '\n', { mode: 0o600 });
    journal(dir, { at: now.toISOString(), op: 'renew', version, holder });
    return { state: 'RENEWED', version, holder, expiresAt, file };
  }

  // A fresh claim. The remote must still be free, and must be known to be.
  const tag = checks.tag(version, { root });
  const npm = await checks.npm(version, {});
  if (tag !== 'free' || npm !== 'free') {
    return { state: tag === 'taken' || npm === 'taken' ? 'CLAIMED_REMOTELY' : 'REMOTE_UNKNOWN', version, tag, npm };
  }

  if (current) {
    const aside = file.replace(/\.json$/, `.expired-${stamp(now)}.json`);
    fs.renameSync(file, aside);
    journal(dir, { at: now.toISOString(), op: 'expired-takeover', version, holder, previous: current.holder, aside: path.basename(aside) });
  }
  const lease = { package: PACKAGE, version, holder, acquiredAt: now.toISOString(), expiresAt, commit: null, host: os.hostname() };
  try {
    fs.writeFileSync(file, JSON.stringify(lease, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    // Lost the race between our read and our create.
    const winner = readLease(file);
    return { state: 'HELD', version, by: winner?.holder, since: winner?.acquiredAt, expiresAt: winner?.expiresAt, file };
  }
  journal(dir, { at: now.toISOString(), op: 'acquire', version, holder });
  return { state: 'ACQUIRED', version, holder, expiresAt, file };
}

function mine(version, holder, now, dir) {
  const file = fileFor(dir, version);
  const lease = readLease(file);
  if (!lease) return { ok: false, why: `no release lease for ${version} — run: node scripts/lib/release-lease.mjs acquire --version ${version}`, file };
  if (!live(lease, now)) return { ok: false, why: `the release lease for ${version} expired at ${lease.expiresAt}`, lease, file };
  if (lease.holder !== holder) return { ok: false, why: `${version} is being released by ${lease.holder} (since ${lease.acquiredAt})`, lease, file };
  return { ok: true, lease, file };
}

export function bind({ version, commit, holder = holderFrom(), now = new Date(), dir = leaseDir() } = {}) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw Error('release lease binds a full 40-hex commit');
  const m = mine(version, holder, now, dir);
  if (!m.ok) return { state: 'REFUSED', why: m.why };
  if (m.lease.commit && m.lease.commit !== commit) {
    // Rebinding is allowed — a red gate means a new candidate — and it is journaled.
    journal(dir, { at: now.toISOString(), op: 'rebind', version, holder, from: m.lease.commit, to: commit });
  } else journal(dir, { at: now.toISOString(), op: 'bind', version, holder, commit });
  fs.writeFileSync(m.file, JSON.stringify({ ...m.lease, commit }, null, 2) + '\n', { mode: 0o600 });
  return { state: 'BOUND', version, commit };
}

export function check({ version, commit, holder = holderFrom(), now = new Date(), dir = leaseDir() } = {}) {
  const m = mine(version, holder, now, dir);
  if (!m.ok) return m;
  if (!m.lease.commit) return { ok: false, why: `the release lease for ${version} names no commit — bind it before publishing` };
  if (commit && m.lease.commit !== commit) return { ok: false, why: `the release lease for ${version} is bound to ${m.lease.commit.slice(0, 12)}, not ${commit.slice(0, 12)}` };
  return { ok: true, lease: m.lease };
}

export function release({ version, holder = holderFrom(), now = new Date(), dir = leaseDir() } = {}) {
  const m = mine(version, holder, now, dir);
  if (!m.ok) return { state: 'REFUSED', why: m.why };
  fs.renameSync(m.file, m.file.replace(/\.json$/, `.done-${stamp(now)}.json`));
  journal(dir, { at: now.toISOString(), op: 'release', version, holder, commit: m.lease.commit });
  return { state: 'RELEASED', version };
}

export function status({ version, now = new Date(), dir = leaseDir() } = {}) {
  const lease = readLease(fileFor(dir, version));
  if (!lease) return { state: 'FREE', version };
  return { state: live(lease, now) ? 'HELD' : 'EXPIRED', version, by: lease.holder, commit: lease.commit, expiresAt: lease.expiresAt };
}

// Compared by real path. Run through a symlinked path (/var → /private/var, a
// plugin cache link), a plain comparison is false, the CLI does nothing and exits
// 0 — and bump-version.sh would take a lease that was never checked as granted.
const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (process.argv[1] && isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) flags[rest[i].replace(/^--/, '')] = rest[i + 1];
  const out = (o, ok) => { process.stdout.write(JSON.stringify(o) + '\n'); process.exitCode = ok ? 0 : 1; };
  try {
    if (cmd === 'acquire') {
      const r = await acquire({ version: flags.version, ttlHours: flags['ttl-hours'] ? Number(flags['ttl-hours']) : DEFAULT_TTL_HOURS });
      out(r, r.state === 'ACQUIRED' || r.state === 'RENEWED');
      if (r.state === 'HELD') process.stderr.write(`✗ ${r.version} is being released by ${r.by} since ${r.since} (lease until ${r.expiresAt})\n`);
      if (r.state === 'CLAIMED_REMOTELY') process.stderr.write(`✗ ${r.version} is already taken remotely (tag: ${r.tag}, npm: ${r.npm}) — pick the next version\n`);
      if (r.state === 'REMOTE_UNKNOWN') process.stderr.write(`✗ could not confirm ${r.version} is free (tag: ${r.tag}, npm: ${r.npm}) — not claiming on an unread remote\n`);
    } else if (cmd === 'bind') { const r = bind({ version: flags.version, commit: flags.commit }); out(r, r.state === 'BOUND'); }
    else if (cmd === 'check') { const r = check({ version: flags.version, commit: flags.commit }); out(r, r.ok); }
    else if (cmd === 'release') { const r = release({ version: flags.version }); out(r, r.state === 'RELEASED'); }
    else if (cmd === 'status') { out(status({ version: flags.version }), true); }
    else { process.stderr.write('usage: release-lease.mjs acquire|bind|check|release|status --version X.Y.Z [--commit SHA] [--ttl-hours N]\n'); process.exitCode = 2; }
  } catch (e) { process.stderr.write(`✗ release lease: ${e.message}\n`); process.exitCode = 1; }
}
