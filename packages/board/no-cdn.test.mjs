// Tests for great_cto-kge6: the board loaded fonts.googleapis.com,
// fonts.gstatic.com and cdn.jsdelivr.net on every open — an IP leak and an
// offline-breaker in a tool whose docs/PRIVACY.md promises zero phoning
// home. Assert none of the served pages/scripts reference an external CDN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');

const CDN_PATTERNS = [
  /googleapis\.com/i,
  /gstatic\.com/i,
  /jsdelivr\.net/i,
  /unpkg\.com/i,
  /cdnjs\.cloudflare\.com/i,
];

// Files actually served to a browser — HTML pages + the service worker.
// (PROVENANCE.md docs under assets/ deliberately document the origin the
// vendored files were downloaded from — that's not a runtime CDN call.)
function servedFiles() {
  const out = [];
  for (const f of fs.readdirSync(PUBLIC)) {
    const full = path.join(PUBLIC, f);
    if (fs.statSync(full).isFile() && (f.endsWith('.html') || f === 'sw.js')) {
      out.push(full);
    }
  }
  return out;
}

test('no external CDN hostnames appear in served HTML/JS', () => {
  const files = servedFiles();
  assert.ok(files.length > 0, 'sanity: expected to find index.html/share.html/sw.js');
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of CDN_PATTERNS) {
      assert.equal(
        pattern.test(text), false,
        `${path.relative(PUBLIC, file)} still references an external CDN matching ${pattern}`,
      );
    }
  }
});

test('vendored JS libs exist locally (marked + dompurify)', () => {
  assert.ok(fs.existsSync(path.join(PUBLIC, 'assets', 'vendor', 'marked.min.js')));
  assert.ok(fs.existsSync(path.join(PUBLIC, 'assets', 'vendor', 'purify.min.js')));
});

test('every vendored JS file matches the SHA-384 recorded in PROVENANCE.md, and DOMPurify is patched', async () => {
  const { createHash } = await import('node:crypto');
  const dir = path.join(PUBLIC, 'assets', 'vendor');
  const table = fs.readFileSync(path.join(dir, 'PROVENANCE.md'), 'utf8');
  for (const name of ['marked.min.js', 'purify.min.js']) {
    const row = table.split('\n').find(l => l.startsWith('| `' + name + '`'));
    assert.ok(row, name + ' has no PROVENANCE row');
    const recorded = row.match(/`([A-Za-z0-9+/]{60,}={0,2})`/)?.[1];
    const actual = createHash('sha384').update(fs.readFileSync(path.join(dir, name))).digest('base64');
    assert.equal(actual, recorded, name + ' differs from the hash in PROVENANCE.md');
  }
  // 3.4.17 fixes GHSA-cg2g-xh64-v4q7; an older copy is a known XSS bypass in the board's markdown.
  const head = fs.readFileSync(path.join(dir, 'purify.min.js'), 'utf8').slice(0, 200);
  const [maj, min, pat] = head.match(/DOMPurify (\d+)\.(\d+)\.(\d+)/).slice(1).map(Number);
  assert.ok(maj > 3 || (maj === 3 && (min > 4 || (min === 4 && pat >= 17))), `vendored DOMPurify ${maj}.${min}.${pat} is older than 3.4.17`);
});

test('vendored fonts exist locally (Geist + Geist Mono)', () => {
  assert.ok(fs.existsSync(path.join(PUBLIC, 'assets', 'fonts', 'fonts.css')));
  assert.ok(fs.existsSync(path.join(PUBLIC, 'assets', 'fonts', 'geist-variable.woff2')));
  assert.ok(fs.existsSync(path.join(PUBLIC, 'assets', 'fonts', 'geist-mono-variable.woff2')));
});

test('index.html references vendored assets via relative/local paths', () => {
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  assert.match(html, /\/assets\/fonts\/fonts\.css/);
  assert.match(html, /\/assets\/vendor\/marked\.min\.js/);
  assert.match(html, /\/assets\/vendor\/purify\.min\.js/);
});
