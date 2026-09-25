#!/usr/bin/env node
/**
 * affected-tests — the test command for the files you changed, so the TDD loop runs
 * those tests and the full suite runs once, before the verdict.
 *
 * Why this exists
 * ---------------
 * senior-dev ran the whole suite after each edit: `flutter test` 1,029 times, `cargo
 * test` 454, on the projects measured (PLAN-2026-09-23-agent-speed). A red-green loop
 * needs the test that covers the edit, not every test in the repository.
 *
 * Mapping, by stack, from the changed files (tracked changes vs HEAD + untracked):
 *   JS/TS    a changed test file itself; else a sibling or any tests-dir file named
 *            <base>.test.* / <base>.spec.*        → vitest | jest | node --test
 *   Rust     the crate owning the file (nearest Cargo.toml [package] name) → cargo test -p
 *   Dart     lib/a/b.dart → test/a/b_test.dart (or the changed _test.dart) → flutter/dart test
 *   Python   pkg/mod.py → a test_mod.py anywhere in the tree (or the changed test_*.py) → pytest
 *   Go       the package directory                  → go test ./dir
 * A changed source file with no test found is reported, never silently dropped — and
 * when nothing maps, the answer is `full`: the honest command is the whole suite.
 *
 * Usage: node scripts/lib/affected-tests.mjs [--cwd DIR] [--json]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.dart_tool', '.venv', 'venv', '__pycache__', '.great_cto']);

function changedFiles(cwd) {
  const run = (args) => spawnSync('git', args, { cwd, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const set = new Set([...run(['diff', '--name-only', 'HEAD']), ...run(['ls-files', '--others', '--exclude-standard'])]);
  return [...set].filter((f) => existsSync(join(cwd, f)));
}

function walk(dir, out = [], depth = 0) {
  if (depth > 8) return out;
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), out, depth + 1); }
    else out.push(join(dir, e.name));
  }
  return out;
}

const JS = /\.(m?[jt]sx?|cjs)$/;
const isJsTest = (f) => /\.(test|spec)\.(m?[jt]sx?|cjs)$/.test(f);

function jsRunner(cwd) {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.vitest) return (files) => `npx vitest run ${files.join(' ')}`;
    if (deps.jest) return (files) => `npx jest ${files.join(' ')}`;
  } catch { /* no package.json: node's own runner */ }
  return (files) => `node --test ${files.join(' ')}`;
}

function crateOf(cwd, file) {
  let d = dirname(join(cwd, file));
  while (d.startsWith(cwd)) {
    const t = join(d, 'Cargo.toml');
    if (existsSync(t)) {
      const m = readFileSync(t, 'utf8').match(/\[package\][^[]*?name\s*=\s*"([^"]+)"/);
      if (m) return m[1];
    }
    if (d === cwd) break;
    d = dirname(d);
  }
  return null;
}

/**
 * @returns {{mode:'targeted'|'full'|'none', commands:string[], tests:string[], unmapped:string[]}}
 */
export function affectedTests({ cwd = process.cwd(), changed } = {}) {
  const files = (changed || changedFiles(cwd)).map((f) => f.split(sep).join('/'));
  if (!files.length) return { mode: 'none', commands: [], tests: [], unmapped: [] };
  let all = null;
  const allFiles = () => (all ||= walk(cwd).map((f) => relative(cwd, f).split(sep).join('/')));
  const js = new Set(); const dart = new Set(); const py = new Set(); const go = new Set(); const crates = new Set();
  const unmapped = [];
  for (const f of files) {
    const base = basename(f).replace(/\.[^.]+$/, '');
    if (JS.test(f)) {
      if (isJsTest(f)) { js.add(f); continue; }
      const hit = allFiles().filter((t) => isJsTest(t) && basename(t).replace(/\.(test|spec)\.[^.]+$/, '') === base);
      if (hit.length) hit.forEach((t) => js.add(t)); else unmapped.push(f);
    } else if (f.endsWith('.rs')) {
      const c = crateOf(cwd, f); if (c) crates.add(c); else unmapped.push(f);
    } else if (f.endsWith('.dart')) {
      if (f.endsWith('_test.dart')) { dart.add(f); continue; }
      const t = f.replace(/^lib\//, 'test/').replace(/\.dart$/, '_test.dart');
      if (existsSync(join(cwd, t))) dart.add(t); else unmapped.push(f);
    } else if (f.endsWith('.py')) {
      if (/(^|\/)test_[^/]+\.py$|_test\.py$/.test(f)) { py.add(f); continue; }
      const hit = allFiles().filter((t) => basename(t) === `test_${base}.py` || basename(t) === `${base}_test.py`);
      if (hit.length) hit.forEach((t) => py.add(t)); else unmapped.push(f);
    } else if (f.endsWith('.go')) {
      go.add(`./${dirname(f)}`);
    }
    // Other files (docs, config, assets) carry no test mapping and are not code.
  }
  const commands = [];
  if (js.size) commands.push(jsRunner(cwd)([...js]));
  if (crates.size) commands.push(`cargo test ${[...crates].map((c) => `-p ${c}`).join(' ')}`);
  if (dart.size) commands.push(`${existsSync(join(cwd, 'pubspec.yaml')) && /flutter:/.test(readFileSync(join(cwd, 'pubspec.yaml'), 'utf8')) ? 'flutter' : 'dart'} test ${[...dart].join(' ')}`);
  if (py.size) commands.push(`pytest ${[...py].join(' ')}`);
  if (go.size) commands.push(`go test ${[...go].join(' ')}`);
  const tests = [...js, ...dart, ...py];
  return { mode: commands.length ? 'targeted' : 'full', commands, tests, unmapped };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--cwd');
  const r = affectedTests({ cwd: i >= 0 ? a[i + 1] : process.cwd() });
  if (a.includes('--json')) process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  else {
    if (r.mode === 'none') process.stdout.write('affected-tests: nothing changed\n');
    else if (r.mode === 'full') process.stdout.write('affected-tests: full — no test maps to the changed files; run the whole suite\n');
    else r.commands.forEach((c) => process.stdout.write(`${c}\n`));
    if (r.unmapped.length) process.stderr.write(`affected-tests: no test found for ${r.unmapped.join(', ')} — cover them, or run the full suite\n`);
  }
}
