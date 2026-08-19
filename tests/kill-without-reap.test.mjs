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
