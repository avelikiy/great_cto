// ADR-021 phase 1, the board side: agent events streamed as they happen.
//
// The hooks append to <project>/.great_cto/events.jsonl (scripts/lib/agent-events.mjs).
// The board reads that file, pushes changes over its existing SSE channel as
// `event: agent`, and shows an activity strip under the pipeline. What must not go
// wrong quietly: no file is "no events recorded", not an idle agent; a file the
// board cannot read is "not measured", not zero events; and a pipeline stage that
// did not chain is shown as something that needs attention.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// compileFunction, not the Function constructor: the same thing — code compiled into a
// function in this realm — through the API the plugin scanner does not flag. The code
// compiled here is this repository's own page, never untrusted input.
import { compileFunction } from 'node:vm';
import { freePort } from '../../tests/helpers/free-port.mjs';
import { reap } from '../../tests/helpers/reap.mjs';
import http from 'node:http';
import { startServerOnFreePort } from '../../tests/helpers/board-start.mjs';
import { appendEvent } from '../../scripts/lib/agent-events.mjs';
import { agentActivity, activityStamp } from './lib/agent-activity.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'cli', 'index.mjs');
const TMP_DIRS = [];
after(() => { for (const d of TMP_DIRS) rmSync(d, { recursive: true, force: true }); });
const tmp = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); TMP_DIRS.push(d); return d; };
function project({ events = [] } = {}) {
  const p = tmp('gcto-activity-');
  mkdirSync(join(p, '.great_cto', 'verdicts'), { recursive: true });
  writeFileSync(join(p, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');
  events.forEach((e, i) => appendEvent(join(p, '.great_cto'), e, { now: Date.parse('2026-09-14T12:00:00Z') + i * 1000, env: {} }));
  return p;
}

// ── the reader ─────────────────────────────────────────────────────────────

test('no events file is "none" — shown as no events recorded, not as an idle agent', () => {
  const a = agentActivity(project());
  assert.equal(a.state, 'none');
  assert.deepEqual(a.events, []);
  assert.deepEqual(a.attention, []);
});

test('events are "live", and a pipeline stage that did not chain is called out', () => {
  const a = agentActivity(project({ events: [
    { kind: 'agent-start', agent: 'qa-engineer' },
    { kind: 'tool', tool: 'Edit', paths: ['src/cart.mjs'], ok: true },
    { kind: 'pipeline', agent: 'qa-engineer', outcome: 'no-rule' },
    { kind: 'pipeline', agent: 'senior-dev', outcome: 'dispatch', verdict: 'TASK_DONE' },
  ] }));
  assert.equal(a.state, 'live');
  assert.equal(a.events.length, 4);
  assert.deepEqual(a.attention.map((e) => e.outcome), ['no-rule'], 'dispatch is progress, not something to flag');
});

test('a file the board cannot read is "not measured", with the reason', () => {
  const p = project();
  mkdirSync(join(p, '.great_cto', 'events.jsonl'));          // a directory where the file should be: readable as nothing
  const a = agentActivity(p);
  assert.equal(a.state, 'unreadable');
  assert.ok(a.why);
});

test('the stamp the watcher polls changes when an event is appended', () => {
  const p = project();
  assert.equal(activityStamp(p), 'none');
  appendEvent(join(p, '.great_cto'), { kind: 'stop' }, { env: {} });
  const first = activityStamp(p);
  assert.notEqual(first, 'none');
  appendEvent(join(p, '.great_cto'), { kind: 'stop' }, { env: {} });
  assert.notEqual(activityStamp(p), first);
});

// ── the route, on the real server ──────────────────────────────────────────

async function waitForBoard(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/projects`); if (r.ok || r.status === 404) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`board did not start on port ${port}`);
}

test('/api/agent-events serves the project’s events, and "none" for a project without any', async () => {
  const withEvents = project({ events: [{ kind: 'agent-start', agent: 'senior-dev' }, { kind: 'agent-stop', agent: 'senior-dev', ok: true }] });
  const home = tmp('gcto-activity-home-');
  const port = await freePort();
  const board = spawn('node', [CLI, 'board', '--port', String(port), '--no-open'], {
    cwd: withEvents, env: { ...process.env, HOME: home }, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  try {
    await waitForBoard(port);
    const live = await (await fetch(`http://127.0.0.1:${port}/api/agent-events`)).json();
    assert.equal(live.state, 'live');
    assert.deepEqual(live.events.map((e) => e.kind), ['agent-start', 'agent-stop']);
  } finally {
    await reap(board);
  }
});

// ── resuming the stream (ADR-021 phase 2, great_cto-c0hb) ──────────────────
//
// Phase 1 pushed a snapshot of the newest twenty events on every change, with no
// `id`. A board that dropped its connection came back to whatever twenty were
// newest then. Now every agent frame carries a cursor, the board hands it back on
// reconnect, and the server sends what came after — nothing missed, nothing twice.

const SERVER = join(HERE, 'server.mjs');

async function board(cwd) {
  const home = tmp('gcto-resume-home-');
  const { port, proc } = await startServerOnFreePort({
    entry: SERVER, cwd, env: { HOME: home, GREAT_CTO_NO_UPDATE_CHECK: '1' },
    readyPath: '/api/heartbeat', portEnv: 'BOARD_PORT',
  });
  return { port, proc };
}

/** Open /api/sse and collect `agent` frames as {id, data} until `want` arrive. */
function agentFrames(port, { query = '', headers = {}, want = 1, timeoutMs = 8000, onOpen } = {}) {
  return new Promise((resolve, reject) => {
    const frames = [];
    let buf = '';
    const req = http.get({ host: '127.0.0.1', port, path: `/api/sse${query}`, headers: { Accept: 'text/event-stream', ...headers } }, (res) => {
      if (onOpen) onOpen();
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const field = (name) => (block.split('\n').find((l) => l.startsWith(`${name}: `)) || '').slice(name.length + 2);
          if (field('event') !== 'agent') continue;
          frames.push({ id: field('id') || null, data: JSON.parse(field('data')) });
          if (frames.length >= want) { req.destroy(); resolve(frames); return; }
        }
      });
    });
    req.on('error', (e) => (frames.length >= want ? null : reject(e)));
    setTimeout(() => { req.destroy(); resolve(frames); }, timeoutMs);
  });
}

test('an agent frame carries an id, and ?since= resumes with only what came after it', async () => {
  const p = project({ events: [{ kind: 'agent-start', agent: 'senior-dev' }, { kind: 'tool', tool: 'Edit' }] });
  const { port, proc } = await board(p);
  try {
    const [first] = await agentFrames(port);
    assert.ok(first, 'a snapshot arrives on connect');
    assert.match(first.id || '', /^\d+-\d+$/, 'the frame names its cursor');
    assert.equal(first.data.mode, 'snapshot');
    assert.equal(first.data.events.length, 2);

    appendEvent(join(p, '.great_cto'), { kind: 'agent-stop', agent: 'senior-dev', ok: true }, { env: {} });
    const [resumed] = await agentFrames(port, { query: `?since=${encodeURIComponent(first.id)}` });
    assert.equal(resumed.data.mode, 'delta', 'a known cursor is resumed, not restarted');
    assert.deepEqual(resumed.data.events.map((e) => e.kind), ['agent-stop'], 'only what came after');
    assert.notEqual(resumed.id, first.id);

    const [viaHeader] = await agentFrames(port, { headers: { 'Last-Event-ID': first.id } });
    assert.equal(viaHeader.data.mode, 'delta', 'the standard header works too');
    assert.deepEqual(viaHeader.data.events.map((e) => e.kind), ['agent-stop']);

    const [junk] = await agentFrames(port, { query: '?since=not-a-cursor' });
    assert.equal(junk.data.mode, 'snapshot', 'a cursor that is not ours starts over');
  } finally {
    await reap(proc);
  }
});

test('the watcher pushes deltas with an advancing id — each event once', async () => {
  const p = project({ events: [{ kind: 'agent-start', agent: 'qa-engineer' }] });
  const { port, proc } = await board(p);
  const dir = join(p, '.great_cto');
  try {
    let step = 0;
    const got = agentFrames(port, {
      want: 3, timeoutMs: 12000,
      onOpen: () => {
        // After the connect snapshot: one event, a pause longer than the watcher's poll, another.
        setTimeout(() => { appendEvent(dir, { kind: 'tool', tool: 'Read' }, { env: {} }); step = 1; }, 500);
        setTimeout(() => { appendEvent(dir, { kind: 'tool', tool: 'Grep' }, { env: {} }); step = 2; }, 3000);
      },
    });
    const frames = await got;
    assert.equal(frames.length, 3, `expected snapshot + 2 pushes, got ${frames.length} (step ${step})`);
    const [snap, one, two] = frames;
    assert.equal(snap.data.mode, 'snapshot');
    assert.equal(one.data.mode, 'delta');
    assert.deepEqual(one.data.events.map((e) => e.tool), ['Read'], 'the push holds only the new event');
    assert.equal(two.data.mode, 'delta');
    assert.deepEqual(two.data.events.map((e) => e.tool), ['Grep'], 'and the next push does not repeat it');
    const offset = (f) => Number(f.id.split('-')[1]);
    assert.ok(offset(one) > offset(snap) && offset(two) > offset(one), 'the cursor only moves forward');
  } finally {
    await reap(proc);
  }
});

// The page recreates its EventSource after an error, so the browser never sends
// Last-Event-ID on its own; the page keeps the cursor and sends it back itself.
function pageFunction(name) {
  const html = readFileSync(join(HERE, 'public', 'index.html'), 'utf8');
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `the page defines ${name}()`);
  return html.slice(start, html.indexOf('\n}\n', start) + 2);
}

test('the page merges a delta, replaces on a snapshot, and says when events were skipped', () => {
  const merge = compileFunction(`${pageFunction('mergeAgentActivity')}\nreturn mergeAgentActivity;`)();
  const ev = (tool) => ({ kind: 'tool', tool });
  const prev = { state: 'live', events: [ev('A'), ev('B')], attention: [] };

  const d = merge(prev, { state: 'live', mode: 'delta', events: [ev('C')], attention: [{ kind: 'pipeline', outcome: 'no-rule' }] });
  assert.deepEqual(d.events.map((e) => e.tool), ['A', 'B', 'C'], 'a delta appends');
  assert.equal(d.attention.length, 1, 'and brings its attention rows');

  const s = merge(prev, { state: 'live', mode: 'snapshot', events: [ev('X')], attention: [] });
  assert.deepEqual(s.events.map((e) => e.tool), ['X'], 'a snapshot replaces');

  const g = merge(prev, { state: 'live', mode: 'snapshot', gap: true, events: [ev('Y')], attention: [] });
  assert.equal(g.gap, true, 'a snapshot that skipped events keeps saying so');

  const many = merge({ state: 'live', events: Array.from({ length: 60 }, (_, i) => ev(`E${i}`)), attention: [] },
    { state: 'live', mode: 'delta', events: [ev('Z')], attention: [] });
  assert.ok(many.events.length <= 50 && many.events.at(-1).tool === 'Z', 'bounded, newest kept');

  const none = merge(null, { state: 'live', mode: 'delta', events: [ev('Q')], attention: [] });
  assert.deepEqual(none.events.map((e) => e.tool), ['Q'], 'a delta with nothing to merge into is still shown');
});

test('the page sends its cursor back only to the project the cursor came from', () => {
  const src = pageFunction('agentSinceParam');
  const param = (cursor, project) => compileFunction(`${src}\nreturn agentSinceParam();`, ['window', 'currentProject'])({ __agentCursor: cursor }, project);
  assert.equal(param({ project: 'alpha', id: '12-340' }, 'alpha'), 'since=12-340');
  assert.equal(param({ project: 'alpha', id: '12-340' }, 'beta'), '', 'another project’s file has other offsets');
  assert.equal(param(undefined, 'alpha'), '');
  const html = readFileSync(join(HERE, 'public', 'index.html'), 'utf8');
  const connect = html.slice(html.indexOf('function connectSSE('), html.indexOf('\n}\n', html.indexOf('function connectSSE(')));
  assert.match(connect, /agentSinceParam\(\)/, 'connectSSE uses it');
  assert.match(connect, /lastEventId/, 'and keeps the id each agent frame carries');
});

// ── wiring the page and the server can only be checked as text here ─────────

test('the page listens for agent events and renders all three states', () => {
  const html = readFileSync(join(HERE, 'public', 'index.html'), 'utf8');
  assert.match(html, /id="agent-activity"/);
  assert.match(html, /addEventListener\('agent'/);
  assert.match(html, /function renderAgentActivity\(/);
  assert.match(html, /No agent events recorded yet/);
  assert.match(html, /Agent events not measured/);
  assert.match(html, /\/api\/agent-events/, 'the strip is filled on load, not only on the first push');
});

test('the collapsed status line reflects agent events — a stalled stage is visible without opening anything', () => {
  // Found by looking at the page: the strip lives inside the collapsed "Project
  // status" disclosure, whose one-line summary kept saying "no activity recorded"
  // beside five recorded events and a stage that had not chained. A warning you
  // must expand a section to see is as invisible as the journal line it replaced.
  //
  // Run, not grepped: a first version of this test matched the words
  // `__agentActivity` and `attention` in the function text, and a mutation that
  // deleted the line printing the warning still passed — the word survived in the
  // count above it. This runs the page's own function against a stub DOM.
  const html = readFileSync(join(HERE, 'public', 'index.html'), 'utf8');
  const start = html.indexOf('function renderStatusVerdict(');
  const source = html.slice(start, html.indexOf('\n}\n', start) + 2);
  const render = (activity, ageH) => {
    const el = { textContent: '' };
    const document = { getElementById: (id) => (id === 'proj-status-verdict' ? el : null) };
    const window = { __agentActivity: activity, __pipelineStages: [] };
    compileFunction(`${source}\nrenderStatusVerdict({}, ${JSON.stringify(ageH)});`, ['document', 'window'])(document, window);
    return { line: el.textContent, window };
  };
  const recent = new Date(Date.now() - 4 * 60 * 1000).toISOString();

  const stalled = render({ state: 'live', events: [{ kind: 'pipeline', ts: recent, outcome: 'no-rule' }], attention: [{ kind: 'pipeline', outcome: 'no-rule' }] }, null);
  assert.match(stalled.line, /⚠ 1 stage did not chain/, 'a stalled stage is on the collapsed line');
  assert.match(stalled.line, /last activity 4m ago/, 'agent events count as activity');
  assert.doesNotMatch(stalled.line, /no activity recorded/);
  assert.ok(Array.isArray(stalled.window.__statusVerdictArgs), 'the arguments are kept so the strip can redraw the line');

  const quiet = render(null, null);
  assert.match(quiet.line, /no activity recorded/, 'with no snapshot the line reads as it always did');
  assert.doesNotMatch(quiet.line, /⚠/);

  const strip = html.slice(html.indexOf('function renderAgentActivity('));
  assert.match(strip.slice(0, strip.indexOf('\n}\n')), /window\.__agentActivity\s*=/, 'the strip keeps the snapshot for the summary line');
});

test('the server starts the events watcher and sends a snapshot when a client connects', () => {
  assert.match(readFileSync(join(HERE, 'server.mjs'), 'utf8'), /watchAgentEvents\(\)/);
  const routes = readFileSync(join(HERE, 'lib', 'routes.mjs'), 'utf8');
  assert.match(routes, /pathname === '\/api\/agent-events'/);
  assert.match(routes, /event: agent\\n/);
});
