import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./public/assets/work-view.js', import.meta.url), 'utf8');
function fixture() {
  const entries = [
    { key: 'task:a', title: 'Waiting for approval', phase: 'needs_decision' },
    { key: 'task:b', title: 'Recorded host activity', phase: 'working' },
    { key: 'task:c', title: 'Ready to start', phase: 'accepted' },
    { key: 'task:d', title: 'Accepted result', phase: 'completed', terminal: true },
  ].map(e => ({ kind: 'task', terminal: false, capabilities: [], acceptance: [], decisions: [], evidence: [], ...e }));
  return { schemaVersion: 1, revision: 'one', observedAt: 'now', health: 'current', sources: [], sessions: [], entries };
}
function harness(read = async () => fixture()) {
  const nodes = new Map(), handlers = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', addEventListener(kind, callback) { handlers.set(`${id}:${kind}`, callback); } });
    return nodes.get(id);
  };
  const context = { window: {}, document: { getElementById: node, querySelectorAll: () => [], activeElement: null }, setInterval() {} };
  vm.createContext(context); vm.runInContext(source, context);
  const view = context.window.GctoWork;
  const click = dataset => handlers.get('work-list:click')({ target: { closest: selector => {
    const field = { '[data-work-action]': 'workAction', '[data-work-select]': 'workSelect', '[data-work-filter]': 'workFilter', '[data-work-tab]': 'workTab' }[selector];
    return field && field in dataset ? { dataset } : null;
  } } });
  return { view, node, click, handlers, bind: options => view.bind({ project: () => 'project', visible: () => true, read, ...options }) };
}

test('cockpit exposes real task filters, one selected detail and accessible tabs', () => {
  const { view } = harness();
  const html = view.renderCockpit(fixture());
  for (const label of ['All active', 'Needs attention', 'Running', 'Queued', 'Completed', 'Overview', 'Execution', 'Evidence']) assert.ok(html.includes(label), label);
  assert.equal((html.match(/class="work-card"/g) || []).length, 1);
  assert.match(html, /aria-current="true"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-selected="true"/);
  assert.doesNotMatch(html, /data-work-select="task:d"/);
  assert.match(view.renderCockpit(fixture(), { category: 'completed' }), /data-work-select="task:d"/);
  assert.doesNotMatch(view.renderCockpit(fixture(), { category: 'completed' }), /data-work-select="task:a"/);
});

test('attention includes pending legacy decisions and blocked legacy issues', () => {
  const { view } = harness(), snapshot = fixture();
  snapshot.entries.push({ ...snapshot.entries[0], key:'issue:gate', kind:'issue', title:'Legacy pending decision', phase:null, nativeState:'open', decisions:[{label:'Review decision'}] });
  snapshot.entries.push({ ...snapshot.entries[0], key:'issue:blocked', kind:'issue', title:'Legacy blocker', phase:null, nativeState:'blocked', decisions:[] });
  const html=view.renderCockpit(snapshot,{category:'attention'});
  assert.match(html,/data-work-select="issue:gate"/);
  assert.match(html,/data-work-select="issue:blocked"/);
  assert.doesNotMatch(html,/data-work-select="task:b"/);
});

test('execution shows recorded observations without invented dependencies or success', () => {
  const { view } = harness(), snapshot = fixture();
  snapshot.entries[0].stage = '<build>';
  snapshot.entries[0].evidence = [{ label: '<reviewer>', verdict: 'PASS' }];
  snapshot.entries[0].inspector = { partial: true, events: [{ ts: 'now', host: 'codex', agent: '<agent>', kind: 'exit', ok: true, durationMs: 4 }] };
  const html = view.renderCockpit(snapshot, { tab: 'execution' });
  assert.match(html, /Dependencies not recorded/);
  assert.match(html, /Recorded observations/);
  assert.match(html, /&lt;reviewer&gt;/);
  assert.match(html, /&lt;agent&gt;/);
  assert.match(html, /not proof of liveness or acceptance/);
  assert.doesNotMatch(html, /<agent>|<reviewer>|Plan.*→.*Build|Verified outcome/);
});

test('selection, tab and category are local state and project reset clears all three', async () => {
  const h = harness(); h.bind(); await h.view.refresh();
  h.click({ workSelect: 'task:b' });
  assert.match(h.node('work-list').innerHTML, /data-entry-key="task:b"/);
  h.click({ workTab: 'evidence' });
  assert.match(h.node('work-list').innerHTML, /Evidence unavailable/);
  h.click({ workFilter: 'completed' });
  assert.match(h.node('work-list').innerHTML, /data-entry-key="task:d"/);
  h.view.reset(); await new Promise(resolve => setImmediate(resolve));
  assert.match(h.node('work-list').innerHTML, /data-entry-key="task:a"/);
  assert.match(h.node('work-list').innerHTML, /data-work-tab="overview"[^>]*aria-selected="true"/);
  assert.equal(h.view.getSnapshot().revision, 'one');
});

test('cockpit search and empty incomplete states do not silently invent tasks', () => {
  const { view } = harness(), snapshot = fixture();
  assert.doesNotMatch(view.renderCockpit(snapshot, { search: 'Ready to start' }), /data-work-select="task:a"/);
  assert.match(view.renderCockpit(snapshot, { category: 'queued' }), /data-work-select="task:c"/);
  snapshot.sources = [{ id: 'tasks', health: 'unavailable', reason: '<unreadable>' }];
  assert.match(view.renderCockpit(snapshot, { search: 'missing' }), /sources are incomplete/);
  assert.doesNotMatch(view.renderCockpit(snapshot, { search: 'missing' }), /<unreadable>/);
  assert.match(view.renderCockpit(snapshot, { search: 'missing' }), /Observed now/);
  assert.match(view.renderCockpit(snapshot, { search: 'missing' }), /Sources read/);
  snapshot.health = 'degraded';
  assert.match(view.renderCockpit(snapshot, { search: 'missing' }), /Sources incomplete/);
});

test('tabs support keyboard navigation and legacy history can enter Completed without new authority', async () => {
  const h = harness(); h.bind(); await h.view.refresh();
  const press = (key, workTab) => h.handlers.get('work-list:keydown')({ key, target: { closest: () => ({ dataset: { workTab } }) }, preventDefault() {} });
  press('ArrowRight', 'overview');
  assert.match(h.node('work-list').innerHTML, /data-work-tab="execution"[^>]*aria-selected="true"/);
  press('End', 'execution');
  assert.match(h.node('work-list').innerHTML, /data-work-tab="evidence"[^>]*aria-selected="true"/);
  press('Home', 'evidence');
  assert.match(h.node('work-list').innerHTML, /data-work-tab="overview"[^>]*aria-selected="true"/);
  h.view.showCompleted();
  assert.match(h.node('work-list').innerHTML, /data-entry-key="task:d"/);
});

test('late reads after reset cannot restore a prior selection or evidence panel', async () => {
  const pending = [];
  const h = harness(() => new Promise(resolve => pending.push(resolve))); h.bind();
  const first = h.view.refresh(); h.view.reset();
  pending[1](fixture()); await new Promise(resolve => setImmediate(resolve));
  h.click({ workSelect: 'task:b' }); h.click({ workTab: 'execution' });
  const stale = fixture(); stale.entries[0].title = 'Old project secret';
  pending[0](stale); await first;
  assert.doesNotMatch(h.node('work-list').innerHTML, /Old project secret/);
  assert.match(h.node('work-list').innerHTML, /Recorded observations/);
});

test('execution displays discrete retry attempts with escaped recorded state and explicit truncation', () => {
  const { view } = harness(), snapshot = fixture();
  snapshot.entries[0].execution = { state: 'recorded', topology: 'unknown', partial: true, truncated: true, nodes: [
    { runId: 'run-1', attemptId: '<first>', role: '<implementer>', host: 'codex', number: 1, phase: 'worker', status: 'rework', startedAt: 'now' },
    { runId: 'run-1', attemptId: 'second', role: '<implementer>', host: 'claude-code', number: 2, phase: 'verifying', status: 'verified', finishedAt: 'later' },
  ] };
  const html = view.renderCockpit(snapshot, { tab: 'execution' });
  assert.equal((html.match(/data-attempt-id=/g) || []).length, 2);
  assert.match(html, /&lt;first&gt;/); assert.match(html, /&lt;implementer&gt;/);
  assert.match(html, /Controller recorded status: verified/); assert.match(html, /not current verification/);
  assert.match(html, /latest 200/); assert.match(html, /Dependencies not recorded/);
  assert.doesNotMatch(html, /<first>|<implementer>|data-work-action=/);
});
