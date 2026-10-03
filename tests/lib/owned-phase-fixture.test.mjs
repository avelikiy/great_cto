import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lstatSync, existsSync, writeFileSync, renameSync, mkdirSync, rmSync, symlinkSync, chmodSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOwnedPhaseFixture } from '../../scripts/lib/owned-phase-fixture.mjs';

test('stock phase checks delegate to the owned fixture and disclose synthetic scope', () => {
  const source = readFileSync(fileURLToPath(new URL('../../scripts/test-pipeline.sh', import.meta.url)), 'utf8');
  const block = source.slice(source.indexOf('# L4b —'), source.indexOf('# L5 —'));
  assert.ok(block.includes('node "$ROOT/scripts/lib/phase-smoke.mjs" "$ROOT/scripts/phase-task.sh" "$(command -v bd)"'));
  assert.ok(block.includes('synthetic verdicts; NOT CHECKED'));
  assert.ok(!block.includes('rm -rf'));
  assert.ok(!block.includes('/tmp/gctest-'));
  assert.ok(!block.includes('bd init'));
});

test('fresh exclusive private dot-free fixture roots clean only their own contents', () => {
  const a = createOwnedPhaseFixture(), b = createOwnedPhaseFixture();
  try {
    assert.notEqual(a.root, b.root);
    assert.equal(basename(a.root).includes('.'), false);
    assert.equal(lstatSync(a.root).mode & 0o077, 0);
    writeFileSync(join(b.root, 'sentinel'), 'preserve');
    a.cleanup(); a.cleanup();
    assert.equal(existsSync(a.root), false);
    assert.equal(readFileSync(join(b.root, 'sentinel'), 'utf8'), 'preserve');
  } finally { a.cleanup(); b.cleanup(); }
});

for (const replacement of ['directory', 'symlink']) {
  test(`changed root ${replacement} is preserved and cleanup refuses`, () => {
    const f = createOwnedPhaseFixture(), target = createOwnedPhaseFixture();
    const original = `${f.root}-original`;
    renameSync(f.root, original);
    try {
      if (replacement === 'directory') mkdirSync(f.root, { mode: 0o700 });
      else symlinkSync(target.root, f.root);
      writeFileSync(join(f.root, 'sentinel'), 'preserve');
      assert.throws(() => f.cleanup(), /identity changed/);
      assert.equal(readFileSync(join(f.root, 'sentinel'), 'utf8'), 'preserve');
      assert.equal(existsSync(original), true);
    } finally {
      // These exact fixture objects/paths were created by this test.
      rmSync(f.root, { recursive: true, force: true });
      renameSync(original, f.root); f.cleanup(); target.cleanup();
    }
  });
}

test('a widened permission boundary refuses cleanup until restored', () => {
  const f = createOwnedPhaseFixture();
  try {
    chmodSync(f.root, 0o755);
    assert.throws(() => f.cleanup(), /identity changed/);
    assert.equal(existsSync(f.root), true);
  } finally { chmodSync(f.root, 0o700); f.cleanup(); }
});
