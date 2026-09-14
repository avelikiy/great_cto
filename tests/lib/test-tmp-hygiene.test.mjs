// A test that makes a temp dir removes it.
//
// Measured 2026-09-14: TMPDIR held about 5,300 `gcto-iv-*` directories, 3,000
// `prepush-*` and roughly 2,000 each of eight more prefixes — one set per gate run,
// never removed. Of the 127 test files that create temp dirs, 48 removed nothing.
//
// Ten of them, the largest leakers, now clean up (great_cto-7179). The other 38 are
// listed below as they were found. The list only shrinks: a new test file that
// leaks fails here, and a listed file that has started cleaning up fails too, so
// the entry is removed rather than left to excuse a future regression.
//
// The check is textual — a file that creates a temp dir must remove something —
// which is the level at which all 48 were wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const KNOWN_LEAKERS = new Set([
  'packages/board/beads-cache.test.mjs',
  'packages/board/beads-warm-async.test.mjs',
  'packages/board/boot-responsiveness.test.mjs',
  'packages/board/decisions-scope.test.mjs',
  'packages/board/read-safe.test.mjs',
  'packages/board/watchers.test.mjs',
  'packages/cli/tests/codex-adapt-claims.test.mjs',
  'packages/cli/tests/overlay.test.mjs',
  'packages/cli/tests/telemetry.test.mjs',
  'packages/cli/tests/upgrade.test.mjs',
  'tests/eval/agent-changelog.test.mjs',
  'tests/eval/eval-gate.test.mjs',
  'tests/eval/guards.test.mjs',
  'tests/eval/prompt-evolve.test.mjs',
  'tests/handoff-package.test.mjs',
  'tests/hooks/budget-fires.test.mjs',
  'tests/hooks/orchestrator-check-parallelism.test.mjs',
  'tests/hooks/subagent-stop-measured-cost.test.mjs',
  'tests/hooks/tool-failure.test.mjs',
  'tests/lib/acceptance-verify.test.mjs',
  'tests/lib/agent-shield.test.mjs',
  'tests/lib/cost-runs.test.mjs',
  'tests/lib/count-skips.test.mjs',
  'tests/lib/cross-model-review-provider.test.mjs',
  'tests/lib/doc-links.test.mjs',
  'tests/lib/exceptions.test.mjs',
  'tests/lib/install-drift.test.mjs',
  'tests/lib/metrics-trend.test.mjs',
  'tests/lib/migration.test.mjs',
  'tests/lib/pattern-lookup.test.mjs',
  'tests/lib/pipeline-contract.test.mjs',
  'tests/lib/postinstall.test.mjs',
  'tests/lib/second-opinion-provider.test.mjs',
  'tests/lib/subagent-cost.test.mjs',
  'tests/lib/sync-managed.test.mjs',
  'tests/memory-filter.test.mjs',
  'tests/task-queue.test.mjs',
]);

const CREATES = /mkdtemp/;
const REMOVES = /rmSync|\brm\(|rm -rf|fs\.rm\b/;

function testFiles() {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((f) => f.endsWith('.test.mjs'));
}

function leakers() {
  return testFiles().filter((f) => {
    let t;
    try { t = readFileSync(join(ROOT, f), 'utf8'); } catch { return false; }
    return CREATES.test(t) && !REMOVES.test(t);
  });
}

test('no test file outside the known list makes temp dirs it never removes', () => {
  const fresh = leakers().filter((f) => !KNOWN_LEAKERS.has(f));
  assert.deepEqual(fresh, [], 'remove what the test creates — an after() hook over the dirs it made is enough');
});

test('the known list only shrinks: a listed file that now cleans up must come off it', () => {
  const still = new Set(leakers());
  const cured = [...KNOWN_LEAKERS].filter((f) => !still.has(f));
  assert.deepEqual(cured, [], 'delete these entries from KNOWN_LEAKERS');
});

test('the ten files fixed for great_cto-7179 stay fixed', () => {
  for (const f of [
    'tests/lib/independent-verify.test.mjs', 'tests/hooks/pre-push.test.mjs', 'tests/lib/docs-classify.test.mjs',
    'tests/lib/scores.test.mjs', 'tests/hooks/verify-gate.test.mjs', 'tests/hooks/summary-enforce.test.mjs',
    'tests/lib/router-key.test.mjs', 'tests/lib/plan-date.test.mjs', 'tests/lib/measured-cost.test.mjs', 'tests/lib/ccr.test.mjs',
  ]) {
    assert.ok(!KNOWN_LEAKERS.has(f), `${f} is back on the known list`);
    assert.match(readFileSync(join(ROOT, f), 'utf8'), REMOVES, `${f} no longer removes its temp dirs`);
  }
});
