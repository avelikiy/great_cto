#!/usr/bin/env node
/**
 * Gate integrity — the diff lines that make a check pass without the code getting
 * better: a test switched off, an assertion loosened, a warning silenced, a branch
 * that behaves differently under test, a CI step allowed to fail.
 *
 * Each one is sometimes right. That is why a hit is a QUESTION for a human, never
 * an automatic fix and never a silent pass: the reviewer asks "why", and a
 * reasonable answer goes into the review. What this removes is the case where
 * nobody noticed — and the green check is read as the code being fine.
 *
 *   node scripts/lib/gate-integrity.mjs [--base REF] [--json]   # diff vs merge-base + working tree
 *   git diff … | node scripts/lib/gate-integrity.mjs --diff -
 *
 * Exit: 0 nothing to ask · 1 questions · 2 the diff could not be read.
 *
 * The idea of a deterministic gate-integrity pass comes from gstack's review
 * skill (MIT); the rules and code here are our own.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { isMainModule } from './is-main.mjs';

const TEST_FILE = /(^|\/)(tests?|__tests__|spec|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py|rb)$|(^|\/)test_[^/]+\.py$|Tests?\.(cs|java|kt|swift)$/;
const CI_FILE = /(^|\/)(\.github\/workflows\/|\.gitlab-ci\.yml$|Jenkinsfile$|\.circleci\/|azure-pipelines\.yml$|\.buildkite\/|\.husky\/|lefthook\.yml$|\.pre-commit-config\.yaml$)|(^|\/)(package\.json|Makefile|justfile|Taskfile\.ya?ml)$/;

// What an unanswered question weighs at gate:code. A switched-off, removed or
// loosened TEST changes what the suite proves, so it blocks until answered (P1).
// The rest are often right in ordinary code — `#[allow(dead_code)]`, an
// `except ImportError: pass` around an optional import — and stay P2: asked,
// recorded, not blocking.
export const BLOCKING = new Set(['GI-SKIP', 'GI-TEST-REMOVED', 'GI-WEAKEN', 'GI-SNAPSHOT']);

export const RULES = [
  { id: 'GI-SKIP', ask: 'a test is switched off or narrowed to a few', where: 'test',
    re: /\.(skip|only|todo)\s*\(|\b(xit|xdescribe|xtest|fit|fdescribe)\s*\(|@pytest\.mark\.(skip|xfail)|@unittest\.skip|\bt\.Skip(Now|f)?\(|@Disabled\b|@Ignore\b|#\[ignore\]/ },
  { id: 'GI-ENV-BRANCH', ask: 'production code behaves differently under test or CI', where: 'prod',
    re: /process\.env\.(NODE_ENV|BABEL_ENV)\s*[!=]==?\s*['"`]test['"`]|process\.env\.(CI|JEST_WORKER_ID|VITEST|VITEST_WORKER_ID|PLAYWRIGHT_TEST_BASE_URL)\b|import\.meta\.env\.(MODE\s*[!=]==?\s*['"`]test['"`]|VITEST)|os\.environ(\.get)?\s*[[(]\s*['"](CI|PYTEST_CURRENT_TEST|TESTING)['"]|['"]pytest['"]\s+in\s+sys\.modules|testing\.Testing\(\)/ },
  { id: 'GI-SUPPRESS', ask: 'a checker is told to look away', where: 'any',
    // A suppression lives in a comment, so the comment opener is part of the match:
    // without it, a regex or a string that NAMES a pragma would read as one.
    re: /(?:\/\/|\/\*+|#|<!--)\s*(?:@ts-(?:ignore|nocheck|expect-error)\b|eslint-disable|biome-ignore|noqa\b|type:\s*ignore|pyright:\s*ignore|pylint:\s*disable|nolint\b|nosec\b|NOSONAR)|^\s*#!?\[allow\(|^\s*@SuppressWarnings\b/ },
  { id: 'GI-CI-BYPASS', ask: 'a CI step or hook may now fail or not run', where: 'ci',
    re: /continue-on-error:\s*true|allow_failure:\s*true|--no-verify\b|\[skip ci\]|\[ci skip\]|\|\|\s*true\b|--passWithNoTests|--pass-with-no-tests|--no-fail-on-empty|if:\s*false\b|exit\s+0\s*$/ },
  { id: 'GI-SWALLOW', ask: 'an error is caught and dropped', where: 'prod',
    re: /catch\s*(\([^)]*\))?\s*\{\s*\}|except(\s+[\w.]+(\s+as\s+\w+)?)?\s*:\s*pass\b|\.catch\(\s*\(\s*\)\s*=>\s*(\{\s*\}|null|undefined)\s*\)|_\s*=\s*err\b/ },
];

// Assertions that pin a value, and ones that only say "something".
const STRICT = /\b(toBe|toEqual|toStrictEqual|toHaveLength|toHaveBeenCalledWith|toHaveBeenCalledTimes|toMatchObject|assertEqual|assertEquals|assert_equal|assert\.(strictEqual|deepStrictEqual|equal|deepEqual))\s*\(|\bassert\s+\S+\s*==\s*\S/;
const LOOSE = /\b(toBeTruthy|toBeDefined|toBeGreaterThan|toBeGreaterThanOrEqual|not\.toBeNull|not\.toBeUndefined|toBeDefined|assertTrue|assertIsNotNone|assert_true)\s*\(|\bassert\.ok\s*\(|\bassert\s+\w+\s*$|\bexpect\([^)]*\)\.toBe\(true\)/;
// A tolerance that moved: the line is the same but for its numbers.
const TOLERANCE_KEY = /timeout|threshold|retries|retry|tolerance|coverage|epsilon|delta|maxDiff|slack|attempts/i;

/** Parse a unified diff into files with added/removed lines per hunk. */
export function parseDiff(text) {
  const files = [];
  let cur = null, hunk = null;
  for (const line of String(text).split('\n')) {
    if (line.startsWith('diff --git ')) { cur = { path: null, old: null, deleted: false, hunks: [] }; files.push(cur); hunk = null; continue; }
    if (!cur) continue;
    if (line.startsWith('--- ')) { cur.old = line.slice(4).replace(/^a\//, ''); continue; }
    if (line.startsWith('+++ ')) {
      const p = line.slice(4);
      cur.deleted = p === '/dev/null';
      cur.path = cur.deleted ? cur.old : p.replace(/^b\//, '');
      continue;
    }
    if (line.startsWith('@@')) { const m = line.match(/\+(\d+)/); hunk = { start: m ? Number(m[1]) : 0, added: [], removed: [], at: m ? Number(m[1]) : 0 }; cur.hunks.push(hunk); continue; }
    if (!hunk) continue;
    if (line.startsWith('+')) { hunk.added.push({ text: line.slice(1), line: hunk.at }); hunk.at += 1; }
    else if (line.startsWith('-')) hunk.removed.push(line.slice(1));
    else if (line.startsWith('\\')) continue;   // "\ No newline at end of file" is not a line
    else hunk.at += 1;
  }
  return files.filter((f) => f.path);
}

const TEST_DEF = /\b(it|test|describe)\s*\(|\bdef\s+test_|\bfunc\s+Test\w*\(|@Test\b|#\[test\]/;
const kindOf = (p) => (TEST_FILE.test(p) ? 'test' : CI_FILE.test(p) ? 'ci' : 'prod');

export function analyse(diffText) {
  const files = parseDiff(diffText);
  const out = [];
  const push = (id, file, line, ask, text) => out.push({ id, file, line, severity: BLOCKING.has(id) ? 'P1' : 'P2',
    question: `${ask} — why?`, text: String(text || '').trim().slice(0, 160) });
  const changedTests = files.some((f) => kindOf(f.path) === 'test');
  for (const f of files) {
    const kind = kindOf(f.path);
    if (f.deleted && kind === 'test') { push('GI-TEST-REMOVED', f.path, 0, 'a test file is deleted', ''); continue; }
    if (/\.snap$|__snapshots__\//.test(f.path) && !changedTests) push('GI-SNAPSHOT', f.path, 0, 'a snapshot changed with no test changed beside it', '');
    for (const h of f.hunks) {
      for (const a of h.added) {
        for (const r of RULES) {
          if (r.where !== 'any' && r.where !== kind) continue;
          if (r.re.test(a.text)) push(r.id, f.path, a.line, r.ask, a.text);
        }
      }
      if (kind === 'test') {
        const removedDefs = h.removed.filter((l) => TEST_DEF.test(l)).length;
        const addedDefs = h.added.filter((a) => TEST_DEF.test(a.text)).length;
        if (removedDefs > addedDefs) push('GI-TEST-REMOVED', f.path, h.start, `${removedDefs - addedDefs} test case(s) removed`, h.removed.find((l) => TEST_DEF.test(l)));
        const strictGone = h.removed.filter((l) => STRICT.test(l)).length - h.added.filter((a) => STRICT.test(a.text)).length;
        const looseNew = h.added.filter((a) => LOOSE.test(a.text));
        if (strictGone > 0 && looseNew.length) push('GI-WEAKEN', f.path, looseNew[0].line, 'an exact assertion became a loose one', looseNew[0].text);
      }
      // Same line but for its numbers, on a tolerance-like key: a threshold moved.
      for (const a of h.added) {
        if (!TOLERANCE_KEY.test(a.text)) continue;
        const shape = (s) => s.replace(/\d+(\.\d+)?/g, '#').trim();
        if (h.removed.some((r) => shape(r) === shape(a.text) && r.trim() !== a.text.trim())) {
          push('GI-THRESHOLD', f.path, a.line, 'a timeout, threshold or retry count changed', a.text);
        }
      }
    }
  }
  return out;
}

function readDiff(base) {
  const mb = spawnSync('git', ['merge-base', 'HEAD', base], { encoding: 'utf8' });
  const from = mb.status === 0 ? mb.stdout.trim() : null;
  if (!from) return null;
  const r = spawnSync('git', ['diff', '--no-color', '--no-ext-diff', '-U3', from], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  // New files not yet added are part of the change too: `git diff` does not show them.
  const u = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' });
  if (u.status !== 0) return null;
  let extra = '';
  for (const p of u.stdout.split('\0').filter(Boolean)) {
    const d = spawnSync('git', ['diff', '--no-index', '--no-color', '--no-ext-diff', '--no-textconv', '-U3', '/dev/null', p], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (d.status === 1) extra += '\n' + d.stdout;   // --no-index exits 1 when the files differ
  }
  return r.stdout + extra;
}

const isMain = isMainModule(import.meta.url);
if (process.argv[1] && isMain) {
  const argv = process.argv.slice(2);
  const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const diff = opt('--diff') === '-' ? fs.readFileSync(0, 'utf8') : readDiff(opt('--base', 'origin/main'));
  if (diff === null) { process.stdout.write('NOT CHECKED — the diff could not be read (no merge-base with the base ref?)\n'); process.exit(2); }
  const qs = analyse(diff);
  if (argv.includes('--json')) process.stdout.write(JSON.stringify(qs) + '\n');
  else if (!qs.length) process.stdout.write('gate integrity: nothing to ask\n');
  else {
    process.stdout.write(`gate integrity: ${qs.length} question(s) for the author — each is sometimes right, so ask, do not assume:\n`);
    for (const q of qs) process.stdout.write(`  ${q.severity}  ${q.id}  ${q.file}${q.line ? ':' + q.line : ''}  ${q.question}${q.text ? `  «${q.text}»` : ''}\n`);
  }
  process.exitCode = qs.length ? 1 : 0;
}
