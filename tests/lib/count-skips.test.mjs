// A skipped test is "not checked", never "checked and fine".
//
// ci-local's step() judged each step by exit code, and `node --test` exits 0
// when tests skip. So a board e2e that could not start a browser — and pressed
// no button — printed ✓, and the gate printed ALL GATES GREEN. HarnessRouter's
// conformance report keeps `conformant` and `conformant_with_skips` apart for
// the same reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { countSkips } from '../../scripts/lib/count-skips.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = join(ROOT, 'scripts/lib/count-skips.mjs');
const GATE = readFileSync(join(ROOT, 'scripts/ci-local.sh'), 'utf8');

test('TAP summaries are summed across every runner in the output', () => {
  assert.equal(countSkips('1..4\n# tests 4\n# skip 2\n# todo 0\n...\n1..9\n# skip 3\n'), 5);
});

test('the spec reporter summary counts too', () => {
  assert.equal(countSkips('ℹ tests 12\nℹ skipped 4\nℹ todo 0\n'), 4);
});

test('no skips is zero, and a zero summary is zero', () => {
  assert.equal(countSkips('# tests 3\n# pass 3\n# skip 0\n'), 0);
  assert.equal(countSkips(''), 0);
});

test('only summary lines count — a test named "skip" and its own # SKIP directive do not double it', () => {
  const tap = '# Subtest: skip the board when there is no browser\n'
    + 'ok 1 - skip the board when there is no browser # SKIP playwright is not installed\n'
    + '# skip 1\n';
  assert.equal(countSkips(tap), 1);
});

test('the CLI prints the count for a log, and refuses a log it cannot read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skips-'));
  const log = join(dir, 'step.log');
  writeFileSync(log, '# skip 2\n');
  const ok = spawnSync(process.execPath, [CLI, log], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout.trim(), '2');
  const missing = spawnSync(process.execPath, [CLI, join(dir, 'nope.log')], { encoding: 'utf8' });
  assert.equal(missing.status, 2);
  assert.equal(missing.stdout.trim(), '', 'an unreadable log is not "0 skipped"');
});

// The real step() from ci-local.sh, run under the shell macOS ships (bash 3.2).
function runStep(body, { pipefail = true } = {}) {
  const fn = (GATE.match(/^step\(\) \{[\s\S]*?^\}/m) || [])[0];
  assert.ok(fn, 'step() not found in ci-local.sh');
  const script = [
    pipefail ? 'set -uo pipefail' : 'set -u', `cd "${ROOT}"`, 'FAIL=0', 'SKIP_TOTAL=0', 'SKIP_LINES=""', fn, body,
    'echo "RESULT FAIL=$FAIL SKIP_TOTAL=$SKIP_TOTAL"', 'printf "%b" "$SKIP_LINES"',
  ].join('\n');
  return spawnSync('/bin/bash', ['-c', script], { encoding: 'utf8' });
}

test('step() counts a step that passed with skipped tests, and still passes it', () => {
  const r = runStep(`step "board e2e" bash -c 'echo "# skip 2"; exit 0'`);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /RESULT FAIL=0 SKIP_TOTAL=2/);
  assert.match(r.stdout, /board e2e: 2/);
});

test('step() keeps the command\'s own exit status through the tee', () => {
  const r = runStep(`step "cli unit tests" bash -c 'echo out; exit 3'`);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /✗ cli unit tests \(exit 3\)/);
  assert.match(r.stdout, /RESULT FAIL=1 SKIP_TOTAL=0/);
});

test('the exit status survives the tee even without pipefail', () => {
  // ci-local sets pipefail, under which `$?` of the pipeline would also be right.
  // PIPESTATUS[0] does not depend on it, and does not report a failing tee as the
  // command's own status. Without pipefail, `$?` is tee's 0 and a failure passes.
  const r = runStep(`step "cli unit tests" bash -c 'exit 3'`, { pipefail: false });
  assert.match(r.stdout, /✗ cli unit tests \(exit 3\)/);
  assert.match(r.stdout, /RESULT FAIL=1/);
});

test('ALL GATES GREEN is printed only when nothing failed and nothing was skipped', () => {
  assert.match(GATE,
    /if \[ "\$FAIL" -eq 0 \] && \[ "\$SKIP_TOTAL" -eq 0 \]; then\s*\n\s*printf [^\n]*ALL GATES GREEN/);
  assert.match(GATE, /SKIPPED — NOT CHECKED/);
});

test('the gate uses no bash arrays — bash 3.2 with set -u dies on an empty one', () => {
  assert.doesNotMatch(GATE, /^\s*[A-Z_]+=\(|\+=\(/m);
});
