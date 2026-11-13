// tests/lib/plugin-activation-e2e-wiring.test.mjs — the isolated-HOME E2E is run by the gate, for real.
//
// The board's browser step globs `tests/e2e/*.test.mjs`, which does not descend into
// tests/e2e/plugin-activation/, so these tests have a step of their own. gate-covers-tests.test.mjs
// checks that the directory's glob appears in ci-local.sh; a comment would satisfy that. This checks
// that it is a step, that it runs after the CLI build it needs, that the optional heavy-e2e switch
// does not guard it, and that nothing in the directory can pass by being skipped.
//
// Run: node --test tests/lib/plugin-activation-e2e-wiring.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const E2E_DIR = 'tests/e2e/plugin-activation';
const GLOB = `${E2E_DIR}/*.test.mjs`;
const STEP = 'plugin activation e2e (isolated HOME)';
const gate = fs.readFileSync(path.join(ROOT, 'scripts/ci-local.sh'), 'utf8');

/** What the step line must be, wherever the script puts it. Returns the problems found, or []. */
function wiringProblems(script) {
  const lines = script.split('\n'), problems = [];
  const at = lines.findIndex(line => line.startsWith('  step "') || line.startsWith('step "') ? line.includes(`"${STEP}"`) : false);
  if (at < 0) return [`no step named "${STEP}"`];
  const line = lines[at];
  if (!line.includes(GLOB)) problems.push(`the step does not run ${GLOB}`);
  if (!/\bnode --test\b/.test(line)) problems.push('the step does not run node --test');
  if (/\|\|\s*true|2>\/dev\/null|--test-skip|--test-name-pattern/.test(line)) problems.push('the step can pass without running every test');
  const build = lines.findIndex(l => l.includes('step "cli build (tests import it)"'));
  if (build < 0 || build > at) problems.push('the step must come after the CLI build it needs');
  // The innermost `if` that is still open at the step decides whether it runs.
  const open = [];
  for (const l of lines.slice(0, at)) {
    const t = l.trim();
    if (/^if\s/.test(t) && !/;\s*fi\s*$/.test(t)) open.push(t); // a one-line if ... fi opens nothing
    else if (t === 'fi') open.pop();
  }
  for (const condition of open) if (/\$E2E\b|"\$E2E"/.test(condition)) problems.push(`the step sits behind the optional heavy-e2e switch: ${condition}`);
  return problems;
}

test('ci-local.sh runs the plugin-activation E2E in a step of its own, after the CLI build', () => {
  assert.deepEqual(wiringProblems(gate), []);
});

test('the wiring check is not vacuous (known-bad samples)', () => {
  const good = ['step "cli build (tests import it)" bash -c true', 'if [ "$QUICK" -eq 0 ]; then', `  step "${STEP}" node --test ${GLOB}`, 'fi'].join('\n');
  assert.deepEqual(wiringProblems(good), []);
  assert.match(wiringProblems('# ' + GLOB).join(), /no step named/);
  assert.match(wiringProblems(good.replace(GLOB, 'tests/e2e/*.test.mjs')).join(), /does not run/);
  assert.match(wiringProblems(good.replace(`${GLOB}`, `${GLOB} || true`)).join(), /without running every test/);
  assert.match(wiringProblems(good.replace('QUICK" -eq 0', 'E2E" -eq 1')).join(), /optional heavy-e2e/);
  assert.match(wiringProblems(['  step "' + STEP + '" node --test ' + GLOB, 'step "cli build (tests import it)" true'].join('\n')).join(), /after the CLI build/);
});

test('the directory holds the scenario files and only they are run as tests; nothing in it skips', () => {
  const dir = path.join(ROOT, E2E_DIR), files = fs.readdirSync(dir);
  const tests = files.filter(name => name.endsWith('.test.mjs'));
  assert.ok(tests.length >= 5, `expected the five scenario files, found ${tests.join(', ')}`);
  for (const helper of ['harness.mjs', 'crash-child.mjs', 'network-guard.mjs']) {
    assert.ok(files.includes(helper), helper);
    assert.equal(helper.endsWith('.test.mjs'), false, `${helper} must not be collected as a test`);
  }
  for (const name of tests) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8');
    assert.doesNotMatch(source, /\.skip\(|\{\s*skip\b|\bt\.skip\b|\btodo\b|\.only\(/, `${name}: a skipped or focused test is not a gate`);
  }
});
