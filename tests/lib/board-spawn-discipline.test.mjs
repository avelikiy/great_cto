/**
 * No test may start a board by hand.
 *
 * Seven test files each had their own copy of "spawn the CLI, then poll a port
 * until a deadline". Between them they carried three distinct defects:
 *
 *   - a wait loop that `break`s on success and, on timeout, falls out SILENTLY,
 *     letting the test continue against a board that never came up (BH-14)
 *   - no retry for a port taken between `freePort()` and the child's bind, even
 *     though free-port.mjs promised one for months
 *   - one message, `board did not start on port <n>`, for three different causes:
 *     port taken, server crashed on boot, machine slow
 *
 * They were fixed in one place — tests/helpers/board-start.mjs — and this keeps
 * them fixed. Without it the eighth test file writes the same loop again, and
 * the flake comes back wearing a new test name.
 *
 * A ratchet, not a style rule: the lists below may only shrink.
 *
 * Its reach is textual, and deliberately so: it matches `spawn('node', [… 'board'`
 * as written. An aliased import (`import { spawn as s } …`) would slip past. That
 * is accepted — this guards against the copy-paste that produced seven near
 * identical loops, not against someone determined to route around it. A guard
 * whose limits are written down can be trusted at its edges; one that implies it
 * catches everything cannot.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every .mjs under tests/, except the helper that is allowed to do this. */
function testFiles() {
  const out = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) { if (e !== '__pycache__' && e !== 'baselines') walk(p); continue; }
      if (e.endsWith('.mjs')) out.push(p);
    }
  })(TESTS);
  return out.filter((p) => !p.endsWith(join('helpers', 'board-start.mjs'))
                        && !p.endsWith(join('helpers', 'board-start.test.mjs'))
                        && !p.endsWith(join('lib', 'board-spawn-discipline.test.mjs')));
}

// Files that still spawn a board directly. A ratchet: it may only shrink.
//
// Both entries are hand-run scripts, not tests — no `.test.mjs` suffix, so
// `node --test` never collects them and the gate never runs them. They drive a
// REAL model against OpenRouter and cost money per run, which is why they are
// started deliberately by a person and why their board lifetime is measured in
// minutes rather than the milliseconds a unit test holds one. The concurrency
// hazard this guard exists for — several files binding ports at once under
// `node --test` — does not reach them.
//
// Convert them if they ever join the suite; until then, converting them buys
// nothing and touching a script that spends money to prove it is buying nothing.
const SPAWNS_BOARD_DIRECTLY = [
  'openrouter-multi-archetype.mjs',
  'openrouter-real-pipeline.mjs',
];

// One test legitimately spawns the CLI itself, and a whole-file exemption would
// let the next four copies in behind it. So the exemption carries a COUNT: the
// file may contain exactly this many direct spawns, and a fifth fails the guard
// the same as an unexempted file would.
//
// BH-C4 asserts that `--port=N` (one argument with an equals sign) is parsed at
// all. `startBoard` cannot stand in for it: startBoard is the thing that passes
// `--port N`, so using it here would test the helper's spelling instead of the
// CLI's parser.
const SPAWN_BUDGET = { 'pipeline-contracts.test.mjs': 1 };

test('no test spawns a board itself — startBoard does it', () => {
  const offenders = [];
  for (const p of testFiles()) {
    const src = readFileSync(p, 'utf8');
    // A spawn whose argument list mentions the board subcommand.
    if (/spawn\(\s*['"]node['"]\s*,\s*\[[^\]]*['"]board['"]/s.test(src)
        || /spawn\(\s*['"]node['"]\s*,\s*\[[^\]]*board\/server\.mjs/s.test(src)) {
      offenders.push(relative(TESTS, p));
    }
  }
  const unexempt = offenders.filter((f) => !SPAWNS_BOARD_DIRECTLY.includes(f) && !(f in SPAWN_BUDGET));
  assert.deepEqual(unexempt, [],
    'use startBoard / startServerOnFreePort from tests/helpers/board-start.mjs');

  // The budgeted files stay within their budget.
  for (const [file, budget] of Object.entries(SPAWN_BUDGET)) {
    const p = testFiles().find((x) => relative(TESTS, x) === file);
    assert.ok(p, `${file} is budgeted but does not exist — drop the entry`);
    const n = (readFileSync(p, 'utf8').match(/spawn\(\s*['"]node['"]\s*,\s*\[[^\]]*['"]board['"]/gs) || []).length;
    assert.equal(n, budget,
      `${file} may spawn a board directly ${budget}× (BH-C4 tests the flag form); found ${n}`);
  }
});

test('the one message that meant three things is gone', () => {
  // `board did not start on port 62394` is what every copy threw. It names a
  // port, says nothing about a race, and reads identically whether the server
  // crashed or the machine was busy — which is why this was re-run through as a
  // known flake for months instead of being read.
  const offenders = [];
  for (const p of testFiles()) {
    // The THROW, not the mention. The fix's own comments quote the old message
    // to explain what was wrong with it, and a guard that cannot tell a quote
    // from the thing it quotes flags its own documentation.
    if (/throw new Error\(\s*`board did not start on port/.test(readFileSync(p, 'utf8'))) {
      offenders.push(relative(TESTS, p));
    }
  }
  assert.deepEqual(offenders, [], 'startBoard reports which of the three causes it was');
});

test('no test derives a port from its own pid', () => {
  // `3197 + (process.pid % 40)` — forty buckets, so two runs on one machine
  // collide and the loser waits out its deadline. The kernel knows which ports
  // are free; guessing is what free-port.mjs was written to stop.
  const offenders = [];
  for (const p of testFiles()) {
    // Same distinction: an assignment, not a mention in prose.
    if (/=\s*\d+\s*\+\s*\(?\s*process\.pid\s*%/.test(readFileSync(p, 'utf8'))) {
      offenders.push(relative(TESTS, p));
    }
  }
  assert.deepEqual(offenders, [], 'ask the kernel for a port instead of deriving one from the pid');
});

test('the helper everyone now depends on exists and exports what they import', async () => {
  // A discipline rule pointing at a module that does not export these would be
  // a rule nobody can follow.
  const m = await import('../helpers/board-start.mjs');
  for (const fn of ['startOnFreePort', 'startBoard', 'startServerOnFreePort']) {
    assert.equal(typeof m[fn], 'function', `board-start must export ${fn}`);
  }
});
