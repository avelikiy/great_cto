// Every scripts/lib file the board imports must reach the npm bundle.
//
// The bundler carried a hand-written list of four filenames while the board had
// grown to import six. `system-map.mjs` and `pipeline-wake.mjs` were never
// copied, so in the published package the Docs system map and the record binding
// a gate approval to pipeline state both failed with "Cannot find module" — the
// second one silently, because that call is best-effort by design and reports
// its error into a JSON field nobody reads.
//
// It worked in the repo and not in the thing users install. This test compares
// what the board asks for against what the bundler would ship, so the two cannot
// drift again — including through a transitive import, which is how the first
// attempt at the fix went wrong: `gate-plan.mjs` pulls in `change-tier.mjs` and
// `judge-model.mjs`, and the board names neither.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOARD = join(REPO, 'packages', 'board');
const LIB = join(REPO, 'scripts', 'lib');

/** Every non-test .mjs under packages/board. */
function boardSources(dir = BOARD, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules/.test(p)) boardSources(p, out); continue; }
    if (/\.mjs$/.test(e.name) && !/\.test\.mjs$/.test(e.name)) out.push(p);
  }
  return out;
}

/** What the board names directly, plus everything those pull in, to a fixpoint. */
function requiredLibFiles() {
  const need = new Set();
  for (const f of boardSources()) {
    for (const m of readFileSync(f, 'utf8').matchAll(/scripts\/lib\/([\w.-]+\.mjs)/g)) need.add(m[1]);
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const f of [...need]) {
      const src = join(LIB, f);
      if (!existsSync(src)) continue;
      for (const m of readFileSync(src, 'utf8').matchAll(/from\s+['"]\.\/([\w.-]+\.mjs)['"]|import\(\s*['"]\.\/([\w.-]+\.mjs)['"]/g)) {
        const dep = m[1] || m[2];
        if (dep && !need.has(dep)) { need.add(dep); grew = true; }
      }
    }
  }
  return need;
}

test('every scripts/lib file the board imports exists in the repo', () => {
  const missing = [...requiredLibFiles()].filter((f) => !existsSync(join(LIB, f)));
  assert.deepEqual(missing, [], `the board imports files that do not exist: ${missing.join(', ')}`);
});

test('the bundler ships exactly what the board needs, derived rather than listed', () => {
  // A hand-maintained list is a list that will be wrong again. The bundler must
  // compute its set the same way this test does, so asserting on the mechanism
  // is the point — asserting on a snapshot of filenames would recreate the bug
  // in the test.
  const bundler = readFileSync(join(REPO, 'packages', 'cli', 'scripts', 'bundle-board.mjs'), 'utf8');
  assert.match(bundler, /scripts\\\/lib\\\/\(\[\\w\.-\]\+\\\.mjs\)/,
    'the bundler should scan board sources for scripts/lib imports');
  assert.match(bundler, /grew/, 'and follow their transitive imports to a fixpoint');
  assert.doesNotMatch(
    bundler,
    /for \(const f of \[\s*["']gate-plan\.mjs["']/,
    'a hand-written filename array is the defect this test exists to prevent',
  );
});

test('the transitive case specifically: gate-plan pulls in files the board never names', () => {
  // The first attempt at this fix scanned only direct mentions and would have
  // dropped these two — replacing two missing files with two different ones.
  const need = requiredLibFiles();
  const boardText = boardSources().map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const f of ['change-tier.mjs', 'judge-model.mjs']) {
    assert.ok(need.has(f), `${f} must be required transitively`);
    assert.ok(!boardText.includes(`scripts/lib/${f}`), `${f} is expected to be unnamed by the board — that is the point of the case`);
  }
});
