// gate-weakening-guard: "don't switch a check off, don't mark it allow-failure"
// was a sentence in the operator's rules. A red check turned green by skipping
// the test or letting the CI step fail is the cheapest way to "fix" it — so the
// edit that does it is refused at the tool layer.
//
// This file holds the patterns as data, so adding MORE of them here trips the
// guard it tests — run that session with GREAT_CTO_DISABLE_GATE_WEAKENING_GUARD=1.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findWeakening } from '../../scripts/hooks/gate-weakening-guard.mjs';
import { create, write } from '../../scripts/lib/exceptions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(ROOT, 'scripts', 'hooks', 'gate-weakening-guard.mjs');
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

test('a skip added to a test file is found, in the usual runners', () => {
  for (const [file, before, after] of [
    ['src/cart.test.ts', "it('adds', () => {})", "it.skip('adds', () => {})"],
    ['tests/a.test.mjs', "test('x', () => {})", "test.skip('x', () => {})"],
    ['tests/a.spec.js', "describe('x', () => {})", "describe.skip('x', () => {})"],
    ['tests/a.spec.js', "it('x', () => {})", "xit('x', () => {})"],
    ['tests/test_ledger.py', 'def test_x():', '@pytest.mark.skip\ndef test_x():'],
    ['tests/test_ledger.py', 'def test_x(self):', '@unittest.skip("flaky")\ndef test_x(self):'],
    ['pkg/pay_test.go', 'func TestPay(t *testing.T) {', 'func TestPay(t *testing.T) {\n\tt.Skip("later")'],
    ['src/lib.rs', '#[test]\nfn pays() {}', '#[test]\n#[ignore]\nfn pays() {}'],
    ['test/wallet_test.dart', "test('x', () {});", "test('x', () {}, skip: true);"],
  ]) assert.ok(findWeakening(file, before, after), `${file}: ${after}`);
});

test('a CI step allowed to fail is found', () => {
  assert.ok(findWeakening('.github/workflows/ci.yml', '  - run: npm test\n', '  - run: npm test\n    continue-on-error: true\n'));
  assert.ok(findWeakening('.gitlab-ci.yml', 'test:\n  script: make test\n', 'test:\n  script: make test\n  allow_failure: true\n'));
  assert.ok(findWeakening('.github/workflows/ci.yml', 'env:\n  X: 1\n', 'env:\n  E2E_SKIP: 1\n'));
});

test('what is already there, removals, and non-test files pass', () => {
  const old = "it.skip('legacy', () => {})\nit('a', () => {})";
  assert.equal(findWeakening('src/a.test.ts', old, old + "\nit('b', () => {})"), null, 'an existing skip is not re-reported');
  assert.equal(findWeakening('src/a.test.ts', "it.skip('x', () => {})", "it('x', () => {})"), null, 'removing a skip is the good direction');
  assert.equal(findWeakening('src/router.ts', 'a', 'const skip = true; items.skip(2)'), null, 'not a test file');
  assert.equal(findWeakening('docs/testing.md', 'x', 'use it.skip sparingly'), null, 'docs may talk about it');
  assert.equal(findWeakening('.github/workflows/ci.yml', 'a', 'a\n# never use continue-on-error here'), null, 'a comment is not a setting');
});

function run(toolName, toolInput, env = {}, cwd = process.cwd()) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: toolName, tool_input: toolInput }),
    encoding: 'utf8', cwd, env: { ...process.env, ...env },
  });
}

test('Edit, Write over an existing file and MultiEdit are all checked; a signed exception lets it through', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gwg-')); made.push(dir);
  const exc = join(dir, 'exc'); mkdirSync(exc);
  mkdirSync(join(dir, 'tests'));
  const f = join(dir, 'tests', 'a.test.mjs');
  writeFileSync(f, "test('x', () => {})\n");
  const env = { GREAT_CTO_EXCEPTIONS_ROOT: exc };

  const edit = run('Edit', { file_path: f, old_string: "test('x'", new_string: "test.skip('x'" }, env, dir);
  assert.equal(edit.status, 2);
  assert.match(JSON.parse(edit.stdout).hookSpecificOutput.permissionDecisionReason, /gate-weakening/);
  assert.equal(run('Write', { file_path: f, content: "test.skip('x', () => {})\n" }, env, dir).status, 2);
  assert.equal(run('MultiEdit', { file_path: f, edits: [{ old_string: "test('x'", new_string: "test.skip('x'" }] }, env, dir).status, 2);
  assert.equal(run('Edit', { file_path: f, old_string: "test('x'", new_string: "test('y'" }, env, dir).status, 0);

  write(create({ gate: 'gate-weakening', reason: 'quarantine a flaky test, ticket #12', createdBy: 'operator' }), { root: exc });
  assert.equal(edit.status, 2);
  assert.equal(run('Edit', { file_path: f, old_string: "test('x'", new_string: "test.skip('x'" }, env, dir).status, 0);
});

// ── Lint / type checking switched off ──────────────────────────────────────
// A suppression IS a comment, so these kinds count comment lines too; prose that
// merely mentions a directive (not at the comment's start) is not one.

test('a lint/type suppression added to source is found', () => {
  for (const [file, before, after] of [
    ['src/cart.ts', 'const n: number = total', '// @ts-ignore\nconst n: number = total'],
    ['src/cart.ts', 'export const a = 1', '// @ts-nocheck\nexport const a = 1'],
    ['src/view.tsx', '<Cart items={x} />', '{/* @ts-expect-error */}\n<Cart items={x} />'],
    ['src/cart.test.ts', "it('adds', () => {})", "// @ts-ignore\nit('adds', () => {})"],
    ['src/legacy.js', 'var a = 1', '/* eslint-disable */\nvar a = 1'],
    ['src/log.jsx', 'console.log(x)', '// eslint-disable-next-line no-console\nconsole.log(x)'],
    ['src/log.mjs', 'console.log(x)', 'console.log(x) // eslint-disable-line'],
    ['app/models.py', 'import os', 'import os  # noqa: F401'],
    ['app/__init__.py', 'import os', '# ruff: noqa\nimport os'],
    ['app/models.py', 'x: int = f()', 'x: int = f()  # type: ignore[assignment]'],
    ['app/models.py', 'def f(): pass', '# pylint: disable=missing-docstring\ndef f(): pass'],
    ['src/lib.rs', 'fn a() {}', '#[allow(dead_code)]\nfn a() {}'],
    ['src/main.rs', 'mod a;', '#![allow(clippy::all)]\nmod a;'],
    ['cmd/main.go', 'x, _ := f()', 'x, _ := f() //nolint:errcheck'],
    ['src/Ledger.java', 'List x = y;', '@SuppressWarnings("unchecked")\nList x = y;'],
    ['src/Ledger.kt', 'val x = y as List<Int>', '@Suppress("UNCHECKED_CAST")\nval x = y as List<Int>'],
  ]) assert.ok(findWeakening(file, before, after), `${file}: ${after}`);
});

test('a suppression that is moved, kept, removed or only talked about passes', () => {
  assert.equal(findWeakening('src/a.ts', '// @ts-ignore\nconst a = f()\nconst b = g()', 'const a = f()\n// @ts-ignore\nconst b = g()'), null, 'moved: one removed, one added');
  assert.equal(findWeakening('src/a.ts', '// @ts-expect-error\nconst a = f()', '// @ts-expect-error\nconst a = f()\nconst b = 2'), null, 'an existing one is not re-reported');
  assert.equal(findWeakening('src/a.ts', '// @ts-ignore\nconst a = f()', 'const a = f() as number'), null, 'removing one is the good direction');
  assert.equal(findWeakening('app/m.py', 'import os  # noqa: F401\nimport re', 'import os\nimport re  # noqa: F401'), null, 'moved noqa');
  assert.equal(findWeakening('src/a.ts', 'a', 'a\n// we never use @ts-ignore in this module'), null, 'prose in a comment is not a directive');
  assert.equal(findWeakening('src/a.ts', 'a', "const rule = 'eslint-disable'"), null, 'a string is not a directive');
  assert.equal(findWeakening('docs/lint.md', 'x', '// @ts-ignore\n# noqa'), null, 'docs may show them');
  assert.equal(findWeakening('src/lib.rs', 'fn a() {}', '// #[allow(dead_code)] was here\nfn a() {}'), null, 'a commented Rust attribute is not an attribute');
});

test('a weakened tsconfig / ESLint config is found', () => {
  for (const [file, before, after] of [
    ['tsconfig.json', '{ "compilerOptions": { "strict": true } }', '{ "compilerOptions": { "strict": false } }'],
    ['packages/api/tsconfig.build.json', '{ "compilerOptions": {} }', '{ "compilerOptions": { "noImplicitAny": false } }'],
    ['tsconfig.json', '{ "compilerOptions": {} }', '{ "compilerOptions": { "skipLibCheck": true } }'],
    ['tsconfig.json', '{ "compilerOptions": { "strict": true } }', '{ "compilerOptions": { "strict": true, "strictNullChecks": false } }'],
    ['.eslintrc.json', '{ "rules": { "no-console": "error" } }', '{ "rules": { "no-console": "off" } }'],
    ['.eslintrc', '{ "rules": {} }', '{ "rules": { "eqeqeq": 0 } }'],
    ['.eslintrc.yml', 'rules:\n  eqeqeq: error\n', 'rules:\n  eqeqeq: error\n  no-console: off\n'],
    ['eslint.config.js', "rules: { 'no-unused-vars': 'error' }", "rules: { 'no-unused-vars': 'error', '@typescript-eslint/no-explicit-any': ['off'] }"],
    ['web/eslint.config.mjs', 'rules: {}', "rules: { 'react-hooks/exhaustive-deps': 0 }"],
  ]) assert.ok(findWeakening(file, before, after), `${file}: ${after}`);
});

test('a widened Python lint ignore list or mypy ignore_errors is found', () => {
  for (const [file, before, after] of [
    ['pyproject.toml', '[tool.ruff.lint]\nselect = ["E", "F"]\n', '[tool.ruff.lint]\nselect = ["E", "F"]\nignore = ["E501"]\n'],
    ['pyproject.toml', '[tool.ruff.lint]\nignore = ["E501"]\n', '[tool.ruff.lint]\nignore = ["E501", "F401"]\n'],
    ['pyproject.toml', '[tool.ruff.lint]\nignore = [\n  "E501",\n]\n', '[tool.ruff.lint]\nignore = [\n  "E501",\n  "F401",\n]\n'],
    ['ruff.toml', '[lint.per-file-ignores]\n"__init__.py" = ["F401"]\n', '[lint.per-file-ignores]\n"__init__.py" = ["F401"]\n"tests/*" = ["S101"]\n'],
    ['setup.cfg', '[flake8]\nmax-line-length = 100\n', '[flake8]\nmax-line-length = 100\nextend-ignore = E203, W503\n'],
    ['.flake8', '[flake8]\nper-file-ignores =\n    __init__.py: F401\n', '[flake8]\nper-file-ignores =\n    __init__.py: F401\n    tests/*: S101\n'],
    ['pyproject.toml', '[tool.mypy]\nstrict = true\n', '[tool.mypy]\nstrict = true\nignore_errors = true\n'],
    ['mypy.ini', '[mypy]\nstrict = True\n', '[mypy]\nstrict = True\n\n[mypy-legacy.*]\nignore_errors = True\n'],
  ]) assert.ok(findWeakening(file, before, after), `${file}: ${after}`);
});

test('tightening, reformatting or unrelated config edits pass', () => {
  assert.equal(findWeakening('tsconfig.json', '{ "strict": false }', '{ "strict": true }'), null, 'turning strict on');
  assert.equal(findWeakening('tsconfig.json', '{ "skipLibCheck": true }', '{ "skipLibCheck": true, "target": "es2022" }'), null, 'an existing setting is not re-reported');
  assert.equal(findWeakening('tsconfig.json', '{\n}', '{\n  // "strict": false,\n}'), null, 'a commented setting is not a setting');
  assert.equal(findWeakening('package.json', '{}', '{ "strict": false }'), null, 'not a tsconfig');
  assert.equal(findWeakening('.eslintrc.json', '{ "rules": { "eqeqeq": "off" } }', '{ "rules": { "eqeqeq": "error" } }'), null, 'turning a rule on');
  assert.equal(findWeakening('eslint.config.js', 'export default [{ languageOptions: {} }]', 'export default [{ languageOptions: { ecmaVersion: 2022 } }]'), null, 'unrelated setting');
  assert.equal(findWeakening('pyproject.toml', '[tool.ruff.lint]\nignore = ["E501", "F401"]\n', '[tool.ruff.lint]\nignore = ["E501"]\n'), null, 'removing an ignore');
  assert.equal(findWeakening('pyproject.toml', '[tool.ruff.lint]\nignore = ["E501", "F401"]\n', '[tool.ruff.lint]\nignore = [\n  "E501",\n  "F401",\n]\n'), null, 'reformatting the list');
  assert.equal(findWeakening('pyproject.toml', '[tool.ruff.lint]\nignore = ["E501"]\n', '[tool.ruff.lint]\nignore = ["E501"]\n  select = ["E", "F", "B"]\n'), null, 'selecting more rules is not ignoring');
  assert.equal(findWeakening('pyproject.toml', '[tool.pytest.ini_options]\naddopts = "-q"\n', '[tool.pytest.ini_options]\naddopts = "-q"\nfilterwarnings = ["ignore::DeprecationWarning"]\n'), null, 'pytest warning filters are not lint ignores');
  assert.equal(findWeakening('setup.cfg', '[flake8]\nmax-line-length = 100\n', '[flake8]\nmax-line-length = 100\n# extend-ignore = E203\n'), null, 'a commented ignore is not an ignore');
});

test('an Edit is judged against the whole file, so a line added inside an ignore list is seen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gwg-')); made.push(dir);
  const exc = join(dir, 'exc'); mkdirSync(exc);
  const env = { GREAT_CTO_EXCEPTIONS_ROOT: exc };
  const py = join(dir, 'pyproject.toml');
  writeFileSync(py, '[tool.ruff.lint]\nselect = ["E", "F"]\nignore = [\n  "E501",\n]\n');
  const widen = run('Edit', { file_path: py, old_string: '  "E501",\n', new_string: '  "E501",\n  "F401",\n' }, env, dir);
  assert.equal(widen.status, 2, widen.stderr);
  assert.match(JSON.parse(widen.stdout).hookSpecificOutput.permissionDecisionReason, /F401/);
  assert.equal(run('Edit', { file_path: py, old_string: '"F"]', new_string: '"F", "B"]' }, env, dir).status, 0, 'selecting more is fine');

  const ts = join(dir, 'cart.ts');
  writeFileSync(ts, 'const a = 1\nconst n: number = total\n');
  const sup = run('Edit', { file_path: ts, old_string: 'const n', new_string: '// @ts-ignore\nconst n' }, env, dir);
  assert.equal(sup.status, 2);
  assert.match(JSON.parse(sup.stdout).hookSpecificOutput.permissionDecisionReason, /@ts-ignore/);
  write(create({ gate: 'gate-weakening', reason: 'third-party types are wrong, ticket #31', createdBy: 'operator' }), { root: exc });
  assert.equal(run('Edit', { file_path: ts, old_string: 'const n', new_string: '// @ts-ignore\nconst n' }, env, dir).status, 0);
});
