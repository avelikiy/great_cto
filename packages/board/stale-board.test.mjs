// An install the operator cannot see is not an install.
//
// This machine served board v2.95.0 for nine days while three installs in a row
// reported success. Nothing was broken in the installer: it wrote the files, and
// the files were correct. The board is a PROCESS, and a process keeps the
// version it started with — `server.mjs` answers EADDRINUSE with "board already
// running" and exit(0), so every relaunch politely deferred to the nine-day-old
// one. The `/board` command's own `--restart` could not help: it killed by the
// patterns `great_cto.*board.*--port` and `great-cto board`, and the process was
// `node packages/board/server.mjs --port 3141`, which matches neither.
//
// Two fixes, and this file guards both: the installer restarts the board by
// PORT (the one identifier that cannot be wrong), and the board reports whether
// it is behind so a board started any other way is visibly stale rather than
// merely stale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const read = (...p) => readFileSync(join(REPO, ...p), 'utf8');

// ── The board can say it is behind ──────────────────────────────────────────

test('/api/version compares the running version against the installed one', () => {
  const routes = read('packages', 'board', 'lib', 'routes.mjs');
  const handler = routes.match(/if \(pathname === '\/api\/version'\)[\s\S]*?\n  \}/)?.[0];
  assert.ok(handler, 'located the handler');
  assert.match(handler, /installed/, 'reports what is installed, not only what is running');
  assert.match(handler, /stale/, 'and the comparison, so the page does not have to make it');
});

test('staleness is three states — a comparison we could not make is not a mismatch', () => {
  const routes = read('packages', 'board', 'lib', 'routes.mjs');
  const handler = routes.match(/if \(pathname === '\/api\/version'\)[\s\S]*?\n  \}/)?.[0];
  assert.match(handler, /'unknown'/, 'an unreadable plugin cache answers unknown');
  assert.match(handler, /installed && BUILD_VERSION !== 'unknown'/,
    'both sides must be known before yes/no is claimed');
});

test('the banner is silent unless the answer is a definite yes', () => {
  const html = read('packages', 'board', 'public', 'index.html');
  const fn = html.match(/async function checkBoardFreshness\(\)[\s\S]*?\n\}/)?.[0];
  assert.ok(fn, 'located checkBoardFreshness');
  assert.match(fn, /v\.stale !== 'yes'\) return;/, "'unknown' must not render as a mismatch");
  assert.match(fn, /esc\(v\.version\)/, 'server-supplied strings are escaped like everything else here');
});

// ── The installer restarts what it replaced ─────────────────────────────────

test('the installer stops the board by PORT, not by command-line pattern', () => {
  const sh = read('scripts', 'lib', 'board-restart.sh');
  assert.match(sh, /lsof -ti ":\$\{1:-3141\}" -sTCP:LISTEN/,
    'whoever holds the port is the board, whatever its command line says');
  assert.ok(!/pkill/.test(sh), 'pattern matching is what failed for nine days');
});

test('a restart preserves the working directory it found', () => {
  // The cwd decides which project the board opens on. A restart that changes it
  // is a restart that moved the operator's board somewhere else.
  const sh = read('scripts', 'lib', 'board-restart.sh');
  assert.match(sh, /board_cwd\(\)/);
  assert.match(sh, /\$4=="cwd"/);
});

test('the installer never claims a restart it did not verify', () => {
  const sh = read('scripts', 'install-local.sh');
  assert.match(sh, /board did not come back/, 'a board that did not return is reported, not assumed');
  assert.match(sh, /could not free/, 'and so is a port it failed to free');
  assert.match(sh, /board restarted/, 'success is only printed when a version came back');
});

test('board_start returns only the version', () => {
  // `local v` inside the poll loop printed `v=''` to stdout on every iteration
  // under zsh, and this function's stdout IS its return value — the caller got
  // three lines of debris wrapped around the answer.
  const sh = read('scripts', 'lib', 'board-restart.sh');
  const fn = sh.match(/board_start\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(fn, 'located board_start');
  assert.ok(!/\n\s*local v;/.test(fn), 'no per-iteration declaration on the output channel');
  assert.match(fn, /printf '%s\\n' "\$v"/, 'and the version is printed, not echoed with surprises');
});

// ── The cache actually caches ───────────────────────────────────────────────

test('the bd cache TTL is longer than a bd call takes', () => {
  // Measured on this repository: `bd list` 3.0-4.6 s, `bd --version` — pure
  // process startup — 1.13 s. At the old 2 s TTL the entry expired before the
  // call that filled it had returned, so a page load firing /api/inbox,
  // /api/tasks and /api/metrics paid full price three times and every endpoint
  // sat at ~5 s. A cache whose TTL is shorter than the operation it caches is
  // not a cache.
  const beads = read('packages', 'board', 'lib', 'beads.mjs');
  const m = beads.match(/const BD_CACHE_TTL_MS = Number\(process\.env\.GREAT_CTO_BD_CACHE_TTL_MS \|\| (\d+)\)/);
  assert.ok(m, 'located the TTL');
  assert.ok(Number(m[1]) >= 10000,
    `TTL is ${m[1]}ms — a bd call costs 3000-4600ms, so anything near it guarantees a miss`);
});

test('staleness is still bounded by invalidation, not only by the clock', () => {
  // A long TTL is only safe because writes and file changes invalidate.
  const beads = read('packages', 'board', 'lib', 'beads.mjs');
  assert.match(beads, /bdCacheInvalidate/, 'writes through the board drop the entry');
  const watchers = read('packages', 'board', 'lib', 'watchers.mjs');
  assert.match(watchers, /bdCacheInvalidate|invalidate/i, 'and so does a change underneath us');
});
