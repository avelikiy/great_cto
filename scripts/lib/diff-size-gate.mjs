#!/usr/bin/env node
// Is this change small enough that a human can actually review it?
//
// The argument (habr.com/ru/articles/1060204, and Naur's "Programming as Theory
// Building" behind it): a merge request of "+1500 -1400" does not get reviewed,
// it gets waved through. The team then owns code no one holds a mental model of.
// That failure is invisible to every check great_cto already runs — tests pass,
// scope is respected, security is clean, and the diff is still unreviewable.
//
// This is not hypothetical here. Measured across the 2026-07 benchmark products:
// single commits of 12,306 and 10,687 insertions. Whatever review those received
// was not review.
//
// Deliberately advisory-by-default. A large diff is sometimes correct — a
// generated lockfile, a vendored dependency, a mechanical rename across 80 files
// — and a hard block on line count would train people to split commits
// artificially or disable the check. What it must not do is pass silently.
//
// Zero tokens, zero network: reads `git diff --numstat`.
import { spawnSync } from 'node:child_process';

/** Files whose size says nothing about review effort. */
const GENERATED = [
  /(^|\/)package-lock\.json$/, /(^|\/)yarn\.lock$/, /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)Cargo\.lock$/, /(^|\/)poetry\.lock$/, /(^|\/)go\.sum$/,
  /(^|\/)dist\//, /(^|\/)build\//, /(^|\/)vendor\//, /(^|\/)node_modules\//,
  /\.min\.(js|css)$/, /\.(svg|png|jpg|jpeg|gif|webp|ico|pdf)$/,
  /(^|\/)__snapshots__\//, /\.snap$/,
];

export function isGenerated(file) {
  return GENERATED.some((re) => re.test(String(file)));
}

/** Parse `git diff --numstat` output into {file, added, removed} rows. */
export function parseNumstat(text = '') {
  const out = [];
  for (const line of String(text).split('\n')) {
    const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!m) continue;
    // "-" marks a binary file: no reviewable lines.
    out.push({
      file: m[3],
      added: m[1] === '-' ? 0 : parseInt(m[1], 10),
      removed: m[2] === '-' ? 0 : parseInt(m[2], 10),
      binary: m[1] === '-',
    });
  }
  return out;
}

/**
 * Thresholds. Hand-written source, not totals — the point is reviewable volume.
 *
 * 400 lines is where review quality is widely observed to fall off (SmartBear's
 * review study is the usual citation, and the Google/Cisco guidance that follows
 * it). It is a threshold for a *warning*, not a truth.
 */
export const DEFAULT_LIMITS = Object.freeze({ lines: 400, files: 20 });

/**
 * @param {{file:string,added:number,removed:number,binary?:boolean}[]} rows
 * @returns {{status:'ok'|'large'|'huge', reviewable:{lines:number,files:number},
 *            generated:{lines:number,files:number}, worst:object[], reason:string}}
 */
export function assessDiff(rows = [], limits = DEFAULT_LIMITS) {
  const source = rows.filter((r) => !isGenerated(r.file) && !r.binary);
  const generated = rows.filter((r) => isGenerated(r.file) || r.binary);

  const sum = (list) => list.reduce((a, r) => a + (r.added || 0) + (r.removed || 0), 0);
  const reviewableLines = sum(source);
  const reviewableFiles = source.length;

  // Ranked by churn so the message can name where the bulk actually is —
  // "split this" is useless advice without saying which part is heavy.
  const worst = [...source]
    .sort((a, b) => (b.added + b.removed) - (a.added + a.removed))
    .slice(0, 3)
    .map((r) => ({ file: r.file, lines: r.added + r.removed }));

  const overLines = reviewableLines > limits.lines;
  const overFiles = reviewableFiles > limits.files;
  const status = (reviewableLines > limits.lines * 3 || reviewableFiles > limits.files * 3)
    ? 'huge'
    : (overLines || overFiles) ? 'large' : 'ok';

  let reason = '';
  if (status !== 'ok') {
    const parts = [];
    if (overLines) parts.push(`${reviewableLines} reviewable lines (limit ${limits.lines})`);
    if (overFiles) parts.push(`${reviewableFiles} source files (limit ${limits.files})`);
    reason = parts.join(', ');
  }

  return {
    status,
    reviewable: { lines: reviewableLines, files: reviewableFiles },
    generated: { lines: sum(generated), files: generated.length },
    worst,
    reason,
  };
}

/** Human rendering. Says what to do, not just that something is wrong. */
export function renderAssessment(a) {
  if (a.status === 'ok') {
    return `diff size: ${a.reviewable.lines} reviewable lines across ${a.reviewable.files} file(s) — reviewable`;
  }
  const L = [];
  L.push(a.status === 'huge'
    ? `⚠️  DIFF TOO LARGE TO REVIEW — ${a.reason}`
    : `⚠️  diff is large — ${a.reason}`);
  if (a.generated.files) {
    L.push(`   (excluded ${a.generated.lines} lines in ${a.generated.files} generated/binary file(s))`);
  }
  if (a.worst.length) {
    L.push('   heaviest: ' + a.worst.map((w) => `${w.file} (${w.lines})`).join(', '));
  }
  L.push('   A change this size is approved, not reviewed. Split it into slices that');
  L.push('   each stand alone — or state explicitly why this one cannot be split.');
  return L.join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const argv = process.argv.slice(2);
  const range = argv.find((a) => !a.startsWith('--')) || 'HEAD';
  const r = spawnSync('git', ['diff', '--numstat', range], { encoding: 'utf8' });
  const a = assessDiff(parseNumstat(r.stdout || ''));

  if (argv.includes('--json')) process.stdout.write(JSON.stringify(a, null, 2) + '\n');
  else process.stdout.write(renderAssessment(a) + '\n');

  // Advisory by default: a large diff is sometimes correct, and a hard block on
  // line count teaches people to split artificially or switch the check off.
  // --enforce is for teams that want it to bite.
  process.exit(argv.includes('--enforce') && a.status !== 'ok' ? 1 : 0);
}
