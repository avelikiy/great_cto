import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFixtureBase } from './lib/mixed-host-fixture-store.mjs';

test('creates private runs under an operator-owned durable base', () => {
  const parent = mkdtempSync(join(tmpdir(), 'great-cto-fixture-test-'));
  try {
    const root = join(parent, 'durable');
    const base = createFixtureBase(root);
    assert.equal(base.startsWith(`${root}/mixed-release-`), true);
    assert.equal(lstatSync(root).mode & 0o077, 0);
    assert.equal(lstatSync(base).mode & 0o077, 0);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test('rejects relative, shared and symlink fixture bases', () => {
  const parent = mkdtempSync(join(tmpdir(), 'great-cto-fixture-test-'));
  try {
    assert.throws(() => createFixtureBase('relative/path'), /absolute/);
    const shared = join(parent, 'shared');
    mkdirSync(shared);
    chmodSync(shared, 0o755);
    assert.throws(() => createFixtureBase(shared), /private/);
    const link = join(parent, 'link');
    symlinkSync(shared, link);
    assert.throws(() => createFixtureBase(link), /private/);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test('rejects an ancestor project Codex config', () => {
  const parent = mkdtempSync(join(tmpdir(), 'great-cto-fixture-test-'));
  try {
    const config = join(parent, '.codex');
    mkdirSync(config);
    writeFileSync(join(config, 'config.toml'), '');
    assert.throws(() => createFixtureBase(join(parent, 'durable')), /ancestor Codex config/);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
