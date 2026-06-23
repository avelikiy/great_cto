// E2E test #1 — Full pipeline (artifacts-driven simulation).
//
// Why not "real" pipeline: great_cto's pipeline is driven by the LLM host
// (Claude Code, Cursor, Codex), not by great_cto itself. Without a real
// LLM provider, we can't truly run /start → architect → pm → senior-dev
// → ... in a test. But we CAN test what the board does GIVEN that an
// LLM-driven pipeline has produced artifacts:
//
//   1. Seed verdict logs for each agent (as if they ran and reported)
//   2. Seed bd tasks + gates (as if pm decomposed work + gates opened)
//   3. Approve gates via API (real human-in-the-loop)
//   4. Verify board reflects pipeline state at each stage
//
// This catches regressions in: pipeline stage detection, verdict→stage
// mapping, gate state machine, cost aggregation across stages, and
// /api/pipeline endpoint correctness — i.e. everything between the LLM
// output and the user's screen.
//
// Run: node --test tests/pipeline-e2e.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = join(__dirname, '..', 'packages', 'cli', 'index.mjs');

const bdProbe = spawnSync('bd', ['--version'], { encoding: 'utf8' });
const BD_AVAILABLE = bdProbe.status === 0;

// ── helpers ────────────────────────────────────────────────────────────────

function pickPort() { return 37000 + Math.floor(Math.random() * 2000); }

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
  const home = mkdtempSync(join(tmpdir(), 'gcto-pipe-home-'));
  const project = mkdtempSync(join(tmpdir(), 'gcto-pipe-proj-'));
  // Verdicts are per-project: write to <project>/.great_cto/verdicts/
  mkdirSync(join(project, '.great_cto', 'verdicts'), { recursive: true });
  mkdirSync(join(project, 'docs', 'arch'), { recursive: true });
  mkdirSync(join(project, 'docs', 'plans'), { recursive: true });
  mkdirSync(join(project, 'docs', 'threat-models'), { recursive: true });
  writeFileSync(join(project, '.great_cto', 'PROJECT.md'),
    'archetype: web-service\nprimary: web-service\ncompliance:\n  - gdpr\n');

  const init = spawnSync('bd', ['init'], { cwd: project, encoding: 'utf8' });
  if (init.status !== 0) throw new Error(`bd init failed: ${init.stderr || init.stdout}`);
  return { home, project };
}

function bdCreate(project, title, opts = {}) {
  const args = ['create', title, '--priority', opts.priority || 'P1'];
  const r = spawnSync('bd', args, { cwd: project, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`bd create failed: ${r.stderr}`);
  const m = (r.stdout || '').match(/Created issue:\s*(\S+)/);
  if (!m) throw new Error(`could not parse bd create: ${r.stdout}`);
  const id = m[1];
  if (opts.label) {
    spawnSync('bd', ['update', id, '--add-label', opts.label], { cwd: project, encoding: 'utf8' });
  }
  if (opts.agent) {
    spawnSync('bd', ['update', id, '--assignee', opts.agent, '--add-label', opts.agent],
      { cwd: project, encoding: 'utf8' });
  }
  return id;
}

function bdClose(project, id) {
  const r = spawnSync('bd', ['update', id, '--status', 'closed'],
    { cwd: project, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`bd close ${id} failed: ${r.stderr}`);
}

function seedVerdict(project, agent, ts, verdict, details, costUsd) {
  // readVerdicts() in board/server.mjs parses by splitting on whitespace and
  // taking parts[1] as the verdict — so the canonical format is:
  //   <ISO-ts> <VERDICT> <details...> cost=$<USD>
  // (Some production logs use pipe-separated "ts | agent | verdict | …" but
  // that parses to verdict='|' under the current parser. We use the canonical
  // space form so getPipeline() can correctly resolve status=done.)
  // Verdicts are now per-project; write to <project>/.great_cto/verdicts/
  const file = join(project, '.great_cto', 'verdicts', `${agent}.log`);
  const line = `${ts} ${verdict} ${details} cost=$${costUsd.toFixed(2)}\n`;
  appendFileSync(file, line);
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

test('pipeline: full 9-stage simulation reports each stage as done', { skip: !BD_AVAILABLE && 'bd CLI not installed' }, async () => {
  const { home, project } = makeProject();

  // Seed artifacts for all 8 pipeline stages with realistic costs.
  // ts must be RECENT — pipeline stage status uses a 30-min active window
  // to distinguish "done recently" from "stale". Use NOW so all show as done.
  const now = new Date();
  const isoMinusMin = (m) => new Date(now.getTime() - m * 60 * 1000).toISOString();

  const stages = [
    { agent: 'product-owner',    ts: isoMinusMin(29), cost: 0.50, verdict: 'APPROVED' },
    { agent: 'architect',        ts: isoMinusMin(28), cost: 0.42, verdict: 'APPROVED' },
    { agent: 'pm',               ts: isoMinusMin(24), cost: 0.18, verdict: 'APPROVED' },
    { agent: 'senior-dev',       ts: isoMinusMin(18), cost: 1.20, verdict: 'DONE'     },
    { agent: 'code-reviewer',    ts: isoMinusMin(14), cost: 0.32, verdict: 'APPROVED' },
    { agent: 'qa-engineer',      ts: isoMinusMin(10), cost: 0.45, verdict: 'PASS'     },
    { agent: 'security-officer', ts: isoMinusMin(7),  cost: 0.28, verdict: 'APPROVED' },
    { agent: 'devops',           ts: isoMinusMin(4),  cost: 0.15, verdict: 'DONE'     },
    { agent: 'l3-support',       ts: isoMinusMin(1),  cost: 0.05, verdict: 'DONE'     },
  ];
  for (const s of stages) {
    seedVerdict(project, s.agent, s.ts, s.verdict, `feature=stripe-webhook stage=${s.agent}`, s.cost);
  }

  const port = pickPort();
  const board = spawnBoard(project, home, port);

  try {
    await waitForBoard(port);

    // 1. /api/pipeline should report each agent stage as done, plus the human-gate node.
    const pipeline = await api(port, '/api/pipeline');
    assert.equal(pipeline.status, 200, `/api/pipeline returned ${pipeline.status}`);
    assert.ok(Array.isArray(pipeline.body), `pipeline body should be array, got ${typeof pipeline.body}`);
    // The pipeline surfaces the human gate AS A STAGE (just before the irreversible
    // devops step), so the body is the 8 agent stages + 1 human-gate node.
    const agentNodes = pipeline.body.filter(s => !s.is_human_gate);
    const gateNodes = pipeline.body.filter(s => s.is_human_gate);
    assert.equal(agentNodes.length, 9, `expected 9 agent stages, got ${agentNodes.length}`);
    assert.equal(gateNodes.length, 1, `expected exactly 1 human-gate node, got ${gateNodes.length}`);
    // The gate must sit immediately before devops on the rail.
    const gateIdx = pipeline.body.findIndex(s => s.is_human_gate);
    const devopsIdx = pipeline.body.findIndex(s => s.stage === 'devops');
    assert.equal(gateIdx + 1, devopsIdx, `human-gate should sit immediately before devops (gate@${gateIdx}, devops@${devopsIdx})`);

    const stagesByName = Object.fromEntries(pipeline.body.map(s => [s.stage, s]));
    const expectedDone = ['product-owner', 'architect', 'pm', 'senior-dev', 'reviewers', 'qa-engineer', 'security-officer', 'devops', 'l3-support'];
    for (const stage of expectedDone) {
      const s = stagesByName[stage];
      assert.ok(s, `missing pipeline stage: ${stage}`);
      assert.equal(s.status, 'done',
        `stage ${stage} should be 'done' (has verdict=${s.verdict}), got status=${s.status}`);
    }

    // 2. /api/cost should accumulate verdicts: total = sum of all cost=$X
    const cost = await api(port, '/api/cost?days=1');
    const expectedTotal = stages.reduce((a, s) => a + s.cost, 0); // 3.05
    assert.ok(
      Math.abs(cost.body.total_llm - expectedTotal) < 0.02,
      `total_llm: expected ~$${expectedTotal.toFixed(2)}, got $${cost.body.total_llm}`
    );

    // 3. /api/cost ratio sanity (regression check for 7,638×)
    if (cost.body.total_llm > 0 && cost.body.total_human > 0) {
      const ratio = cost.body.total_human / cost.body.total_llm;
      assert.ok(ratio <= 1000, `pipeline cost ratio ${ratio.toFixed(0)}× exceeds plausible ceiling`);
    }
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

test('pipeline: gate state transitions reflect in /api/inbox', { skip: !BD_AVAILABLE && 'bd CLI not installed' }, async () => {
  const { home, project } = makeProject();

  // Two gates open: plan + ship. Pipeline simulation:
  //  - gate:plan opens (architect done) → 1 pending in inbox
  //  - approve gate:plan → inbox shows 1 pending (ship still open)
  //  - approve gate:ship → inbox shows 0 pending
  const gatePlan = bdCreate(project, 'gate: plan approval for stripe-webhook', { label: 'gate' });
  const gateShip = bdCreate(project, 'gate: ship v2.7.1', { label: 'gate' });

  const port = pickPort();
  const board = spawnBoard(project, home, port);

  try {
    await waitForBoard(port);

    // Stage 1: both gates open → 2 pending
    let inbox = await api(port, '/api/inbox');
    assert.equal(inbox.body.summary.gates, 2,
      `2 gates open, /api/inbox.summary.gates should be 2, got ${inbox.body.summary.gates}`);

    // Stage 2: approve gate:plan → 1 pending
    const r1 = await api(port, `/api/gates/${gatePlan}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', reason: 'plan looks good' }),
    });
    assert.equal(r1.status, 200, `approve gate:plan failed: ${JSON.stringify(r1.body)}`);

    // bd cache lives ~500ms — wait briefly for invalidation
    await new Promise(r => setTimeout(r, 700));
    inbox = await api(port, '/api/inbox');
    assert.equal(inbox.body.summary.gates, 1,
      `1 gate remaining after plan-approve, got ${inbox.body.summary.gates}`);

    // Stage 3: approve gate:ship → 0 pending
    const r2 = await api(port, `/api/gates/${gateShip}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', reason: 'shipping' }),
    });
    assert.equal(r2.status, 200, `approve gate:ship failed: ${JSON.stringify(r2.body)}`);

    await new Promise(r => setTimeout(r, 700));
    inbox = await api(port, '/api/inbox');
    assert.equal(inbox.body.summary.gates, 0,
      `0 gates after both approved, got ${inbox.body.summary.gates}`);
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

test('pipeline: failed verdict marks stage as failed (not done)', { skip: !BD_AVAILABLE && 'bd CLI not installed' }, async () => {
  const { home, project } = makeProject();
  const now = new Date();
  const isoMinusMin = (m) => new Date(now.getTime() - m * 60 * 1000).toISOString();

  // architect APPROVED, but security-officer BLOCKED → pipeline stuck
  seedVerdict(project, 'architect',         isoMinusMin(20), 'APPROVED', 'feature=test', 0.42);
  seedVerdict(project, 'security-officer',  isoMinusMin(2),  'BLOCKED',  'feature=test criticals=1', 0.28);

  const port = pickPort();
  const board = spawnBoard(project, home, port);

  try {
    await waitForBoard(port);
    const pipeline = await api(port, '/api/pipeline');
    const stages = Object.fromEntries(pipeline.body.map(s => [s.stage, s]));

    assert.equal(stages['architect'].status, 'done',
      `architect APPROVED should map to status=done, got ${stages['architect'].status}`);
    assert.equal(stages['security-officer'].status, 'failed',
      `security-officer BLOCKED should map to status=failed, got ${stages['security-officer'].status}`);
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

test('pipeline: cumulative cost across multiple feature runs', { skip: !BD_AVAILABLE && 'bd CLI not installed' }, async () => {
  const { home, project } = makeProject();
  const now = new Date();
  const isoMinusMin = (m) => new Date(now.getTime() - m * 60 * 1000).toISOString();

  // Three feature pipelines, each with 3 agents — total 9 verdicts
  const features = ['stripe-webhook', 'oauth-refresh', 'billing-tax'];
  let expected = 0;
  for (let f = 0; f < features.length; f++) {
    for (const agent of ['architect', 'senior-dev', 'qa-engineer']) {
      const cost = 0.30 + (f * 0.05);
      seedVerdict(project, agent, isoMinusMin(5 - f), 'APPROVED', `feature=${features[f]}`, cost);
      expected += cost;
    }
  }

  const port = pickPort();
  const board = spawnBoard(project, home, port);

  try {
    await waitForBoard(port);
    const cost = await api(port, '/api/cost?days=1');
    assert.ok(
      Math.abs(cost.body.total_llm - expected) < 0.05,
      `cumulative across 3 features: expected ~$${expected.toFixed(2)}, got $${cost.body.total_llm}`
    );
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});
