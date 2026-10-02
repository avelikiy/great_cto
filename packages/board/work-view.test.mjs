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
