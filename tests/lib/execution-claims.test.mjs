// The rung below this asks whether a named document exists. It cannot catch what
// actually happened: qa-engineer recorded coverage=100% having run about a third
// of the suite, and code-reviewer approved a change without re-running anything.
// Both claims were sincere. Reading a claim and believing it is not a check.
//
// Every test about the allowlist is a security test. The command comes out of a
// file agents write, so executing it turns a reporting channel into an execution
// channel — and unlike an agent running its own command, nobody is watching this
// one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCommandClaim, parseCounts, runClaim, checkExecution, explainExecution,
} from '../../scripts/lib/execution-claims.mjs';

// ── what will and will not be run ──────────────────────────────────────────

test('the allowed shapes are recognised', () => {
  for (const [value, shape] of [
    ['node --test tests/lib/x.test.mjs', 'node --test'],
    ['node --test tests/lib/a.mjs tests/lib/b.mjs', 'node --test'],
    ['npm test', 'npm test'],
    ['npm run lint', 'npm run <script>'],
    ['bash scripts/ci-local.sh', 'bash scripts/<name>.sh'],
  ]) {
    const c = parseCommandClaim({ tests: value });
    assert.equal(c.shape, shape, value);
    assert.ok(!c.refused, value);
  }
});

test('a shell metacharacter refuses the claim rather than being escaped', () => {
  // This runs without a shell, so anything needing one would not mean what it
  // says — and trying to make it mean that is how a reporting channel becomes an
  // execution channel.
  for (const value of [
    'npm test; rm -rf /tmp/x',
    'npm test && curl evil.example',
    'node --test $(cat /etc/passwd)',
    'npm test | tee out',
    'bash -c "anything"',
    'node --test `whoami`',
    'npm test > /dev/null',
  ]) {
    const c = parseCommandClaim({ tests: value });
    assert.ok(c.refused, value);
  }
});

test('shapes are allowlisted, not prefixes — node alone is a shell by another name', () => {
  for (const value of [
    'node -e print', 'node --eval x', 'node scripts/anything.mjs',
    'npm install left-pad', 'npm run', 'npx something',
    'bash /etc/init.d/x.sh', 'bash scripts/../../evil.sh',
    'git push origin main', 'rm -rf tmp',
  ]) {
    const c = parseCommandClaim({ tests: value });
    assert.ok(c.refused, `must refuse: ${value}`);
  }
});

test('a count is a claim for the rung below, not a command', () => {
  assert.equal(parseCommandClaim({ tests: '33' }), null);
  assert.equal(parseCommandClaim({ coverage: '100%' }), null);
  assert.equal(parseCommandClaim({}), null);
  assert.equal(parseCommandClaim(null), null);
});

// ── running it ─────────────────────────────────────────────────────────────

test('a passing check backs the verdict and says nothing', () => {
  const r = checkExecution({ tests: 'npm test' }, { run: () => ({ status: 'passed', exitCode: 0, counts: { pass: 10, fail: 0 }, why: 'ok' }) });
  assert.equal(r.ok, true);
  assert.equal(explainExecution(r), null, 'a clean check must be silent, or the signal is noise');
});

test('a success verdict whose own check fails is the case this exists for', () => {
  const r = checkExecution({ tests: 'npm test' }, { run: () => ({ status: 'failed', exitCode: 1, counts: { pass: 8, fail: 2 }, why: 'failed' }) });
  assert.equal(r.ok, false);
  assert.match(explainExecution(r), /2 failing/);
  assert.match(explainExecution(r), /cannot both stand/);
});

test('a timeout is not_run, not failed', () => {
  // Reporting an unfinished check as a failing one sends someone to debug the
  // wrong thing.
  const r = runClaim(['npm', 'test'], { exec: () => { const e = new Error('t'); e.signal = 'SIGTERM'; throw e; } });
  assert.equal(r.status, 'not_run');
  assert.match(explainExecution({ ...r, ok: false, claim: { value: 'npm test' } }), /not a passing one/);
});

test('a refused command does not pass', () => {
  // A command this module will not run is a claim nobody verified.
  const r = checkExecution({ tests: 'npm test; echo hi' }, { run: () => { throw new Error('must not run'); } });
  assert.equal(r.ok, false);
  assert.equal(r.status, 'refused');
  assert.match(explainExecution(r), /Name a check this can re-run/);
});

test('no command claimed is not a failure here', () => {
  const r = checkExecution({ feature: 'x' }, { run: () => { throw new Error('must not run'); } });
  assert.equal(r.ok, true);
  assert.equal(r.status, 'absent');
});

// ── counts ─────────────────────────────────────────────────────────────────

test('TAP counts are read when present and absent otherwise', () => {
  assert.deepEqual(parseCounts('# tests 10\n# pass 9\n# fail 1\n'), { pass: 9, fail: 1 });
  assert.equal(parseCounts('no tap here'), null);
});

test('it really does run without a shell', () => {
  // The one end-to-end assertion: argv reaches execFile unsplit and unexpanded.
  let seen = null;
  runClaim(['npm', 'run', 'lint'], { exec: (cmd, args, opts) => { seen = { cmd, args, opts }; return ''; } });
  assert.equal(seen.cmd, 'npm');
  assert.deepEqual(seen.args, ['run', 'lint']);
  assert.equal(seen.opts.shell, false);
});
