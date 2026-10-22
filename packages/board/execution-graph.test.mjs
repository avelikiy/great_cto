import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function renderer() {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('./public/assets/work-view.js', import.meta.url), 'utf8'), ctx);
  return ctx.window.GctoWork.renderExecutionGraph;
}
test('graph renders recorded typed edges, escaped node details and read-only controls', () => {
  const html = renderer()({ state: 'recorded', complete: false, reason: '<incomplete>', snapshots: [{ digest: 'a' }],
    nodes: [{ id: 'one', role: '<writer>', kind: 'attempt', status: 'intent', gates: [] }, { id: 'two', kind: 'verifier', status: 'verified', gates: [] }],
    edges: [{ from: 'one', to: 'two', kind: 'verification' }] });
  assert.match(html, /Controller-recorded graph/); assert.match(html, /2 nodes · 1 recorded edges/);
  assert.match(html, /&lt;writer&gt;/); assert.match(html, /&lt;incomplete&gt;/);
  assert.match(html, /role="button" tabindex="0"/); assert.match(html, /data-graph-detail="one"/);
  assert.match(html, /Partial history/); assert.match(html, /verification: one to two/);
  assert.match(html, /Stage context SHA-256/);
  assert.match(html, /exclude separately admitted domain packets/);
  assert.doesNotMatch(html, /data-work-action|<writer>|<incomplete>/);
});
test('historical scoped reuse is not presented as a fresh worker call', () => {
  const html = renderer()({ state: 'recorded', complete: true, nodes: [{ id: 'reuse', kind: 'reuse', status: 'recorded', contextDigest: 'a'.repeat(64), verdict: 'historical-report-no-worker' }], edges: [] });
  assert.match(html, /Historical report SHA-256 \(worker not invoked\)/);
  assert.match(html, /historical-report-no-worker/);
});
test('legacy/native and malformed/cyclic graph data do not become causal diagrams', () => {
  const render = renderer();
  assert.match(render(null), /Native and legacy observations remain partial/);
  assert.match(render({ state: 'recorded', nodes: [{ id: 'a' }], edges: [{ from: 'a', to: 'a' }] }), /cannot be displayed safely/);
  assert.match(render({ state: 'recorded', nodes: [{ id: 'a' }], edges: [{ from: 'missing', to: 'a' }] }), /cannot be displayed safely/);
  assert.match(render({ state: 'recorded', nodes: Array.from({ length: 513 }, (_, i) => ({ id: String(i) })), edges: [] }), /display limit/);
});
