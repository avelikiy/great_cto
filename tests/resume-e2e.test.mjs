// E2E test #5 — Cross-session resume.
//
// Validates that great_cto's persistence guarantees survive a process restart:
// seed a partially-completed pipeline, kill the board, start a fresh board
// against the same HOME + project dir, and assert that /api/resume
// reconstructs the correct state from disk alone.
//
// Persistence sources tested:
//   - <project>/.great_cto/verdicts/*.log  (agent verdicts → recent_verdicts)
//   - bd's .beads/ database        (gates → open_gates, WIP → wip_tasks)
//   - ~/.great_cto/decisions.md    (approval history → decisions)
//
// If any of these silently dropped state on restart, this test fails.
//
// Run: node --test tests/resume-e2e.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = join(__dirname, '..', 'packages', 'cli', 'index.mjs');

const bdProbe = spawnSync('bd', ['--version'], { encoding: 'utf8' });
const BD_AVAILABLE = bdProbe.status === 0;

// ── helpers ────────────────────────────────────────────────────────────────

function pickPort() { return 39000 + Math.floor(Math.random() * 2000); }

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

async function api(port, path, init) {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const txt = await r.text();
  try { return { status: r.status, body: JSON.parse(txt) }; }
  catch { return { status: r.status, body: txt }; }
}

function makeProject() {
  const home = mkdtempSync(join(tmpdir(), 'gcto-resume-home-'));
  const project = mkdtempSync(join(tmpdir(), 'gcto-resume-proj-'));
  // Verdicts are per-project: write to <project>/.great_cto/verdicts/
  mkdirSync(join(project, '.great_cto', 'verdicts'), { recursive: true });
  writeFileSync(join(project, '.great_cto', 'PROJECT.md'),
    'archetype: web-service\nprimary: web-service\n');
  const init = spawnSync('bd', ['init'], { cwd: project, encoding: 'utf8' });
  if (init.status !== 0) throw new Error(`bd init failed: ${init.stderr}`);
  return { home, project };
}

function bdCreate(project, title, opts = {}) {
  const r = spawnSync('bd', ['create', title, '--priority', opts.priority || 'P1'],
    { cwd: project, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`bd create: ${r.stderr}`);
  const m = (r.stdout || '').match(/Created issue:\s*(\S+)/);
  if (!m) throw new Error(`parse bd create: ${r.stdout}`);
  const id = m[1];
  if (opts.label) {
    spawnSync('bd', ['update', id, '--add-label', opts.label],
      { cwd: project, encoding: 'utf8' });
  }
  if (opts.status) {
    spawnSync('bd', ['update', id, '--status', opts.status],
      { cwd: project, encoding: 'utf8' });
  }
  return id;
}

function seedVerdict(project, agent, ts, verdict, details, costUsd) {
  // Verdicts are now per-project; write to <project>/.great_cto/verdicts/
  const file = join(project, '.great_cto', 'verdicts', `${agent}.log`);
  appendFileSync(file, `${ts} ${verdict} ${details} cost=$${costUsd.toFixed(2)}\n`);
}

function spawnBoard(project, home, port) {
  return spawn('node', [CLI_ENTRY, 'board', '--port', String(port), '--no-open'], {
    cwd: project, env: { ...process.env, HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'], detached: true,
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

test('resume: pipeline state survives board restart', { skip: !BD_AVAILABLE && 'bd CLI not installed' }, async () => {
  const { home, project } = makeProject();
  const now = new Date();
  const minutesAgo = (m) => new Date(now.getTime() - m * 60_000).toISOString();

  // ── Phase 1: seed a partially-completed pipeline ──
  // 3 agents have produced verdicts; 1 gate is open; 2 tasks are in_progress
  seedVerdict(project, 'architect',     minutesAgo(45), 'APPROVED', 'feature=billing-api', 0.42);
  seedVerdict(project, 'pm',            minutesAgo(30), 'APPROVED', 'feature=billing-api', 0.18);
  seedVerdict(project, 'senior-dev',    minutesAgo(15), 'DONE',     'feature=billing-api', 1.20);

  const gateShipId = bdCreate(project, 'gate: ship billing-api v1', { label: 'gate' });
  const wipId1 = bdCreate(project, 'wire stripe webhook handler', { status: 'in_progress' });
  const wipId2 = bdCreate(project, 'add idempotency middleware', { status: 'in_progress' });

  // ── Phase 2: start board, capture state ──
  const port1 = pickPort();
  let board = spawnBoard(project, home, port1);

  let preRestartResume;
  try {
    await waitForBoard(port1);
    const r = await api(port1, '/api/resume');
    assert.equal(r.status, 200, `pre-restart /api/resume returned ${r.status}`);
    preRestartResume = r.body;
  } finally {
    killBoardTree(board);
  }

  // Wait a moment to ensure board process fully exited
  await new Promise(r => setTimeout(r, 500));

  // ── Phase 3: start FRESH board, verify state recovered from disk ──
  const port2 = pickPort();
  board = spawnBoard(project, home, port2);
  try {
    await waitForBoard(port2);
    const r = await api(port2, '/api/resume');
    assert.equal(r.status, 200, `post-restart /api/resume returned ${r.status}`);
    const post = r.body;

    // 1. Verdicts persisted via verdict logs on disk
    assert.equal(post.recent_verdicts.length, 3,
      `expected 3 recent verdicts, got ${post.recent_verdicts.length}`);
    const agentsRecovered = new Set(post.recent_verdicts.map(v => v.agent));
    for (const expected of ['architect', 'pm', 'senior-dev']) {
      assert.ok(agentsRecovered.has(expected),
        `agent '${expected}' missing from recovered verdicts: ${[...agentsRecovered].join(', ')}`);
    }

    // 2. Gate persisted via bd database
    assert.equal(post.open_gates.length, 1,
      `expected 1 open gate, got ${post.open_gates.length}`);
    assert.equal(post.open_gates[0].id, gateShipId,
      `recovered wrong gate id: ${post.open_gates[0].id}`);

    // 3. WIP tasks persisted via bd database
    assert.equal(post.wip_tasks.length, 2,
      `expected 2 WIP tasks, got ${post.wip_tasks.length}`);
    const wipIds = new Set(post.wip_tasks.map(t => t.id));
    assert.ok(wipIds.has(wipId1), `WIP task ${wipId1} not recovered`);
    assert.ok(wipIds.has(wipId2), `WIP task ${wipId2} not recovered`);

    // 4. Resume shape equivalence — pre and post restart should match in counts
    assert.equal(preRestartResume.recent_verdicts.length, post.recent_verdicts.length,
      'verdict count drifted across restart');
    assert.equal(preRestartResume.open_gates.length, post.open_gates.length,
      'open_gates count drifted across restart');
    assert.equal(preRestartResume.wip_tasks.length, post.wip_tasks.length,
      'wip_tasks count drifted across restart');
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

test('resume: approving a gate then restarting reflects the closed state', { skip: !BD_AVAILABLE && 'bd CLI not installed' }, async () => {
  const { home, project } = makeProject();
  const gatePlanId = bdCreate(project, 'gate: plan approval', { label: 'gate' });
  const gateShipId = bdCreate(project, 'gate: ship approval', { label: 'gate' });

  // Phase 1: approve gate:plan, leaving only gate:ship open
  const port1 = pickPort();
  let board = spawnBoard(project, home, port1);
  try {
    await waitForBoard(port1);
    const r = await api(port1, `/api/gates/${gatePlanId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', reason: 'pre-restart approval' }),
    });
    assert.equal(r.status, 200, `pre-restart approve failed: ${JSON.stringify(r.body)}`);
  } finally {
    killBoardTree(board);
  }

  await new Promise(r => setTimeout(r, 500));

  // Phase 2: restart, verify only 1 gate remaining (ship)
  const port2 = pickPort();
  board = spawnBoard(project, home, port2);
  try {
    await waitForBoard(port2);
    const r = await api(port2, '/api/resume');
    assert.equal(r.body.open_gates.length, 1,
      `expected 1 open gate after restart, got ${r.body.open_gates.length}`);
    assert.equal(r.body.open_gates[0].id, gateShipId,
      `wrong gate remains open: expected ${gateShipId}, got ${r.body.open_gates[0].id}`);

    // And /api/inbox.summary.gates should agree
    const inbox = await api(port2, '/api/inbox');
    assert.equal(inbox.body.summary.gates, 1,
      `inbox gates summary should be 1, got ${inbox.body.summary.gates}`);
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

test('resume: decisions log preserves audit trail across restart', { skip: !BD_AVAILABLE && 'bd CLI not installed' }, async () => {
  const { home, project } = makeProject();
  const gate1 = bdCreate(project, 'gate: pre-restart audit test', { label: 'gate' });

  // Phase 1: approve gate to create a decisions.md entry
  const port1 = pickPort();
  let board = spawnBoard(project, home, port1);
  try {
    await waitForBoard(port1);
    await api(port1, `/api/gates/${gate1}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', reason: 'audit-test-marker-xyz' }),
    });
    await new Promise(r => setTimeout(r, 300));
  } finally {
    killBoardTree(board);
  }

  await new Promise(r => setTimeout(r, 500));

  // Phase 2: restart, verify /api/decisions surfaces the entry
  const port2 = pickPort();
  board = spawnBoard(project, home, port2);
  try {
    await waitForBoard(port2);
    const r = await api(port2, '/api/decisions?limit=20');
    assert.equal(r.status, 200);
    const found = (r.body || []).some(d =>
      d.id === gate1 && (d.reason || '').includes('audit-test-marker-xyz')
    );
    assert.ok(found,
      `decisions log should preserve audit-test-marker-xyz entry across restart. ` +
      `Got ${r.body?.length || 0} decisions, none matched gate=${gate1}.`);
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});
