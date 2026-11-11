// A published share report carries only what the page shows.
//
// The report is public to anyone with the link. It used to embed the full records
// of the last 20 completed tasks — descriptions, notes, design text, assignee —
// although the page reads eight fields. Whatever a completed task's text held was
// in the published page source.
//
// The same substitution also pasted task text into a <script> block unescaped, so
// a title containing `</script>` ended the script, and `$&` in any value was
// rewritten by String.replace.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { generateShareHTML, shareTask, SHARE_TASK_FIELDS } from './lib/share.mjs';

const TMP = [];
after(() => { for (const d of TMP) rmSync(d, { recursive: true, force: true }); });
function project(name = 'demo-project') {
  const root = mkdtempSync(join(tmpdir(), 'gcto-share-')); TMP.push(root);
  const dir = join(root, name);
  mkdirSync(join(dir, '.great_cto'), { recursive: true });
  writeFileSync(join(dir, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');
  return dir;
}

const full = (over = {}) => ({
  id: 'GC-42', title: 'Ship the export', status: 'closed', priority: 1, labels: ['infra'],
  created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-02T10:00:00Z', closed_at: '2026-11-02T10:00:00Z',
  close_reason: 'done',
  description: 'PRIVATE-DESCRIPTION customer list lives in bucket x',
  notes: 'PRIVATE-NOTES', design: 'PRIVATE-DESIGN', acceptance_criteria: 'PRIVATE-ACCEPTANCE',
  assignee: 'PRIVATE-ASSIGNEE', owner: 'PRIVATE-OWNER', comments: [{ text: 'PRIVATE-COMMENT' }],
  ...over,
});

/** The values the page's script would see, by running only its data block. */
function embedded(html) {
  const start = html.indexOf('const metrics =');
  const end = html.indexOf('function esc(');
  assert.ok(start > -1 && end > start, 'the data block is where the template puts it');
  const ctx = {};
  vm.runInNewContext(`${html.slice(start, end).replace(/\bconst /g, 'var ')}`, ctx);
  return ctx;
}

test('a shared task keeps the fields the page reads and nothing else', () => {
  const t = shareTask(full());
  assert.deepEqual(Object.keys(t).sort(), [...SHARE_TASK_FIELDS].sort());
  assert.equal(t.title, 'Ship the export');
  assert.deepEqual(t.labels, ['infra']);
});

test('a long close reason is cut to what the page prints', () => {
  const t = shareTask(full({ close_reason: 'x'.repeat(500) }));
  assert.ok(t.close_reason.length <= 71, 'the page shows 70 characters and an ellipsis');
});

test('fields of the wrong shape do not travel', () => {
  const t = shareTask(full({ labels: 'PRIVATE-NOT-A-LIST', title: { nested: 'PRIVATE-OBJECT' }, priority: 'PRIVATE-PRIO' }));
  assert.doesNotMatch(JSON.stringify(t), /PRIVATE/);
});

test('the published page does not contain a completed task’s private text', () => {
  const html = generateShareHTML([full(), full({ id: 'GC-43', status: 'done' })], { tasks: { done: 2 } }, project());
  assert.doesNotMatch(html, /PRIVATE-/, 'description, notes, design, assignee and comments stay on the machine');
  assert.match(html, /Ship the export/);
  const { tasks } = embedded(html);
  assert.equal(tasks.length, 2);
  assert.deepEqual(Object.keys(tasks[0]).sort(), [...SHARE_TASK_FIELDS].sort());
});

test('task text cannot end the script block or be rewritten by the substitution', () => {
  const title = 'a </script><script>window.pwned=1</script> b $& $1 $\' c';
  const html = generateShareHTML([full({ title })], { tasks: { done: 1 }, note: '</script>' }, project());
  const dataBlock = html.slice(html.indexOf('const metrics ='), html.indexOf('function esc('));
  assert.doesNotMatch(dataBlock, /<\/script/i, 'a closing tag inside the data would end the script');
  const { tasks, metrics } = embedded(html);
  assert.equal(tasks[0].title, title, 'and the value still arrives intact');
  assert.equal(metrics.note, '</script>');
});

test('a project name cannot break out of the title, an attribute or the script string', () => {
  const html = generateShareHTML([full()], { tasks: { done: 1 } }, project(`x'-"-<b>-$&`));
  const { project: name } = embedded(html);
  assert.equal(name, 'x--b-');
  assert.match(html, /<title>x--b- · Engineering Report/);
});

test('open tasks are not published at all', () => {
  const html = generateShareHTML([full({ status: 'open', title: 'PRIVATE-OPEN-TITLE' }), full()], { tasks: { done: 1 } }, project());
  assert.doesNotMatch(html, /PRIVATE-OPEN-TITLE/);
});
