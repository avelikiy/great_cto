// Every path in package.json "files" must actually exist.
//
// `"scripts/hooks/"` sat in that list for months pointing at
// packages/cli/scripts/hooks/ — a directory that has never existed. npm silently
// skips a files entry it cannot resolve, so the manifest claimed to ship the
// git hooks and shipped nothing, with no error at pack time, no warning at
// publish, and no way to notice short of unpacking a published tarball. (The
// hooks reach users through the plugin clone instead — the generated Codex
// config points at ~/.codex/skills/great_cto/scripts/hooks/, not at anything
// inside this package.)
//
// Same defect class as the rest of this arc: a config promising delivery it does
// not perform, failing silently. This test makes the promise checkable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));

test('every "files" entry resolves to something on disk', () => {
  const missing = [];
  for (const entry of pkg.files || []) {
    // Entries may be dirs ("dist/"), files ("index.mjs") or globs. Only literal
    // paths are checked — a glob that matches nothing is a separate concern.
    if (/[*?[\]]/.test(entry)) continue;
    const p = join(pkgRoot, entry.replace(/\/$/, ''));
    if (!existsSync(p)) missing.push(entry);
  }
  assert.deepEqual(missing, [],
    `package.json "files" lists path(s) that do not exist: ${missing.join(', ')} — ` +
    'npm skips these silently, so the package ships less than the manifest claims');
});

test('"files" is non-empty — an empty list would ship almost nothing', () => {
  assert.ok(Array.isArray(pkg.files) && pkg.files.length > 0);
});

test('the entry points named in package.json exist', () => {
  const bin = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin || {});
  for (const b of bin) {
    assert.ok(existsSync(join(pkgRoot, b)), `bin target missing: ${b}`);
  }
  if (pkg.main) assert.ok(existsSync(join(pkgRoot, pkg.main)), `main missing: ${pkg.main}`);
});

test('a bin entry is covered by "files" (otherwise the published package cannot run)', () => {
  const bin = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin || {});
  const files = pkg.files || [];
  for (const b of bin) {
    const covered = files.some((f) => f === b || b.startsWith(f.replace(/\/$/, '') + '/'));
    assert.ok(covered, `bin "${b}" is not included by any "files" entry`);
  }
});
