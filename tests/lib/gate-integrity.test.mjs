// Diff lines that make a check pass without the code getting better are asked
// about, not fixed and not passed. Each rule has a positive and a near-miss.
// The fixture lines are assembled at runtime: written literally, the
// gate-weakening guard (correctly) refuses this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyse, parseDiff } from '../../scripts/lib/gate-integrity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = path.join(ROOT, 'scripts/lib/gate-integrity.mjs');
const J = (...p) => p.join('');
const SKIP_IT = J('it', '.sk', 'ip(', "'totals', () => {");
const PY_SKIP = J('@pytest', '.mark', '.sk', 'ip(reason="flaky")');
const TS_IGNORE = J('/', '/ @ts', '-ignore');
const ESLINT_OFF = J('/', '* eslint', '-disable no-unused-vars */');
const CONTINUE = J('    continue', '-on-error: ', 'true');

/** A one-file unified diff: `minus` lines removed, `plus` lines added. */
const diff = (file, plus = [], minus = [], { deleted = false } = {}) => [
  `diff --git a/${file} b/${file}`,
  `--- a/${file}`,
  `+++ ${deleted ? '/dev/null' : 'b/' + file}`,
  '@@ -1,5 +10,5 @@',
  ' context',
  ...minus.map((l) => '-' + l),
  ...plus.map((l) => '+' + l),
  ' context',
].join('\n');
const ids = (d) => analyse(d).map((q) => q.id);

test('the parser keeps the new-side line number of each added line', () => {
  const f = parseDiff(diff('src/a.js', ['x', 'y'], ['old']));
  assert.equal(f[0].path, 'src/a.js');
  assert.deepEqual(f[0].hunks[0].added.map((a) => a.line), [11, 12]);
});

test('GI-SKIP: a test switched off; a test added is not', () => {
  assert.deepEqual(ids(diff('src/cart.test.ts', [SKIP_IT])), ['GI-SKIP']);
  assert.deepEqual(ids(diff('tests/test_cart.py', [PY_SKIP])), ['GI-SKIP']);
  assert.deepEqual(ids(diff('src/cart.test.ts', ["it('totals', () => {"])), []);
  assert.deepEqual(ids(diff('src/router.ts', [J('router', '.on', 'ly(path)')])), [], 'only test files are asked about');
});

test('GI-ENV-BRANCH: production code that behaves differently under test', () => {
  assert.deepEqual(ids(diff('src/pay.ts', ["if (process.env.NODE_ENV === 'test') return OK;"])), ['GI-ENV-BRANCH']);
  assert.deepEqual(ids(diff('app/pay.py', ["if os.environ.get('CI'):"])), ['GI-ENV-BRANCH']);
  assert.deepEqual(ids(diff('src/pay.ts', ["if (process.env.NODE_ENV === 'production') enableCache();"])), []);
  assert.deepEqual(ids(diff('tests/setup.ts', ['if (process.env.CI) jest.setTimeout(30000);'])), [], 'a test file may read CI');
});

test('GI-SUPPRESS: a checker told to look away, in any file', () => {
  for (const l of [TS_IGNORE, ESLINT_OFF, J('x = 1  # no', 'qa: E501'), J('y = f()  # type', ': ignore'), J('/', '/no', 'lint')]) {
    assert.deepEqual(ids(diff('src/a.ts', [l])), ['GI-SUPPRESS'], l);
  }
  assert.deepEqual(ids(diff('src/a.ts', ['// ignore the cache here, it is rebuilt'])), []);
  // A pattern or string that names a pragma is not one (the scanner's own source).
  assert.deepEqual(ids(diff('src/rules.ts', [J("const re = /@ts-(ig", "nore)/;")])), []);
  assert.deepEqual(ids(diff('src/Pay.java', ['    @SuppressWarnings("unchecked")'])), ['GI-SUPPRESS']);
  assert.deepEqual(ids(diff('src/lib.rs', ['#[allow(dead_code)]'])), ['GI-SUPPRESS']);
  assert.deepEqual(ids(diff('src/rules.ts', ['const names = "@SuppressWarnings";'])), []);
});

test('GI-CI-BYPASS: a CI step that may now fail, only in CI and hook files', () => {
  assert.deepEqual(ids(diff('.github/workflows/ci.yml', [CONTINUE])), ['GI-CI-BYPASS']);
  assert.deepEqual(ids(diff('package.json', [J('    "test": "vitest run --pass', 'WithNoTests",')])), ['GI-CI-BYPASS']);
  assert.deepEqual(ids(diff('.husky/pre-push', [J('npm test |', '| true')])), ['GI-CI-BYPASS']);
  assert.deepEqual(ids(diff('src/cli.ts', [J('run(cmd) |', '| true')])), [], 'not a CI file');
});

test('GI-SWALLOW: an error caught and dropped in production code', () => {
  assert.deepEqual(ids(diff('src/sync.ts', ['} catch {}'])), ['GI-SWALLOW']);
  assert.deepEqual(ids(diff('src/sync.ts', ['try { a() } catch (e) { }'])), ['GI-SWALLOW']);
  assert.deepEqual(ids(diff('app/sync.py', ['except Exception: pass'])), ['GI-SWALLOW']);
  assert.deepEqual(ids(diff('src/sync.ts', ['} catch (e) { log.warn(e); throw e; }'])), []);
});

test('GI-WEAKEN: an exact assertion that became a loose one', () => {
  assert.deepEqual(ids(diff('src/cart.test.ts', ['expect(total).toBeGreaterThan(0);'], ['expect(total).toBe(42);'])), ['GI-WEAKEN']);
  assert.deepEqual(ids(diff('src/cart.test.ts', ['expect(total).toBe(43);'], ['expect(total).toBe(42);'])), [], 'exact to exact');
  assert.deepEqual(ids(diff('src/cart.test.ts', ['expect(x).toBeDefined();'])), [], 'a loose assertion added beside nothing removed');
});

test('GI-TEST-REMOVED: cases removed or a test file deleted', () => {
  assert.deepEqual(ids(diff('src/cart.test.ts', [], ["it('handles empty cart', () => {", '  expect(total([])).toBe(0);', '});'])), ['GI-TEST-REMOVED']);
  assert.deepEqual(ids(diff('tests/old.test.js', [], ["test('x', () => {})"], { deleted: true })), ['GI-TEST-REMOVED']);
  assert.deepEqual(ids(diff('src/cart.test.ts', ["it('renamed', () => {"], ["it('old name', () => {"])), [], 'a rename keeps the count');
});

test('GI-THRESHOLD: a timeout or threshold moved, the rest of the line unchanged', () => {
  assert.deepEqual(ids(diff('vitest.config.ts', ['  testTimeout: 60000,'], ['  testTimeout: 5000,'])), ['GI-THRESHOLD']);
  assert.deepEqual(ids(diff('jest.config.js', ['  coverageThreshold: { global: { lines: 60 } },'], ['  coverageThreshold: { global: { lines: 90 } },'])), ['GI-THRESHOLD']);
  assert.deepEqual(ids(diff('src/a.ts', ['const port = 8081;'], ['const port = 8080;'])), [], 'not a tolerance');
  assert.deepEqual(ids(diff('vitest.config.ts', ['  testTimeout: config.timeout,'], ['  testTimeout: 5000,'])), [], 'the line changed, not only its number');
});

test('GI-SNAPSHOT: a snapshot rewritten with no test beside it', () => {
  assert.deepEqual(ids(diff('src/__snapshots__/card.test.tsx.snap', ['exports[`card 1`] = `<div/>`;'])), ['GI-SNAPSHOT']);
  const both = diff('src/__snapshots__/card.test.tsx.snap', ['x']) + '\n' + diff('src/card.test.tsx', ["it('renders', () => {"]);
  assert.ok(!ids(both).includes('GI-SNAPSHOT'));
});

test('a question carries file, line and the line itself, and asks why', () => {
  const [q] = analyse(diff('src/pay.ts', ["if (process.env.NODE_ENV === 'test') return OK;"]));
  assert.deepEqual([q.file, q.line], ['src/pay.ts', 11]);
  assert.match(q.question, /why\?$/);
  assert.match(q.text, /NODE_ENV/);
});

test('CLI: questions exit 1, a clean diff exits 0, an unreadable diff is NOT CHECKED', () => {
  const run = (input, args = ['--diff', '-']) => spawnSync(process.execPath, [CLI, ...args], { input, encoding: 'utf8', cwd: ROOT });
  const asked = run(diff('src/a.ts', [TS_IGNORE]));
  assert.equal(asked.status, 1);
  assert.match(asked.stdout, /1 question\(s\) for the author/);
  assert.equal(run(diff('src/a.ts', ['const a = 1;'])).status, 0);
  const none = spawnSync(process.execPath, [CLI, '--base', 'no-such-ref-xyz'], { encoding: 'utf8', cwd: ROOT });
  assert.equal(none.status, 2);
  assert.match(none.stdout, /^NOT CHECKED/);
});

test('code-reviewer and senior-dev carry the gate-integrity rules, in both registrations', async () => {
  const fs = await import('node:fs');
  for (const dir of ['agents', 'agents-full']) {
    const cr = fs.readFileSync(path.join(ROOT, dir, 'code-reviewer.md'), 'utf8');
    assert.match(cr, /gate-integrity\.mjs/, `${dir}/code-reviewer runs the scanner`);
    assert.match(cr, /unanswered at gate:code, a Finding at the printed severity \(P1 for a test switched\s+off, removed or loosened; else P2\)/, `${dir}/code-reviewer: a question cannot be left open`);
    assert.match(cr, /gate integrity: not checked/, `${dir}/code-reviewer: an unread diff is said so`);
    const sd = fs.readFileSync(path.join(ROOT, dir, 'senior-dev.md'), 'utf8');
    assert.match(sd, /branches on running under test/, `${dir}/senior-dev refuses test-only branches`);
    assert.match(sd, /loosening an assertion or raising a timeout or threshold/, `${dir}/senior-dev refuses loosened checks`);
  }
});

// Review of 3.75.5 (M7, m6, m7).

test('M7: a question about a test weighs P1; one about ordinary code weighs P2', () => {
  const [skip] = analyse(diff('src/cart.test.ts', [SKIP_IT]));
  assert.equal(skip.severity, 'P1');
  const [allow] = analyse(diff('src/lib.rs', ['#[allow(dead_code)]']));
  assert.equal(allow.severity, 'P2');
  const [opt] = analyse(diff('app/opt.py', ['except ImportError: pass']));
  assert.equal(opt.severity, 'P2');
});

test('m7: "\\ No newline at end of file" does not shift the cited line', () => {
  const d = ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1,2 +1,3 @@', ' one', '-two', '\\ No newline at end of file', '+two', '+' + TS_IGNORE].join('\n');
  const [q] = analyse(d);
  assert.equal(q.line, 3);
});

test('m6: a new file not yet added to git is part of the change', async (t) => {
  const fs = await import('node:fs'); const os = await import('node:os');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-gi-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  const g = (...a) => spawnSync('git', ['-C', d, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' });
  g('init', '-q'); fs.writeFileSync(path.join(d, 'a.txt'), 'x\n'); g('add', '.'); g('commit', '-qm', 'base');
  const trunk = g('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
  fs.mkdirSync(path.join(d, 'src')); fs.writeFileSync(path.join(d, 'src/new.test.ts'), SKIP_IT + '\n');
  const r = spawnSync(process.execPath, [CLI, '--base', trunk], { cwd: d, encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /P1  GI-SKIP  src\/new\.test\.ts:1/);
});
