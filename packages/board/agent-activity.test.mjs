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
import { freePort } from '../../tests/helpers/free-port.mjs';
import { reap } from '../../tests/helpers/reap.mjs';
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
    new Function('document', 'window', `${source}\nrenderStatusVerdict({}, ${JSON.stringify(ageH)});`)(document, window);
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
