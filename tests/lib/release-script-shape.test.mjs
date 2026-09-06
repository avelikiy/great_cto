// release.sh may not sweep the working tree into a version commit.
//
// It did, twice on 2026-09-06: `git add -A` put a reverted contract into the
// morning's version commit and an entire untracked feature plus two design
// documents into the afternoon's — none in the release notes, all public the
// moment the tag was pushed. The script cannot be exercised in a test (it pushes
// tags), so its SHAPE is pinned: no sweep, an explicit list, a refusal branch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const raw = readFileSync(path.join(ROOT, 'scripts/release.sh'), 'utf8');
// Comments stripped before searching. The comment explaining WHY there is no
// `git add -A` contains the words `git add -A`, and the first version of this
// guard tripped on its own explanation — the third guard today to do so.
const src = raw.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

test('release.sh never runs git add -A', () => {
  assert.doesNotMatch(src, /git add -A\b/, 'a sweep commits whatever happens to be in the tree');
  assert.doesNotMatch(src, /git add \./, 'same thing spelled differently');
});

test('release.sh stages an explicit version-file list and refuses strays', () => {
  assert.match(src, /VERSION_FILES=\(/, 'the list exists');
  for (const f of ['.claude-plugin/plugin.json', '.codex-plugin/mcp.json', 'CHANGELOG.md', 'packages/cli/package.json']) {
    assert.ok(src.includes(f), `${f} is on the list`);
  }
  assert.match(src, /refusing to commit/, 'a stray file stops the release rather than riding it');
  assert.match(src, /git add -- "\$f"/, 'files are added by name');
});

test('the version-file list matches what bump-version.sh actually writes', () => {
  // The list is only honest if it tracks the bump. Every path the bump writes to
  // must be on it — a new version file added to the bump and not to this list
  // would be exactly the stray the refusal branch then trips on.
  const bump = readFileSync(path.join(ROOT, 'scripts/bump-version.sh'), 'utf8');
  const written = [...bump.matchAll(/"\$ROOT\/([^"]+)"/g)].map((m) => m[1]).filter((p) => !p.endsWith('/'));
  assert.ok(written.length >= 6, `bump writes ${written.length} files`);
  for (const f of written) assert.ok(src.includes(f), `bump writes ${f} but release.sh does not stage it by name`);
});
