// data-readers.mjs was 5% covered — the lowest file in the repo — and it is what
// four board endpoints read: the memory panel, the pipeline view, the cost
// history and the inbox. Every data-corruption bug fixed this week lived in a
// board module below 80%, so the correlation is not a coincidence worth ignoring.
//
// Two of these functions carry regression comments describing money bugs that
// already shipped: a cost regex too strict to match a single-value plan, and an
// inclusive-window off-by-one that dropped a day off the far edge. Neither had a
// test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { getMemory, getPipeline, getCostHistory, getInbox } = await import('./lib/data-readers.mjs');

function project({ files = {}, plans = {}, verdicts = {}, tasks = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-dr-'));
  fs.mkdirSync(path.join(dir, '.great_cto', 'verdicts'), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, '.great_cto', name), body);
  }
  if (tasks !== null) fs.writeFileSync(path.join(dir, '.great_cto', 'tasks.md'), tasks);
  for (const [agent, body] of Object.entries(verdicts)) {
    fs.writeFileSync(path.join(dir, '.great_cto', 'verdicts', `${agent}.log`), body);
  }
  if (Object.keys(plans).length) {
    fs.mkdirSync(path.join(dir, 'docs', 'plans'), { recursive: true });
    for (const [name, body] of Object.entries(plans)) {
      fs.writeFileSync(path.join(dir, 'docs', 'plans', name), body);
    }
  }
  return dir;
}
const clean = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} };
const today = () => new Date().toISOString().slice(0, 10);

// ── getMemory ──────────────────────────────────────────────────────────────

test('every memory layer is listed whether or not the file is there', () => {
  const dir = project({ files: { 'PROJECT.md': 'archetype: cli-tool\n' } });
  try {
    const m = getMemory(dir);
    assert.ok(Array.isArray(m) || typeof m === 'object');
    const rows = Array.isArray(m) ? m : m.layers ?? [];
    assert.ok(rows.length >= 8, 'a layer missing from the list is a layer nobody can see is empty');
    const project_md = rows.find((r) => r.id === 'project');
    assert.equal(project_md.exists, true);
    assert.match(project_md.content, /cli-tool/);
  } finally { clean(dir); }
});

test('an absent memory file is reported as absent, not as empty content', () => {
  const dir = project();
  try {
    const rows = getMemory(dir);
    const list = Array.isArray(rows) ? rows : rows.layers ?? [];
    const brain = list.find((r) => r.id === 'brain');
    assert.equal(brain.exists, false, 'exists is the field that distinguishes "no file" from "empty file"');
  } finally { clean(dir); }
});

// ── getCostHistory ─────────────────────────────────────────────────────────

test('the window is inclusive on both ends', () => {
  // days=30 means [today-30 … today] = 31 buckets. The previous behaviour
  // created a one-day gap at the far edge and dropped valid data out of the
  // history while the user still called it "the last 30 days".
  const dir = project();
  try {
    assert.equal(getCostHistory(dir, 30).series.length, 31);
    assert.equal(getCostHistory(dir, 7).series.length, 8);
    assert.equal(getCostHistory(dir, 5).series.length, 6);
  } finally { clean(dir); }
});

test('buckets are dated and ordered, one per day', () => {
  const dir = project();
  try {
    const h = getCostHistory(dir, 5).series;
    const dates = h.map((b) => b.date);
    assert.deepEqual([...dates].sort(), dates, 'a chart reading an unordered series draws nonsense');
    assert.equal(new Set(dates).size, dates.length, 'one bucket per day');
    assert.ok(dates.includes(today()));
  } finally { clean(dir); }
});

test('a single-value plan cost is counted — a range is not required', () => {
  // The regression the comment in this function records: agents write
  // "LLM: ~$0.30" as often as "LLM: 5–10 min · $0.30–$2.00", and the strict
  // regex returned zero for the first form while human cost stayed present.
  const dir = project({ plans: { 'PLAN-a.md': '# Plan\n\nLLM: ~$0.30\nHuman: $1,200\n' } });
  try {
    const total = getCostHistory(dir, 30).series.reduce((s, b) => s + b.llm, 0);
    assert.ok(total > 0, 'a plan with a cost must contribute one');
    assert.equal(Math.round(total * 100) / 100, 0.3);
  } finally { clean(dir); }
});

test('a plan with no cost lines contributes nothing rather than NaN', () => {
  const dir = project({ plans: { 'PLAN-b.md': '# Plan\n\nJust prose.\n' } });
  try {
    for (const b of getCostHistory(dir, 5).series) {
      assert.ok(Number.isFinite(b.llm) && Number.isFinite(b.human), 'a NaN reaches the chart as a blank day');
    }
  } finally { clean(dir); }
});

test('no plans and no verdicts still yields a full, zeroed series', () => {
  const dir = project();
  try {
    const h = getCostHistory(dir, 10).series;
    assert.equal(h.length, 11);
    assert.ok(h.every((b) => b.llm === 0 && b.human === 0), 'zero is a measurement; a gap is not');
  } finally { clean(dir); }
});

// ── getInbox ───────────────────────────────────────────────────────────────

test('a closed gate leaves the inbox', () => {
  // Filtering on the MAPPED status would leave closed gates in the inbox
  // forever, because mapStatus rewrites any gate-labelled task to 'gate'.
  const dir = project({ tasks: `| id | title | status | owner |
|--|--|--|--|
| GATE-arch | gate:arch — review | closed | CTO |
| GATE-ship | gate:ship — release | open | CTO |
` });
  try {
    const ids = getInbox(dir).pending_gates.map((g) => g.id);
    assert.deepEqual(ids, ['GATE-ship'], 'an approved gate that never leaves is an inbox nobody trusts');
  } finally { clean(dir); }
});

// A gate marked `blocked` in tasks.md carried raw_status 'open' and never left
// the inbox. The comment in getInbox says the filter uses raw_status precisely so
// closed gates do not linger — that reasoning covered `done` and missed
// `blocked`, for exactly the bd-less projects the tasks.md parser exists to serve.
test('a blocked gate also leaves the inbox', () => {
  const dir = project({ tasks: `| id | title | status | owner |
|--|--|--|--|
| GATE-arch | gate:arch — review | blocked | CTO |
` });
  try {
    assert.deepEqual(getInbox(dir).pending_gates, []);
  } finally { clean(dir); }
});

test('an empty project yields empty lists, never undefined', () => {
  const dir = project();
  try {
    const inbox = getInbox(dir);
    for (const k of ['pending_gates', 'blocked']) {
      assert.ok(Array.isArray(inbox[k]), `${k} must be a list — a caller mapping over undefined crashes the panel`);
    }
  } finally { clean(dir); }
});

// ── getPipeline ────────────────────────────────────────────────────────────

test('a stage with no verdict is reported as idle, not omitted', () => {
  const dir = project({ verdicts: { architect: `${today()}T10:00:00Z APPROVED ok cost=$0.10\n` } });
  try {
    const stages = getPipeline(dir);
    assert.ok(Array.isArray(stages) && stages.length > 1,
      'omitting a stage that never ran hides the fact that it never ran');
    const arch = stages.find((s) => /architect/i.test(s.stage ?? s.agent ?? ''));
    assert.ok(arch, 'the stage that did run is present');
  } finally { clean(dir); }
});

test('a pipeline with no verdicts at all still lists its stages', () => {
  const dir = project();
  try {
    assert.ok(getPipeline(dir).length > 0);
  } finally { clean(dir); }
});

// Two counts of one concept, on one screen, disagreeing over a single word.
//
// `getInbox` excludes blocked gates from pending_gates — deliberately, and the
// test above pins it. `getPipeline` excluded only done/closed, so the gate the
// Inbox tile reported as 0 PENDING DECISIONS was announced by the rail beside it
// as 1 GATE AWAITING SIGNATURE. Both numbers were computed correctly; they were
// answers to different questions wearing the same label.
test('a blocked gate is shown as blocked, not as awaiting a signature', () => {
  const dir = project({ tasks: `| id | title | status | owner |
|--|--|--|--|
| GATE-plan | gate:plan — review | blocked | CTO |
` });
  try {
    const gate = getPipeline(dir).find((s) => s.is_human_gate);
    assert.ok(gate, 'the human gate is always a stage, even with nothing pending');
    assert.equal(gate.pending, 0, 'nobody can sign a blocked gate');
    assert.equal(gate.blocked, 1, 'and it has not gone away either');
    assert.match(gate.last_message, /blocked/);
    assert.doesNotMatch(gate.last_message, /awaiting signature/);
    assert.equal(gate.status, 'blocked', 'active means somebody can act on it now');

    // The two surfaces now agree about this task.
    assert.deepEqual(getInbox(dir).pending_gates, []);
  } finally { clean(dir); }
});

test('a gate that really is awaiting still reads as awaiting', () => {
  const dir = project({ tasks: `| id | title | status | owner |
|--|--|--|--|
| GATE-ship | gate:ship — release | open | CTO |
` });
  try {
    const gate = getPipeline(dir).find((s) => s.is_human_gate);
    assert.equal(gate.pending, 1);
    assert.equal(gate.blocked, 0);
    assert.equal(gate.status, 'active');
    assert.match(gate.last_message, /awaiting signature/);
  } finally { clean(dir); }
});
