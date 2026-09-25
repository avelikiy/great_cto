// The TDD loop runs the tests the edit touches; the full suite runs once.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { affectedTests } from '../../scripts/lib/affected-tests.mjs';

const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
function repo(files) {
  const d = mkdtempSync(join(tmpdir(), 'aff-')); made.push(d);
  for (const [f, c] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), c); }
  return d;
}

test('JS: a source file maps to its test, run by the project runner', () => {
  const d = repo({ 'package.json': '{"devDependencies":{"vitest":"1"}}', 'src/price.ts': '', 'src/price.test.ts': '', 'src/other.test.ts': '' });
  const r = affectedTests({ cwd: d, changed: ['src/price.ts'] });
  assert.equal(r.mode, 'targeted');
  assert.deepEqual(r.commands, ['npx vitest run src/price.test.ts']);
});

test('without vitest or jest it is node --test; a changed test runs itself', () => {
  const d = repo({ 'tests/a.test.mjs': '' });
  assert.deepEqual(affectedTests({ cwd: d, changed: ['tests/a.test.mjs'] }).commands, ['node --test tests/a.test.mjs']);
});

test('Rust: the owning crate', () => {
  const d = repo({ 'engine/Cargo.toml': '[package]\nname = "copier-engine"\n', 'engine/src/risk.rs': '' });
  assert.deepEqual(affectedTests({ cwd: d, changed: ['engine/src/risk.rs'] }).commands, ['cargo test -p copier-engine']);
});

test('Dart/Flutter: lib/x.dart → test/x_test.dart', () => {
  const d = repo({ 'pubspec.yaml': 'dependencies:\n  flutter:\n    sdk: flutter\n', 'lib/wallet/balance.dart': '', 'test/wallet/balance_test.dart': '' });
  assert.deepEqual(affectedTests({ cwd: d, changed: ['lib/wallet/balance.dart'] }).commands, ['flutter test test/wallet/balance_test.dart']);
});

test('Python and Go', () => {
  const d = repo({ 'app/ledger.py': '', 'tests/test_ledger.py': '', 'svc/pay/pay.go': '' });
  assert.deepEqual(affectedTests({ cwd: d, changed: ['app/ledger.py', 'svc/pay/pay.go'] }).commands,
    ['pytest tests/test_ledger.py', 'go test ./svc/pay']);
});

test('a source file with no test is reported, and nothing mapped means full', () => {
  const d = repo({ 'src/orphan.ts': '' });
  const r = affectedTests({ cwd: d, changed: ['src/orphan.ts', 'README.md'] });
  assert.equal(r.mode, 'full');
  assert.deepEqual(r.unmapped, ['src/orphan.ts']);
});

test('nothing changed is none, not full', () => {
  assert.equal(affectedTests({ cwd: repo({}), changed: [] }).mode, 'none');
});
