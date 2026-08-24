import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync, spawn } from 'child_process';
import { readSafe } from './util.mjs';
import { bdCache } from './state.mjs';
import { log } from './log.mjs';

// ── Beads data ─────────────────────────────────────────────────────────────────
// Cache bdList output per cwd for BD_CACHE_TTL_MS. Invalidated when the project's
// .beads/interactions.jsonl changes (the file watcher in watchBeads() calls
// bdCacheInvalidate(cwd) before broadcasting). This avoids spawning `bd list`
// on every API call when 5+ projects are open in tabs.
// Measured, not guessed: `bd list` on this repository takes 3.0–4.6 s and
// `bd --version` — pure process startup, no query — takes 1.13 s. At a 2 s TTL
// the entry expired before the call that filled it had returned, so a page load
// firing /api/inbox, /api/tasks and /api/metrics paid full price three times and
// every endpoint sat at ~5 s. A cache whose TTL is shorter than the operation it
// caches is not a cache; it is a counter of missed opportunities.
//
// 30 s is safe because staleness is bounded by invalidation, not by the clock:
// `bdCacheInvalidate` fires on every write through the board, and the file
// watchers fire when anything changes the store underneath us. The TTL is only
// the backstop for a change that arrived through neither.
// 5 minutes, and the number is a backstop rather than a freshness promise.
//
// Staleness is bounded by INVALIDATION, not by this clock. Every write through
// the board drops the entry (four call sites in routes.mjs), and the file
// watchers drop it for the project a client is actually watching on any change
// underneath it. What the TTL covers is the residue: a change that arrived
// through neither path, in a project nobody has open.
//
// 30 s was worse than it looks. `bd list` costs 6.8 s on this repository, so a
// person who clicks, reads for half a minute, and clicks again pays the full
// cost every single time — the cache only ever helped a burst. Measured after
// the sweep fix, with no `bd` child present in twenty seconds of sampling: the
// board was no longer saturated and still answered /api/inbox in 8-11 s,
// because each request arrived just after the entry expired.
const BD_CACHE_TTL_MS = Number(process.env.GREAT_CTO_BD_CACHE_TTL_MS || 300000);

function bdCacheInvalidate(cwd) {
  clearSelfTouch(cwd);
  bdCache.delete(cwd);
}

// ── bd binary resolution (BH-32) ────────────────────────────────────────────
// A board launched from a GUI / launchd / a login shell that didn't source the
// usual profile often has a minimal PATH (`/usr/bin:/bin`) that omits where
// Homebrew (`/opt/homebrew/bin`) or a user install (`~/.local/bin`) put `bd`.
// Then `spawnSync('bd', …)` → ENOENT, and a gate Approve fails with the opaque
// "bd update failed" — even though `bd list` was served from cache. Resolve the
// binary once against the common locations, and always spawn with an augmented
// PATH so bd's own child processes (git) are found too.
const BD_EXTRA_PATHS = ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin'), '/usr/bin', '/bin'];
const BD_BIN = (() => {
  // honor an explicit override first
  if (process.env.GREAT_CTO_BD_BIN && fs.existsSync(process.env.GREAT_CTO_BD_BIN)) return process.env.GREAT_CTO_BD_BIN;
  for (const dir of BD_EXTRA_PATHS) {
    const p = path.join(dir, 'bd');
    try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
  }
  return 'bd'; // fall back to PATH lookup
})();
function bdEnv() {
  const cur = process.env.PATH || '';
  const have = new Set(cur.split(path.delimiter).filter(Boolean));
  const add = BD_EXTRA_PATHS.filter((d) => !have.has(d));
  return add.length ? { ...process.env, PATH: [...add, cur].filter(Boolean).join(path.delimiter) } : process.env;
}
// Centralized bd invocation — resolved binary + augmented PATH for every call site.
function bd(args, opts = {}) {
  return spawnSync(BD_BIN, args, { encoding: 'utf8', timeout: 8000, ...opts, env: { ...bdEnv(), ...(opts.env || {}) } });
}
// Turn a failed bd result into an actionable message (the bare "bd update failed" hid ENOENT).
function bdErr(r, what) {
  if (r.error && r.error.code === 'ENOENT') return `${what}: 'bd' not found. Install Beads (brew install beads) or set GREAT_CTO_BD_BIN to the bd path, then restart the board.`;
  if (r.error && r.error.code === 'ETIMEDOUT') return `${what}: bd timed out — a stale .beads/.lock can cause this`;
  return (r.stderr && r.stderr.trim()) || (r.stdout && r.stdout.trim()) || what;
}

// Check whether `bd` is initialized in the given cwd. Returns null on success,
// or a structured error object suitable for a 409 Conflict response.
// Used to give the admin UI a clean signal ("project not initialized") rather
// than a 500 with a raw stderr dump.
function checkBeadsAvailable(cwd) {
  // Quick filesystem check first — beads stores its DB under .beads/.
  // Some installs use ~/.beads or env-var BEADS_DIR; respect those too.
  const candidates = [
    path.join(cwd, '.beads'),
    process.env.BEADS_DIR,
  ].filter(Boolean);
  if (candidates.some(p => { try { return fs.existsSync(p); } catch { return false; } })) {
    return null;  // looks initialized
  }
  return {
    error: 'beads_not_initialized',
    message: `No .beads/ directory found in ${cwd}. Initialize with 'bd init' or set BEADS_DIR.`,
    cwd,
    hint: "Run 'bd init' in the project root, then retry.",
  };
}

// ── bd write serialisation (BH-12, 2026-05-15) ─────────────────────────────
//
// bd uses Dolt-embedded DB with file-level locking. Concurrent `bd create`
// or `bd update` calls compete for the lock; if one crashes mid-write, it
// leaves a stale `.beads/.lock` that blocks ALL subsequent operations
// until manually removed.
//
// Server-level fix: serialise bd write operations through this single
// promise chain. Reads (`bd list`) are unaffected — Dolt's read path
// doesn't take the write lock.
//
// Adds ~100ms per write under burst load; no-op under normal usage.
let _bdWriteChain = Promise.resolve();
function bdWriteSerialised(fn) {
  const next = _bdWriteChain.then(() => fn()).catch((e) => {
    log.error('[bd-write-serialised]', e?.message || e);
    return null;
  });
  _bdWriteChain = next.then(() => undefined).catch(() => undefined);
  return next;
}

// On a transient bd failure (nonzero exit, dolt lock, timeout, throw), keep
// serving the last-good cached data instead of overwriting it with [] — an
// empty result is indistinguishable from "no tasks" and would wipe a
// populated board on every SSE push (great_cto-e2ew). We deliberately do NOT
// refresh cached.ts on failure, so the next call retries bd immediately
// rather than being TTL-gated on a failed read.
//
// Why the failure is also RECORDED
// --------------------------------
// Falling back to `[]` keeps the board up, but `[]` is the same value a project
// with no tasks returns, and the reader cannot tell them apart. A project whose
// directory name contains a dot — `<private-project>.ai` — makes bd refuse to open its
// database at all ("invalid database name"), and the board answered that with a
// clean empty board: no tasks, no metrics, no explanation. Switching to it looked
// exactly like a project nobody had started.
//
// So the reason is kept per-cwd and handed up to the API, which reports it in
// `X-Board-Degraded`. The empty list is still returned — the board stays usable —
// but it now arrives labelled.
const bdFailures = new Map();

/** Why this project's tasks could not be read, or null if they could. */
function bdFailureFor(cwd = process.cwd()) {
  return bdFailures.get(cwd) || null;
}

/** The first meaningful line of bd's complaint, short enough for a header. */
function bdReason(result) {
  const text = String(result?.stderr || result?.stdout || '').trim();
  // bd reports some failures as JSON on stdout with status 0-adjacent shapes.
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.error) return String(parsed.error).slice(0, 300);
  } catch { /* not JSON — use the raw first line */ }
  const line = text.split('\n').map((s) => s.trim()).find(Boolean);
  return (line || 'bd exited non-zero without a message').slice(0, 300);
}

/**
 * @param {object} [opts]
 * @param {number} [opts.maxAgeMs] How stale an entry may be before it is
 *   refreshed. Defaults to BD_CACHE_TTL_MS — the interactive freshness a person
 *   looking at one project expects.
 *
 *   Background sweeps pass a much larger value, and the reason is arithmetic
 *   rather than taste. `bd list` costs 2-6 s per project; this machine has 16
 *   registered. One sweep is therefore ~60 s of SYNCHRONOUS work — `spawnSync`
 *   holds the event loop for the whole of it — while the TTL was 30 s. The first
 *   entries expired before the sweep that filled them had finished, so the next
 *   sweep re-ran all sixteen. Three of the alert crons do this every five
 *   minutes: ~190 s of blocking per 300 s.
 *
 *   Measured while it was happening: a `bd` child present in 9 of 10 samples
 *   over 20 s, and `/api/version` — a single readdirSync — answering in 1-10 s
 *   because it was queued behind the sweep. The board rendered empty, said
 *   "live · synced just now", and was telling the truth: SSE was connected and
 *   every data request had timed out.
 *
 *   A cache whose TTL is shorter than the sweep that fills it never hits. Same
 *   defect as the 2 s TTL fixed yesterday, one level up: that one was measured
 *   against a single call, this one has to be measured against the whole sweep.
 */
/**
 * When we last ran `bd` ourselves in a directory.
 *
 * `bd list` is a READ, and dolt still writes: it touches
 * `.dolt/noms/manifest` and `.dolt/noms/journal.idx` on every invocation. The
 * file watcher watches exactly those files — deliberately, because `bd create`
 * writes only to dolt and never to interactions.jsonl, so they are the only
 * signal for a new issue.
 *
 * The two together form a loop: a request runs `bd list`, dolt touches the
 * journal, the watcher fires, the cache entry is invalidated, and the next
 * request runs `bd list` again. The read destroyed the cache that existed to
 * make the read unnecessary. This is why raising the TTL never worked — not at
 * 2 s, not at 30 s, not at 5 minutes. The entry was never expiring; it was being
 * deleted.
 *
 * A touch within `SELF_TOUCH_WINDOW_MS` of our own run is ours. A real external
 * write inside that window is missed by the watcher and picked up by the next
 * event or by the TTL — the alternative is the loop, which costs every read.
 */
const lastBdRunAt = new Map();
const SELF_TOUCH_WINDOW_MS = 3000;

/** True when a file event under `cwd` is the echo of a `bd` we just ran. */
function isSelfInflictedTouch(cwd) {
  const at = lastBdRunAt.get(cwd);
  return at != null && Date.now() - at < SELF_TOUCH_WINDOW_MS;
}

/**
 * A DELIBERATE invalidation means something really changed, so the file event it
 * is about to produce is not ours to ignore.
 *
 * Without this the self-touch window swallowed real writes. Approving a gate
 * goes: read the inbox (our `bd list`, stamped), approve (a `bd update`), dolt
 * touches the journal, watcher fires — and the touch lands inside the 3 s window
 * opened by our own read, so it was skipped and the SSE broadcast never went out.
 * Live updates stopped, and the comment above said the write would be "picked up
 * by the next event", which for a broadcast means never.
 *
 * Every write path already calls `bdCacheInvalidate`. Clearing the mark there
 * costs nothing and makes the window mean what it says: it suppresses the echo
 * of a READ, never the consequence of a write.
 */
function clearSelfTouch(cwd) { lastBdRunAt.delete(cwd); }

/**
 * An EMPTY answer is cached briefly, whatever the TTL says.
 *
 * Empty is the one result most likely to be premature: a board that starts while
 * a project is still being written reads no tasks, and that answer is
 * indistinguishable from a project that genuinely has none. At a 2 s TTL the
 * mistake healed before anyone noticed. At 5 minutes it does not — the board
 * served `{"gates":0,"blocked":0,"p0":0,"stale":0}` for longer than any test
 * runs, and longer than a person will wait before deciding the board is broken.
 *
 * That is exactly what raising the TTL did to this suite: the gate tests create
 * a task, start a board, and poll. The poll used to recover. It stopped
 * recovering, and the failures moved around enough between runs to read as the
 * flakiness that had been there all day — which is why I spent three runs
 * blaming the machine.
 *
 * A short window for empty costs one `bd list` on a project that really is
 * empty, and nothing at all on one that is not.
 */
const EMPTY_TTL_MS = Number(process.env.GREAT_CTO_BD_EMPTY_TTL_MS || 5000);

/**
 * Directories with a background refresh already in flight.
 *
 * Without this, ten requests arriving while one refresh runs start ten more.
 */
const refreshing = new Set();

/**
 * Refresh a directory's entry WITHOUT holding the event loop.
 *
 * `spawnSync` is what made this board unanswerable: `bd list` costs seconds and
 * blocks everything for the whole of it — /api/version, one readdirSync,
 * measured at 1-10 s because it was queued behind a task read. Warming at boot
 * moved the first stall out of sight; this removes the rest.
 *
 * Nothing awaits it. It exists to make the NEXT read fast, and a caller that
 * needed the new data would have had to block for it anyway.
 */
function bdRefreshAsync(cwd) {
  if (refreshing.has(cwd)) return;
  refreshing.add(cwd);
  lastBdRunAt.set(cwd, Date.now());
  let out = '';
  try {
    const child = spawn(BD_BIN, ['list', '--json', '--all', '--include-gates'], { cwd, env: bdEnv() });
    child.stdout?.on('data', (d) => { out += d; });
    child.on('error', (e) => {
      refreshing.delete(cwd);
      bdFailures.set(cwd, `bd could not be run: ${e?.message || e}`.slice(0, 300));
    });
    child.on('close', (code) => {
      refreshing.delete(cwd);
      lastBdRunAt.set(cwd, Date.now());
      if (code !== 0) { bdFailures.set(cwd, `bd exited ${code}`); return; }
      try {
        const parsed = JSON.parse(out || '[]');
        // Same guard as the sync path: bd 0.6x can answer 0 with a JSON object,
        // and a non-array rendered as no tasks is the silent zero again.
        if (!Array.isArray(parsed)) {
          bdFailures.set(cwd, String(parsed?.error || 'bd returned something that is not a task list').slice(0, 300));
          return;
        }
        bdFailures.delete(cwd);
        bdCache.set(cwd, { ts: Date.now(), data: parsed });
      } catch (e) {
        bdFailures.set(cwd, `bd output could not be parsed: ${e?.message || e}`.slice(0, 300));
      }
    });
  } catch (e) {
    refreshing.delete(cwd);
    bdFailures.set(cwd, `bd could not be spawned: ${e?.message || e}`.slice(0, 300));
  }
}

function bdList(cwd = process.cwd(), runner = bd, opts = {}) {
  const maxAge = Number.isFinite(opts.maxAgeMs) ? opts.maxAgeMs : BD_CACHE_TTL_MS;
  const cached = bdCache.get(cwd);
  const ttl = cached && Array.isArray(cached.data) && cached.data.length === 0
    ? Math.min(maxAge, EMPTY_TTL_MS)
    : maxAge;
  if (cached && Date.now() - cached.ts < ttl) return cached.data;

  // Stale-while-revalidate. An entry that exists is served immediately, however
  // old, and refreshed off the event loop. Only a directory with NO entry at all
  // blocks — which after the boot warm-up means a project nobody has opened yet,
  // once.
  //
  // The alternative was making this async and every caller with it: getTasks,
  // getInbox, getPipeline, the metrics readers, the SSE broadcast, the alert
  // sweeps. That refactor is the correct end state and is not what a board
  // hanging today needs.
  //
  // The injected `runner` is how the tests drive this. When one is supplied the
  // sync path is kept, so a test that stubs `bd` still observes the call it
  // stubbed rather than a background spawn it cannot see.
  if (cached && runner === bd) {
    bdRefreshAsync(cwd);
    return cached.data;
  }
  try {
    lastBdRunAt.set(cwd, Date.now());
    const result = runner(['list', '--json', '--all', '--include-gates'], { cwd });
    // Stamped again on return: the touch happens DURING the call, and the call
    // takes seconds. Stamping only before it leaves a window where our own echo
    // arrives after the mark has already aged out.
    lastBdRunAt.set(cwd, Date.now());
    if (result.status !== 0) {
      bdFailures.set(cwd, bdReason(result));
      if (cached) return cached.data; // last-good data, cache untouched
      bdCache.set(cwd, { ts: Date.now(), data: [] });
      return [];
    }
    // bd 0.6x reports some open failures as a JSON object on stdout with exit 0.
    // `JSON.parse` succeeds, the result is not an array, and the board rendered
    // it as no tasks — the same silent zero one layer further in.
    const parsed = JSON.parse(result.stdout || '[]');
    if (!Array.isArray(parsed)) {
      bdFailures.set(cwd, String(parsed?.error || 'bd returned something that is not a task list').slice(0, 300));
      if (cached) return cached.data;
      bdCache.set(cwd, { ts: Date.now(), data: [] });
      return [];
    }
    bdFailures.delete(cwd);
    bdCache.set(cwd, { ts: Date.now(), data: parsed });
    return parsed;
  } catch (e) {
    bdFailures.set(cwd, `bd could not be run: ${e?.message || e}`.slice(0, 300));
    if (cached) return cached.data; // last-good data, cache untouched
    bdCache.set(cwd, { ts: Date.now(), data: [] });
    return [];
  }
}

// Map a free-form status word (from either tasks.md dialect) to the UI status
// the board renders, plus the gate flag. Kept separate so both the checkbox and
// the table parser classify identically.
function tasksMdStatus(rawStatus, id, title) {
  const s = String(rawStatus || '').toLowerCase().trim();
  const isGate = /^gate[:\-]/i.test(title || '') || /^gate\b/i.test(id || '')
    || (title || '').toLowerCase().includes('gate:');
  let status;
  if (s === 'done' || s === 'closed' || s === 'x') status = 'done';
  else if (s === 'in_progress' || s === 'in-progress' || s === 'wip' || s === 'doing') status = 'in_progress';
  else if (s === 'blocked') status = 'blocked';
  else status = isGate ? 'gate' : 'backlog';
  // raw_status is what the inbox filters on, because mapStatus() rewrites any
  // gate-labelled task to 'gate' and filtering on the mapped value would leave
  // closed gates in the inbox forever. That fix covered `done`; it did not cover
  // `blocked`, so a gate marked blocked in tasks.md reported raw_status 'open'
  // and never left the inbox — for exactly the bd-less projects this parser
  // exists to serve.
  const raw = status === 'done' ? 'closed' : status === 'blocked' ? 'blocked' : 'open';
  return { status, raw_status: raw, isGate };
}

// Build the full task record both parsers emit — one shape so getTasks can
// return either verbatim.
function tasksMdRecord({ id, title, description, status, raw_status, isGate, owner, agent, est }) {
  return {
    id,
    title: (title || '').trim(),
    description: (description || '').trim(),
    notes: '', design: '', acceptance: '',
    status, raw_status,
    priority: 2,
    labels: agent ? [agent] : [],
    owner: owner || agent || '',
    created_at: null, updated_at: null, closed_at: null,
    close_reason: '', comment_count: 0,
    is_gate: isGate,
    agent: agent || '',
    estimated_minutes: est ? (parseInt(est) || null) : null,
    source: 'tasks.md',
  };
}

// The pipeline falls back to a Markdown *table* (`| id | title | status | owner |`)
// when beads can't open the path (e.g. a space in it). Parse those rows. Requires
// a header row containing at least `id`, `title`, `status` so unrelated tables in
// the file (metrics, config) are never misread as tasks.
// Split one Markdown table row into cells. Markdown escapes a literal pipe
// inside a cell as `\|` (task notes are full of them: `range=1d\|1w\|1m\|all`,
// `key\|secret\|token`). Splitting on a bare `|` shredded those rows into extra
// columns, shoving `open`/`1m\`/`M` into the owner slot → junk filter chips and
// broken layout. Split only on UNescaped pipes, then unescape each cell.
function splitTableRow(line) {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split(/(?<!\\)\|/)
    .map(c => c.replace(/\\\|/g, '|').trim());
}

// An owner/agent cell is a short handle (senior-dev, CTO, qa-engineer). This
// tasks.md has 19 tables in 3 schemas (incl. `id|title|size|horizon|status|owner`
// and `id|severity|finding|status`), plus ragged/duplicated rows, so a mis-aligned
// row can drop a status word ("done"), a size ("M"), or a horizon code ("H2") into
// the owner slot. Those became bogus agent/label filter chips. Accept only real
// handle shapes; reject status/size words and anything with a digit.
const NON_OWNER = new Set([
  'done', 'closed', 'open', 'in_progress', 'in-progress', 'blocked', 'backlog',
  'todo', 'wip', 'ready', 'gate', 'xs', 's', 'm', 'l', 'xl', // status + t-shirt sizes
]);
function cleanOwner(raw) {
  const o = String(raw || '').trim();
  if (!o || o === '—' || o.length > 40 || /\s—\s|[.;]/.test(o)) return '';
  if (NON_OWNER.has(o.toLowerCase())) return '';
  // Real handles are letters + hyphens (senior-dev, product-owner, CTO, pm).
  // Anything with a digit (H2, P1, 1m) is a size/horizon/estimate code, not an owner.
  if (!/^[A-Za-z]+(-[A-Za-z]+)*$/.test(o)) return '';
  return o;
}

// tasks.md table "titles" can run to hundreds of chars (they carry a full
// implementation note). bd titles are short, so no view was built to clamp this
// much text and long rows overflowed the layout. Keep the card title readable and
// push the overflow into the description (which renders in a scrollable panel).
const TITLE_MAX = 160;
function capTitle(title, description) {
  const t = String(title || '').trim();
  if (t.length <= TITLE_MAX) return { title: t, description };
  let cut = t.lastIndexOf(' ', TITLE_MAX);
  // Cutting inside a markdown link leaves `see [the design…` in the title and
  // the URL stranded in the description — the board renders a broken link and
  // the reader cannot tell the title was truncated rather than malformed. Back
  // up to before the link when the cut lands inside one.
  const linkStart = t.lastIndexOf('[', cut);
  if (linkStart !== -1) {
    const linkEnd = t.indexOf(')', linkStart);
    if (linkEnd === -1 || linkEnd >= cut) {
      const before = t.lastIndexOf(' ', linkStart);
      if (before > 0) cut = before;
    }
  }
  const at = cut > TITLE_MAX * 0.6 ? cut : TITLE_MAX;
  const overflow = t.slice(at).trim();
  return {
    title: t.slice(0, at).trim() + '…',
    description: overflow + (description ? ' — ' + description : ''),
  };
}

function parseTableTasks(text) {
  const lines = text.split('\n');
  const tasks = [];
  let cols = null; // { id, title, status, owner } → column indices
  const idLike = /^[A-Za-z][\w.]*-[\w.\-]+$/; // e.g. GATE-arch, TASK-12, EPIC-2, AUTH-01
  for (const line of lines) {
    if (!/^\s*\|.*\|\s*$/.test(line)) { cols = null; continue; } // table ended
    const cells = splitTableRow(line);
    if (/^:?-{2,}:?$/.test(cells[0] || '')) continue; // separator row
    if (!cols) {
      const lower = cells.map(c => c.toLowerCase());
      const idx = n => lower.indexOf(n);
      if (idx('id') !== -1 && idx('title') !== -1 && idx('status') !== -1) {
        cols = { id: idx('id'), title: idx('title'), status: idx('status'), owner: idx('owner') };
      }
      continue; // header consumed (or a non-task table's row skipped)
    }
    const id = cells[cols.id] || '';
    if (!idLike.test(id)) continue; // not a task row
    // Split a trailing `[ … ]` completion note off the title into the description.
    let rawTitle = (cells[cols.title] || '').replace(/\*\*/g, '');
    let description = '';
    const noteAt = rawTitle.search(/`?\[/);
    if (noteAt > 0) {
      description = rawTitle.slice(noteAt).replace(/^`|`$/g, '').replace(/^\[|\]$/g, '').trim();
      rawTitle = rawTitle.slice(0, noteAt).trim();
    }
    const owner = cols.owner !== -1 ? cleanOwner(cells[cols.owner]) : '';
    const { status, raw_status, isGate } = tasksMdStatus(cells[cols.status], id, rawTitle);
    const capped = capTitle(rawTitle, description);
    tasks.push(tasksMdRecord({ id, title: capped.title, description: capped.description, status, raw_status, isGate, owner, agent: owner }));
  }
  return tasks;
}

// Best-effort write-back for bd-less projects (e.g. a path with a space, where
// embedded-dolt can't open its store): flip the `status` cell of a task's row in
// the tasks.md table so a board gate approve/reject still persists. Returns true
// if a matching row was updated. Only touches the table dialect (the checkbox
// dialect has no separate status cell to rewrite in place).
function setTaskStatusInTasksMd(cwd, id, newStatus) {
  const fp = path.join(cwd, '.great_cto', 'tasks.md');
  if (!fs.existsSync(fp)) return false;
  let text;
  try { text = fs.readFileSync(fp, 'utf8'); } catch { return false; }
  const lines = text.split('\n');
  let cols = null, changed = false;
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|.*\|\s*$/.test(lines[i])) { cols = null; continue; }
    const cells = splitTableRow(lines[i]);
    if (/^:?-{2,}:?$/.test(cells[0] || '')) continue;
    if (!cols) {
      const lower = cells.map(c => c.toLowerCase());
      if (lower.indexOf('id') !== -1 && lower.indexOf('status') !== -1) {
        cols = { id: lower.indexOf('id'), status: lower.indexOf('status'), width: cells.length };
      }
      continue;
    }
    if ((cells[cols.id] || '') === id) {
      // A title containing an unescaped `|` — "deploy A | B decision" — splits
      // into an extra cell, so every column after it is shifted. Writing by
      // index then put the new status INSIDE the title and left the real status
      // cell untouched: the row lost text and the gate stayed open while the
      // board reported it approved. A row that does not match the header's
      // width is not one we can address by index, so it is refused instead.
      if (cells.length !== cols.width) {
        readDegradation.set(cwd,
          `tasks.md row '${id}' has ${cells.length} cells but the table header has ${cols.width} ` +
          '(an unescaped `|` in a cell?) — status not written, as writing by column would corrupt the row');
        return false;
      }
      cells[cols.status] = newStatus;
      // Re-escape pipes we unescaped on the way in, then rebuild the row.
      lines[i] = '| ' + cells.map(c => c.replace(/\|/g, '\\|')).join(' | ') + ' |';
      changed = true;
      break;
    }
  }
  if (!changed) return false;
  try { fs.writeFileSync(fp, lines.join('\n')); return true; } catch { return false; }
}

// Fallback: parse .great_cto/tasks.md when Beads isn't initialized (or can't
// open its store). Two dialects, tried in order:
//   1. checkbox:  `- [ ] TASK-001: Title [agent] [~42min]` + indented description
//   2. table:     `| id | title | status | owner |` rows (space-in-path fallback)
// Why a read failed, per project dir — so the API can report "could not read
// this" instead of an empty board. `null` means "nothing wrong": either the file
// is legitimately absent or it parsed fine. Absence is normal; unreadable is not.
const readDegradation = new Map();

/** Degradation reason for a project's task sources, or null when healthy. */
function getReadDegradation(cwd = process.cwd()) {
  // tasks.md first: if that file exists and is broken, that is the specific
  // problem. Otherwise report bd's failure, which until now was swallowed — the
  // board answered "no tasks" for a project whose database bd refused to open.
  return readDegradation.get(cwd) || bdFailureFor(cwd) || null;
}

function parseTasksMd(cwd) {
  const fp = path.join(cwd, '.great_cto', 'tasks.md');
  const r = readSafe(fp);
  if (!r.ok) {
    // Missing is a normal state (a project may track tasks in beads only).
    // Unreadable is a defect the operator must see rather than read as "no tasks".
    readDegradation.set(cwd, r.reason === 'missing'
      ? null
      : `tasks.md could not be read: ${r.error}`);
    return [];
  }
  readDegradation.set(cwd, null);
  try {
    const text = r.text;
    const tasks = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^-\s+\[([ x])\]\s+([A-Z]+-\d+):\s+(.+?)(?:\s+\[([\w-]+)\])?(?:\s+\[~?([^\]]+)\])?\s*$/);
      if (!m) continue;
      const [, done, id, title, agent, est] = m;
      // Collect indented description lines until next blank or task
      let desc = '';
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s+\S/.test(lines[j])) { desc += lines[j].trim() + ' '; }
        else break;
      }
      const isGate = /^gate:/i.test(title) || (title || '').toLowerCase().includes('gate');
      tasks.push({
        id,
        title: title.trim(),
        description: desc.trim(),
        notes: '',
        design: '',
        acceptance: '',
        status: done === 'x' ? 'done' : (isGate ? 'gate' : 'backlog'),
        raw_status: done === 'x' ? 'closed' : 'open',
        priority: 2,
        labels: agent ? [agent] : [],
        owner: agent || '',
        created_at: null,
        updated_at: null,
        closed_at: null,
        close_reason: '',
        comment_count: 0,
        is_gate: isGate,
        agent: agent || '',
        estimated_minutes: est ? parseInt(est) || null : null,
        source: 'tasks.md',
      });
    }
    // Both dialects, always. Parsing the table only when the checkbox pass came
    // back empty meant a single stray `- [ ] …` line hid every table row behind
    // it — and a gate row that never reaches the board is a gate nobody can
    // approve. The checkbox pass wins a duplicate id: it is the older dialect,
    // so a file carrying both is one being migrated away from it.
    const seen = new Set(tasks.map((t) => t.id));
    for (const t of parseTableTasks(r.text)) if (!seen.has(t.id)) tasks.push(t);
    return tasks;
  } catch (e) {
    // The file was readable but we could not make sense of it. Record it: an
    // empty list here is a parser defect, not an empty backlog.
    readDegradation.set(cwd, `tasks.md could not be parsed: ${e?.message || e}`);
    return [];
  }
}

/**
 * Sweeps that touch every registered project pass `{ maxAgeMs: SWEEP_MAX_AGE_MS }`.
 * A gate that has been stale for hours is not less stale for having been read
 * ten minutes ago, and no alert is worth making the board unanswerable.
 */
const SWEEP_MAX_AGE_MS = Number(process.env.GREAT_CTO_BD_SWEEP_MAX_AGE_MS || 15 * 60 * 1000);

function getTasks(cwd = process.cwd(), opts = {}) {
  const all = bdList(cwd, bd, opts);
  // Fallback to tasks.md when no Beads tasks (project not initialized with bd)
  if (all.length === 0) {
    const mdTasks = parseTasksMd(cwd);
    if (mdTasks.length > 0) return mdTasks;
  }
  return all.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description || '',
    notes: t.notes || '',
    design: t.design || '',
    acceptance: t.acceptance || '',
    status: mapStatus(t.status, t.labels, t.issue_type),
    raw_status: t.status,                     // bd-native status (open/in_progress/closed/blocked)
    priority: t.priority,
    labels: t.labels || [],
    owner: t.owner || '',
    created_at: t.created_at,
    updated_at: t.updated_at,
    closed_at: t.closed_at || null,
    close_reason: t.close_reason || '',
    comment_count: t.comment_count || 0,
    // Gate detection: explicit 'gate' label OR bd decision type OR title contains 'gate:'
    is_gate: (t.labels || []).includes('gate')
          || t.issue_type === 'decision'
          || (t.title || '').toLowerCase().startsWith('gate:'),
    agent: detectAgent(t),
  }));
}

function mapStatus(status, labels = [], issue_type = '') {
  // Terminal status takes precedence over the 'gate' classification.
  // Otherwise closed gate tasks would still appear as 'gate' status, which
  // breaks Pending-decisions / P0-open / Active-pipeline aggregates that
  // consider "anything mapped to gate" still actionable.
  // Reported by Codex against /api/inbox showing 3 closed gates as P0 open.
  if (status === 'closed') return 'done';
  if (status === 'blocked') return 'blocked';
  if ((labels || []).includes('gate') || issue_type === 'decision') return 'gate';
  switch (status) {
    case 'open': return 'backlog';
    case 'in_progress': return 'in_progress';
    default: return 'backlog';
  }
}

function detectAgent(task) {
  const title = (task.title || '').toLowerCase();
  if (title.includes('architect') || title.includes('arch')) return 'architect';
  if (title.includes('pm:') || title.includes('product-manager') || title.includes('plan ')) return 'pm';
  if (title.includes('senior') || title.includes('impl') || title.includes('feat') || title.includes('fix')) return 'senior-dev';
  if (title.includes('qa') || title.includes('test')) return 'qa-engineer';
  if (title.includes('sec') || title.includes('cso')) return 'security-officer';
  if (title.includes('deploy') || title.includes('release')) return 'devops';
  if (title.includes('gate:')) return 'gate';
  return '';
}

export {
  bdCacheInvalidate,
  BD_CACHE_TTL_MS,
  SWEEP_MAX_AGE_MS,
  EMPTY_TTL_MS,
  isSelfInflictedTouch,
  BD_BIN,
  bdEnv,
  bd,
  bdErr,
  checkBeadsAvailable,
  bdWriteSerialised,
  bdList,
  bdFailureFor,
  parseTasksMd,
  getReadDegradation,
  setTaskStatusInTasksMd,
  getTasks,
  mapStatus,
  detectAgent,
};
