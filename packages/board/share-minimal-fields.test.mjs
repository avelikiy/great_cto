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
import { generateShareHTML, shareTask, SHARE_TASK_FIELDS, shareMetrics } from './lib/share.mjs';

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
  const html = generateShareHTML([full({ title })], { tasks: { done: 1 }, agents_cost: [{ agent: '</script>', tasks_total: 1 }] }, project());
  const dataBlock = html.slice(html.indexOf('const metrics ='), html.indexOf('function esc('));
  assert.doesNotMatch(dataBlock, /<\/script/i, 'a closing tag inside the data would end the script');
  const { tasks, metrics } = embedded(html);
  assert.equal(tasks[0].title, title, 'and the value still arrives intact');
  assert.equal(metrics.agents_cost[0].agent, '</script>');
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

// Reported by review on PR 275: getMetrics returns recent_done (full records of the
// last ten completed tasks) and the report embedded the metrics object unchanged, so
// the task allowlist above was bypassed. Verdicts and server counters went out too.
const metricsLike = () => ({
  window_days: 30,
  tasks: { total: 9, done: 4, done_in_window: 3, in_progress: 2, backlog: 3 },
  velocity: { last_7d: 2, last_30d: 4, this_week: 2, this_month: 4 },
  cost: { llm_usd: 1.5, human_usd: 600, savings_x: 400, real_llm_usd: 1.2, count: 3, source: 'verdicts', note: 'PRIVATE-COST-NOTE' },
  qa: { pass_rate: 90, passed: 9, failed: 1, last_report: 'PRIVATE-QA-PATH' },
  security: { approved: 2, blocked: 0, findings: ['PRIVATE-FINDING'] },
  agents: { 'senior-dev': 5, qa: 2 },
  agents_cost: [{ agent: 'senior-dev', tasks_total: 3, tasks_done: 2, time_min: 40, llm_usd: 1, human_usd: 400, tasks: ['PRIVATE-AGENT-TASK'] }],
  verdicts: [{ agent: 'qa', task: 'GC-42', summary: 'PRIVATE-VERDICT' }],
  recent_done: [full()],
  server: { sse_clients: 1, bd_cache_entries: 7 },
});

test('the published page does not carry recent_done, verdicts or other unshown metrics', () => {
  const html = generateShareHTML([full()], metricsLike(), project());
  for (const s of ['PRIVATE-DESCRIPTION', 'PRIVATE-NOTES', 'PRIVATE-ASSIGNEE', 'PRIVATE-VERDICT',
    'PRIVATE-COST-NOTE', 'PRIVATE-QA-PATH', 'PRIVATE-FINDING', 'PRIVATE-AGENT-TASK', 'bd_cache_entries']) {
    assert.ok(!html.includes(s), `${s} is not in the published page`);
  }
});

test('the numbers the page draws still arrive', () => {
  // JSON round trip: objects from the vm context have another realm's prototypes.
  const m = JSON.parse(JSON.stringify(embedded(generateShareHTML([full()], metricsLike(), project())).metrics));
  assert.deepEqual(m.tasks, { total: 9, done: 4, in_progress: 2, backlog: 3 });
  assert.equal(m.velocity.this_week, 2);
  assert.deepEqual(m.cost, { llm_usd: 1.5, human_usd: 600, savings_x: 400, real_llm_usd: 1.2, count: 3, source: 'verdicts' });
  assert.deepEqual(m.qa, { pass_rate: 90, passed: 9, failed: 1 });
  assert.deepEqual(m.security, { approved: 2, blocked: 0 });
  assert.deepEqual(m.agents, { 'senior-dev': 5, qa: 2 });
  assert.deepEqual(m.agents_cost, [{ agent: 'senior-dev', tasks_total: 3, tasks_done: 2, time_min: 40, llm_usd: 1, human_usd: 400 }]);
});

test('missing or malformed metrics do not break the page data', () => {
  assert.deepEqual(shareMetrics(null), { tasks: {}, velocity: {}, cost: {}, qa: {}, security: {}, agents: {}, agents_cost: [] });
  const bad = shareMetrics({ tasks: { done: 'many' }, agents: { x: 'y' }, agents_cost: [{ llm_usd: 'free' }] });
  assert.deepEqual(bad.tasks, {});
  assert.deepEqual(bad.agents, {});
  assert.equal(bad.agents_cost[0].llm_usd, 0, 'the page sums these; a string would print NaN');
});
