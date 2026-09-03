/**
 * Every directory of tests is named in the gate.
 *
 * `ci-local.sh` collects tests with explicit globs — `tests/*.test.mjs`,
 * `tests/hooks/*.test.mjs`, `tests/lib/*.test.mjs`. A new directory is therefore
 * invisible to the gate by default: `tests/helpers/board-start.test.mjs` was
 * written, passed, and was not run by the gate at all. A test the gate never
 * runs is indistinguishable from a test that passes, which is the failure this
 * repository keeps removing everywhere else.
 *
 * This asserts the inverse: for every directory under tests/ that contains a
 * *.test.mjs, the gate mentions that directory.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Directories whose tests are deliberately run elsewhere or not at all.
// A ratchet: it may only shrink.
const NOT_IN_GATE = {
  'eval': 'run by its own "eval tests" step',
  'docs': 'run by its own "docs tests" step, tolerated to fail',
};

test('every tests/ directory holding a .test.mjs is named in ci-local.sh', () => {
  const gate = readFileSync(join(ROOT, 'scripts', 'ci-local.sh'), 'utf8');
  const testsRoot = join(ROOT, 'tests');
  const missing = [];

  (function walk(dir) {
    let hasTest = false;
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) { if (e !== '__pycache__' && e !== 'baselines') walk(p); continue; }
      if (e.endsWith('.test.mjs')) hasTest = true;
    }
    if (!hasTest) return;
    const rel = relative(testsRoot, dir);
    const name = rel === '' ? '' : rel;
    if (name in NOT_IN_GATE) return;
    const needle = name === '' ? 'tests/*.test.mjs' : `tests/${name}/*.test.mjs`;
    if (!gate.includes(needle)) missing.push(needle);
  })(testsRoot);

  assert.deepEqual(missing, [],
    'these test directories exist but the gate never runs them — add the glob to ci-local.sh');
});
