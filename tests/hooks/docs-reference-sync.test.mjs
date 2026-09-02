// The hook that regenerates docs/reference/ on write.
//
// ci-local's `docs-reference in sync` gate caught a stale page twice in one
// session — after editing a command, then after editing an agent. The gate is
// right; the feedback arrives minutes later on finished work, for a file nobody
// edited by hand. This hook moves that feedback to the write.
//
// What it must not become: a second, drifting copy of "which files matter".
// scripts/lib/system-map.mjs GROUPS is what the generator actually reads, so the
// test below drives the hook with EVERY directory and extension GROUPS names. A
// group added there and not watched here fails this test rather than going
// quietly unwatched — which is the defect the gate exists to catch, one level up.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUPS } from '../../scripts/lib/system-map.mjs';
import { feedsReference } from '../../scripts/hooks/docs-reference-sync.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('every directory GROUPS names is watched, with the extension it declares', () => {
  const missed = [];
  for (const g of GROUPS) {
    for (const dir of g.dirs) {
      for (const ext of g.ext) {
        const probe = join(ROOT, dir, `probe-file${ext}`);
        if (!feedsReference(probe, GROUPS)) missed.push(`${dir}/*${ext} (${g.key})`);
      }
    }
  }
  assert.deepEqual(missed, [], 'these feed docs/reference but would not trigger the hook');
});

test('the extension matters, not just the directory', () => {
  // agents/ is watched for .md. A .png dropped beside an agent changes nothing
  // the reference derives from, and regenerating on it is pure noise.
  assert.equal(feedsReference(join(ROOT, 'agents', 'architect.md'), GROUPS), true);
  assert.equal(feedsReference(join(ROOT, 'agents', 'diagram.png'), GROUPS), false);
  // scripts/lib is watched for .mjs only.
  assert.equal(feedsReference(join(ROOT, 'scripts', 'lib', 'contrast.mjs'), GROUPS), true);
  assert.equal(feedsReference(join(ROOT, 'scripts', 'lib', 'notes.md'), GROUPS), false);
});

test('files the reference does not derive from do not trigger it', () => {
  for (const p of [
    join(ROOT, 'README.md'),
    join(ROOT, 'docs', 'reference', 'agents.md'),   // the OUTPUT — regenerating on it would loop
    join(ROOT, 'tests', 'lib', 'contrast.test.mjs'),
    join(ROOT, 'package.json'),
  ]) {
    assert.equal(feedsReference(p, GROUPS), false, `${p} must not trigger regeneration`);
  }
});

test('generated and vendored trees are not sources', () => {
  // system-map skips these when counting; the hook must skip them too, or a
  // build artefact under a watched directory regenerates the docs on every write.
  assert.equal(feedsReference(join(ROOT, 'packages', 'board', 'node_modules', 'x', 'a.mjs'), GROUPS), false);
  assert.equal(feedsReference(join(ROOT, 'packages', 'cli', 'src', 'dist', 'main.mjs'), GROUPS), false);
});

test('a path outside the repository is never ours', () => {
  assert.equal(feedsReference('/etc/passwd', GROUPS), false);
  assert.equal(feedsReference(join(ROOT, '..', 'other-repo', 'agents', 'x.md'), GROUPS), false);
  assert.equal(feedsReference('', GROUPS), false);
});
