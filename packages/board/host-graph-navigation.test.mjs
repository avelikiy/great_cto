import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./public/assets/work-view.js', import.meta.url), 'utf8');
function renderer(extra = {}) { const context = { window: {}, URLSearchParams, ...extra }; vm.createContext(context); vm.runInContext(source, context); return context.window.GctoWork; }
const graph = () => ({ state: 'recorded', complete: true, snapshots: [{ digest: 'a'.repeat(64), rules: [{ role: 'writer', on: ['DONE'], next: ['reviewer'], join: ['security'], gates: ['gate:code'] }] }],
  nodes: [{ id: 'control', kind: 'transition', status: 'recorded', at: '2026-10-25T10:00:00Z' },
    { id: 'first', kind: 'attempt', role: 'writer', host: 'codex', status: 'returned', at: '2026-10-25T10:01:00Z' },
    { id: 'second', kind: 'attempt', role: 'reviewer', host: 'claude-code', status: 'intent', at: '2026-10-25T10:02:00Z' }],
  edges: [{ from: 'control', to: 'first', kind: 'dispatch' }, { from: 'first', to: 'second', kind: 'transition' }] });
function selected(main, observations = []) { const entry = { key: 'task:one', title: 'Synthetic task', kind: 'task', terminal: false, phase: 'waiting', capabilities: [], acceptance: [], evidence: [], decisions: [], execution: { graph: main, observations, nodes: [] } }; return { observedAt: 'now', health: 'current', sources: [], sessions: [], entries: [entry] }; }

test('declared workflow shows snapshot rules separately from recorded execution without changing tabs', () => {
  const g = graph(), html = renderer().renderCockpit(selected(g), { canvas: true, selectedKey: 'task:one', tab: 'execution' });
  assert.match(html, /Declared workflow/); assert.match(html, /Declared possibilities only/);
  for (const field of ['writer', 'DONE', 'reviewer', 'security', 'gate:code']) assert(html.includes(field));
  assert.equal((html.match(/role="tab"/g) || []).length, 3);
  assert.equal((html.match(/class="execution-node"/g) || []).length, 3);
  assert.match(html, /2 recorded edges/);
  const native = { ...g, source: 'host-observation', snapshots: [] };
  assert.doesNotMatch(renderer().renderCockpit(selected(native), { canvas: true, selectedKey: 'task:one', tab: 'execution' }), /Declared possibilities only/);
});

test('supplementary host graphs are collapsed per attempt while main graph remains expanded', () => {
  const host = { ...graph(), source: 'host-observation', binding: { host: 'codex', sessionId: 'session-1', runId: 'run-1' }, snapshots: [], nodes: [{ id: 'tool', attemptId: 'attempt-1', kind: 'tool', host: 'codex', status: 'started' }], edges: [] };
  const html = renderer().renderCockpit(selected(graph(), [host]), { canvas: true, selectedKey: 'task:one', tab: 'execution' });
  assert.match(html, /<details[^>]*data-host-attempt=/); assert.doesNotMatch(html, /<details[^>]*data-host-attempt=[^>]* open/);
  assert.match(html, /Host observations · Codex · attempt attempt-1/);
  assert.equal((html.match(/<section class="execution-graph"/g) || []).length, 2);
});

test('host lanes change placement in both orientations while preserving every recorded edge', () => {
  const g = graph(), before = JSON.stringify(g), ui = renderer();
  for (const direction of ['lr', 'tb']) {
    const html = ui.renderExecutionGraph(g, { canvas: true, direction });
    for (const lane of ['Controller', 'Codex', 'Claude Code']) assert.match(html, new RegExp(`Host lane: ${lane}`));
    assert.equal((html.match(/class="execution-node"/g) || []).length, 3);
    for (const edge of g.edges) assert(html.includes(`${edge.kind}: ${edge.from} to ${edge.to}`));
    assert.match(html, /Visual grouping only/);
    const positions = [...html.matchAll(/class="execution-node"[^>]*transform="translate\((\d+),(\d+)\)"/g)].map(match => [Number(match[1]), Number(match[2])]);
    assert.equal(new Set(positions.map(position => position[direction === 'lr' ? 1 : 0])).size, 3, 'each host receives a separate visual lane');
  }
  assert.equal(JSON.stringify(g), before);
});

test('node navigation leaves dependencies visible and latest button claims recorded attempt only', () => {
  const html = renderer().renderExecutionGraph(graph(), { canvas: true });
  assert.match(html, /Find graph node/); assert.match(html, /data-graph-search="find"/);
  assert.match(html, /data-graph-latest="second"[^>]*>Latest recorded attempt/);
  assert.equal((html.match(/class="execution-node"/g) || []).length, 3);
  assert.doesNotMatch(html, /data-work-action|Running now|currently running/);
});

test('page interval and diagnostic codes are escaped and bounded in host coverage', () => {
  const g = { ...graph(), source: 'host-observation', snapshots: [], observedInterval: { from: '<from>', to: '<to>' }, diagnostics: ['<gap>'] };
  const html = renderer().renderExecutionGraph(g);
  assert.match(html, /Observed interval/); assert.match(html, /&lt;from&gt;/); assert.match(html, /&lt;to&gt;/);
  assert.match(html, /Observation diagnostics/); assert.match(html, /&lt;gap&gt;/);
  assert.doesNotMatch(html, /<gap>|<from>|<to>/);
});

test('find and latest buttons focus nodes locally without requests or dependency filtering', () => {
  const handlers = new Map(), elements = new Map(); let focused = null, calls = 0;
  const nodes = ['first', 'second'].map((id, i) => ({ dataset: { graphNode: id, graphSearchText: i ? 'reviewer claude-code second' : 'writer codex first' }, focus() { focused = id; }, scrollIntoView() {} }));
  const input = { value: 'reviewer' }, feedback = { textContent: '' };
  const container = { querySelectorAll: () => nodes, querySelector: selector => selector === '[data-graph-find]' ? input : feedback };
  const doc = { getElementById(id) { if (!elements.has(id)) elements.set(id, { addEventListener(type, fn) { handlers.set(`${id}:${type}`, fn); }, textContent: '' }); return elements.get(id); }, querySelectorAll: () => [] };
  const ui = renderer({ document: doc, setInterval() {} });
  ui.bind({ project: () => 'fixture', visible: () => true, read: () => { calls++; } });
  const click = (selector, dataset) => handlers.get('work-list:click')({ target: { closest: requested => requested === selector ? { dataset, closest: () => container } : null } });
  click('[data-graph-search]', { graphSearch: 'find' }); assert.equal(focused, 'second');
  click('[data-graph-latest]', { graphLatest: 'first' }); assert.equal(focused, 'first');
  input.value = 'absent'; click('[data-graph-search]', { graphSearch: 'find' }); assert.match(feedback.textContent, /No matching/);
  assert.equal(nodes.length, 2); assert.equal(calls, 0);
  assert.doesNotThrow(() => handlers.get('work-list:click')({ target: { closest: () => ({ dataset: { workAction: 'other' } }) } }));
});

test('supplementary details survive same-project refresh and close across project changes', async () => {
  const handlers = new Map(), elements = new Map(); let workspace = null, details = [], project = 'project-a', revision = 0;
  const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const doc = { activeElement: null, querySelector: selector => selector === '[data-observation-scope]' ? workspace : null,
    querySelectorAll: selector => selector === '[data-observation-key]' ? details : [],
    getElementById(id) {
      if (!elements.has(id)) {
        const element = { textContent: '', addEventListener(type, fn) { handlers.set(`${id}:${type}`, fn); } }; let html = '';
        Object.defineProperty(element, 'innerHTML', { get() { return html; }, set(value) {
          html = value; if (id !== 'work-list') return;
          const scope = value.match(/data-observation-scope="([^"]*)"/);
          details = [...value.matchAll(/data-observation-key="([^"]*)"/g)].map(match => ({ dataset: { observationKey: decode(match[1]) }, open: false }));
          workspace = scope ? { dataset: { observationScope: decode(scope[1]) }, querySelectorAll: () => details.filter(detail => detail.open) } : null;
        } }); elements.set(id, element);
      }
      return elements.get(id);
    } };
  const host = { ...graph(), source: 'host-observation', binding: { host: 'codex', sessionId: 'same-session', runId: 'same-run' }, snapshots: [], nodes: [{ id: 'tool', attemptId: 'attempt-1', kind: 'tool', host: 'codex', status: 'started' }], edges: [] };
  const ui = renderer({ document: doc, setInterval() {} });
  ui.bind({ canvas: true, project: () => project, visible: () => true, read: async () => ({ ...selected(graph(), [host]), schemaVersion: 1, revision: String(++revision), projectId: project }) });
  await ui.refresh(); ui.navigateRoute('work/task/task%3Aone/execution');
  assert.equal(details.length, 1); assert.equal(details[0].open, false); details[0].open = true;
  await ui.refresh(); assert.equal(details[0].open, true, 'refresh retains the opened journal in the same task/project');
  project = 'project-b'; await ui.refresh(); assert.equal(details[0].open, false, 'identical record keys cannot carry expansion into another project');
});

test('missing worker provenance never assigns an attempt tool or child to Controller', () => {
  const g = { state: 'recorded', complete: false, snapshots: [], nodes: [
    { id: 'control', kind: 'transition', host: null, status: 'recorded' },
    ...['attempt', 'tool', 'child'].map(kind => ({ id: kind, kind, host: null, status: 'unknown' })),
  ], edges: [] };
  const html = renderer().renderExecutionGraph(g, { canvas: true });
  assert.match(html, /Host lane: Host not recorded/); assert.match(html, /Host lane: Controller/);
  for (const kind of ['attempt', 'tool', 'child']) {
    const node = html.match(new RegExp(`data-graph-node="${kind}"[\\s\\S]*?<\\/g>`))?.[0];
    assert(node); assert.match(node, /Host not recorded/); assert.doesNotMatch(node, />controller<|>Controller</);
  }
});
