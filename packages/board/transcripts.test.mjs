// The board reports outcomes — verdicts, gates, cost. It never touched the 2 GB
// of session transcripts that record HOW an outcome was reached, and that gap
// cost real time this week: three separate low eval scores were read as agent
// gaps and turned out to be the harness. Each was found by reading what the
// agent actually did.
//
// What these tests pin is what a reader of evidence needs: the right sessions
// found at all, a bounded read, and nothing invented where the file is silent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const {
  slugForCwd, listSessions, messageText, toolCalls, readSession, editedFiles, searchSessions,
} = await import('./lib/transcripts.mjs');

function fixture(sessions) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-tr-'));
  const cwd = '/Users/x/dev/my_project';
  const dir = path.join(root, slugForCwd(cwd));
  fs.mkdirSync(dir, { recursive: true });
  for (const [id, records] of Object.entries(sessions)) {
    fs.writeFileSync(path.join(dir, `${id}.jsonl`), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }
  return { root, cwd };
}
const clean = (r) => { try { fs.rmSync(r, { recursive: true, force: true }); } catch {} };

const say = (role, text, ts = '2026-08-05T10:00:00Z') =>
  ({ type: role, timestamp: ts, message: { content: [{ type: 'text', text }] } });
const call = (name, input, ts = '2026-08-05T10:00:00Z') =>
  ({ type: 'assistant', timestamp: ts, message: { content: [{ type: 'tool_use', name, input }] } });

// ── the slug, which is the whole difference between history and none ────────

test('an underscore in the path becomes a hyphen, like every other separator', () => {
  // A slug that is nearly right lists zero sessions and reads as a project with
  // no history — silently, which is the worst way to be wrong here.
  assert.equal(slugForCwd('/Users/x/development/Personal/great_cto'),
    '-Users-x-development-Personal-great-cto');
  assert.equal(slugForCwd('/a/b.c/d_e'), '-a-b-c-d-e');
});

test('a project with no transcript directory lists nothing rather than throwing', () => {
  assert.deepEqual(listSessions('/nowhere/at/all'), []);
  assert.deepEqual(listSessions(''), []);
});

// ── listing ────────────────────────────────────────────────────────────────

test('sessions come back newest first, with their titles', () => {
  const { root, cwd } = fixture({
    older: [{ type: 'custom-title', customTitle: 'First pass' }, say('user', 'hello')],
    newer: [{ type: 'custom-title', customTitle: 'Second pass' }, say('user', 'hello again')],
  });
  try {
    // mtime is what orders them; make it deterministic.
    const dir = path.join(root, slugForCwd(cwd));
    fs.utimesSync(path.join(dir, 'older.jsonl'), new Date('2026-01-01'), new Date('2026-01-01'));
    fs.utimesSync(path.join(dir, 'newer.jsonl'), new Date('2026-08-01'), new Date('2026-08-01'));
    const s = listSessions(cwd, { root });
    assert.deepEqual(s.map((x) => x.id), ['newer', 'older']);
    assert.equal(s[0].title, 'Second pass');
  } finally { clean(root); }
});

test('a retitled session shows its current title, not its first', () => {
  // Retitling appends a new record rather than editing the old one, so the LAST
  // is current. Taking the first would show a name the user already replaced.
  const { root, cwd } = fixture({
    s1: [{ type: 'custom-title', customTitle: 'Old name' }, say('user', 'x'),
         { type: 'custom-title', customTitle: 'New name' }],
  });
  try {
    assert.equal(listSessions(cwd, { root })[0].title, 'New name');
  } finally { clean(root); }
});

test('an untitled session is still recognisable by what it was asked', () => {
  const { root, cwd } = fixture({ s1: [say('user', 'fix the flaky deploy test')] });
  try {
    const s = listSessions(cwd, { root })[0];
    assert.equal(s.title, null, 'no title is null, not an invented one');
    assert.match(s.opened_with, /flaky deploy test/);
  } finally { clean(root); }
});

test('a half-written line does not fail the read', () => {
  // A session being appended to right now always ends mid-line. Skipping that
  // line is right; failing the whole read is not.
  const { root, cwd } = fixture({ s1: [say('user', 'complete')] });
  try {
    const f = path.join(root, slugForCwd(cwd), 's1.jsonl');
    fs.appendFileSync(f, '{"type":"assistant","mess');
    assert.equal(listSessions(cwd, { root }).length, 1);
    assert.equal(readSession(f).length, 1);
  } finally { clean(root); }
});

// ── reading a session ──────────────────────────────────────────────────────

test('bookkeeping records are dropped, system records are kept', () => {
  const { root, cwd } = fixture({
    s1: [
      { type: 'mode', mode: 'plan' },
      { type: 'queue-operation', operation: 'add' },
      { type: 'last-prompt', lastPrompt: 'x' },
      say('user', 'do the thing'),
      { type: 'system', subtype: 'compact_boundary', timestamp: '2026-08-05T10:01:00Z' },
    ],
  });
  try {
    const turns = readSession(path.join(root, slugForCwd(cwd), 's1.jsonl'));
    assert.deepEqual(turns.map((t) => t.role), ['user', 'system'],
      'a compaction is part of how the session went; the client\'s mode is not');
  } finally { clean(root); }
});

test('a tool call is reported by name and target, never by its whole input', () => {
  // A Write input can be megabytes. The panel shows what was called.
  const { root, cwd } = fixture({
    s1: [call('Write', { file_path: '/repo/src/a.ts', content: 'x'.repeat(50_000) })],
  });
  try {
    const t = readSession(path.join(root, slugForCwd(cwd), 's1.jsonl'))[0];
    assert.deepEqual(t.tools, ['Write']);
    assert.equal(t.tool_detail[0].target, '/repo/src/a.ts');
    assert.ok(!JSON.stringify(t).includes('xxxxxxxxxx'), 'the file body is not carried into the response');
  } finally { clean(root); }
});

test('message text is read from both content shapes', () => {
  assert.equal(messageText({ message: { content: 'plain string' } }), 'plain string');
  assert.equal(messageText({ message: { content: [{ type: 'text', text: 'in a block' }] } }), 'in a block');
  assert.equal(messageText({}), '', 'a record with no message is empty, not undefined');
  assert.deepEqual(toolCalls({ message: { content: 'plain' } }), []);
});

// ── edits ──────────────────────────────────────────────────────────────────

test('edited files are counted per path and ordered by when they were last touched', () => {
  const { root, cwd } = fixture({
    s1: [
      call('Write', { file_path: '/repo/a.ts' }, '2026-08-05T10:00:00Z'),
      call('Edit', { file_path: '/repo/a.ts' }, '2026-08-05T10:05:00Z'),
      call('Edit', { file_path: '/repo/b.ts' }, '2026-08-05T10:10:00Z'),
      call('Read', { file_path: '/repo/c.ts' }, '2026-08-05T10:15:00Z'),
    ],
  });
  try {
    const files = editedFiles(path.join(root, slugForCwd(cwd), 's1.jsonl'));
    assert.deepEqual(files.map((f) => f.path), ['/repo/b.ts', '/repo/a.ts']);
    assert.equal(files.find((f) => f.path === '/repo/a.ts').edits, 2);
    assert.ok(!files.some((f) => f.path === '/repo/c.ts'), 'reading a file is not editing it');
  } finally { clean(root); }
});

test('edits are read from tool calls, so uncommitted work still shows', () => {
  // Reading from git would show nothing for a session that never committed —
  // exactly the session someone is trying to reconstruct.
  const { root, cwd } = fixture({ s1: [call('Edit', { file_path: '/repo/never-committed.ts' })] });
  try {
    assert.equal(editedFiles(path.join(root, slugForCwd(cwd), 's1.jsonl'))[0].path, '/repo/never-committed.ts');
  } finally { clean(root); }
});

// ── search ─────────────────────────────────────────────────────────────────

test('search finds a phrase and says which session and turn it was in', () => {
  const { root, cwd } = fixture({
    s1: [say('assistant', 'the interval spans the bar so the run settled nothing')],
    s2: [say('user', 'something else entirely')],
  });
  try {
    const r = searchSessions(cwd, 'settled nothing', { root });
    assert.equal(r.hits.length, 1);
    assert.equal(r.hits[0].session, 's1');
    assert.equal(r.hits[0].role, 'assistant');
    assert.match(r.hits[0].excerpt, /settled nothing/);
  } finally { clean(root); }
});

test('search is case-insensitive and returns a window, not the whole turn', () => {
  const { root, cwd } = fixture({
    s1: [say('assistant', 'a'.repeat(2000) + ' NEEDLE ' + 'b'.repeat(2000))],
  });
  try {
    const hit = searchSessions(cwd, 'needle', { root }).hits[0];
    assert.match(hit.excerpt, /NEEDLE/);
    assert.ok(hit.excerpt.length < 300, 'a turn can be a thousand lines; the reader wants to know whether to open it');
  } finally { clean(root); }
});

test('a query too short to be a query is refused rather than matching everything', () => {
  const { root, cwd } = fixture({ s1: [say('user', 'anything at all')] });
  try {
    const r = searchSessions(cwd, 'a', { root });
    assert.deepEqual(r.hits, []);
    assert.match(r.note, /matches everything/);
  } finally { clean(root); }
});

test('search over a project with no sessions is empty, not an error', () => {
  assert.deepEqual(searchSessions('/nowhere', 'anything').hits, []);
});
