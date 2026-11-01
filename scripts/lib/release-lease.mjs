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
//   acquire  — bump-version.sh calls it. Creates
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
// Every write about a version — acquire, renew, bind, release — is taken under a
// per-version lock directory (mkdir is atomic), so reading a lease, checking the
// remote and taking it over cannot interleave with another session doing the
// same. The lock is never taken over automatically: a holder that is slow, not
// dead (a laptop that slept), would on waking remove the lock of whoever took it
// over and let a third session in. A process that died inside the lock — the
// window is the two remote checks, about a minute at most — leaves the version
// refused until the operator removes the lock, which the refusal names. Files are
// written to a temporary name and linked or renamed into place, so a crash leaves
// either the old lease or the new one, never an empty file.
//
// A lease expires (12 h by default) so a crashed chain does not block the
// version for ever. An expired lease is moved aside, not deleted, and every
// change is appended to journal.jsonl — who held what, when, and who took it over.
// A lease whose expiry cannot be read is treated as live: it was written by
// someone, and guessing it has lapsed would hand the version over.
//
// The holder is the host session: Claude Code's CLAUDE_CODE_SESSION_ID, Codex's
// CODEX_THREAD_ID or CODEX_SESSION_ID, or GREAT_CTO_RELEASE_HOLDER set by a human
// for one release. There is deliberately no fallback such as the user name: two
// sessions without an id would share it, and the second would "renew" the
// first one's claim. Without an id the lease refuses and says what to set.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const DEFAULT_TTL_HOURS = 12;
const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const PACKAGE = 'great-cto';
const NO_HOLDER = 'no session id to hold the lease with — set GREAT_CTO_RELEASE_HOLDER to a name unique to this release ' +
  '(CLAUDE_CODE_SESSION_ID, CODEX_THREAD_ID and CODEX_SESSION_ID are all unset)';

/** The store. The account's home from the password database, not $HOME: a host
 *  that runs commands under another HOME must still meet the same leases.
 *  GREAT_CTO_HOME moves it, for tests. */
export function leaseDir(env = process.env) {
  if (env.GREAT_CTO_HOME) return path.join(env.GREAT_CTO_HOME, 'release-lease');
  let home;
  // A uid with no passwd entry (some sandboxes) has no userInfo; os.homedir() is the next best answer.
  try { home = os.userInfo().homedir; } catch { home = os.homedir(); }
  return path.join(home, '.great_cto', 'release-lease');
}

/** Who is releasing: stable across the commands of one session, distinct between sessions, or null. */
export function holderFrom(env = process.env) {
  if (env.GREAT_CTO_RELEASE_HOLDER) return env.GREAT_CTO_RELEASE_HOLDER;
  if (env.CLAUDE_CODE_SESSION_ID) return `claude:${env.CLAUDE_CODE_SESSION_ID}`;
  const codex = env.CODEX_THREAD_ID || env.CODEX_SESSION_ID;
  if (codex) return `codex:${codex}`;
  return null;
}

const fileFor = (dir, version) => path.join(dir, `${PACKAGE}@${version}.json`);
const stamp = (now) => now.toISOString().replace(/[:.]/g, '-');

function journal(dir, entry) {
  fs.appendFileSync(path.join(dir, 'journal.jsonl'), JSON.stringify(entry) + '\n', { mode: 0o600 });
}

/** Write via a temporary file. `exclusive`: fail with EEXIST if the target exists (link semantics). */
function writeLease(file, lease, { exclusive = false } = {}) {
  const tmp = `${file}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try { fs.writeSync(fd, JSON.stringify(lease, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try {
    if (exclusive) fs.linkSync(tmp, file); else fs.renameSync(tmp, file);
  } finally { fs.rmSync(tmp, { force: true }); }
}

function readLease(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  // A lease that does not parse, or parses to something that is not a lease, is
  // not "no lease": someone wrote it.
  let lease;
  try { lease = JSON.parse(text); } catch { lease = undefined; }
  if (!lease || typeof lease !== 'object' || typeof lease.holder !== 'string') {
    throw Error(`release lease ${file} is unreadable — inspect it before releasing`);
  }
  return lease;
}

const live = (lease, now) => {
  if (!lease) return false;
  const until = Date.parse(lease.expiresAt);
  return Number.isNaN(until) ? true : until > now.getTime();
};

/** One write about one version at a time. BUSY when another session is mid-write. */
async function withLock(dir, version, fn) {
  const lock = fileFor(dir, version).replace(/\.json$/, '.lock');
  try { fs.mkdirSync(lock, { mode: 0o700 }); }
  catch (e) {
    if (e.code === 'ENOENT') return { state: 'REFUSED', version, why: `the lease store ${dir} disappeared — nothing was written` };
    if (e.code !== 'EEXIST') throw e;
    let age = null;
    try { age = Math.round((Date.now() - fs.statSync(lock).mtimeMs) / 1000); } catch { /* released meanwhile: the retry will tell */ }
    return { state: 'BUSY', version, lock,
      why: `another session is writing the ${version} lease (lock ${age === null ? 'just released' : `${age} s old`}) — retry in a minute. ` +
           `A lock older than a few minutes was left by a process that died inside it: remove ${lock} once no release of ${version} is running` };
  }
  let result, failure = null;
  try { result = await fn(); } catch (e) { failure = e; }
  // The write already happened. A lock that will not go away is reported, not
  // turned into a failure of a write that succeeded.
  try { fs.rmSync(lock, { recursive: true, force: true }); }
  catch (e) {
    process.stderr.write(`✗ release lease: could not remove ${lock} (${e.message}) — remove it by hand, or every later write of ${version} is refused\n`);
    if (!failure && result && typeof result === 'object') result.lockLeft = lock;
  }
  if (failure) throw failure;
  return result;
}

/** Temporary files a crashed write left. Swept under the lock, where no write of this version is running. */
function sweep(dir, version) {
  const prefix = path.basename(fileFor(dir, version)) + '.tmp-';
  for (const f of fs.readdirSync(dir)) if (f.startsWith(prefix)) fs.rmSync(path.join(dir, f), { force: true });
}

/** Default remote checks. Each answers free | taken | unknown. */
export const remote = {
  tag(version, { root = process.cwd() } = {}) {
    try {
      const out = execFileSync('git', ['-C', root, 'ls-remote', '--tags', 'origin', `refs/tags/v${version}`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 });
      return out.trim() ? 'taken' : 'free';
    } catch { return 'unknown'; }
  },
  /** The commit the remote tag points at (peeled), null when there is no tag, 'unknown' when unread. */
  tagCommit(version, { root = process.cwd() } = {}) {
    try {
      const out = execFileSync('git', ['-C', root, 'ls-remote', '--tags', 'origin', `refs/tags/v${version}`, `refs/tags/v${version}^{}`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 });
      const lines = out.trim().split('\n').filter(Boolean).map((l) => l.split('\t'));
      if (!lines.length) return null;
      const peeled = lines.find(([, ref]) => ref.endsWith('^{}')) || lines[0];
      return peeled[0];
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
  if (!(Number.isFinite(ttlHours) && ttlHours > 0)) throw Error(`release lease needs a positive ttl, got ${ttlHours}`);
  if (!holder) return { state: 'HOLDER_UNKNOWN', version, why: NO_HOLDER };
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = fileFor(dir, version);
  const expiresAt = new Date(now.getTime() + ttlHours * 3600000).toISOString();

  return withLock(dir, version, async () => {
    sweep(dir, version);
    const current = readLease(file);

    // Ours and live: renew. The remote is not re-checked — after our own tag it
    // is "taken" by us.
    // Ours and lapsed: renew only if nobody else took the version meanwhile. The
    // 2FA rerun next morning is the case to keep: our tag on our bound commit
    // counts as ours. Anything else on the remote is someone else's.
    if (current && current.holder === holder) {
      if (!live(current, now)) {
        const at = checks.tagCommit ? checks.tagCommit(version, { root }) : 'unknown';
        const ours = current.commit && at === current.commit;
        if (!ours) {
          const tag = at === null ? 'free' : at === 'unknown' ? 'unknown' : 'taken';
          const npm = await checks.npm(version, {});
          if (tag !== 'free' || npm !== 'free') {
            return { state: tag === 'taken' || npm === 'taken' ? 'CLAIMED_REMOTELY' : 'REMOTE_UNKNOWN', version, tag, npm };
          }
        }
      }
      writeLease(file, { ...current, expiresAt, renewedAt: now.toISOString() });
      journal(dir, { at: now.toISOString(), op: 'renew', version, holder });
      return { state: 'RENEWED', version, holder, expiresAt, file };
    }
    if (live(current, now)) {
      return { state: 'HELD', version, by: current.holder, since: current.acquiredAt, expiresAt: current.expiresAt, file };
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
      writeLease(file, lease, { exclusive: true });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // Written by something outside the lock (a release tool older than it).
      const winner = readLease(file);
      return { state: 'HELD', version, by: winner.holder, since: winner.acquiredAt, expiresAt: winner.expiresAt, file };
    }
    journal(dir, { at: now.toISOString(), op: 'acquire', version, holder });
    return { state: 'ACQUIRED', version, holder, expiresAt, file };
  });
}

function mine(version, holder, now, dir) {
  const file = fileFor(dir, version);
  if (!holder) return { ok: false, why: NO_HOLDER, file };
  const lease = readLease(file);
  if (!lease) return { ok: false, why: `no release lease for ${version} — run: node scripts/lib/release-lease.mjs acquire --version ${version}`, file };
  if (lease.holder !== holder) return { ok: false, why: `${version} is being released by ${lease.holder} (since ${lease.acquiredAt})`, lease, file };
  if (!live(lease, now)) return { ok: false, why: `the release lease for ${version} expired at ${lease.expiresAt} — renew it: node scripts/lib/release-lease.mjs acquire --version ${version}`, lease, file };
  return { ok: true, lease, file };
}

export async function bind({ version, commit, holder = holderFrom(), now = new Date(), dir = leaseDir() } = {}) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw Error('release lease binds a full 40-hex commit');
  if (!holder) return { state: 'REFUSED', why: NO_HOLDER };
  if (!fs.existsSync(dir)) return { state: 'REFUSED', why: mine(version, holder, now, dir).why };
  return withLock(dir, version, async () => {
    const m = mine(version, holder, now, dir);
    if (!m.ok) return { state: 'REFUSED', why: m.why };
    if (m.lease.commit && m.lease.commit !== commit) {
      // Rebinding is allowed — a red gate means a new candidate — and it is journaled.
      journal(dir, { at: now.toISOString(), op: 'rebind', version, holder, from: m.lease.commit, to: commit });
    } else journal(dir, { at: now.toISOString(), op: 'bind', version, holder, commit });
    writeLease(m.file, { ...m.lease, commit });
    return { state: 'BOUND', version, commit };
  });
}

/** The publisher's question. The commit is required: "some commit is bound" is not an answer to it. */
export function check({ version, commit, holder = holderFrom(), now = new Date(), dir = leaseDir() } = {}) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw Error('release lease check needs the full 40-hex commit being published');
  const m = mine(version, holder, now, dir);
  if (!m.ok) return m;
  if (!m.lease.commit) return { ok: false, why: `the release lease for ${version} names no commit — bind it before publishing` };
  if (m.lease.commit !== commit) return { ok: false, why: `the release lease for ${version} is bound to ${m.lease.commit.slice(0, 12)}, not ${commit.slice(0, 12)}` };
  return { ok: true, lease: m.lease };
}

export async function release({ version, holder = holderFrom(), now = new Date(), dir = leaseDir() } = {}) {
  if (!holder) return { state: 'REFUSED', why: NO_HOLDER };
  if (!fs.existsSync(dir)) return { state: 'REFUSED', why: mine(version, holder, now, dir).why };
  return withLock(dir, version, async () => {
    const m = mine(version, holder, now, dir);
    // An expired lease of ours may still be released; one of someone else's may not.
    if (!m.ok && !(m.lease && m.lease.holder === holder)) return { state: 'REFUSED', why: m.why };
    fs.renameSync(m.file, m.file.replace(/\.json$/, `.done-${stamp(now)}.json`));
    journal(dir, { at: now.toISOString(), op: 'release', version, holder, commit: m.lease.commit });
    return { state: 'RELEASED', version };
  });
}

export function status({ version, now = new Date(), dir = leaseDir() } = {}) {
  const lockPath = fileFor(dir, version).replace(/\.json$/, '.lock');
  let lock = null;
  try { lock = { path: lockPath, ageSeconds: Math.round((Date.now() - fs.statSync(lockPath).mtimeMs) / 1000) }; } catch { /* no lock */ }
  const lease = readLease(fileFor(dir, version));
  if (!lease) return { state: 'FREE', version, ...(lock ? { lock } : {}) };
  return { state: live(lease, now) ? 'HELD' : 'EXPIRED', version, by: lease.holder, commit: lease.commit, expiresAt: lease.expiresAt, ...(lock ? { lock } : {}) };
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
  const why = (r) => { if (r.why) process.stderr.write(`✗ ${r.why}\n`); };
  try {
    if (cmd === 'acquire') {
      const r = await acquire({ version: flags.version, root: flags.root || process.cwd(),
        ttlHours: flags['ttl-hours'] !== undefined ? Number(flags['ttl-hours']) : DEFAULT_TTL_HOURS });
      out(r, r.state === 'ACQUIRED' || r.state === 'RENEWED');
      if (r.state === 'HELD') process.stderr.write(`✗ ${r.version} is being released by ${r.by} since ${r.since} (lease until ${r.expiresAt})\n`);
      if (r.state === 'CLAIMED_REMOTELY') process.stderr.write(`✗ ${r.version} is already taken remotely (tag: ${r.tag}, npm: ${r.npm}) — pick the next version\n`);
      if (r.state === 'REMOTE_UNKNOWN') process.stderr.write(`✗ could not confirm ${r.version} is free (tag: ${r.tag}, npm: ${r.npm}) — not claiming on an unread remote\n`);
      why(r);
    } else if (cmd === 'bind') { const r = await bind({ version: flags.version, commit: flags.commit }); out(r, r.state === 'BOUND'); why(r); }
    else if (cmd === 'check') { const r = check({ version: flags.version, commit: flags.commit }); out(r, r.ok); why(r); }
    else if (cmd === 'release') { const r = await release({ version: flags.version }); out(r, r.state === 'RELEASED'); why(r); }
    else if (cmd === 'status') { out(status({ version: flags.version }), true); }
    else { process.stderr.write('usage: release-lease.mjs acquire|bind|check|release|status --version X.Y.Z [--commit SHA] [--root DIR] [--ttl-hours N]\n'); process.exitCode = 2; }
  } catch (e) { process.stderr.write(`✗ release lease: ${e.message}\n`); process.exitCode = 1; }
}
