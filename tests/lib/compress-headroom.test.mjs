// Opt-in headroom-MCP routing in compress() (great_cto-k9p). The extension point must:
// route heavy blobs to an injected headroom fn, stay native for everything else, never crash if
// the MCP errors, and be native-only by default (headroom is never a dependency).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compress } from '../../scripts/lib/compress/index.mjs';

const BIG = 'x'.repeat(300_000); // ≥ default heavyBytes (200 KB)

test('heavy blob + injected headroom → routed to headroom', () => {
  const r = compress(BIG, { headroom: () => ({ compressed: 'SMALL', type: 'ast' }) });
  assert.equal(r.via, 'headroom');
  assert.equal(r.compressed, 'SMALL');
  assert.equal(r.type, 'ast');
  assert.ok(r.ratio > 0.99);
});

test('opts.heavy forces headroom even for small input', () => {
  const r = compress('tiny', { heavy: true, headroom: () => ({ compressed: 'h' }) });
  assert.equal(r.via, 'headroom');
});

test('small input (below heavyBytes) → native, headroom not consulted', () => {
  let called = false;
  const r = compress('{"a":1,"b":2}', { headroom: () => { called = true; return { compressed: 'X' }; } });
  assert.equal(r.via, 'native');
  assert.equal(called, false);
});

test('headroom throws → native fallback, never crashes', () => {
  const r = compress(BIG, { headroom: () => { throw new Error('mcp unavailable'); } });
  assert.equal(r.via, 'native');
  assert.ok(r.compressed.length >= 0);
});

test('headroom returns a worse (longer) result → native kept', () => {
  const r = compress(BIG, { headroom: () => ({ compressed: BIG + 'more' }) });
  assert.equal(r.via, 'native');
});

test('default (no headroom fn) → native only — never a dependency', () => {
  assert.equal(compress(BIG).via, 'native');
});
