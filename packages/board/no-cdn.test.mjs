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
