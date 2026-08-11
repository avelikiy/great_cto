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
export function compareReceipts(recorded, current) {
  if (!recorded) return { state: 'no-receipt', why: 'the approving verdict carries no receipt — nothing to compare against' };
  if (!current) return { state: 'unreadable', why: 'the current tree state could not be read' };

  const changed = [];
  const added = [];
  const removed = [];
  const before = recorded.files || {};
  const now = current.files || {};

  for (const [p, digest] of Object.entries(before)) {
    if (!(p in now)) removed.push(p);
    else if (now[p] !== digest) changed.push(p);
  }
  for (const p of Object.keys(now)) if (!(p in before)) added.push(p);

  // A file the review covered, edited since. This is the finding; the rest is
  // context. `added` in particular is usually ordinary work continuing, not a
  // review being bypassed, and reporting it as one is how a signal dies.
  if (changed.length || removed.length) {
    return { state: 'differs', changed, added, removed,
      why: `${changed.length + removed.length} reviewed file(s) changed after the approval` };
  }
  if (added.length) {
    return { state: 'extended', changed, added, removed,
      why: `${added.length} file(s) were added after the approval; nothing reviewed was altered` };
  }
  return { state: 'matches', changed, added, removed, why: 'every reviewed file is byte-identical to what was approved' };
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
    const approval = latestApproval(process.cwd());
    const cmp = compareReceipts(approval?.receipt ?? null, treeReceipt(process.cwd()));
    if (cmp.state === 'no-receipt') {
      // Not silence. A push with no approval to compare against and a push whose
      // receipt matched are different facts, and only one of them is evidence.
      console.log('receipt: no approving verdict carries a receipt — nothing was verified');
      process.exit(0);
    }
    const who = approval ? `${approval.agent} ${approval.verdict} at ${approval.ts}` : 'an approval';
    console.log(`receipt: against ${who}`);
    console.log(describeDrift(cmp).split('\n').map((l) => `  ${l}`).join('\n'));
    process.exit(cmp.state === 'differs' ? 1 : 0);
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
