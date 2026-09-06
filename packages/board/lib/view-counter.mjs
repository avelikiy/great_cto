// BRD-R9 (great_cto-ki1x.15): a local, per-view request counter.
//
// Why this exists: every JTBD claim in the board redesign brief
// (docs/product/BRIEF-board-redesign-2026-09.md) is otherwise an assumption.
// This file is the one source the K2/K3 kill-criteria read from — Decisions
// opened <5 days in a 14-day window → pivot; Fleet opened <4 times in 60 days
// → delete — plus the 2026-09-20 kanban deep-link review already logged in
// .great_cto/decisions.md.
//
// What this is NOT: telemetry. docs/PRIVACY.md requires telemetry to be
// opt-in and off by default; this counter makes no network call, has no
// endpoint that leaves the machine, and writes to a file under the caller's
// OWN `.great_cto/` (project-scoped, same rule as decisionsLogPath in
// fleet.mjs / ADR-008 — never a global/home-dir file another project's
// agents could read).
//
// Kept pure on purpose (`root` and `at` are both injected): a test builds a
// temp root and a fixed clock instead of touching the real filesystem or
// wall clock, and the HTTP route in routes.mjs is the only caller that
// supplies real values.
import fs from 'fs';
import path from 'path';

// The only view names the redesigned IA renders (BRD-R8): Decisions, Ledger,
// Fleet, Harness, Settings, plus the demoted-to-deep-link `kanban`. Anything
// else is rejected outright, before any filesystem write — an unknown view
// name written to this file would silently corrupt the K2/K3 counts it
// exists to protect.
const VALID_VIEWS = ['decisions', 'ledger', 'fleet', 'harness', 'settings', 'kanban'];

function logFilePath(root) {
  return path.join(root, '.great_cto', 'view-counter.log');
}

/**
 * Append one line — `{"ts":<ISO>,"view":<name>}` — to `.great_cto/view-counter.log`.
 * Append-only: never truncates, never rewrites a prior line. Creates the
 * `.great_cto/` directory on first use.
 *
 * @param {{root:string, view:string, at?:Date}} args
 * @throws if `view` is not one of VALID_VIEWS — nothing is written in that case.
 */
function recordView({ root, view, at = new Date() }) {
  if (!VALID_VIEWS.includes(view)) {
    throw new Error(`recordView: unknown view "${view}" — expected one of ${VALID_VIEWS.join(', ')}`);
  }
  const file = logFilePath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ ts: at.toISOString(), view }) + '\n');
}

/**
 * Summarize opens per view since `since` (inclusive; null/omitted = all time).
 *
 * Three states, not two (this repository's rule, e.g. routes.mjs `/api/harnesses`
 * evidence log): a file that was never written is `absent` — DIFFERENT from
 * `ok` with real zeros, which means "measured, and there were none". A file
 * that exists but cannot even be opened (permission error, or a directory
 * sitting where the file should be) is `unreadable`, carrying `why`.
 *
 * Within `ok`, an individual line that fails JSON.parse (or is missing a
 * recognized `view`/`ts`) does NOT flip the file to `unreadable` — it is
 * counted in `unreadable_lines` and skipped, same as the existing
 * cross-review.log parser in routes.mjs: "unparseable lines are counted, not
 * dropped, so a corrupted log does not read as a quiet one."
 *
 * @param {{root:string, since?:string|null}} args
 * @returns {{state:'absent'}
 *          |{state:'unreadable', why:string}
 *          |{state:'ok', since:string|null, views:Record<string,{opens:number,days_with_opens:number,first:string|null,last:string|null}>, unreadable_lines:number}}
 */
function summarizeViews({ root, since = null }) {
  const file = logFilePath(root);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return { state: 'absent' };
    return { state: 'unreadable', why: String(e?.message || e) };
  }

  const sinceMs = since ? new Date(since).getTime() : -Infinity;
  const views = {};
  const daysSeen = {};
  for (const v of VALID_VIEWS) {
    views[v] = { opens: 0, days_with_opens: 0, first: null, last: null };
    daysSeen[v] = new Set();
  }

  let unreadableLines = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      unreadableLines += 1;
      continue;
    }
    if (!row || typeof row.view !== 'string' || !VALID_VIEWS.includes(row.view) || typeof row.ts !== 'string') {
      unreadableLines += 1;
      continue;
    }
    const ms = new Date(row.ts).getTime();
    if (!Number.isFinite(ms)) {
      unreadableLines += 1;
      continue;
    }
    if (ms < sinceMs) continue; // outside the requested window — filtered, not unreadable

    const bucket = views[row.view];
    bucket.opens += 1;
    if (bucket.first == null || ms < new Date(bucket.first).getTime()) bucket.first = row.ts;
    if (bucket.last == null || ms > new Date(bucket.last).getTime()) bucket.last = row.ts;
    daysSeen[row.view].add(row.ts.slice(0, 10)); // YYYY-MM-DD, UTC by construction (toISOString)
  }
  for (const v of VALID_VIEWS) views[v].days_with_opens = daysSeen[v].size;

  return { state: 'ok', since: since ?? null, views, unreadable_lines: unreadableLines };
}

export { recordView, summarizeViews, VALID_VIEWS };
