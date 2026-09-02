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
        if (!feedsReference(probe, GROUPS, ROOT)) missed.push(`${dir}/*${ext} (${g.key})`);
      }
    }
  }
  assert.deepEqual(missed, [], 'these feed docs/reference but would not trigger the hook');
});

test('the extension matters, not just the directory', () => {
  // agents/ is watched for .md. A .png dropped beside an agent changes nothing
  // the reference derives from, and regenerating on it is pure noise.
  assert.equal(feedsReference(join(ROOT, 'agents', 'architect.md'), GROUPS, ROOT), true);
  assert.equal(feedsReference(join(ROOT, 'agents', 'diagram.png'), GROUPS, ROOT), false);
  // scripts/lib is watched for .mjs only.
  assert.equal(feedsReference(join(ROOT, 'scripts', 'lib', 'contrast.mjs'), GROUPS, ROOT), true);
  assert.equal(feedsReference(join(ROOT, 'scripts', 'lib', 'notes.md'), GROUPS, ROOT), false);
});

test('files the reference does not derive from do not trigger it', () => {
  for (const p of [
    join(ROOT, 'README.md'),
    join(ROOT, 'docs', 'reference', 'agents.md'),   // the OUTPUT — regenerating on it would loop
    join(ROOT, 'tests', 'lib', 'contrast.test.mjs'),
    join(ROOT, 'package.json'),
  ]) {
    assert.equal(feedsReference(p, GROUPS, ROOT), false, `${p} must not trigger regeneration`);
  }
});

test('generated and vendored trees are not sources', () => {
  // system-map skips these when counting; the hook must skip them too, or a
  // build artefact under a watched directory regenerates the docs on every write.
  assert.equal(feedsReference(join(ROOT, 'packages', 'board', 'node_modules', 'x', 'a.mjs'), GROUPS, ROOT), false);
  assert.equal(feedsReference(join(ROOT, 'packages', 'cli', 'src', 'dist', 'main.mjs'), GROUPS, ROOT), false);
});

test('a path outside the repository is never ours', () => {
  assert.equal(feedsReference('/etc/passwd', GROUPS, ROOT), false);
  assert.equal(feedsReference(join(ROOT, '..', 'other-repo', 'agents', 'x.md'), GROUPS, ROOT), false);
  assert.equal(feedsReference('', GROUPS, ROOT), false);
});

test('the tree it regenerates is the one the EDIT is in, not the one the script is in', () => {
  // The defect this replaces. When the hook runs from an installed plugin, the
  // script lives in ~/.claude/plugins/cache/…/<version>/scripts/hooks/. The first
  // version derived its root from its own location, so the one time it fired it
  // rewrote docs/reference INSIDE the cache, left the repository stale, and
  // logged "regenerated" — the gate then failed on exactly the file the hook was
  // added to keep in sync.
  //
  // feedsReference now takes the root explicitly, so a path is judged against
  // the repository it belongs to. Passing the wrong root is how the bug looked.
  const agent = join(ROOT, 'agents', 'architect.md');
  assert.equal(feedsReference(agent, GROUPS, ROOT), true,
    'judged against its own repository: it feeds the reference');
  assert.equal(feedsReference(agent, GROUPS, '/tmp/some-plugin-cache/3.21.0'), false,
    'judged against an unrelated root: not ours, and must not trigger a regeneration there');
});

test('run from a plugin cache, it regenerates the PROJECT tree and leaves the cache alone', async () => {
  // The unit tests above check which paths qualify. They cannot see the bug that
  // shipped: the hook ran the generator with cwd set to its OWN directory, so the
  // files landed in the plugin cache. Only running it and looking at where the
  // bytes went catches that.
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync: exists, cpSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { spawnSync } = await import('node:child_process');

  const cache = mkdtempSync(join(tmpdir(), 'docs-sync-cache-'));
  const project = mkdtempSync(join(tmpdir(), 'docs-sync-project-'));
  try {
    // A stand-in plugin cache: this repo's scripts, no .git of its own.
    cpSync(join(ROOT, 'scripts'), join(cache, 'scripts'), { recursive: true });
    cpSync(join(ROOT, 'shared'), join(cache, 'shared'), { recursive: true });

    // A stand-in project: a .git marker and the three trees the generator reads.
    // All three must exist — a missing one is a readdir error, not a defect.
    mkdirSync(join(project, '.git'), { recursive: true });
    mkdirSync(join(project, 'agents'), { recursive: true });
    mkdirSync(join(project, 'commands'), { recursive: true });
    mkdirSync(join(project, 'skills', 'probe'), { recursive: true });
    writeFileSync(join(project, 'agents', 'probe.md'),
      '---\nname: probe\ndescription: a fixture agent\nmodel: sonnet\n---\n\nbody\n');
    writeFileSync(join(project, 'commands', 'probe.md'),
      '---\ndescription: a fixture command\n---\n\nbody\n');
    writeFileSync(join(project, 'skills', 'probe', 'SKILL.md'),
      '---\nname: probe\ndescription: a fixture skill\n---\n\nbody\n');

    const hook = join(cache, 'scripts', 'hooks', 'docs-reference-sync.mjs');
    const r = spawnSync(process.execPath, [hook], {
      input: JSON.stringify({ file_path: join(project, 'agents', 'probe.md'), tool_name: 'Edit' }),
      cwd: project, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(r.status, 0, `hook exited ${r.status}: ${(r.stderr || '').slice(0, 300)}`);

    assert.ok(exists(join(project, 'docs', 'reference', 'agents.md')),
      'the PROJECT got its reference regenerated');
    assert.ok(!exists(join(cache, 'docs', 'reference')),
      'the plugin cache was left alone — writing there is the defect this replaces');
    // And it read the PROJECT's agents, not the plugin's: the fixture agent is
    // named in the output, and the plugin's seventy are not.
    const out = readFileSync(join(project, 'docs', 'reference', 'agents.md'), 'utf8');
    assert.match(out, /probe/, "the fixture project's own agent is in the reference");
    assert.ok(!/architect/.test(out), "the plugin's agents are not — it read the wrong tree if they are");
  } finally {
    rmSync(cache, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});
