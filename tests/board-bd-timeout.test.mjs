/**
 * A busy `bd` is not a failed `bd`.
 *
 * `POST /api/tasks` runs `bd create` with `timeout: 5000` and turns ANY non-zero
 * result — including the timeout it just imposed — into HTTP 500. So a beads
 * process that is merely slow is reported to the caller as a server error, and
 * the caller (a test, a person, the board's own UI) cannot tell "try again in a
 * moment" from "this request is malformed".
 *
 * The numbers are not hypothetical, and they were already measured IN THIS
 * REPOSITORY. tests/pipeline-contracts.test.mjs records:
 *
 *     bd init takes 1.9s alone and up to 8.7s when ten test files spawn it at
 *     once — which is what `node --test` does.
 *
 * 8.7s measured against a 5s cap, with `bdWriteSerialised` queueing every write
 * behind every other write on top. That is the full-gate flake: three board
 * tests fail on task creation at 26s, 30s and 71s, and every one of them passes
 * alone, because alone there is nothing to queue behind.
 *
 * Two separate claims are tested here, and they are separate on purpose:
 *   1. a timeout is reported as 503 (temporary), not 500 (your fault)
 *   2. the cap is above the measured worst case, not below it
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startBoard } from './helpers/board-start.mjs';
import { reap } from './helpers/reap.mjs';

const CLI_ENTRY = join(process.cwd(), 'packages/cli/dist/main.js');

/** A `bd` that answers instantly for reads and stalls on `create`. */
function slowBd(stallSeconds) {
  const dir = mkdtempSync(join(tmpdir(), 'gc-slowbd-'));
  const p = join(dir, 'bd');
  writeFileSync(p, `#!/usr/bin/env bash
if [ "$1" = "create" ]; then sleep ${stallSeconds}; echo "Created issue: slow-1"; exit 0; fi
if [ "$1" = "list" ]; then echo '[]'; exit 0; fi
exit 0
`);
  chmodSync(p, 0o755);
  return p;
}

function project() {
  const root = mkdtempSync(join(tmpdir(), 'gc-bdto-'));
  mkdirSync(join(root, '.beads'), { recursive: true });     // checkBeadsAvailable
  mkdirSync(join(root, '.great_cto'), { recursive: true });
  writeFileSync(join(root, '.great_cto', 'PROJECT.md'), 'slug: bdto\n');
  return root;
}

test('a bd slower than the OLD cap now succeeds', { timeout: 90_000 }, async (t) => {
  // 12s: comfortably past the 5s cap this route used to impose, comfortably
  // inside the 20s it imposes now. Under `node --test` the real bd was measured
  // at 8.7s, and the write queue adds to that — so this is not a hypothetical
  // slow bd, it is the ordinary one on a loaded machine. It used to answer 500.
  const home = mkdtempSync(join(tmpdir(), 'gc-bdto-home-'));
  const root = project();
  const bdBin = slowBd(12);
  t.after(() => { for (const d of [home, root]) try { rmSync(d, { recursive: true, force: true }); } catch {} });

  const { port, proc: board } = await startBoard({
    cliEntry: CLI_ENTRY, project: root, home, env: { GREAT_CTO_BD_BIN: bdBin },
  });
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'slow but fine', priority: 2 }),
    });
    const body = await r.text();
    assert.equal(r.status, 200, `a 12s bd must succeed under a 20s cap, got ${r.status}. body: ${body.slice(0, 300)}`);
  } finally { await reap(board); }
});

test('a bd that exceeds the cap is 503, not 500', { timeout: 120_000 }, async (t) => {
  // 500 says "this request was wrong". A timeout says "come back shortly".
  // Conflating them is why the full-gate flake read as a broken board.
  const home = mkdtempSync(join(tmpdir(), 'gc-bdto2-home-'));
  const root = project();
  const bdBin = slowBd(25);
  t.after(() => { for (const d of [home, root]) try { rmSync(d, { recursive: true, force: true }); } catch {} });

  const { port, proc: board } = await startBoard({
    cliEntry: CLI_ENTRY, project: root, home, env: { GREAT_CTO_BD_BIN: bdBin },
  });
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'stalls past the cap', priority: 2 }),
    });
    const body = await r.text();
    assert.notEqual(r.status, 500,
      `a timed-out bd must not be reported as a server error. body: ${body.slice(0, 300)}`);
    assert.equal(r.status, 503, `expected 503, got ${r.status}. body: ${body.slice(0, 300)}`);
    assert.match(body, /timed out|busy|retry/i, 'the body must say it is temporary');
    assert.equal(r.headers.get('retry-after'), '5', 'a 503 must tell the caller when to come back');
  } finally { await reap(board); }
});

test('the bd write cap is above the worst case this repo has measured', () => {
  // 8.7s measured under `node --test` parallelism, and bdWriteSerialised queues
  // writes behind each other on top of that. A 5s cap could not be met under the
  // very conditions the suite creates for itself, so the check "did bd succeed"
  // was really asking "was the machine quiet".
  //
  // This asserts the cap, not the behaviour, because the behaviour only shows up
  // under a loaded machine — exactly the condition a test cannot rely on.
  const MEASURED_WORST_MS = 8700;
  const found = [];

  // Every explicit cap at a call site...
  const routes = readFileSync('packages/board/lib/routes.mjs', 'utf8');
  for (const m of routes.matchAll(/bd\([^;]*?timeout:\s*(\d+)/g)) found.push(['routes.mjs', Number(m[1])]);

  // ...and the DEFAULT, which every call site that names no timeout inherits.
  // It was 8000 — below the measured worst case — so the paths that looked
  // safest, by not configuring anything, were the ones with the tightest cap.
  const beads = readFileSync('packages/board/lib/beads.mjs', 'utf8');
  const def = beads.match(/spawnSync\(BD_BIN[^;]*?timeout:\s*(\d+)/);
  assert.ok(def, 'expected to find the default bd timeout in beads.mjs');
  found.push(['beads.mjs default', Number(def[1])]);

  assert.ok(found.length >= 2, 'expected to find bd timeouts to check');
  for (const [where, c] of found) {
    assert.ok(c > MEASURED_WORST_MS,
      `${where}: bd timeout ${c}ms is below the measured worst case ${MEASURED_WORST_MS}ms ` +
      '(tests/pipeline-contracts.test.mjs records bd taking 8.7s under node --test parallelism)');
  }
});
