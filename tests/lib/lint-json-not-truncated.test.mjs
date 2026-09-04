/**
 * `--json` output must survive being piped.
 *
 * `agent-prompt-lint.mjs` prints its report with `console.log` and then calls
 * `process.exit()`. On a PIPE — which is what every caller uses, including
 * tests/lib/agent-prompt-lint-phase.test.mjs — stdout is asynchronous, and
 * `process.exit()` does not wait for it to drain. Anything past the pipe buffer
 * is discarded.
 *
 * The report was 8,170 bytes for a long time, the buffer is 8,192, and so it
 * worked. Adding one skill pushed the report to 9,810 and four tests began
 * failing with `Unterminated string in JSON` — pointing at the agents rather
 * than at the exit, because a truncated report is still a report right up to the
 * moment it stops.
 *
 * That is this repository's recurring defect in its most literal form: output
 * that stops early looks exactly like output that finished.
 *
 * `process.exitCode = n` sets the same status and lets the runtime flush.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LINT = join(ROOT, 'scripts', 'agent-prompt-lint.mjs');

test('the --json report parses when read through a pipe', () => {
  let out;
  try {
    out = execFileSync(process.execPath, [LINT, '--json'], { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    out = e.stdout ?? '';   // a non-zero exit is the normal path when findings exist
  }
  assert.ok(out.length > 0, 'the linter produced no output at all');

  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch (e) {
    assert.fail(
      `--json output is not parseable (${out.length} bytes): ${e.message}\n` +
      'If this is a truncation at ~8192 bytes, the cause is process.exit() ' +
      'discarding an unflushed stdout pipe — use process.exitCode instead.',
    );
  }
  assert.ok(Array.isArray(parsed.results), 'report must carry a results array');
  assert.equal(parsed.results.length, parsed.total,
    'every agent the linter counted must appear in the report — a short array is a truncated read');
});

test('the linter does not exit in a way that can discard its own output', () => {
  // Asserted against the source, not only the behaviour: the behaviour depends
  // on the report happening to be larger than the pipe buffer, which is exactly
  // the condition that hid this for months.
  const src = readFileSync(LINT, 'utf8');
  const afterPrint = src.slice(src.indexOf('--json'));
  assert.doesNotMatch(afterPrint, /\n\s*process\.exit\(errors\.length/,
    'use `process.exitCode = …` so stdout can flush before the process ends');
});
