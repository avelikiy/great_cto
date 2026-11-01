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
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = (s) => createHash('sha256').update(String(s)).digest('hex');

// Hooks read evidence under host deadlines of 5-15 s and must give up in time to
// fail closed themselves, so 5 s is the default. A long-lived caller on a loaded
// machine (the packaged controller probe) widens it with
// GREAT_CTO_GIT_READ_TIMEOUT_MS; it never narrows below 5 s nor passes 120 s.
export const GIT_READ_TIMEOUT_MS = 5000;
export function gitReadTimeoutMs(raw = process.env.GREAT_CTO_GIT_READ_TIMEOUT_MS) {
  return /^\d{1,9}$/.test(raw ?? '') ? Math.min(Math.max(Number(raw), GIT_READ_TIMEOUT_MS), 120000) : GIT_READ_TIMEOUT_MS;
}

function git(args, cwd, { maxBuffer = 32 * 1024 * 1024 } = {}) {
  const timeout = gitReadTimeoutMs();
  try {
    // Reading evidence must not execute project-configured diff/filter/monitor helpers.
    const command = args[0] === 'diff' ? ['diff', '--no-ext-diff', '--no-textconv', ...args.slice(1)] : args;
    const config = ['-c', 'core.fsmonitor=false'];
    if (args[0] === 'diff') {
      // Diff also applies clean/process filters while inspecting working files.
      // Read names only, not values (which can contain private configuration).
      let keys = '';
      try {
        keys = execFileSync('git', [...config, 'config', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|process|required)$'],
          { cwd, encoding: 'utf8', maxBuffer: 65536, timeout, stdio: ['ignore', 'pipe', 'ignore'] });
      } catch (error) { if (error.status !== 1) return null; }
      const filters = [...new Set(keys.split('\0').filter(Boolean).map(key => key.match(/^filter\.([\s\S]+)\.(?:clean|process|required)$/)?.[1]))];
      if (filters.length > 128 || filters.some(name => !name)) return null;
      for (const name of filters) config.push('-c', `filter.${name}.clean=`, '-c', `filter.${name}.process=`, '-c', `filter.${name}.required=false`);
    }
    return execFileSync('git', [...config, ...command],
      { cwd, encoding: 'utf8', maxBuffer, timeout, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; }
}

// Shared bounded evidence read for adaptive observers. Unknown is null, never
// a fabricated empty inventory. Not a general commit/push runner or sandbox.
export { git as readOnlyGit };

/** A cap, so a receipt for a thousand-file change cannot bloat every verdict line. */
export const MAX_FILES = 200;

/**
 * Files the tooling writes while agents work — an activity record, not reviewed
 * content. ADR-021's hooks append to the events log on every tool call, and `init`
 * does not gitignore .great_cto/, so counting it made a receipt drift by itself:
 * a gate read "reviewed files changed" one tool call later, and the controlled
 * Codex host would block on "working tree changed during verification" (bkvj).
 * Only these files: anything else under .great_cto/ is still part of the tree.
 *
 * beads' own interactions log is the same kind of file (4b9l). Current `bd init`
 * no longer gitignores it, so in a fresh project it is tracked, and every
 * `bd update` an agent or the board runs made a reviewed tree read as changed.
 * The rest of .beads/ — config, metadata, hooks — is configuration and counts.
 */
export const ACTIVITY_LOGS = Object.freeze(['.great_cto/events.jsonl', '.great_cto/events.1.jsonl', '.beads/interactions.jsonl']);
const excludeLogs = ACTIVITY_LOGS.map((p) => `:(exclude)${p}`);

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
export function treeReceipt(cwd = process.cwd(), { base = null, maxFiles = MAX_FILES, verdictsDir = null, exclude = [], hashFilesInProcess = false, persist = false } = {}) {
  const head = git(['rev-parse', 'HEAD'], cwd)?.trim();
  if (!head) return null;
  // Off-loop board readers avoid one process per untracked file. Preserve Git's
  // blob format (including SHA-256 repositories) and --no-filters semantics.
  const algorithm = hashFilesInProcess ? git(['rev-parse', '--show-object-format'], cwd)?.trim() : null;
  if (hashFilesInProcess && !['sha1', 'sha256'].includes(algorithm)) return null;
  const digest = p => {
    if (!hashFilesInProcess) return fileDigest(cwd, p, { write: persist });
    try {
      const fd = fsModule.openSync(join(cwd, p), 'r');
      try {
        const before = fsModule.fstatSync(fd, { bigint: true });
        if (!before.isFile()) return null;
        const hash = createHash(algorithm).update(`blob ${before.size}\0`);
        const chunk = Buffer.allocUnsafe(64 * 1024);
        let remaining = before.size;
        while (remaining > 0n) {
          const count = fsModule.readSync(fd, chunk, 0, Number(remaining > BigInt(chunk.length) ? BigInt(chunk.length) : remaining), null);
          if (!count) return null;
          hash.update(chunk.subarray(0, count)); remaining -= BigInt(count);
        }
        const after = fsModule.fstatSync(fd, { bigint: true });
        if (after.size !== before.size || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) return null;
        return hash.digest('hex');
      } finally { fsModule.closeSync(fd); }
    } catch { return null; }
  };

  // Directories a caller does not want in this receipt, ON TOP OF the activity logs.
  // ADR-024: a gate token binds to the project outside .great_cto/, because an
  // approval writes the pipeline's own files there and must not invalidate every
  // other open gate. A caller that passes nothing gets the receipt it always got.
  // An entry holding ':' is dropped, not passed through: pathspec magic that
  // includes rather than excludes must not reach a receipt others compare against.
  const pathspecExclude = [
    ...excludeLogs,
    ...(Array.isArray(exclude) ? exclude : [])
      .filter((d) => typeof d === 'string' && d.trim() && !d.includes(':'))
      .map((d) => `:(exclude)${d.trim().replace(/\/+$/, '')}`),
  ];

  // Uncommitted content, hashed rather than stored: the receipt has to fit on a
  // verdict line, and the question it answers is "the same or not".
  //
  // Untracked files are part of that. `git diff HEAD` does not see them, so a
  // receipt built from the diff alone called a tree clean while an agent was
  // reviewing four brand-new modules — which is most of what a new feature is.
  // Their names and content go into the hash; `--exclude-standard` keeps
  // .gitignore'd build output and node_modules out of it.
  // Pathspecs keep each call's scope as it was — `:/` is the whole repository, as a
  // bare `git diff` is; `.` is this directory, as a bare `ls-files` is — and drop
  // the activity logs, named relative to this directory (the project's own).
  const diff = git(['diff', 'HEAD', '--', ':/', ...pathspecExclude], cwd);
  const untrackedOutput = git(['ls-files', '--others', '--exclude-standard', '--', '.', ...pathspecExclude], cwd);
  if (diff === null || untrackedOutput === null) return null;
  const untracked = untrackedOutput
    .split('\n').map((s) => s.trim()).filter(Boolean);
  const untrackedDigests = untracked.map(p => [p, digest(p)]);
  if (hashFilesInProcess && untrackedDigests.some(([, value]) => !value)) return null;
  const untrackedDigest = untrackedDigests.map(([p, value]) => `${p}:${value ?? '?'}`).join('\n');
  const dirty = (diff.trim() || untrackedDigest) ? sha(`${diff}\n--untracked--\n${untrackedDigest}`) : null;

  // Which files the change touches. `--diff-filter=d` drops deletions: a file
  // that is gone cannot have a blob sha, and its absence is already visible in
  // the map as a missing key.
  // What the change is measured against. The merge-base with the default branch
  // is right on a feature branch, and wrong on the branch itself: once the work is
  // on main, or there is no upstream at all, the merge-base IS HEAD, and a stage
  // that committed before recording its verdict gets a change set holding only
  // uncommitted leftovers. A live run on 2026-09-14 did exactly that — senior-dev
  // committed its fix, the receipt named two logs and a report, and the
  // independent judge, shown no code, correctly said nothing was implemented.
  //
  // So when the caller hands in the project's verdicts, the change starts where
  // the previous stage stood (taskBase), unless the merge-base is closer.
  // `base_from` records which, so a reader can tell what the judge was shown.
  let ref, baseFrom;
  if (base) {
    ref = base; baseFrom = 'explicit';
  } else {
    const tb = verdictsDir ? taskBase(cwd, { verdictsDir, head }) : null;
    const mb = mergeBase(cwd);
    const mbBelow = mb && mb !== head ? mb : null;
    if (tb && mbBelow) {
      ref = isAncestor(cwd, mbBelow, tb) ? tb : mbBelow;
      baseFrom = ref === tb ? 'task' : 'merge-base';
    } else if (tb) {
      ref = tb; baseFrom = 'task';
    } else if (mbBelow) {
      ref = mbBelow; baseFrom = 'merge-base';
    } else {
      ref = mb || 'HEAD'; baseFrom = 'head';
    }
  }
  const changedOutput = git(['diff', '--name-only', '--diff-filter=d', ref, '--', ':/', ...pathspecExclude], cwd);
  if (changedOutput === null) return null;
  // Deletions, kept apart: a file deleted after an approval changes what ships, and
  // the file map — which holds content digests — cannot hold a file that is gone.
  const deletedOutput = git(['diff', '--name-only', '--diff-filter=D', ref, '--', ':/', ...pathspecExclude], cwd);
  if (deletedOutput === null) return null;
  const allDeleted = deletedOutput.split('\n').map((x) => x.trim()).filter(Boolean).sort();
  const deleted = allDeleted.slice(0, maxFiles);
  const names = [
    ...changedOutput
      .split('\n').map((s) => s.trim()).filter(Boolean),
    // A new file is part of the change under review, and is exactly the kind a
    // reviewer reads most closely.
    ...untracked,
  ];

  const files = {};
  let truncated = false;
  for (const p of names) {
    if (Object.keys(files).length >= maxFiles) { truncated = true; break; }
    const blob = digest(p);
    if (!blob) return null;
    files[p] = blob;
  }

  // A cut deletion list is a partial receipt like a cut file map: say so.
  if (allDeleted.length > maxFiles) truncated = true;
  return { head, dirty, base: ref, base_from: baseFrom, files, deleted, ...(truncated ? { truncated: true } : {}) };
}

/**
 * The content hash of a path AS IT IS ON DISK, not as it is in the index.
 *
 * `git rev-parse :path` reads the index, which is what was staged rather than
 * what an agent read. `hash-object` on the working file is the thing the
 * reviewer actually saw.
 */
export function fileDigest(cwd, path, { write = false } = {}) {
  const out = git(['hash-object', ...(write ? ['-w'] : []), '--no-filters', '--', path], cwd);
  return out ? out.trim() : null;
}

/** Is `ancestor` in the history of `descendant`? */
function isAncestor(cwd, ancestor, descendant) {
  return git(['merge-base', '--is-ancestor', ancestor, descendant], cwd) !== null;
}

/**
 * Where the current stage's work began: the commit the previous stage stood on.
 *
 * The newest verdict in `verdictsDir` that carries a receipt names that commit as
 * `receipt.head`. It is a base only if it is still in this history and is not
 * HEAD itself — a previous stage recorded at HEAD means nothing has been
 * committed since, and an earlier verdict would attribute another stage's work
 * to this one. A recorded head that is not an ancestor (rebased away, or from a
 * different clone) is skipped for the next newest.
 *
 * Null when there is no such commit; the caller falls back to the merge-base.
 */
export function taskBase(cwd, { verdictsDir, head = null, read = readFileSync, list = null } = {}) {
  if (!verdictsDir) return null;
  const now = head || git(['rev-parse', 'HEAD'], cwd)?.trim();
  if (!now) return null;
  let names;
  try { names = (list || fsModule.readdirSync)(verdictsDir).filter((f) => f.endsWith('.log')); }
  catch { return null; }
  const recorded = [];
  for (const f of names) {
    let text;
    try { text = read(join(verdictsDir, f), 'utf8'); } catch { continue; }
    for (const line of String(text).split('\n')) {
      if (!line.trim()) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      const h = rec?.receipt?.head;
      if (typeof h === 'string' && /^[0-9a-f]{7,40}$/.test(h)) recorded.push({ ts: String(rec.ts || ''), head: h });
    }
  }
  recorded.sort((a, b) => b.ts.localeCompare(a.ts));
  for (const { head: h } of recorded) {
    if (h === now) return null;
    if (isAncestor(cwd, h, now)) return h;
  }
  return null;
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
// Inside .great_cto/, only what DECIDES behaviour is compared: PROJECT.md (project_size
// and the tier, which decide the stages a deploy checks), exceptions/ (signed
// overrides), configuration files (*.toml, *.yml — security-allowlist.yml is one),
// security-signals.log (it raises the tier from baseline), slo-budget-current.md
// (an exhausted budget blocks a deploy) and env.sh (sourced into the deploy shell).
// Deleting or editing any of them after an approval is drift.
// Everything else there is what the pipeline writes while it runs — verdicts, logs,
// lessons, the review marker, handoffs, an acceptance — and in a project that does
// not gitignore .great_cto/ (init does not) each of those, written AFTER an approval,
// made the approval drift from itself, so a deploy could never pass.
//
// A list of what counts, not of what to ignore. The first fix listed the writers and
// missed three (review-marker.json, .last-auto-learn, lessons.md); the writers grow
// with every hook, the configuration does not.
const COUNTED_STATE = /^(PROJECT\.md|exceptions(\/|$)|security-signals\.log$|slo-budget-current\.md$|env\.sh$|[^/]+\.(toml|ya?ml)$)/;
export function isPipelineOutput(p) {
  if (!p.startsWith('.great_cto/')) return false;
  return !COUNTED_STATE.test(p.slice('.great_cto/'.length));
}
/** The top-level entries of .great_cto/ that are pipeline output, as paths to exclude. */
export function pipelineOutputPaths(cwd) {
  let names;
  try { names = requireFs().readdirSync(join(cwd, '.great_cto')); } catch { return []; }
  return names.filter((n) => !n.includes(':') && isPipelineOutput(`.great_cto/${n}`)).map((n) => `.great_cto/${n}`);
}
const codeOnly = (files) => Object.fromEntries(Object.entries(files || {}).filter(([p]) => !isPipelineOutput(p)));

export function compareReceipts(recorded, current, { digest = null, cwd = process.cwd() } = {}) {
  if (!recorded) return { state: 'no-receipt', why: 'the approving verdict carries no receipt — nothing to compare against' };
  if (!current) return { state: 'unreadable', why: 'the current tree state could not be read' };

  const changed = [];
  const added = [];
  const removed = [];
  const landed = [];
  const before = codeOnly(recorded.files);
  const now = codeOnly(current.files);
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
  // Deleted since the approval. Only when the recorded receipt says what was deleted
  // then; one from before this field cannot tell a new deletion from the change's own.
  if (Array.isArray(recorded.deleted)) {
    const was = new Set(recorded.deleted);
    for (const p of current.deleted || []) if (!was.has(p) && !isPipelineOutput(p) && !removed.includes(p)) removed.push(p);
  }

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

/** Same state location as log-verdict.sh; the candidate bytes stay in cwd. */
export function verdictStateDir(cwd = process.cwd(), env = process.env) {
  if (env.GREAT_CTO_DIR) return resolve(cwd, env.GREAT_CTO_DIR);
  const common = git(['rev-parse', '--git-common-dir'], cwd)?.trim();
  const gitdir = git(['rev-parse', '--git-dir'], cwd)?.trim();
  if (common && gitdir && resolve(cwd, common) !== resolve(cwd, gitdir)) {
    return join(dirname(resolve(cwd, common)), '.great_cto');
  }
  return join(cwd, '.great_cto');
}

export function latestApproval(cwd = process.cwd(), { agents = APPROVING_AGENTS, read = readFileSync, stateDir = verdictStateDir(cwd) } = {}) {
  let best = null;
  for (const agent of agents) {
    let text;
    try {
      text = read(join(stateDir, 'verdicts', `${agent}.log`), 'utf8');
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
export function writeAcceptance(cwd, { hash, why = '', at = Date.now(), agent = null } = {}) {
  const { writeFileSync, mkdirSync } = requireFs();
  mkdirSync(join(cwd, '.great_cto'), { recursive: true });
  writeFileSync(join(cwd, ACCEPT_PATH), JSON.stringify({ hash, why, at, ...(agent ? { agent } : {}) }) + '\n');
  return { hash, why, at, agent };
}

/**
 * The pending acceptance, if it is for the state in front of us.
 *
 * Four answers, not two. "None recorded", "unreadable", "for a different
 * state" and "valid" are different situations, and the third is the one worth
 * naming out loud: it means the tree moved after a human looked at it.
 */
export function readAcceptance(cwd, currentHash, { agent = null } = {}) {
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
  // An acceptance given while looking at one stage's drift does not cover another's:
  // the operator saw code-reviewer's files, not qa-engineer's.
  if (agent && rec.agent !== agent) {
    return { valid: false, stale: true, rec,
      why: `the acceptance was given for ${rec.agent || 'the whole tree'}, not for ${agent} — accept ${agent}'s drift separately` };
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
//    `--agent <name>` narrows it to one approving stage. The newest approval of
//    any stage is the wrong question before a deploy: a review of today's tree
//    must not stand in for a QA pass on yesterday's.
//    `--require` is the deploy question: "no approval carries a receipt" exits 3,
//    not 0, and files ADDED since the approval count as drift. Before a push they
//    are work continuing; before a deploy they are code nobody reviewed, shipping.

function currentForReceipt(cwd, receipt) {
  // Persisted evidence is data, not Git options or a new revision expression.
  // Missing bases retain legacy behavior; invalid declared bases stay unreadable.
  let base = receipt?.base;
  // The emitter uses HEAD when there is no conventional default branch. Bind
  // that legacy symbolic base to the recorded commit, not today's moving HEAD.
  if (base === 'HEAD') {
    if (!receipt?.head) return null;
    base = receipt.head;
  }
  if (base != null && (typeof base !== 'string' || !/^[0-9a-f]{7,64}$/i.test(base))) return null;
  // Without the pipeline's own state: an approval, an acceptance and a verdict all
  // write under .great_cto/, and in a project that does not ignore it each write
  // would change the state it is about (an acceptance voiding itself on write).
  return treeReceipt(cwd, { base: base || null, exclude: pipelineOutputPaths(cwd) });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  if (argv.includes('--state-dir')) {
    console.log(verdictStateDir());
    process.exit(0);
  }
  if (argv.includes('--emit')) {
    // `--verdicts <dir>`: measure the change from where the previous stage stood.
    const vi = argv.indexOf('--verdicts');
    const verdictsDir = vi >= 0 && argv[vi + 1] ? argv[vi + 1] : null;
    // `persist`: the bytes go into git's object store, not only their digest. The
    // judge reads the change from those objects later; a digest alone is a
    // promise about content nobody kept, and an uncommitted change — senior-dev's
    // normal case — would otherwise be judged from whatever the disk holds by then.
    // Only here, where a verdict is recorded: the board's frequent readers must
    // not leave objects behind.
    const r = treeReceipt(process.cwd(), { verdictsDir, persist: true });
    process.stdout.write(r ? JSON.stringify(r) : '');
    process.exit(r ? 0 : 1);
  }
  const agentsArg = () => {
    const i = argv.indexOf('--agent');
    if (i < 0) return APPROVING_AGENTS;
    const name = argv[i + 1];
    if (!APPROVING_AGENTS.includes(name)) {
      console.error(`receipt: --agent must be one of ${APPROVING_AGENTS.join(', ')}, got ${name}`);
      process.exit(2);
    }
    return [name];
  };
  if (argv.includes('--verify')) {
    const cwd = process.cwd();
    const agents = agentsArg();
    const approval = latestApproval(cwd, { agents });
    const current = currentForReceipt(cwd, approval?.receipt);
    const cmp = compareReceipts(approval?.receipt ?? null, current);
    if (cmp.state === 'no-receipt') {
      // Not silence. A push with no approval to compare against and a push whose
      // receipt matched are different facts, and only one of them is evidence.
      const whom = agents.length === 1 ? `${agents[0]} verdict` : 'verdict';
      console.log(`receipt: no approving ${whom} carries a receipt — nothing was verified`);
      process.exit(argv.includes('--require') ? 3 : 0);
    }
    const who = approval ? `${approval.agent} ${approval.verdict} at ${approval.ts}` : 'an approval';
    console.log(`receipt: against ${who}`);
    console.log(describeDrift(cmp).split('\n').map((l) => `  ${l}`).join('\n'));

    if (cmp.state === 'unreadable') process.exit(2);
    const requireMode = argv.includes('--require');
    // A receipt capped at MAX_FILES lists only part of the change, so a file past
    // the cap could change unseen. For the deploy question that is not a match.
    if (requireMode && (approval?.receipt?.truncated || current?.truncated)) {
      console.log(`  the receipt lists only the first ${MAX_FILES} files of this change — a match cannot be shown; re-run the stage on a smaller change`);
      process.exit(2);
    }
    const drifted = cmp.state === 'differs' || (cmp.state === 'extended' && requireMode);
    if (!drifted) process.exit(0);

    // Drift, but a human may already have looked at exactly this state.
    const hash = receiptHash(current);
    const narrowed = agents.length === 1 ? agents[0] : null;
    const acc = readAcceptance(cwd, hash, { agent: narrowed });
    if (acc.valid) {
      console.log(`  accepted by the operator for this exact state (${acc.why})`);
      // Consumed here rather than by the caller: whoever asked the question is
      // the one acting on the answer, and an acceptance that survives its own
      // check is a standing permission.
      clearAcceptance(cwd);
      process.exit(0);
    }
    if (acc.stale) console.log(`  ${acc.why} — accept again if this state is fine`);
    console.log(`  to accept this state: node scripts/lib/receipt.mjs --accept${narrowed ? ` --agent ${narrowed}` : ''}${requireMode ? ' --require' : ''}`);
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
    const approval = latestApproval(cwd, { agents: agentsArg() });
    const current = currentForReceipt(cwd, approval?.receipt);
    const cmp = compareReceipts(approval?.receipt ?? null, current);
    if (cmp.state === 'unreadable') {
      console.error(`receipt: cannot accept — ${cmp.why}`);
      process.exit(2);
    }
    const requireMode = argv.includes('--require');
    if (requireMode && (approval?.receipt?.truncated || current?.truncated)) {
      console.error(`receipt: cannot accept — the receipt lists only the first ${MAX_FILES} files; what you would accept is not all on screen`);
      process.exit(2);
    }
    // Under --require an added file is drift, so it must be acceptable too —
    // otherwise verify says "accept it" and accept says "nothing to accept".
    if (!(cmp.state === 'differs' || (cmp.state === 'extended' && requireMode))) {
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

    const stage = argv.includes('--agent') ? argv[argv.indexOf('--agent') + 1] : null;
    writeAcceptance(cwd, { hash, agent: stage,
      why: `drift accepted over ${cmp.changed.length} changed and ${cmp.added.length} added file(s)${stage ? ` for ${stage}` : ''}` });
    console.log('accepted. This authorises ONE push of this exact state; any further edit voids it.');
    process.exit(0);
  }

  const i = argv.indexOf('--check');
  if (i > -1) {
    const { readFileSync } = await import('node:fs');
    let recorded = null;
    try { recorded = JSON.parse(readFileSync(argv[i + 1], 'utf8')); } catch { /* absent */ }
    const cmp = compareReceipts(recorded, currentForReceipt(process.cwd(), recorded));
    console.log(describeDrift(cmp));
    process.exit(cmp.state === 'unreadable' ? 2 : cmp.state === 'differs' ? 1 : 0);
  }
  console.log(JSON.stringify(treeReceipt(process.cwd()), null, 2));
}
