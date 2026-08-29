// A screenshot cannot go stale loudly. It just keeps rendering, showing a screen
// the software no longer has, and nothing in the repository disagrees.
//
// This happened: `docs/screenshots/board.png` was taken at v2.73.1 and sat in
// eleven READMEs while the board shipped 3.16.0 — two months and one redesign
// out of date. It was found by a person looking, which is the failure mode this
// project spends its checks removing.
//
// So every screenshot carries the version it was taken from, inside the PNG
// (scripts/lib/png-meta.mjs), and this test is the ratchet. Three states, not
// two: `current`, `stale`, and `unstamped` — an image that was never stamped is
// not an image that passed.
//
// Re-shoot with:  node scripts/capture-screenshots.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTextChunks } from '../../scripts/lib/png-meta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const version = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'packages', 'cli', 'package.json'), 'utf8')).version;

/** Feature releases change the UI; patch releases do not. Compare on major.minor. */
const line = (v) => String(v).split('.').slice(0, 2).join('.');

function judge(file) {
  const stamped = readTextChunks(fs.readFileSync(path.join(SHOTS, file)))['great_cto.version'];
  if (!stamped) return { state: 'unstamped' };
  return { state: line(stamped) === line(version) ? 'current' : 'stale', stamped };
}

test('every screenshot says which version it was taken from', () => {
  const files = fs.readdirSync(SHOTS).filter((f) => f.endsWith('.png'));
  assert.ok(files.length > 0, 'docs/screenshots/ has images to judge');

  const unstamped = files.filter((f) => judge(f).state === 'unstamped');
  assert.deepEqual(unstamped, [],
    `these images carry no version, so nothing can tell whether they are current: ${unstamped.join(', ')}\n`
    + '  Re-shoot with: node scripts/capture-screenshots.mjs');
});

test('no screenshot is older than the release line it documents', () => {
  const files = fs.readdirSync(SHOTS).filter((f) => f.endsWith('.png'));
  const stale = files.map((f) => ({ f, ...judge(f) })).filter((r) => r.state === 'stale');
  assert.deepEqual(stale.map((r) => `${r.f} (v${r.stamped}, package is v${version})`), [],
    'a screenshot from an older feature release shows a screen this version may not have.\n'
    + '  Re-shoot with: node scripts/capture-screenshots.mjs');
});

test('every screenshot a document points at exists', () => {
  // The other direction of the same failure: a reference that resolves to
  // nothing renders as a broken image, which reads as a broken project.
  const docs = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.md')) docs.push(full);
    }
  };
  walk(path.join(ROOT, 'docs'));
  docs.push(path.join(ROOT, 'README.md'));

  const missing = [];
  for (const d of docs) {
    const text = fs.readFileSync(d, 'utf8');
    for (const m of text.matchAll(/screenshots\/([a-zA-Z0-9._-]+\.png)/g)) {
      if (!fs.existsSync(path.join(SHOTS, m[1]))) missing.push(`${path.relative(ROOT, d)} → ${m[1]}`);
    }
  }
  assert.deepEqual(missing, [], `documents point at screenshots that are not there:\n  ${missing.join('\n  ')}`);
});
