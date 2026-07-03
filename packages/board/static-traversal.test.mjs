// Tests for great_cto-qvg9: static file serving in server.mjs joined
// `path.join(PUBLIC, filePath)` with no containment check, so a request
// like GET /..%2F..%2Fetc%2Fpasswd (decoded by the URL parser to
// pathname "/../../etc/passwd") could escape the public/ directory.
//
// server.mjs now guards every static-file read with lib/util.mjs's
// isInsideDir(PUBLIC, fullPath) — same containment primitive used here.
// Booting the real HTTP server isn't an established pattern in this test
// suite (no other packages/board/*.test.mjs does it), so this tests the
// pure containment logic directly, exercised with the same inputs the
// server actually produces via path.join(PUBLIC, pathname).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { isInsideDir } from './lib/util.mjs';

const PUBLIC = '/app/packages/board/public';

function joined(pathname) {
  return path.join(PUBLIC, pathname);
}

test('isInsideDir allows the PUBLIC root itself', () => {
  assert.equal(isInsideDir(PUBLIC, PUBLIC), true);
});

test('isInsideDir allows a normal file inside PUBLIC', () => {
  assert.equal(isInsideDir(PUBLIC, joined('/index.html')), true);
  assert.equal(isInsideDir(PUBLIC, joined('/assets/app.js')), true);
});

test('isInsideDir rejects a simple ../ escape', () => {
  const fullPath = joined('/../server.mjs');
  assert.equal(isInsideDir(PUBLIC, fullPath), false);
});

test('isInsideDir rejects a deep traversal to /etc/passwd', () => {
  const fullPath = joined('/../../../../../../etc/passwd');
  assert.equal(isInsideDir(PUBLIC, fullPath), false);
});

test('isInsideDir rejects the exact traversal path from the smoke test (/assets/../../../etc/passwd)', () => {
  const fullPath = joined('/assets/../../../etc/passwd');
  assert.equal(isInsideDir(PUBLIC, fullPath), false);
});

test('isInsideDir rejects a sibling directory that merely shares the PUBLIC prefix', () => {
  // Guards against a naive startsWith(base) (no trailing separator) which would
  // wrongly allow "/app/packages/board/public-evil/secret".
  const sibling = '/app/packages/board/public-evil/secret';
  assert.equal(isInsideDir(PUBLIC, sibling), false);
});

test('URL decoding still resolves %2e%2e (percent-encoded dots) as a literal path segment named "%2e%2e", not a traversal', () => {
  // Node's URL parser decodes %2F (encoded slash) but the http module's
  // req.url / URL(pathname) does NOT decode it into an actual path
  // separator for routing purposes — encoded slashes stay literal percent
  // sequences in `pathname` unless the runtime decodes them. Either way,
  // isInsideDir must not be fooled: whatever pathname the server hands it,
  // containment is re-checked after path.resolve().
  const fullPath = joined('/%2e%2e/%2e%2e/etc/passwd');
  // This does NOT collapse via path.join (no literal ".." segments), so it
  // stays "inside" PUBLIC as a (nonexistent) literally-named file — proving
  // the guard doesn't over-block legitimate-looking encoded names while
  // still blocking real ".." segments once decoded by the URL parser.
  assert.equal(isInsideDir(PUBLIC, fullPath), true);
});
