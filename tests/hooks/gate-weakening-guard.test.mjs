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
