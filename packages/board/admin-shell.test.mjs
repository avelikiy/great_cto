import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function module(name, key) {
  const context = { window: {} }; vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL(`./public/assets/${name}.js`, import.meta.url), 'utf8'), context);
  return context.window[key];
}
test('legacy links resolve into five destinations without losing technical panels', () => {
  const ui = module('admin-shell', 'GctoAdmin');
  for (const [input, route, panel] of [['docs','knowledge','knowledge'], ['usage','insights/consumption','usage'], ['ledger','insights/ledger','budgets'], ['fleet','settings/executors','agents'], ['harness','settings/runtime','harness'], ['skills','settings/capabilities','skills'], ['history','work/completed','history']]) {
    assert.equal(ui.route(input).canonical, route); assert.equal(ui.route(input).panel, panel);
  }
  assert.equal(ui.route('settings').primary, 'settings');
  assert.equal(ui.route('kanban'), null);
});
test('outcomes never count closed issues or successful processes as accepted tasks', () => {
  const ui = module('admin-shell', 'GctoAdmin');
  const d = ui.outcomes({ entries: [
    {kind:'issue', terminal:true,nativeState:'closed'}, {kind:'run',terminal:true,nativeState:'done'},
    {kind:'task',taskId:'1',phase:'completed',taskOutcome:{state:'completed'}},
    {kind:'task',taskId:'2',phase:'working'},
  ]});
  assert.equal(d.tasks,2);assert.equal(d.completed,1);assert.equal(d.unknown,1);
  assert.equal(d.acceptanceRate,null);assert.equal(d.costPerAcceptedTask,null);
});
test('bounded flowchart renderer supports declared edges and escapes labels', () => {
  const diagrams = module('diagram-view','GctoDiagram');
  const output = diagrams.render('flowchart LR\n A[Controller] --> B[Codex]\n A --> C[Claude Code]');
  assert.equal(output.state,'rendered');assert.match(output.html,/Controller/);assert.match(output.html,/Declared diagram/);
  assert.equal(diagrams.render('flowchart LR\n click A "javascript:evil()"').state,'unsupported');
  assert.equal(diagrams.render('sequenceDiagram\n A->>B: hi').state,'unsupported');
  assert.equal(diagrams.render('flowchart TD\n A --> B').state,'unsupported');
  assert.equal(diagrams.render('flowchart LR\n A --> B\n B --> A').state,'unsupported');
  assert.equal(diagrams.render('x'.repeat(20001)).state,'unsupported');
  assert.doesNotMatch(diagrams.render('flowchart LR\n A[<script>bad</script>] --> B').html,/<script>/);
});
