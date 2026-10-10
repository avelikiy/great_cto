import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
const context = { window: {} }; vm.createContext(context);
vm.runInContext(readFileSync(new URL('./public/assets/work-view.js', import.meta.url), 'utf8'), context);
const view = context.window.GctoWork;
test('composer preserves shell metacharacters as literal goal and requires Codex authority', () => {
  const goal = "a'b `literal` $(literal)\nsecond line";
  const command = view.commandFor(goal, 'claude-code', '');
  // Replace the executable with argv echo; no goal content executes.
  const args = JSON.parse(execFileSync('/bin/sh', ['-c', command.replace('great-cto', "python3 -c 'import json,sys; print(json.dumps(sys.argv[1:]))'")], { encoding: 'utf8' }));
  assert.deepEqual(args, ['run', '--host', 'claude-code', '--', goal]);
  assert.throws(() => view.commandFor('task', 'codex', ''), /explicit/);
  assert.throws(() => view.commandFor('task', 'codex', 'src,,docs'), /explicit/);
  assert.match(view.commandFor('task', 'codex', 'src,tests'), /--allow 'src,tests'/);
});
test('renderer escapes all content, separates absent evidence and incomplete sources', () => {
  const snapshot = { observedAt: 'today', health: 'degraded', sources: [{ id: 'codex', health: 'unavailable', reason: '<bad>' }], sessions: [], entries: [] };
  assert.match(view.render(snapshot), /Sources incomplete/);
  assert.match(view.render(snapshot), /sources are incomplete/);
  snapshot.entries.push({ key: 'issue:x', kind: 'issue', terminal: false, title: '<img onerror=evil()>', nativeState: 'open',
    updatedAt: null, capabilities: [], acceptance: [], evidence: [], decisions: [], reason: 'unlinked' });
  snapshot.entries[0].release = { url: 'javascript:alert(1)', status: 'recorded' };
  const html = view.render(snapshot);
  assert.equal(html.includes('href='), false);
  snapshot.entries[0].release.url = 'https://example.com/release';
  assert.match(view.render(snapshot), /Open release result/);
  assert.equal(html.includes('<img'), false); assert.match(html, /&lt;img/); assert.match(html, /verification is not inferred/);
});

test('late read from a previous project cannot replace the selected project', async () => {
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, { textContent: '', innerHTML: '', addEventListener() {} }); return nodes.get(id); };
  const pending = []; let selected = 'first';
  const raceContext = { window: {}, document: { getElementById: node, querySelectorAll: () => [], activeElement: null }, setInterval() {} };
  vm.createContext(raceContext); vm.runInContext(readFileSync(new URL('./public/assets/work-view.js', import.meta.url), 'utf8'), raceContext);
  const ui = raceContext.window.GctoWork;
  ui.bind({ project: () => selected, visible: () => true, read: () => new Promise(resolve => pending.push(resolve)) });
  const first = ui.refresh(); selected = 'second'; ui.reset();
  const snapshot = (revision, title) => ({ schemaVersion: 1, revision, observedAt: '', sources: [], sessions: [], health: 'current', entries: [{ key: 'issue:x', kind: 'issue', terminal: false, title, nativeState: 'open', acceptance: [], evidence: [], decisions: [], capabilities: [] }] });
  pending[1](snapshot('second', 'Selected project')); await new Promise(resolve => setImmediate(resolve));
  pending[0](snapshot('first', 'Wrong project')); await first;
  assert.match(node('work-list').innerHTML, /Selected project/);
  assert.doesNotMatch(node('work-list').innerHTML, /Wrong project/);
});

test('task cockpit escapes activity and does not treat successful process output as verified completion', () => {
  const html = view.render({ observedAt: 'now', health: 'current', sources: [], sessions: [], entries: [{
    key: 'run:one', kind: 'run', terminal: false, title: 'Feature', nativeState: 'blocked', stage: '<qa>',
    capabilities: [], acceptance: [], evidence: [], decisions: [], reason: 'timeout',
    inspector: { state: 'recorded', partial: true, lastEventAt: 'now', events: [
      { ts: 'now', kind: 'agent-stop', agent: '<script>evil()</script>', host: 'codex', ok: true, durationMs: 10 },
    ] },
  }] });
  assert.match(html, /Stage: &lt;qa&gt;/); assert.match(html, /Live activity inspector/);
  assert.match(html, /not proof of liveness or acceptance/); assert.match(html, /window is incomplete/);
  assert.doesNotMatch(html, /<script>|verified completion|success: true/);
});

test('publication command explicitly confirms only draft PR and quotes literal scope/base', () => {
  const taskId = '00000000-0000-4000-8000-000000000000';
  const command = view.publicationCommand({ taskId, revision: 3, approval: 'a'.repeat(64), base: "topic'base", allow: ['src', 'docs'] });
  const args = JSON.parse(execFileSync('/bin/sh', ['-c', command.replace('great-cto', "python3 -c 'import json,sys; print(json.dumps(sys.argv[1:]))'")], { encoding: 'utf8' }));
  assert.deepEqual(args.slice(-6), ['--base', "topic'base", '--allow', 'src,docs', '--confirm', 'publish-draft-pr']);
  assert.throws(() => view.publicationCommand({ taskId, revision: 3, approval: 'a'.repeat(64), allow: ['a,b'] }), /Invalid/);
});

test('browser publication requires exact branch and sends only one scoped confirmation', async () => {
  const nodes = new Map(), handlers = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, { textContent: '', innerHTML: '', addEventListener(kind, fn) { handlers.set(`${id}:${kind}`, fn); } }); return nodes.get(id); };
  const key = 'task:one', taskId = '00000000-0000-4000-8000-000000000000';
  const panel = { dataset: { publicationPreview: key }, isConnected: true };
  const scope = { dataset: { publicationAllow: key }, value: 'src,tests' };
  const confirm = { dataset: { publicationConfirm: key }, value: 'wrong' };
  const selectors = { '[data-publication-preview]': [panel], '[data-publication-allow]': [scope], '[data-publication-confirm]': [confirm] };
  const ctx = { window: {}, document: { getElementById: node, querySelectorAll: s => selectors[s] || [], activeElement: null }, setInterval() {} };
  vm.createContext(ctx); vm.runInContext(readFileSync(new URL('./public/assets/work-view.js', import.meta.url), 'utf8'), ctx);
  const requests = [], writes = [];
  const snapshot = { schemaVersion: 1, revision: 'one', observedAt: '', health: 'current', sources: [], sessions: [], entries: [{ key, taskId, revision: 3, terminal: false, publicationPreview: true, kind: 'task', title: 'Feature', acceptance: [], evidence: [], decisions: [], capabilities: [] }] };
  ctx.window.GctoWork.bind({ project: () => 'selected', visible: () => true,
    read: async url => { requests.push(url); return url.includes('publication-preview') ? { taskId, revision: 3, approval: 'a'.repeat(64), branch: 'topic', base: 'main', allow: ['src', 'tests'], ticket: 'one-time' } : snapshot; },
    publish: async (url, body) => { writes.push({ url, body }); return { error: 'Uncertain outcome: reconcile' }; },
  });
  await ctx.window.GctoWork.refresh();
  const click = action => { const button = { dataset: { workKey: key, workAction: action } }; handlers.get('work-list:click')({ target: { closest: () => button } }); return button; };
  click('preview_publication'); await new Promise(resolve => setImmediate(resolve));
  assert.match(requests.at(-1), /allow=src%2Ctests&project=selected/);
  click('publish_publication'); assert.equal(writes.length, 0);
  confirm.value = 'topic'; const button = click('publish_publication'); click('publish_publication');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(button.disabled, true); assert.equal(writes.length, 1);
  assert.equal(writes[0].url, '/api/work/publication?project=selected');
  assert.equal(writes[0].body.confirm, 'publish-draft-pr');
  assert.equal(writes[0].body.ticket, 'one-time');
  assert.match(node('work-feedback').textContent, /reconcile/);
  assert.doesNotMatch(node('work-feedback').textContent, /publication recorded/);
});
