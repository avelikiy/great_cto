// Fix B: parseTasksMd must understand the Markdown *table* format the pipeline
// falls back to when beads (embedded-dolt) can't open a path with a space —
// not just the older `- [ ] TASK-001: …` checkbox format. Without this the
// admin board shows an empty task list (and, downstream, empty docs) for any
// project living on a space-containing path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTasksMd } from './lib/beads.mjs';

function withTasksMd(body) {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-tasksmd-'));
  mkdirSync(join(dir, '.great_cto'), { recursive: true });
  writeFileSync(join(dir, '.great_cto', 'tasks.md'), body);
  return dir;
}

// Synthetic fixture — generic app tasks only. Do NOT mirror any real project's
// task IDs or titles here (this file ships in the public repo).
const TABLE = `# Tasks

> ⚠️ Beads unavailable — embedded-dolt cannot open a path with a space. Falling back to this file.

| id | title | status | owner |
|----|-------|--------|-------|
| GATE-arch | **gate:arch — architecture review** \`[APPROVED by CTO 2026-01-02]\` | closed | CTO |
| AUTH-01 | Add email/password login | done | senior-dev |
| API-EXPORT | CSV export endpoint | in_progress | senior-dev |
| UI-42 | Dark mode toggle | open | senior-dev |
`;

test('table format: parses every data row', () => {
  const dir = withTasksMd(TABLE);
  try {
    const tasks = parseTasksMd(dir);
    assert.equal(tasks.length, 4, 'all 4 rows parsed');
    const ids = tasks.map(t => t.id);
    assert.deepEqual(ids, ['GATE-arch', 'AUTH-01', 'API-EXPORT', 'UI-42']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('table format: status + gate + owner mapping', () => {
  const dir = withTasksMd(TABLE);
  try {
    const by = Object.fromEntries(parseTasksMd(dir).map(t => [t.id, t]));
    assert.equal(by['GATE-arch'].status, 'done');       // closed → done
    assert.equal(by['GATE-arch'].is_gate, true);        // GATE-* / gate: → gate
    assert.equal(by['AUTH-01'].status, 'done');         // done → done
    assert.equal(by['AUTH-01'].owner, 'senior-dev');
    assert.equal(by['API-EXPORT'].status, 'in_progress');
    assert.equal(by['UI-42'].status, 'backlog');        // open → backlog
    assert.equal(by['UI-42'].owner, 'senior-dev');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('table format: strips bold, lifts trailing note into description', () => {
  const dir = withTasksMd(TABLE);
  try {
    const g = parseTasksMd(dir).find(t => t.id === 'GATE-arch');
    assert.ok(!g.title.includes('**'), 'bold markers stripped');
    assert.ok(g.title.startsWith('gate:arch'), 'title kept');
    assert.ok(/APPROVED by CTO/.test(g.description), 'trailing note moved to description');
    assert.ok(!g.title.includes('APPROVED'), 'note not left in title');
    assert.equal(g.source, 'tasks.md');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('table format: checkbox and table are mutually exclusive dialects', () => {
  // A file with checkbox tasks must NOT also pick up an unrelated pipe table.
  const dir = withTasksMd('- [ ] TASK-9: only this\n\n| id | title | status |\n|--|--|--|\n| X-1 | leak | open |\n');
  try {
    const ids = parseTasksMd(dir).map(t => t.id);
    assert.deepEqual(ids, ['TASK-9'], 'checkbox wins; table not double-parsed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('checkbox format still parses (regression)', () => {
  const dir = withTasksMd('- [ ] TASK-001: Do the thing [senior-dev] [~42min]\n  Description here\n- [x] TASK-002: Done item [qa-engineer]\n');
  try {
    const tasks = parseTasksMd(dir);
    assert.equal(tasks.length, 2);
    assert.equal(tasks[0].id, 'TASK-001');
    assert.equal(tasks[0].status, 'backlog');
    assert.equal(tasks[1].status, 'done');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('escaped pipes in a cell do not shift columns', () => {
  // `\|` inside a title cell must NOT split into extra columns — that used to
  // shove `open`/`1m\` into the owner slot and break the filter chips.
  const body = `| id | title | status | owner |
|----|-------|--------|-------|
| API-11 | GET /equity?range=1d\\|1w\\|1m\\|all \`[done]\` | done | senior-dev |
`;
  const dir = withTasksMd(body);
  try {
    const t = parseTasksMd(dir);
    assert.equal(t.length, 1);
    assert.equal(t[0].owner, 'senior-dev', 'owner intact despite pipes in title');
    assert.equal(t[0].status, 'done', 'status intact');
    assert.ok(t[0].title.includes('1d|1w|1m|all'), 'pipes unescaped back into the title');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('extra-column table schema maps status/owner by header, not position', () => {
  const body = `| id | title | size | horizon | status | owner |
|----|-------|------|---------|--------|-------|
| SIG-1 | consensus builder | M | H2 | in_progress | senior-dev |
`;
  const dir = withTasksMd(body);
  try {
    const t = parseTasksMd(dir);
    assert.equal(t.length, 1);
    assert.equal(t[0].status, 'in_progress', 'status read from its header column');
    assert.equal(t[0].owner, 'senior-dev', 'owner read from its header column, not "M"/"H2"');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('sentence-shaped owner debris is dropped, not turned into a chip', () => {
  const body = `| id | title | status | owner |
|----|-------|--------|-------|
| X-1 | a task | done | senior-dev — argon2id, 15min access, WhitelistGuard on routes |
`;
  const dir = withTasksMd(body);
  try {
    const t = parseTasksMd(dir);
    assert.equal(t[0].owner, '', 'long sentence owner rejected');
    assert.deepEqual(t[0].labels, [], 'no junk label emitted');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('status / size / horizon debris never becomes an owner chip', () => {
  const body = `| id | title | status | owner |
|----|-------|--------|-------|
| A-1 | t | open | done |
| A-2 | t | open | M |
| A-3 | t | open | H2 |
| A-4 | t | open | senior-dev |
| A-5 | t | open | CTO |
`;
  const dir = withTasksMd(body);
  try {
    const owners = parseTasksMd(dir).map(t => t.owner);
    assert.deepEqual(owners, ['', '', '', 'senior-dev', 'CTO'], 'done/M/H2 rejected; real handles kept');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('over-long title is capped, overflow moved to description', () => {
  const long = 'word '.repeat(60).trim(); // ~300 chars
  const dir = withTasksMd(`| id | title | status | owner |\n|--|--|--|--|\n| L-1 | ${long} | open | pm |\n`);
  try {
    const t = parseTasksMd(dir)[0];
    assert.ok(t.title.length <= 162, `title capped (${t.title.length})`);
    assert.ok(t.title.endsWith('…'), 'ellipsis appended');
    assert.ok(t.description.length > 0, 'overflow preserved in description');
    assert.equal(t.owner, 'pm', 'short lowercase handle kept');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('non-task tables are ignored (no false positives)', () => {
  const dir = withTasksMd('# Notes\n\n| feature | value |\n|---------|-------|\n| latency | 50ms |\n| price | 5% |\n');
  try {
    assert.equal(parseTasksMd(dir).length, 0, 'a random table without an id/status header is not parsed as tasks');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
