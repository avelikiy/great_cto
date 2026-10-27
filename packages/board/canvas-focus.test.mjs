import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('./public/assets/work-view.js', import.meta.url), 'utf8');
function fixture(revision = 'one') {
  const entry = (key, title, terminal = false) => ({ key, title, terminal, kind: 'task', phase: terminal ? 'completed' : 'needs_decision', capabilities: [], acceptance: [], decisions: [], evidence: [], execution: { partial: true, nodes: [], graph: null } });
  return { schemaVersion: 1, revision, observedAt: 'now', health: 'current', sources: [], sessions: [], entries: [entry('task:one', 'First task'), entry('task:done', 'Done task', true)] };
}
function harness(read = async () => fixture()) {
  const nodes = new Map(), handlers = new Map(), routes = [], views = [];
  const node = id => { if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', scrollTop: 0, addEventListener(kind, fn) { handlers.set(`${id}:${kind}`, fn); }, focus() {} }); return nodes.get(id); };
  const context = { window: {}, URLSearchParams, document: { getElementById: node, querySelectorAll: () => [], activeElement: null }, setInterval() {} };
  vm.createContext(context); vm.runInContext(source, context);
  const ui = context.window.GctoWork; let project = 'project-a';
  ui.bind({ canvas: true, project: () => project, visible: () => true, read, navigate: route => routes.push(route), onViewChange: view => views.push(view) });
  const click = dataset => handlers.get('work-list:click')({ target: { closest: selector => {
    const field = { '[data-work-select]': 'workSelect', '[data-work-filter]': 'workFilter', '[data-work-tab]': 'workTab', '[data-work-back]': 'workBack' }[selector];
    return field && field in dataset ? { dataset } : null;
  } } });
  return { ui, node, routes, views, click, setProject(value) { project = value; } };
}
test('canvas routes safely round-trip encoded keys and list filters without side effects', () => {
  const { ui, routes } = harness();
  const r = ui.parseRoute('work/task/task%3Aone/execution?category=attention&search=retry%20checkout');
  assert.equal(r.selectedKey, 'task:one'); assert.equal(r.tab, 'execution'); assert.equal(r.category, 'attention'); assert.equal(r.search, 'retry checkout');
  assert.equal(r.canonical, 'work/task/task%3Aone/execution?category=attention&search=retry+checkout');
  for (const value of ['work/task/%/execution', 'work/task/a/delete', 'work?category=active&category=completed', 'work?unknown=x', `work?search=${'x'.repeat(1001)}`, 'work/task/a%00b/execution']) assert.equal(ui.parseRoute(value), null, value.slice(0, 80));
  assert.equal(ui.parseRoute('work/completed').category, 'completed'); assert.equal(routes.length, 0);
});
test('canvas Work shows a full task list without silently opening a detail or mutation controls', () => {
  const { ui } = harness(); const html = ui.renderCockpit(fixture(), { canvas: true });
  assert.match(html, /data-work-select="task:one"/); assert.doesNotMatch(html, /work-detail-panel|data-work-action|work-cockpit/);
});
test('explicit detail resolves across list filters and missing selection never substitutes another task', () => {
  const { ui } = harness();
  const html = ui.renderCockpit(fixture(), { canvas: true, selectedKey: 'task:done', category: 'attention', search: 'unmatched', tab: 'execution' });
  assert.match(html, /Done task/); assert.match(html, /Attempt observations are incomplete/); assert.doesNotMatch(html, /data-work-action|work-task-list/);
  const missing = ui.renderCockpit(fixture(), { canvas: true, selectedKey: 'task:missing' });
  assert.match(missing, /Selected task is unavailable/); assert.doesNotMatch(missing, /First task|data-entry-key="task:one"/);
});
test('canvas graph lays out the same recorded dependencies left to right and retains unavailable warnings', () => {
  const { ui } = harness();
  const html = ui.renderExecutionGraph({ state: 'recorded', complete: false, nodes: [{ id: 'a', kind: 'attempt', status: 'intent' }, { id: 'b', kind: 'verifier', status: 'recorded' }], edges: [{ from: 'a', to: 'b', kind: 'verification' }] }, { canvas: true });
  assert.match(html, /translate\(24,24\)/); assert.match(html, /translate\(296,24\)/); assert.match(html, /verification: a to b/); assert.match(html, /Partial history/); assert.match(html, /data-graph-scale="fit"/);
  assert.match(html, /Recorded node details/); assert.doesNotMatch(html, /data-work-action/);
});
test('navigation replay does not push history and user task/tab/back transitions preserve list state', async () => {
  const h = harness(); await h.ui.refresh();
  h.ui.navigateRoute('work?category=attention&search=First'); assert.equal(h.routes.length, 0);
  h.click({ workSelect: 'task:one' }); assert.match(h.routes.at(-1), /^work\/task\/task%3Aone\/overview\?category=attention&search=First$/);
  h.click({ workTab: 'execution' }); assert.match(h.routes.at(-1), /\/execution\?/); assert.equal(h.views.at(-1).detail, true);
  h.click({ workBack: '' }); assert.equal(h.routes.at(-1), 'work?category=attention&search=First'); assert.equal(h.views.at(-1).detail, false);
});
test('project URL scope change invalidates prior snapshot before navigation and reset clears detail', async () => {
  const h = harness(); await h.ui.refresh(); h.ui.navigateRoute('work/task/task%3Aone/execution');
  h.setProject('project-b'); h.ui.navigateRoute('work/task/task%3Aone/execution');
  assert.doesNotMatch(h.node('work-list').innerHTML, /First task/);
  h.ui.reset(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.views.at(-1).detail, false); assert.match(h.node('work-list').innerHTML, /data-work-select="task:one"/);
});
test('canvas run headers keep generated UUIDs secondary without losing technical identity', () => {
  const { ui } = harness(), data = fixture(), id = '12345678-abcd-4321-9876-123456789abc';
  data.entries[0].key = `run:${id}`; data.entries[0].title = `Controlled run ${id}`; data.entries[0].kind = 'run';
  const html = ui.renderCockpit(data, { canvas: true, selectedKey: `run:${id}`, tab: 'execution' });
  assert.match(html, /<h2>Controlled run <small[^>]*>12345678<\/small><\/h2>/);
  assert.doesNotMatch(html.match(/<header class="work-task-header">[\s\S]*?<\/header>/)[0], new RegExp(id));
  const overview = ui.renderCockpit(data, { canvas: true, selectedKey: `run:${id}`, tab: 'overview' });
  assert.match(overview, new RegExp(`run:${id}`));
});
test('canvas graph orientation changes geometry only and long node labels retain accessible details', () => {
  const { ui } = harness(), graph = { state: 'recorded', complete: true, nodes: [{ id: 'a', kind: 'a-very-long-controller-transition-kind', role: 'writer', status: 'an-extremely-long-recorded-status' }, { id: 'b', kind: 'verifier', status: 'recorded' }], edges: [{ from: 'a', to: 'b', kind: 'verification' }] };
  const lr = ui.renderExecutionGraph(graph, { canvas: true }), tb = ui.renderExecutionGraph(graph, { canvas: true, direction: 'tb' });
  assert.match(lr, /data-graph-direction="tb"/); assert.match(tb, /translate\(24,136\)/);
  assert.equal((lr.match(/class="execution-node"/g) || []).length, 2); assert.equal((tb.match(/class="execution-node"/g) || []).length, 2);
  assert.match(tb, /verification: a to b/); assert.match(lr, /<title>a-very-long-controller-transition-kind · writer · an-extremely-long-recorded-status<\/title>/);
  assert.doesNotMatch(lr, /<text x="12" y="45">a-very-long-controller-transition-kind/);
});
function dialogHarness() {
  const nodes = new Map(), handlers = new Map(), docHandlers = new Map(), dialogs = [];
  let project = 'project-a', revision = 0, switcher = null, graphNode = null, graphDetail = null, focused = null;
  const focusable = dataset => ({ dataset, isConnected: true, focus() { focused = this; }, closest(selector) { return selector === '[data-graph-node]' && this.dataset.graphNode ? this : selector === '[data-work-switch]' && 'workSwitch' in this.dataset ? this : null; } });
  const node = id => {
    if (!nodes.has(id)) {
      const n = { textContent: '', addEventListener(kind, fn) { handlers.set(`${id}:${kind}`, fn); } }; let html = '';
      Object.defineProperty(n, 'innerHTML', { get() { return html; }, set(value) {
        html = value;
        if (id !== 'work-list') return;
        if (switcher) switcher.isConnected = false;
        if (graphNode) graphNode.isConnected = false;
        switcher = value.includes('data-work-switch') ? focusable({ workSwitch: '' }) : null;
        graphNode = value.includes('data-graph-node="a"') ? focusable({ graphNode: 'a' }) : null;
        graphDetail = graphNode ? { dataset: { graphDetail: 'a' }, open: false, outerHTML: '<details data-graph-detail="a"><summary>Recorded node</summary></details>' } : null;
      } }); nodes.set(id, n);
    }
    return nodes.get(id);
  };
  const document = {
    getElementById: node, get activeElement() { return focused; }, querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === '[data-work-switch]') return switcher ? [switcher] : [];
      if (selector === '[data-graph-node]') return graphNode ? [graphNode] : [];
      if (selector === '[data-graph-detail]') return graphDetail ? [graphDetail] : [];
      return [];
    },
    addEventListener(kind, fn) { docHandlers.set(kind, fn); }, removeEventListener(kind, fn) { if (docHandlers.get(kind) === fn) docHandlers.delete(kind); },
    body: { append(dialog) { dialogs.push(dialog); } },
    createElement() {
      const listeners = new Map(), input = focusable({}); input.addEventListener = () => {};
      return { open: false, innerHTML: '', setAttribute() {}, addEventListener(kind, fn) { listeners.set(kind, fn); }, querySelector() { return input; }, querySelectorAll() { return []; },
        show() { this.open = true; }, showModal() { this.open = true; }, close() { this.open = false; listeners.get('close')?.(); }, remove() { dialogs.splice(dialogs.indexOf(this), 1); } };
    },
  };
  const context = { window: {}, document, URLSearchParams, setInterval() {} }; vm.createContext(context); vm.runInContext(source, context);
  const ui = context.window.GctoWork;
  ui.bind({ canvas: true, project: () => project, visible: () => true, read: async () => { const data = fixture(String(++revision)); data.entries[0].execution.graph = { state: 'recorded', complete: true, nodes: [{ id: 'a', kind: 'attempt', status: 'intent' }], edges: [] }; return data; } });
  return { ui, dialogs, switcher: () => switcher, graphNode: () => graphNode, focused: () => focused, setProject(value) { project = value; },
    openSwitcher() { handlers.get('work-list:click')({ target: { closest: selector => selector === '[data-work-switch]' ? switcher : null } }); },
    openNode() { handlers.get('work-list:click')({ target: { closest: selector => selector === '[data-graph-node]' ? graphNode : null } }); },
    escape() { docHandlers.get('keydown')?.({ key: 'Escape', preventDefault() {}, stopPropagation() {} }); },
  };
}
test('leaving Work closes body-mounted dialogs and removes their Escape listener', async () => {
  const h = dialogHarness(); await h.ui.refresh(); h.ui.navigateRoute('work/task/task%3Aone/execution'); h.openNode();
  assert.equal(h.dialogs.length, 1); h.ui.leaveView(); assert.equal(h.dialogs.length, 0);
  h.escape(); assert.equal(h.dialogs.length, 0);
});
test('Escape restores the equivalent picker or graph opener after a deferred refresh replaces DOM', async () => {
  for (const kind of ['switcher', 'node']) {
    const h = dialogHarness(); await h.ui.refresh(); h.ui.navigateRoute('work/task/task%3Aone/execution');
    const original = kind === 'switcher' ? h.switcher() : h.graphNode();
    if (kind === 'switcher') h.openSwitcher(); else h.openNode();
    await h.ui.refresh(); assert.equal(h.dialogs.length, 1); h.escape();
    const replacement = kind === 'switcher' ? h.switcher() : h.graphNode();
    assert.notEqual(replacement, original); assert.equal(original.isConnected, false); assert.equal(h.focused(), replacement); assert.equal(h.dialogs.length, 0);
  }
});
test('dialog focus restoration never jumps to an identically keyed node in another project', async () => {
  const h = dialogHarness(); await h.ui.refresh(); h.ui.navigateRoute('work/task/task%3Aone/execution'); h.openNode();
  h.setProject('project-b'); await h.ui.refresh(); h.escape();
  assert.notEqual(h.focused(), h.graphNode()); assert.equal(h.dialogs.length, 0);
});
