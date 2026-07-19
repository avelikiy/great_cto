// E2E test #2 — Board admin gate approval.
//
// The end-to-end human-in-the-loop flow that defines great_cto's UX:
//   1. Pipeline opens a gate (bd task with `gate` label)
//   2. Board's /api/inbox surfaces it as a pending decision
//   3. User POSTs /api/gates/<id> with action=approve
//   4. Server marks the bd task closed + appends to decisions.md
//   5. SSE clients receive an updated tasks payload
//
// This test asserts the whole chain end-to-end with NO LLM dependencies —
// just bd, the board server, and a tmp HOME for the decisions log.
//
// Run: node --test tests/board-gate.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = join(__dirname, '..', 'packages', 'cli', 'index.mjs');

// ── env preflight ──────────────────────────────────────────────────────────

const bdProbe = spawnSync('bd', ['--version'], { encoding: 'utf8' });
const BD_AVAILABLE = bdProbe.status === 0;

// ── helpers ────────────────────────────────────────────────────────────────

function pickPort() { return 35000 + Math.floor(Math.random() * 2000); }

async function waitForBoard(port, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/projects`);
      if (r.ok || r.status === 404) return;
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`board did not start on port ${port}`);
}

async function fetchJson(port, path, init) {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const txt = await r.text();
  try { return { status: r.status, body: JSON.parse(txt) }; }
  catch { return { status: r.status, body: txt }; }
}

function makeProject() {
  const home = mkdtempSync(join(tmpdir(), 'gcto-gate-home-'));
  const project = mkdtempSync(join(tmpdir(), 'gcto-gate-proj-'));
  mkdirSync(join(home, '.great_cto'), { recursive: true });
  mkdirSync(join(project, '.great_cto'), { recursive: true });
  writeFileSync(join(project, '.great_cto', 'PROJECT.md'), 'archetype: web-service\nprimary: web-service\n');

  // bd init — required for gate approval endpoint
  const init = spawnSync('bd', ['init'], { cwd: project, encoding: 'utf8' });
  if (init.status !== 0) {
    throw new Error(`bd init failed: ${init.stderr || init.stdout}`);
  }
  return { home, project };
}

function bdCreate(project, title, label = 'gate') {
  const r = spawnSync('bd', ['create', title, '--priority', 'P1'], {
    cwd: project, encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`bd create failed: ${r.stderr}`);
  const m = (r.stdout || '').match(/Created issue:\s*(\S+)/);
  if (!m) throw new Error(`could not parse bd create output: ${r.stdout}`);
  const id = m[1];
  if (label) {
    const upd = spawnSync('bd', ['update', id, '--add-label', label], {
      cwd: project, encoding: 'utf8',
    });
    if (upd.status !== 0) throw new Error(`bd label failed: ${upd.stderr}`);
  }
  return id;
}

function bdShow(project, id) {
  // bd 0.63: `bd show <id> --json` returns an ARRAY `[{...}]`, not a single
  // object. Unwrap it here so callers can treat it as the issue record.
  const r = spawnSync('bd', ['show', id, '--json'], {
    cwd: project, encoding: 'utf8',
  });
  if (r.status !== 0) return null;
  try {
    const parsed = JSON.parse(r.stdout);
    return Array.isArray(parsed) ? parsed[0] : parsed;
  } catch { return null; }
}

function spawnBoard(project, home, port) {
  return spawn('node', [CLI_ENTRY, 'board', '--port', String(port), '--no-open'], {
    cwd: project,
    env: { ...process.env, HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
}

function killBoardTree(board) {
  try { process.kill(-board.pid, 'SIGKILL'); } catch {}
  try { board.kill('SIGKILL'); } catch {}
}

function cleanup(...dirs) {
  for (const d of dirs) try { rmSync(d, { recursive: true, force: true }); } catch {}
}

// ── tests ──────────────────────────────────────────────────────────────────

test('gate: approve via POST /api/gates/<id> closes bd task', { skip: !BD_AVAILABLE && 'bd CLI not installed' }, async () => {
  const { home, project } = makeProject();
  const gateId = bdCreate(project, 'gate: plan approval for billing endpoint');

  const port = pickPort();
  const board = spawnBoard(project, home, port);

  try {
    await waitForBoard(port);

    // Sanity: gate appears in inbox as pending
    const inbox = await fetchJson(port, '/api/inbox');
    assert.equal(inbox.status, 200, `inbox returned ${inbox.status}`);
    const gateInInbox = (inbox.body?.pending_gates || []).find(g => g.id === gateId);
    assert.ok(gateInInbox,
      `gate ${gateId} should appear in /api/inbox.pending_gates. ` +
      `summary: ${JSON.stringify(inbox.body?.summary)}, ` +
      `count: ${inbox.body?.pending_gates?.length ?? 'undefined'}`);

    // Approve
    const approve = await fetchJson(port, `/api/gates/${gateId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', reason: 'lgtm — E2E test' }),
    });
    assert.equal(approve.status, 200, `approve returned ${approve.status}: ${JSON.stringify(approve.body)}`);
    assert.equal(approve.body?.ok, true);
    assert.equal(approve.body?.action, 'approve');

    // Verify bd marked it closed
    const task = bdShow(project, gateId);
    assert.ok(task, `bd show ${gateId} returned null`);
    assert.equal(task.status, 'closed', `expected status=closed after approve, got ${task.status}`);
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

test('gate: rejection sets bd status=blocked', { skip: !BD_AVAILABLE && 'bd CLI not installed' }, async () => {
  const { home, project } = makeProject();
  const gateId = bdCreate(project, 'gate: ship approval for v2.1');

  const port = pickPort();
  const board = spawnBoard(project, home, port);

  try {
    await waitForBoard(port);

    const reject = await fetchJson(port, `/api/gates/${gateId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', reason: 'not ready — security concern' }),
    });
    assert.equal(reject.status, 200, `reject returned ${reject.status}: ${JSON.stringify(reject.body)}`);
    assert.equal(reject.body?.action, 'reject');

    const task = bdShow(project, gateId);
    assert.equal(task.status, 'blocked', `expected status=blocked after reject, got ${task.status}`);
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

// ADR-008: the decision lands in the PROJECT's log, never the global one. Gate
// titles carry the project's own vocabulary, and the global file is read by
// agents on every other project.
test('gate: approval appends to the project decisions log, not the global one', { skip: !BD_AVAILABLE && 'bd CLI not installed' }, async () => {
  const { home, project } = makeProject();
  const gateId = bdCreate(project, 'gate: architecture review for payment service');

  const port = pickPort();
  const board = spawnBoard(project, home, port);

  try {
    await waitForBoard(port);

    await fetchJson(port, `/api/gates/${gateId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', reason: 'audit trail check' }),
    });

    // Wait briefly for async append to flush
    await new Promise(r => setTimeout(r, 200));

    const projectDecisions = join(project, '.great_cto', 'decisions.md');
    assert.ok(existsSync(projectDecisions), `decisions.md should exist at ${projectDecisions}`);
    const log = readFileSync(projectDecisions, 'utf8');
    assert.ok(log.includes(gateId), `decisions log should contain gate id ${gateId}`);
    assert.ok(log.includes('APPROVED'), `decisions log should record the approval`);
    assert.ok(log.includes('audit trail check'), `decisions log should record reason`);

    // The cross-project file must not have gained this project's gate title.
    const globalDecisions = join(home, '.great_cto', 'decisions.md');
    const globalText = existsSync(globalDecisions) ? readFileSync(globalDecisions, 'utf8') : '';
    assert.ok(!globalText.includes(gateId),
      'a project gate must never reach the global cross-project log');
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

test('gate: SSE broadcasts updated tasks after approval', { skip: !BD_AVAILABLE && 'bd CLI not installed' }, async () => {
  const { home, project } = makeProject();
  const gateId = bdCreate(project, 'gate: SSE broadcast test');

  const port = pickPort();
  const board = spawnBoard(project, home, port);

  try {
    await waitForBoard(port);

    // Subscribe to SSE stream
    const sseResp = await fetch(`http://127.0.0.1:${port}/api/sse`);
    assert.equal(sseResp.status, 200, 'SSE endpoint should return 200');
    const reader = sseResp.body.getReader();
    const decoder = new TextDecoder();

    // Collect events for 2 seconds while we trigger an approval
    const events = [];
    const readPromise = (async () => {
      const deadline = Date.now() + 2500;
      while (Date.now() < deadline) {
        try {
          const { value, done } = await reader.read();
          if (done) break;
          events.push(decoder.decode(value));
        } catch { break; }
      }
    })();

    // Trigger approval, which should cause broadcastTasks(cwd) → SSE event
    await new Promise(r => setTimeout(r, 200)); // let SSE handshake settle
    await fetchJson(port, `/api/gates/${gateId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', reason: 'SSE test' }),
    });

    await readPromise;
    try { reader.cancel(); } catch {}

    // Initial handshake sends event: tasks immediately; broadcast should send
    // another after our approval. Count tasks events.
    const combined = events.join('');
    const tasksEventCount = (combined.match(/event:\s*tasks/g) || []).length;
    assert.ok(
      tasksEventCount >= 1,
      `expected at least 1 SSE 'tasks' event, got ${tasksEventCount}. Combined stream:\n${combined.slice(0, 500)}`
    );
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

test('gate: invalid action returns 400', { skip: !BD_AVAILABLE && 'bd CLI not installed' }, async () => {
  const { home, project } = makeProject();
  const gateId = bdCreate(project, 'gate: input validation test');

  const port = pickPort();
  const board = spawnBoard(project, home, port);

  try {
    await waitForBoard(port);

    const r = await fetchJson(port, `/api/gates/${gateId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'maybe', reason: 'should fail' }),
    });
    assert.equal(r.status, 400, `expected 400 for invalid action, got ${r.status}`);
    assert.ok(r.body?.error, 'error field should be present');
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});
