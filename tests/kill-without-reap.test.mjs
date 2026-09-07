// A gate people re-run instead of read has stopped being a gate.
//
// Twenty-eight sites in this suite SIGKILLed a detached board and immediately
// removed the temp directories it had been running out of. SIGKILL is delivered
// asynchronously, and `great-cto board` is a LAUNCHER — it exits as soon as the
// server is up and the server is a GRANDCHILD — so the process actually racing
// `rmSync` was still alive and still writing. ENOTEMPTY, about one run in three,
// on a different test each time. The response stopped being "read the failure"
// and became "run it again", which is the same thing as having no suite.
//
// `tests/helpers/reap.mjs` kills the process GROUP and waits for it to go empty
// (`process.kill(-pgid, 0)` throws ESRCH once no member is left) — the direct
// child's exit proves nothing, because the direct child is not the problem.
//
// This check lives in a test rather than in the lesson-rules pack because that
// pack's sweep deliberately skips test files — they carry the hunted shapes as
// fixtures — so a rule about test files could never have fired there. A guard
// wired to a sweep that excludes its own target is not a guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS = dirname(fileURLToPath(import.meta.url));

function testFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...testFiles(p));
    else if (e.name.endsWith('.test.mjs')) out.push(p);
  }
  return out;
}

test('a test that group-kills a process and cleans up waits for the group', () => {
  const offenders = [];
  for (const file of testFiles(TESTS)) {
    const text = readFileSync(file, 'utf8');
    // Only where the race can bite. A killer that removes nothing has nothing
    // to race, and the fixture below is this file quoting the shape it hunts.
    if (!/rmSync\(/.test(text)) continue;
    if (file.endsWith('kill-without-reap.test.mjs')) continue;
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (!/process\.kill\(-/.test(line)) return;
      // A deliberate exception states its reason in the three lines above it.
      if (/reap-exempt:/.test(lines.slice(Math.max(0, i - 3), i).join('\n'))) return;
      offenders.push(`${file.replace(TESTS, 'tests')}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [],
    'use reap() from tests/helpers/reap.mjs, which waits for the group to empty, '
    + 'or write "// reap-exempt: <reason>" above the kill');
});

// ── A process that leads its own group is not reachable from its parent's ───
//
// Measured 2026-09-07: 93 orphaned `node` processes on the machine, all of them
// the fake CLI from tests/helpers/board-start.test.mjs, the oldest alive for two
// days and six hours. One leaked per gate run for as long as that test existed.
//
// The mechanism: the test's stand-in CLI DAEMONISES — it spawns itself again
// with `detached: true` and exits 0 — so the grandchild leads a process group of
// its own. `process.kill(-proc.pid)` reaps the parent's group and never touches
// it, and the cleanup looked correct while leaking every time.
//
// That is why the gate flaked and why fixing each flaky test kept not working:
// the machine's load floor rose run by run until tests with a time budget
// started missing it. Three beads describe the symptom; this is the cause.
//
// A test that spawns something detached must be able to name it — a pid file, a
// port it can find, anything — and kill it by that. Spawning detached with
// nothing written down is the leak.
test('a test that spawns a DETACHED grandchild records how to kill it', () => {
  const offenders = [];
  for (const file of testFiles(TESTS)) {
    const text = readFileSync(file, 'utf8');
    if (file.endsWith('kill-without-reap.test.mjs')) continue;
    // `detached: true` inside a string the test writes to disk and runs: that is
    // a grandchild, outside every group the test itself can reap.
    if (!/detached:\s*true/.test(text)) continue;
    const spawnsInsideAFixture = /writeFileSync\([^)]*\bcli\b|fakeCli\(/.test(text);
    if (!spawnsInsideAFixture) continue;
    // The escape hatch is naming it: a pid written somewhere the test reads back.
    if (/PIDFILE|pidFile|pidfile/i.test(text)) continue;
    offenders.push(file.replace(`${TESTS}/`, ''));
  }
  assert.deepEqual(offenders, [],
    'these spawn a detached grandchild from a fixture and keep no way to kill it — '
    + 'it survives the run, and the next run adds another');
});
