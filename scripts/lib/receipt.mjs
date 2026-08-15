// The rung above "a second reader agreed": the code that was reviewed is the
// code that shipped.
//
// Every rung of the evidence ladder below this one asks a question about the
// moment of review — did the stage report, does the artefact exist, does the
// check still pass, does a second reader agree. None of them says anything
// about what happened afterwards. `code-reviewer` returns APPROVED over a tree,
// senior-dev keeps editing, `gate:ship` is approved at 14:20 over one state and
// the push happens at 17:05 over another, and every rung still reads green
// because every rung is answering a question about the past.
//
// A receipt is a fingerprint of exactly what an agent saw, recorded in its
// verdict and comparable later. It proves identity and nothing else: that the
// bytes are the bytes. Whether the reviewer was right is the rung below.
//
// Why HEAD alone is not enough
// ----------------------------
// An agent almost always reviews a dirty tree — that is what reviewing a change
// means. Two entirely different working states share a HEAD, so a receipt built
// from the commit sha would match after any amount of uncommitted editing.
//
// Why a per-file map and not one hash
// -----------------------------------
// "Something changed since the review" sends a reader looking. "routes.mjs
// changed after the review that approved it" is the finding. The difference
// between those two is whether anyone acts on it.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as fsModule from 'node:fs';
import { join } from 'node:path';

const sha = (s) => createHash('sha256').update(String(s)).digest('hex');

function git(args, cwd, { maxBuffer = 32 * 1024 * 1024 } = {}) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; }
}

/** A cap, so a receipt for a thousand-file change cannot bloat every verdict line. */
export const MAX_FILES = 200;

/**
 * The state of the tree right now, as something comparable later.
 *
 * `base` names what the change is measured against — the merge-base with the
 * default branch by default, which is "the change under review" rather than
 * "everything that ever happened".
 *
 * Returns `null` outside a git repository rather than a fabricated receipt: a
 * receipt that cannot be built must not look like one that matched.
 */
export function treeReceipt(cwd = process.cwd(), { base = null, maxFiles = MAX_FILES } = {}) {
  const head = git(['rev-parse', 'HEAD'], cwd)?.trim();
  if (!head) return null;

  // Uncommitted content, hashed rather than stored: the receipt has to fit on a
  // verdict line, and the question it answers is "the same or not".
  //
  // Untracked files are part of that. `git diff HEAD` does not see them, so a
  // receipt built from the diff alone called a tree clean while an agent was
  // reviewing four brand-new modules — which is most of what a new feature is.
  // Their names and content go into the hash; `--exclude-standard` keeps
  // .gitignore'd build output and node_modules out of it.
  const diff = git(['diff', 'HEAD'], cwd) ?? '';
  const untracked = (git(['ls-files', '--others', '--exclude-standard'], cwd) ?? '')
    .split('\n').map((s) => s.trim()).filter(Boolean);
  const untrackedDigest = untracked.map((p) => `${p}:${fileDigest(cwd, p) ?? '?'}`).join('\n');
  const dirty = (diff.trim() || untrackedDigest) ? sha(`${diff}\n--untracked--\n${untrackedDigest}`) : null;

  // Which files the change touches. `--diff-filter=d` drops deletions: a file
  // that is gone cannot have a blob sha, and its absence is already visible in
  // the map as a missing key.
  const ref = base || mergeBase(cwd) || 'HEAD';
  const names = [
    ...(git(['diff', '--name-only', '--diff-filter=d', ref], cwd) ?? '')
      .split('\n').map((s) => s.trim()).filter(Boolean),
    // A new file is part of the change under review, and is exactly the kind a
    // reviewer reads most closely.
    ...untracked,
  ];

  const files = {};
  let truncated = false;
  for (const p of names) {
    if (Object.keys(files).length >= maxFiles) { truncated = true; break; }
    const blob = fileDigest(cwd, p);
    if (blob) files[p] = blob;
  }

  return { head, dirty, base: ref, files, ...(truncated ? { truncated: true } : {}) };
}

/**
 * The content hash of a path AS IT IS ON DISK, not as it is in the index.
 *
 * `git rev-parse :path` reads the index, which is what was staged rather than
 * what an agent read. `hash-object` on the working file is the thing the
 * reviewer actually saw.
 */
export function fileDigest(cwd, path) {
  const out = git(['hash-object', '--', path], cwd);
  return out ? out.trim() : null;
}

/** The fork point from the default branch, or null when there isn't one. */
export function mergeBase(cwd) {
  for (const branch of ['origin/main', 'main', 'origin/master', 'master']) {
    const b = git(['merge-base', 'HEAD', branch], cwd);
    if (b?.trim()) return b.trim();
  }
  return null;
}

/**
 * What changed between a recorded receipt and the state now.
 *
 * Three outcomes, and they are deliberately not two: "matches", "differs", and
 * "cannot tell". A push with no receipt to compare is not the same as a push
 * whose receipt matched, and collapsing them is the defect this whole ladder
 * exists to remove.
 */
export function compareReceipts(recorded, current, { digest = null, cwd = process.cwd() } = {}) {
  if (!recorded) return { state: 'no-receipt', why: 'the approving verdict carries no receipt — nothing to compare against' };
  if (!current) return { state: 'unreadable', why: 'the current tree state could not be read' };

  const changed = [];
  const added = [];
  const removed = [];
  const landed = [];
  const before = recorded.files || {};
  const now = current.files || {};
  // Falling out of the CHANGE SET is not the same as being deleted.
  //
  // The file map is the diff against the merge-base, so the moment a reviewed
  // change is committed and the base moves forward, every reviewed file drops
  // out of it. The first version read that as `removed` and would therefore
  // have blocked every push after a release, with the strongest wording it
  // has, about files sitting right there on disk. A gate that fires on the
  // ordinary case is a gate people route around.
  const digestOf = digest || ((path) => fileDigest(cwd, path));

  for (const [p, d] of Object.entries(before)) {
    if (p in now) {
      if (now[p] !== d) changed.push(p);
      continue;
    }
    // Not in the current change set — ask the disk which of the three it is.
    const onDisk = digestOf(p);
    if (onDisk === null) removed.push(p);        // genuinely gone
    else if (onDisk === d) landed.push(p);       // committed since; byte-identical to the review
    else changed.push(p);                        // still here, and edited
  }
  for (const p of Object.keys(now)) if (!(p in before)) added.push(p);

  // A file the review covered, edited since. This is the finding; the rest is
  // context. `added` in particular is usually ordinary work continuing, not a
  // review being bypassed, and reporting it as one is how a signal dies.
  if (changed.length || removed.length) {
    return { state: 'differs', changed, added, removed, landed,
      why: `${changed.length + removed.length} reviewed file(s) changed after the approval` };
  }
  if (added.length) {
    return { state: 'extended', changed, added, removed, landed,
      why: `${added.length} file(s) were added after the approval; nothing reviewed was altered` };
  }
  const shipped = landed.length ? ` (${landed.length} committed since, unchanged)` : '';
  return { state: 'matches', changed, added, removed, landed,
    why: `every reviewed file is byte-identical to what was approved${shipped}` };
}

/** Lines a human can act on — the paths, not just the count. */
export function describeDrift(cmp, { max = 10 } = {}) {
  if (!cmp) return '';
  const lines = [cmp.why];
  const show = (label, xs) => {
    for (const p of (xs || []).slice(0, max)) lines.push(`    ${label} ${p}`);
    if ((xs || []).length > max) lines.push(`    … and ${xs.length - max} more`);
  };
  show('changed:', cmp.changed);
  show('removed:', cmp.removed);
  if (cmp.state === 'extended') show('added:  ', cmp.added);
  return lines.join('\n');
}

/**
 * The newest verdict that both APPROVED something and recorded what it saw.
 *
 * Only reviewing stages count. `architect` approving a design says nothing
 * about which bytes shipped, and treating it as an approval of the code would
 * make the check pass for the wrong reason — which is worse than not running.
 */
export const APPROVING_AGENTS = Object.freeze(['code-reviewer', 'security-officer', 'qa-engineer']);
const APPROVING_VERDICTS = new Set(['APPROVED', 'PASS', 'PASSED']);

export function latestApproval(cwd = process.cwd(), { agents = APPROVING_AGENTS, read = readFileSync } = {}) {
  let best = null;
  for (const agent of agents) {
    let text;
    try {
      text = read(join(cwd, '.great_cto', 'verdicts', `${agent}.log`), 'utf8');
    } catch { continue; }
    for (const line of String(text).split('\n')) {
      if (!line.trim()) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      if (!APPROVING_VERDICTS.has(String(rec.verdict || '').toUpperCase())) continue;
      if (!rec.receipt?.head) continue;
      if (!best || String(rec.ts) > String(best.ts)) best = rec;
    }
  }
  return best;
}

/**
 * Where an operator's acceptance of a drifted state is recorded.
 *
 * Beside the verdicts rather than in them: a verdict is an agent's report of
 * what it found, and this is a human's decision about what to do next. Mixing
 * them would let a reader mistake one for the other, which is the whole thing
 * receipts exist to prevent.
 */
export const ACCEPT_PATH = '.great_cto/.receipt-accept';

/**
 * A stable fingerprint of a tree state — what an acceptance is bound TO.
 *
 * `hashgate`'s formulation, which is better than the one we shipped: an approve
 * button approves an intention, a hash approves a state. Accepting "yes, ship
 * despite the drift" without naming WHICH state leaves an acceptance that
 * survives the next edit — an expiring bypass wearing an approval's clothes.
 */
export function receiptHash(receipt) {
  if (!receipt) return null;
  // The file map in a fixed order, plus the dirty digest: two trees hash alike
  // exactly when every reviewed file is byte-identical and the uncommitted work
  // is the same.
  const files = Object.keys(receipt.files || {}).sort()
    .map((p) => `${p}:${receipt.files[p]}`).join('\n');
  return sha(`${receipt.head}\n${receipt.dirty ?? '-'}\n${files}`);
}

/**
 * Record that a human accepted this exact state.
 *
 * Single-use by design: an acceptance authorises ONE push. An acceptance that
 * outlives its push is a standing permission, and nobody asked for one.
 */
export function writeAcceptance(cwd, { hash, why = '', at = Date.now() } = {}) {
  const { writeFileSync, mkdirSync } = requireFs();
  mkdirSync(join(cwd, '.great_cto'), { recursive: true });
  writeFileSync(join(cwd, ACCEPT_PATH), JSON.stringify({ hash, why, at }) + '\n');
  return { hash, why, at };
}

/**
 * The pending acceptance, if it is for the state in front of us.
 *
 * Four answers, not two. "None recorded", "unreadable", "for a different
 * state" and "valid" are different situations, and the third is the one worth
 * naming out loud: it means the tree moved after a human looked at it.
 */
export function readAcceptance(cwd, currentHash) {
  const { readFileSync } = requireFs();
  let raw;
  try { raw = readFileSync(join(cwd, ACCEPT_PATH), 'utf8'); }
  catch { return { valid: false, why: 'no acceptance recorded' }; }

  let rec;
  try { rec = JSON.parse(raw.trim()); }
  catch { return { valid: false, unreadable: true, why: 'the acceptance record could not be parsed' }; }

  if (!rec?.hash) return { valid: false, unreadable: true, why: 'the acceptance record names no state' };
  if (rec.hash !== currentHash) {
    return { valid: false, stale: true, rec,
      why: 'the acceptance names a different state — the tree changed after it was accepted' };
  }
  return { valid: true, rec, why: `accepted at ${new Date(rec.at).toISOString()}` };
}

/** Consume it. One acceptance, one push. */
export function clearAcceptance(cwd) {
  try { requireFs().rmSync(join(cwd, ACCEPT_PATH), { force: true }); return true; }
  catch { return false; /* an acceptance we cannot clear is re-checked against the hash anyway */ }
}

function requireFs() {
  // Imported lazily so the pure comparison functions above stay usable by
  // callers that hand in their own strings and never touch a disk.
  return fsModule;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
//
// `--emit`   prints a receipt for the current tree (used by log-verdict.sh).
// `--check <file>`  compares a recorded receipt held in a file.
// `--verify` compares the newest approving verdict's receipt against now.

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes('--emit')) {
    const r = treeReceipt(process.cwd());
    process.stdout.write(r ? JSON.stringify(r) : '');
    process.exit(r ? 0 : 1);
  }
  if (argv.includes('--verify')) {
    const cwd = process.cwd();
    const approval = latestApproval(cwd);
    const current = treeReceipt(cwd);
    const cmp = compareReceipts(approval?.receipt ?? null, current);
    if (cmp.state === 'no-receipt') {
      // Not silence. A push with no approval to compare against and a push whose
      // receipt matched are different facts, and only one of them is evidence.
      console.log('receipt: no approving verdict carries a receipt — nothing was verified');
      process.exit(0);
    }
    const who = approval ? `${approval.agent} ${approval.verdict} at ${approval.ts}` : 'an approval';
    console.log(`receipt: against ${who}`);
    console.log(describeDrift(cmp).split('\n').map((l) => `  ${l}`).join('\n'));

    if (cmp.state !== 'differs') process.exit(0);

    // Drift, but a human may already have looked at exactly this state.
    const hash = receiptHash(current);
    const acc = readAcceptance(cwd, hash);
    if (acc.valid) {
      console.log(`  accepted by the operator for this exact state (${acc.why})`);
      // Consumed here rather than by the caller: whoever asked the question is
      // the one acting on the answer, and an acceptance that survives its own
      // check is a standing permission.
      clearAcceptance(cwd);
      process.exit(0);
    }
    if (acc.stale) console.log(`  ${acc.why} — accept again if this state is fine`);
    console.log(`  to accept this state: node scripts/lib/receipt.mjs --accept`);
    process.exit(1);
  }

  // `--accept`: a human says this drifted state is fine to ship.
  //
  // Requires a controlling terminal, and that is the substance rather than a
  // nicety. Our hooks and agents run inside the operator's own shell, so
  // without this "the operator accepted" would mean "something in the agent's
  // session ran a command". Enforcement must not depend on the agent's good
  // behaviour — an agent asked to approve its own work will comply.
  if (argv.includes('--accept')) {
    const cwd = process.cwd();
    const approval = latestApproval(cwd);
    const current = treeReceipt(cwd);
    const cmp = compareReceipts(approval?.receipt ?? null, current);
    if (cmp.state !== 'differs') {
      console.log(`receipt: nothing to accept — ${cmp.why}`);
      process.exit(0);
    }
    console.log(describeDrift(cmp));
    const hash = receiptHash(current);
    console.log(`\nstate: ${hash.slice(0, 16)}…`);

    if (!process.stdin.isTTY) {
      console.error('\nreceipt: --accept needs a terminal. Run it yourself, in your own shell —');
      console.error('an acceptance from inside an agent session is the agent approving its own work.');
      process.exit(2);
    }
    const { createInterface } = await import('node:readline');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((res) => rl.question('\nShip this state anyway? [y/N] ', (a) => { rl.close(); res(a); }));
    if (!/^y(es)?$/i.test(answer.trim())) { console.log('not accepted — nothing recorded.'); process.exit(1); }

    writeAcceptance(cwd, { hash, why: `drift accepted over ${cmp.changed.length} changed file(s)` });
    console.log('accepted. This authorises ONE push of this exact state; any further edit voids it.');
    process.exit(0);
  }

  const i = argv.indexOf('--check');
  if (i > -1) {
    const { readFileSync } = await import('node:fs');
    let recorded = null;
    try { recorded = JSON.parse(readFileSync(argv[i + 1], 'utf8')); } catch { /* absent */ }
    const cmp = compareReceipts(recorded, treeReceipt(process.cwd()));
    console.log(describeDrift(cmp));
    process.exit(cmp.state === 'differs' ? 1 : 0);
  }
  console.log(JSON.stringify(treeReceipt(process.cwd()), null, 2));
}
