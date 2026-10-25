import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function renderer() {
  const context = { window: {} }; vm.createContext(context);
  vm.runInContext(readFileSync(new URL('./public/assets/work-view.js', import.meta.url), 'utf8'), context);
  return context.window.GctoWork;
}
const observation = (overrides = {}) => ({
  state: 'recorded', source: 'host-observation', complete: false, snapshots: [],
  nodes: [{ id: 'tool-start', kind: 'tool', role: 'read', host: 'claude-code', status: 'started', source: 'host-observation' }],
  edges: [], health: 'ok', total: 1, cursor: null,
  reason: 'Host delivery completeness is not attested.',
  coverage: {
    lifecycle: { supported: true, state: 'partial', reason: 'Terminal observation absent.' },
    tools: { supported: null, state: 'partial', reason: 'Source support unknown.' },
    gates: { supported: false, state: 'unavailable', reason: 'Controller decisions own gate authority.' },
  }, ...overrides,
});

test('host graph preserves observation provenance and dimension-specific unknown coverage', () => {
  const html = renderer().renderExecutionGraph(observation({ complete: true }), { canvas: true });
  assert.match(html, /aria-label="Host-observed execution graph"/);
  assert.match(html, /Host-observed graph/);
  assert.match(html, /Lifecycle · Supported · Partial/);
  assert.match(html, /Tools · Support unknown · Partial/);
  assert.match(html, /Gates · Unsupported · Unavailable/);
  assert.match(html, /Artifacts · Support unknown · Unavailable/);
  assert.match(html, /Partial history: host delivery completeness is not attested/);
  assert.match(html, /<dt>Source<\/dt><dd><code>host-observation/);
  assert.match(html, /<dt>Host<\/dt><dd><code>claude-code/);
  assert.match(html, /data-graph-scale="fit"/);
  assert.doesNotMatch(html, /Controller-recorded graph|Controller history recorded from run creation|data-work-action/);
});

test('coverage and pagination remain visible when no host nodes are available', () => {
  const html = renderer().renderExecutionGraph(observation({ state: 'unavailable', nodes: [], health: 'degraded', total: 202,
    cursor: 'page:200', reason: 'A partial source is unavailable.' }));
  assert.match(html, /Host-observed graph/);
  assert.match(html, /Health: degraded/);
  assert.match(html, /Showing 0 of 202 recorded observations/);
  assert.match(html, /More observations are available outside this page/);
  assert.match(html, /Observation page cursor · read-only/);
  assert.match(html, /page:200/);
  assert.match(html, /A partial source is unavailable/);
  assert.doesNotMatch(html, /<svg|data-work-action/);
});

test('observation reasons, health, cursor and node metadata are escaped', () => {
  const html = renderer().renderExecutionGraph(observation({
    health: '<health>', cursor: '<cursor>', reason: '<script>bad()</script>',
    nodes: [{ id: 'one', kind: 'tool', role: '<role>', host: '<host>', status: '<status>', source: '<source>' }],
    coverage: { lifecycle: { supported: true, state: 'partial', reason: '<coverage>' } },
  }));
  for (const label of ['health', 'cursor', 'script', 'role', 'host', 'status', 'source', 'coverage']) {
    assert.equal(html.includes(`<${label}>`), false);
    assert.match(html, new RegExp(`&lt;${label}&gt;`));
  }
});

test('explicit late-parent observations render without adding edges and cycles are refused', () => {
  const graph = observation({ nodes: [
    { id: 'child', kind: 'tool', status: 'completed' },
    { id: 'parent', kind: 'tool', status: 'started' },
  ], edges: [{ from: 'parent', to: 'child', kind: 'same-call' }], total: 2 });
  const render = renderer().renderExecutionGraph;
  const html = render(graph);
  assert.match(html, /2 nodes · 1 recorded edges/);
  assert.match(html, /same-call: parent to child/);
  assert.doesNotMatch(html, /cannot be displayed safely/);
  const cyclic = render({ ...graph, edges: [...graph.edges, { from: 'child', to: 'parent', kind: 'observed-parent' }] });
  assert.match(cyclic, /cannot be displayed safely/);
  assert.match(cyclic, /Host observation coverage/);
});

test('host metadata cannot turn unknown or unsupported dimensions into complete coverage', () => {
  const html = renderer().renderExecutionGraph(observation({ coverage: {
    lifecycle: { supported: null, state: 'complete' },
    gates: { supported: false, state: 'complete' },
    tools: { supported: true, state: 'complete' },
  } }));
  assert.match(html, /Lifecycle · Support unknown · Unavailable/);
  assert.match(html, /Gates · Unsupported · Unavailable/);
  assert.match(html, /Tools · Supported · Complete/);
  assert.match(html, /Partial history: host delivery completeness is not attested/);
});

test('selected task shows supplemental host graphs alongside the controller graph', () => {
  const controller = { state: 'recorded', complete: true, snapshots: [],
    nodes: [{ id: 'controller', kind: 'attempt', role: 'architect', status: 'intent', host: 'codex' }], edges: [] };
  const entry = { key: 'run:one', kind: 'run', title: 'Sample run', host: 'codex', terminal: false,
    phase: 'working', nativeState: 'ready', capabilities: [], acceptance: [], evidence: [], decisions: [],
    execution: { graph: controller, nodes: [], observations: [observation()] } };
  const html = renderer().renderCockpit({ observedAt: 'now', health: 'current', sources: [], sessions: [], entries: [entry] },
    { canvas: true, selectedKey: entry.key, tab: 'execution' });
  assert.match(html, /Controller-recorded graph/);
  assert.match(html, /Host-observed graph/);
  assert.equal((html.match(/<section class="execution-graph"/g) || []).length, 2);
  assert.doesNotMatch(html, /data-work-action/);
});
