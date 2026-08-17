// A check that never runs is invisible in exactly the way a check that runs and
// passes is: both are silent. These tests are about telling the two apart.
//
// Every case below is a shape found in this repository's real workflows during
// the pass that produced the module — the first version reported thirty findings
// and most were noise, so most of these are the narrowings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCommands, referencedPath, classify, parity, describeParity, expandNpmScripts } from '../../scripts/lib/guard-parity.mjs';

const never = () => false;
const always = () => true;

// ── Reading a workflow ──────────────────────────────────────────────────────

test('a single-line run: is a command', () => {
  assert.deepEqual(runCommands('      - name: x\n        run: node scripts/a.mjs\n'), ['node scripts/a.mjs']);
});

test('a block run: yields every line in the block and stops at the dedent', () => {
  const yaml = [
    '      - name: x',
    '        run: |',
    '          node scripts/a.mjs',
    '          node scripts/b.mjs',
    '      - name: y',
    '        run: node scripts/c.mjs',
  ].join('\n');
  assert.deepEqual(runCommands(yaml), ['node scripts/a.mjs', 'node scripts/b.mjs', 'node scripts/c.mjs']);
});

test('a workflow with no run: steps yields nothing rather than throwing', () => {
  assert.deepEqual(runCommands('name: x\non: push\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n'), []);
});

// ── What counts as an invoked file ──────────────────────────────────────────
//
// Each of these produced a false finding before it was excluded.

test('the invoked script is the first positional argument', () => {
  assert.equal(referencedPath('node scripts/lib/eval-drift.mjs --split holdout'), 'scripts/lib/eval-drift.mjs');
  assert.equal(referencedPath('bash tests/security/run-all.sh'), 'tests/security/run-all.sh');
});

test('a glob is a pattern, not a file', () => {
  // `existsSync('tests/*.test.mjs')` is always false and always meaningless.
  assert.equal(referencedPath('node --test tests/*.test.mjs'), null);
});

test('a path outside the repository is not ours to verify', () => {
  // Created or consumed during the run; the local tree cannot answer for it.
  assert.equal(referencedPath('bash /tmp/canary.sh'), null);
  assert.equal(referencedPath('node ~/.great_cto/projects.json'), null);
});

test('a leftover from ${{ }} interpolation is not a path', () => {
  assert.equal(referencedPath('bash }}/main/scripts/canary.sh'), null);
  assert.equal(referencedPath('bash scripts/canary.sh ${{ matrix.source }}'), 'scripts/canary.sh');
});

test("a flag's value is not the invoked script", () => {
  // `--output-file sbom.cdx.json` names an OUTPUT, and an output not existing
  // yet is the normal case rather than a defect.
  assert.equal(referencedPath('npx cyclonedx-npm --output-file sbom.cdx.json'), null);
});

test('a bare filename is unverifiable, and unverifiable is not broken', () => {
  // `node index.mjs` under `working-directory: packages/cli` reported five
  // phantom "does not exist" findings for a file that is simply elsewhere.
  assert.equal(referencedPath('node index.mjs --version'), null);
});

// ── The three answers ───────────────────────────────────────────────────────

test('a command whose file does not exist is broken, whatever else is true of it', () => {
  // Asked before the allowlist on purpose: reaching the allowlist first is how a
  // dead workflow gets excused as remote-by-design, which is what let a
  // `security-tests` workflow read as configured for eighty-six days while
  // failing on `No such file`.
  const c = classify('bash tests/security/run-all.sh', { ciLocalText: '', exists: never });
  assert.equal(c.state, 'broken');
  assert.match(c.why, /does not exist/);
});

test('a publish step is remote by design and says which reason applies', () => {
  const c = classify('npm publish --access public', { ciLocalText: '', exists: always });
  assert.equal(c.state, 'remote-by-design');
  assert.match(c.why, /clean runner/);
});

test('a guard the local runners also run is parity', () => {
  const c = classify('node scripts/a.mjs', { ciLocalText: 'step "a" node scripts/a.mjs', exists: always });
  assert.equal(c.state, 'parity');
});

test('a guard that exists, runs nowhere locally, and is not excused is actions-only', () => {
  const c = classify('node scripts/hooks/artifact-lint.mjs --enforce', { ciLocalText: '', exists: always });
  assert.equal(c.state, 'actions-only');
  assert.match(c.why, /nowhere ci-local reaches/);
});

test('a shell fragment with no repo script is not a missing guard', () => {
  // Twenty-odd findings once read "runs in a workflow and nowhere ci-local
  // reaches" with no subject — nothing to port and nothing to name.
  assert.equal(classify('echo "hello"', { ciLocalText: '', exists: always }).state, 'remote-by-design');
  assert.equal(classify('BASE=$(git rev-parse HEAD)', { ciLocalText: '', exists: always }).state, 'remote-by-design');
});

// ── npm indirection ─────────────────────────────────────────────────────────

test('a guard reached through `npm run` still counts as run locally', () => {
  // The tempting fix was to name the path in a ci-local comment so the text
  // match would find it — writing a comment to make a check pass. Resolving the
  // indirection is the honest version of the same fix.
  const local = 'step "e2e" bash -c \'cd packages/cli && npm run test:e2e\'';
  const expanded = expandNpmScripts(local, [{ scripts: { 'test:e2e': 'npm run build && node ../../tests/run-archetype-e2e.mjs' } }]);
  const c = classify('node tests/run-archetype-e2e.mjs', { ciLocalText: expanded, exists: always });
  assert.equal(c.state, 'parity');
});

test('only scripts the runners actually call are expanded', () => {
  // Appending every script in every package.json would claim parity for work
  // nothing invokes.
  const expanded = expandNpmScripts('npm run build', [{ scripts: { build: 'tsc', unused: 'node tests/never-called.mjs' } }]);
  assert.ok(expanded.includes('tsc'));
  assert.ok(!expanded.includes('never-called'), 'a script nothing calls buys no parity');
});

// ── The whole comparison ────────────────────────────────────────────────────

test('parity reports nothing when every guard is covered or excused', () => {
  const p = parity({
    workflows: [{ name: 'ci.yml', text: '        run: node scripts/a.mjs\n' }],
    ciLocalText: 'node scripts/a.mjs',
    exists: always,
  });
  assert.equal(p.state, 'parity');
  assert.match(describeParity(p), /either runs in ci-local or is named remote-by-design/);
});

test('one command repeated across a matrix is one finding, not six', () => {
  const text = '        run: node scripts/a.mjs\n' + '        run: node scripts/a.mjs\n';
  const p = parity({ workflows: [{ name: 'ci.yml', text }], ciLocalText: '', exists: always });
  assert.equal(p.actionsOnly.length, 1);
});

test('broken and actions-only are reported separately — they are different work', () => {
  // One needs the file back or the workflow gone; the other needs a line in
  // ci-local. Collapsing them would hide which.
  const p = parity({
    workflows: [{ name: 'ci.yml', text: '        run: bash tests/gone.sh\n        run: node scripts/here.mjs\n' }],
    ciLocalText: '',
    exists: (f) => f === 'scripts/here.mjs',
  });
  assert.deepEqual(p.broken.map((f) => f.cmd), ['bash tests/gone.sh']);
  assert.deepEqual(p.actionsOnly.map((f) => f.cmd), ['node scripts/here.mjs']);
  assert.equal(p.state, 'gaps');
});

test('no workflows at all is parity, not a silent pass over nothing', () => {
  const p = parity({ workflows: [], ciLocalText: '', exists: always });
  assert.equal(p.state, 'parity');
});
