// The graph-* subcommands of `great-cto task work` are the operator's door to native host
// observation. Library tests cover the pieces; these run the real entry script
// (scripts/work-task.mjs, which `great-cto task work` spawns) the way an operator does,
// in a throwaway HOME so nothing touches the machine's own enrollments or journals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const workTask = resolve(import.meta.dirname, '../../scripts/work-task.mjs');
const CANARY = 'CLI-CANARY-DO-NOT-STORE';

function fixture(t) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'gcto-graph-cli-')));
  const root = join(tmp, 'project'), home = join(tmp, 'home'); mkdirSync(root); mkdirSync(home);
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  for (const key of ['GREAT_CTO_GRAPH_BINDINGS_DIR', 'GREAT_CTO_HOST_GRAPHS_DIR', 'GREAT_CTO_TASKS_DIR']) delete env[key];
  const journals = join(home, '.great_cto', 'host-graphs');
  const run = (args, input) => spawnSync(process.execPath, [workTask, ...args], { cwd: tmp, env, input, encoding: 'utf8' });
  const ok = (args, input) => { const r = run(args, input); assert.equal(r.status, 0, `${args[0]} failed: ${r.stderr}`); return JSON.parse(r.stdout); };
  const dir = ['--dir', root];
  return {
    tmp, root, home, journals, run, ok,
    enable: (host = 'claude-code') => ok(['graph-enable', ...dir, '--host', host, '--source-version', '2.1.292']),
    disable: (host = 'claude-code') => ok(['graph-disable', ...dir, '--host', host]),
    ingest: (event, host = 'claude-code') => ok(['graph-ingest', ...dir, '--host', host], JSON.stringify({ cwd: root, ...event })),
    page: (session, extra = [], host = 'claude-code') => ok(['graph-read', ...dir, '--host', host, '--session', session, ...extra]),
    list: () => ok(['graph-read', ...dir]),
    // Everything the journal store holds, so a leak anywhere in it is visible.
    journalText: () => existsSync(journals) ? readdirSync(journals).map(n => readFileSync(join(journals, n), 'utf8')).join('\n') : '',
  };
}
// Synthetic Claude Code hook payloads. Each carries text that must never be stored.
const tool = (id, name = 'Bash') => ({ tool_use_id: id, tool_name: name, tool_input: { command: CANARY, file_path: `/private/${CANARY}` } });
const session = f => {
  const id = randomUUID();
  return { id, run: events => events.map(e => f.ingest({ session_id: id, ...e })) };
};
const lifecycle = tool1 => [
  { hook_event_name: 'SessionStart', source: 'startup' },
  { hook_event_name: 'UserPromptSubmit', prompt: CANARY },
  { hook_event_name: 'PreToolUse', ...tool(tool1) },
  { hook_event_name: 'PostToolUse', ...tool(tool1), tool_response: { stdout: CANARY } },
  { hook_event_name: 'Stop' },
];

test('CLI: enable, ingest hook events, read a private graph, disable, then nothing more is recorded', t => {
  const f = fixture(t), s = session(f);

  // Opt-in comes first: an event for a project that has not enabled observation writes nothing.
  assert.equal(f.ingest({ session_id: s.id, hook_event_name: 'SessionStart' }).state, 'not-enrolled');
  assert.equal(existsSync(f.journals), false, 'no journal exists before enable');
  assert.deepEqual(f.list(), []);

  const enabled = f.enable();
  assert.equal(enabled.state, 'enabled'); assert.equal(enabled.authority, 'observation-only');

  const results = s.run(lifecycle('toolu_cli_1'));
  for (const r of results) assert.match(r.state, /^(recorded|degraded)$/, 'every delivery reaches the journal');
  assert.equal(results[0].state, 'recorded', 'a true SessionStart enrolls the session through the project policy');

  // read: the listing and the single-session page both show a graph, with no payload text.
  const [row] = f.list();
  assert.equal(row.host, 'claude-code'); assert.equal(row.sessionId, s.id);
  assert(row.graph.nodes.length >= 5, `graph has nodes, got ${row.graph.nodes.length}`);
  for (const kind of ['session', 'turn', 'tool']) assert(row.graph.nodes.some(n => n.kind === kind), `has a ${kind} node`);
  assert(row.graph.edges.some(e => e.kind === 'same-call'), 'tool start and end are joined by their explicit call id');
  assert.equal(row.graph.complete, false, 'observation is never claimed complete');
  const page = f.page(s.id);
  assert.equal(page.nodes.length, row.graph.nodes.length);
  assert.equal(page.enrolled, true); assert.equal(page.retained, false);

  const shown = JSON.stringify([row, page]);
  assert(!shown.includes(CANARY), 'prompt, command, path and tool output never reach the read output');
  assert(!shown.includes(f.root), 'the project path never reaches the read output');
  assert(!f.journalText().includes(CANARY), 'nor the journal on disk');
  const [journalFile] = readdirSync(f.journals).filter(n => n.endsWith('.jsonl'));
  assert.equal(statSync(join(f.journals, journalFile)).mode & 0o077, 0, 'journal is owner-only');
  assert.equal(statSync(f.journals).mode & 0o077, 0, 'journal store is owner-only');

  // disable: revocation stops the enrolled session and the project policy.
  const disabled = f.disable();
  assert.equal(disabled.state, 'disabled'); assert.equal(disabled.retainedHistory, true);
  const before = f.journalText(), files = readdirSync(f.journals).length;
  assert.equal(f.ingest({ session_id: s.id, hook_event_name: 'PreToolUse', ...tool('toolu_cli_2') }).state, 'not-enrolled');
  assert.equal(f.ingest({ session_id: randomUUID(), hook_event_name: 'SessionStart' }).state, 'not-enrolled', 'a new session no longer auto-enrolls');
  assert.equal(f.journalText(), before, 'further events are not recorded');
  assert.equal(readdirSync(f.journals).length, files, 'and no new journal is created');
  assert.deepEqual(f.list(), [], 'no enrolled session remains');
});

test('CLI: disabled and unbound sessions stay readable as retained history, read-only', t => {
  const f = fixture(t);
  const live = {}, sessions = {};

  // A session enrolled by project policy, later revoked by graph-disable.
  f.enable();
  const viaPolicy = session(f); viaPolicy.run(lifecycle('toolu_policy'));
  live.policy = f.page(viaPolicy.id);
  f.disable();

  // A session enrolled by hand, later revoked by graph-unbind.
  const byHand = randomUUID();
  assert.equal(f.ok(['graph-bind', '--dir', f.root, '--host', 'claude-code', '--session', byHand, '--source-version', '2.1.292']).state, 'enrolled');
  sessions.hand = { id: byHand, run: events => events.map(e => f.ingest({ session_id: byHand, ...e })) };
  sessions.hand.run(lifecycle('toolu_hand'));
  live.hand = f.page(byHand);
  assert.equal(f.ok(['graph-unbind', '--dir', f.root, '--host', 'claude-code', '--session', byHand]).state, 'unenrolled');

  for (const [name, id] of [['policy', viaPolicy.id], ['hand', byHand]]) {
    const kept = f.page(id);
    assert.equal(kept.retained, true, `${name}: marked retained`); assert.equal(kept.enrolled, false, `${name}: marked not enrolled`);
    assert(kept.nodes.length >= 5, `${name}: the recorded graph is still there`);
    assert.deepEqual(kept.nodes, live[name].nodes, `${name}: same graph as before revocation`);
    assert.equal(kept.complete, false);
    assert(!JSON.stringify(kept).includes(CANARY), `${name}: still no payload text`);
    assert.equal(f.page(id, ['--limit', '2']).nodes.length, 2, `${name}: retained pages are bounded`);
  }

  // Reading never re-enables recording or enrolls anything.
  const before = f.journalText(), files = readdirSync(f.journals).length;
  assert.equal(f.ingest({ session_id: byHand, hook_event_name: 'PreToolUse', ...tool('toolu_after') }).state, 'not-enrolled');
  assert.equal(f.ingest({ session_id: viaPolicy.id, hook_event_name: 'PreToolUse', ...tool('toolu_after') }).state, 'not-enrolled');
  assert.equal(f.journalText(), before); assert.equal(readdirSync(f.journals).length, files);
  assert.deepEqual(f.list(), [], 'the listing shows enrolled sessions only');
  assert.equal(f.page(byHand).total, live.hand.total);

  // A session this project never recorded is still refused, and so is the wrong host.
  for (const [host, id] of [['claude-code', randomUUID()], ['codex', byHand]]) {
    const refused = f.run(['graph-read', '--dir', f.root, '--host', host, '--session', id]);
    assert.equal(refused.status, 2, 'refused sessions exit non-zero');
    assert.match(refused.stderr, /not enrolled/);
    assert.equal(refused.stdout, '');
  }
});
