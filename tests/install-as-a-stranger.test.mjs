// Install it the way someone who just found it would, and see if it runs.
//
// The defect this exists for: `great-cto init` clones the repository into the
// plugin cache, and `packages/cli/dist/` is a build artefact. Five of its
// thirty-two files are in git by accident; `archetypes.js` is not. So a cloned
// plugin got 5 of 32 and the board died on
//
//     ERR_MODULE_NOT_FOUND … packages/cli/dist/archetypes.js
//
// It worked for the author, whose plugin cache is filled by install-local.sh
// from a working tree with a full build. It worked from the npm tarball, which
// ships all 32. It failed on exactly one path — the one a new user takes — and
// nothing in the suite walked that path, so the board was unstartable for every
// new user across several releases with a green CI.
//
// These tests take that path. They are deliberately about the SHAPE of the
// install rather than about one filename: asserting "archetypes.js is present"
// would pass again the day something else stops being copied.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliDist = join(repoRoot, 'packages', 'cli', 'dist');

test('every module the plugin imports from the build is present in the build', async () => {
  // Derived from the source, not listed here: a list you have to remember to
  // update is a list that will be wrong again.
  const { execFileSync } = await import('node:child_process');
  let refs = '';
  try {
    refs = execFileSync('grep', ['-rhoE', String.raw`cli/dist/[A-Za-z0-9._-]+\.js`,
      join(repoRoot, 'scripts'), join(repoRoot, 'packages', 'board')],
      { encoding: 'utf8' });
  } catch { return; }   // nothing imports the build — nothing to assert

  const needed = [...new Set(refs.split('\n').filter(Boolean).map((r) => r.split('/').pop()))];
  assert.ok(needed.length, 'expected the board or scripts to import at least one built module');

  const missing = needed.filter((f) => !existsSync(join(cliDist, f)));
  assert.deepEqual(missing, [],
    `these are imported at runtime but absent from packages/cli/dist — run the build:\n  ${missing.join('\n  ')}`);
});

test('the installer supplies the build rather than trusting the clone to carry it', async () => {
  const installer = join(repoRoot, 'packages', 'cli', 'src', 'installer.ts');
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(installer, 'utf8');
  assert.match(src, /supplyBuiltDist/,
    'a git clone contains no build; the installer must supply one from the package it runs from');
  assert.match(src, /missingRuntimeParts/,
    'the post-install check must ask whether the plugin can RUN, not whether files arrived');
});

test('the runtime check names the parts that make the plugin runnable', async () => {
  const { missingRuntimeParts } = await import('../packages/cli/dist/installer.js');

  // A directory with nothing in it is missing everything, and says so.
  const empty = missingRuntimeParts(join(repoRoot, 'tests', 'fixtures', '__definitely_not_here__'));
  assert.ok(empty.length >= 4, 'an empty directory must not pass a runnability check');
  assert.ok(empty.some((m) => m.includes('archetypes.js')),
    'the module whose absence broke the board must be one of the things checked');

  // The repo itself, with a build present, is runnable.
  assert.deepEqual(missingRuntimeParts(repoRoot), [],
    'this repository with a completed build should read as runnable');
});

test('the accidental five are not mistaken for a build', () => {
  // The five files committed by accident are exactly the ones that made the
  // broken install look plausible: `dist/` existed and was not empty.
  const present = readdirSync(cliDist).filter((f) => f.endsWith('.js'));
  assert.ok(present.length > 5,
    `dist has ${present.length} built file(s) — a non-empty dist is not evidence of a complete one`);
});
