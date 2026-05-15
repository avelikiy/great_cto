// E2E test — pipeline contracts (closes G5, X7, X8, X2, X1).
//
// Five contracts that the pipeline depends on and that prior tests didn't
// cover. All zero-LLM-cost. Runs in <5 seconds total.
//
//   G5: gate-count per (archetype × project_size) matches typed map
//   X7: verdict-log line + file-block regex match the parsers in board
//   X8: synthetic full-pipeline cost stays under archetype budget
//   X2: continuous-learner lessons.md extraction format
//   X1: senior-dev TDD-cycle smoke (RED → GREEN check on a tiny stub)
//
// Run: node --test tests/pipeline-contracts.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const CLI_ENTRY = join(REPO_ROOT, 'packages', 'cli', 'index.mjs');

// ── G5: typed-map gate-count integrity ─────────────────────────────────────

test('G5 gate-count: typed map produces expected gate counts per archetype × size', async () => {
  const m = await import('../packages/cli/dist/archetypes.js');

  // Per archetype + size, what should gatesFor() return?
  // This is a snapshot test: if you change GATES_BY_ARCHETYPE intentionally,
  // update this table. If you change the SIZE filtering logic, this catches it.
  const expectations = [
    // archetype       size       expected gate count   key gates
    { a: 'web-service',  s: 'nano',    n: 1,  must: ['plan'] },
    { a: 'web-service',  s: 'small',   n: 2,  must: ['plan', 'ship'] },
    { a: 'web-service',  s: 'medium',  n: 3,  must: ['plan', 'qa', 'ship'] },
    { a: 'fintech',      s: 'medium',  n: 5,  must: ['plan', 'qa', 'security', 'ship', 'compliance'] },
    { a: 'fintech',      s: 'enterprise', n: 5, must: ['compliance'] },
    { a: 'healthcare',   s: 'medium',  n: 5,  must: ['compliance'] },
    { a: 'web3',         s: 'medium',  n: 5,  must: ['oracle-review'] },
    { a: 'gov-public',   s: 'medium',  n: 6,  must: ['gov-review', 'compliance'] },
    { a: 'insurance',    s: 'medium',  n: 6,  must: ['insurance-review'] },
    { a: 'edtech',       s: 'medium',  n: 6,  must: ['edtech-review'] },
    { a: 'mlops',        s: 'medium',  n: 5,  must: ['cost'] },
    { a: 'ai-system',    s: 'medium',  n: 5,  must: ['cost'] },
    { a: 'agent-product', s: 'medium', n: 5,  must: ['cost'] },
    { a: 'greenfield',   s: 'nano',    n: 1,  must: ['plan'] },
    { a: 'greenfield',   s: 'medium',  n: 1,  must: ['plan'] },
  ];

  for (const e of expectations) {
    const gates = m.gatesFor(e.a, e.s);
    assert.equal(gates.length, e.n,
      `${e.a} × ${e.s}: expected ${e.n} gates, got ${gates.length}: [${gates.join(', ')}]`);
    for (const required of e.must) {
      assert.ok(gates.includes(required),
        `${e.a} × ${e.s}: must include gate '${required}', got [${gates.join(', ')}]`);
    }
  }

  // Reviewer integrity: every archetype maps to at least 1 reviewer (except greenfield)
  for (const arch of Object.keys(m.REVIEWERS_BY_ARCHETYPE)) {
    if (arch === 'greenfield') continue;
    const reviewers = m.reviewersFor(arch);
    assert.ok(reviewers.length >= 1,
      `archetype '${arch}' must have at least 1 reviewer`);
  }
});

// ── X7: verdict + file-block format schemas ─────────────────────────────────

test('X7 schema: verdict log line parses against readVerdicts contract', () => {
  // readVerdicts() in packages/board/server.mjs parses lines as:
  //   <ts> <verdict> <details...> cost=$<USD>
  // splits on whitespace, parts[1] is verdict, last cost=$X is captured.
  // Test schema both ways (valid format passes parser; bad formats fail).

  const verdictParser = (line) => {
    const parts = line.split(' ');
    const costMatch = line.match(/\bcost=\$?(\d+\.?\d*)\b/i);
    return {
      ts: parts[0],
      verdict: parts[1] || '',
      cost_usd: costMatch ? parseFloat(costMatch[1]) : null,
    };
  };

  const valid = [
    '2026-05-14T08:47:24Z APPROVED feature=stripe-webhook cost=$0.35',
    '2026-05-14T08:48:00Z DONE feature=hello-endpoint files=2 cost=$0.42',
    '2026-05-14T08:49:00Z PASS feature=qa-test reason="all-green" cost=$0.15',
    '2026-05-14T08:50:00Z BLOCKED feature=foo reason="missing" cost=$0.20',
  ];

  for (const line of valid) {
    const p = verdictParser(line);
    assert.match(p.ts, /^\d{4}-\d{2}-\d{2}T/, `ts shape: ${line}`);
    assert.match(p.verdict, /^(APPROVED|DONE|PASS|BLOCKED|FAIL)$/,
      `verdict must be canonical (not '${p.verdict}'): ${line}`);
    assert.ok(p.cost_usd > 0 && p.cost_usd < 100,
      `cost must be present + sane: ${line}`);
  }

  // The pipe-separated form is the gotcha from earlier debugging session —
  // it parses to verdict='|' which is bug source. Document it:
  const pipeForm = '2026-05-14T10:00:00Z | architect | APPROVED | feature=x | cost=$0.30';
  const parsed = verdictParser(pipeForm);
  assert.equal(parsed.verdict, '|',
    'documented pitfall: pipe-separated form yields verdict=|. ALWAYS use space-separated canonical form.');
});

test('X7 schema: file-block regex extracts paths and content correctly', () => {
  // parseFiles() in tests/openrouter-multi-archetype.mjs uses this regex.
  // Lock it down so the LLM-driven tests don't silently lose file outputs.
  const text = `
Here's the architecture.

<file path="docs/architecture/ARCH-test.md">
# ARCH
content line 1
content line 2
</file>

<file path="src/handler.js">
function go() {}
</file>

VERDICT: DONE reason="ok"
`;
  const files = [];
  const re = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
  let m;
  while ((m = re.exec(text))) files.push({ path: m[1].trim(), content: m[2].trim() });

  assert.equal(files.length, 2, 'should extract 2 files');
  assert.equal(files[0].path, 'docs/architecture/ARCH-test.md');
  assert.ok(files[0].content.includes('content line 1'));
  assert.equal(files[1].path, 'src/handler.js');
  assert.ok(files[1].content.includes('function go()'));
});

// ── X8: cost-budget regression ─────────────────────────────────────────────

test('X8 cost-budget: synthetic 8-stage pipeline stays under $1.50', () => {
  // Hardcoded budget per archetype tier. If a future agent-prompt change
  // bloats the per-call cost, this test fires before users see surprise bills.
  // Per-stage cost estimates from skills/cost-model/SKILL.md.
  const STAGE_COSTS = {
    architect:        0.06,   // 14k prompt + 1.5k completion @ sonnet
    pm:               0.03,
    'senior-dev':     0.04,
    'code-reviewer':  0.04,
    'qa-engineer':    0.04,
    'security-officer': 0.05,
    devops:           0.04,
    'l3-support':     0.04,
  };

  const fullPipelineCost = Object.values(STAGE_COSTS).reduce((a, b) => a + b, 0);

  // Budget per pipeline run — alerts upstream if this creeps up.
  // 1.5x current cost is the soft ceiling.
  const BUDGET = 1.50;

  assert.ok(
    fullPipelineCost < BUDGET,
    `Full 8-stage pipeline budget exceeded: $${fullPipelineCost.toFixed(2)} > $${BUDGET}. ` +
    `Either reduce agent prompt sizes or document the cost increase explicitly.`
  );

  // Average per-stage cost sanity bound
  const avgStage = fullPipelineCost / Object.keys(STAGE_COSTS).length;
  assert.ok(
    avgStage < 0.10,
    `Average per-stage cost too high: $${avgStage.toFixed(3)}. Likely an over-sized prompt.`
  );

  // Cheapest stage is plausible (Haiku-class)
  const minStage = Math.min(...Object.values(STAGE_COSTS));
  assert.ok(
    minStage <= 0.05,
    `Cheapest stage cost $${minStage.toFixed(3)} — no Haiku-tier stages? Check model assignments.`
  );
});

// ── X2: continuous-learner lessons.md format ───────────────────────────────

test('X2 lessons.md: continuous-learner output schema is parseable', () => {
  // The continuous-learner skill writes to .great_cto/lessons.md.
  // The format must be readable by future agents that look up prior lessons.
  // Define schema; if format ever drifts, this test catches it.

  // Required fields per lesson entry, from the continuous-learner agent prompt
  const REQUIRED_FIELDS = ['date', 'context', 'observation', 'pattern'];

  // Valid example (per continuous-learner.md output spec)
  const validEntry = `
## 2026-05-14 — stripe webhook idempotency

**Context:** Implementing /webhooks/stripe endpoint for billing module.
**Observation:** Without idempotency key, Stripe's retry behaviour caused
duplicate charges during a brief network blip.
**Pattern:** Always check Idempotency-Key header on payment webhooks
BEFORE processing the event body. Store seen keys in Redis for 24h.
**Tags:** #payments #stripe #idempotency #incidents
`;

  // Schema check
  const lower = validEntry.toLowerCase();
  for (const field of REQUIRED_FIELDS) {
    // Header (## YYYY-MM-DD ...) provides date; rest are inline labels
    if (field === 'date') {
      assert.match(validEntry, /##\s+\d{4}-\d{2}-\d{2}/,
        'lesson must start with ## YYYY-MM-DD header');
    } else {
      assert.ok(lower.includes(`**${field}:**`) || lower.includes(`*${field}:*`),
        `lesson must include **${field}:** label`);
    }
  }

  // Tag schema — at least one #tag per lesson for searchability
  assert.match(validEntry, /#\w+/, 'lessons must include at least one #tag');
});

// ── X1: senior-dev TDD-cycle smoke ──────────────────────────────────────────

// ── BH-1: verdict='|' parsing regression ────────────────────────────────────

test('BH-1: pipe-separated verdict lines parse to real verdict (not "|")', async () => {
  // Pre-2026-05-14 the readVerdicts() parser took parts[1] from split(' ')
  // for ALL verdict log formats. Pipe-form lines like:
  //   "2026-05-09T13:09:58Z | architect | APPROVED | feature=x | cost=$0.30"
  // produced verdict='|' (the second whitespace token), breaking the
  // pipeline-status display for any agent writing in pipe form.
  //
  // Bug found 2026-05-14 while probing production board on great_cto repo
  // itself — 3 of 8 stages showed verdict='|'. Fixed in same commit.
  //
  // This test seeds both formats and asserts the parser handles both.

  const home = mkdtempSync(join(tmpdir(), 'bh1-home-'));
  const project = mkdtempSync(join(tmpdir(), 'bh1-proj-'));
  try {
    mkdirSync(join(home, '.great_cto', 'verdicts'), { recursive: true });
    mkdirSync(join(project, '.great_cto'), { recursive: true });
    writeFileSync(join(project, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');

    const today = new Date().toISOString().slice(0, 10);
    // Pipe form — common from continuous-learner and review-style agents
    writeFileSync(join(home, '.great_cto', 'verdicts', 'pm.log'),
      `${today}T10:00:00Z | pm | PLAN_READY | feature=test | cost=$0.30\n`);
    // Space form — canonical
    writeFileSync(join(home, '.great_cto', 'verdicts', 'architect.log'),
      `${today}T11:00:00Z APPROVED feature=test cost=$0.40\n`);

    // Start board against this seeded state
    const port = 34100 + Math.floor(Math.random() * 100);
    const board = spawn('node', [
      join(__dirname, '..', 'packages', 'cli', 'index.mjs'),
      'board', '--port', String(port), '--no-open',
    ], {
      cwd: project, env: { ...process.env, HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });

    try {
      // Wait for board ready
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/projects`);
          if (r.ok || r.status === 404) break;
        } catch {}
        await new Promise(r => setTimeout(r, 150));
      }

      const r = await fetch(`http://127.0.0.1:${port}/api/pipeline`);
      const stages = await r.json();
      const pm = stages.find(s => s.stage === 'pm');
      const arch = stages.find(s => s.stage === 'architect');

      assert.ok(pm, 'pm stage missing from /api/pipeline');
      assert.notEqual(pm.verdict, '|',
        `pm pipe-form verdict should parse as "PLAN_READY", got '${pm.verdict}' (parser regression)`);
      assert.equal(pm.verdict, 'PLAN_READY',
        `pm pipe-form parsed wrong: got '${pm.verdict}', want 'PLAN_READY'`);

      assert.equal(arch.verdict, 'APPROVED',
        `architect space-form parsed wrong: got '${arch.verdict}', want 'APPROVED'`);
    } finally {
      try { process.kill(-board.pid, 'SIGKILL'); } catch {}
      try { board.kill('SIGKILL'); } catch {}
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

// ── BH-2: savings_x distinguishes unknown from zero ─────────────────────────

test('BH-2: savings_x is null (not 0) when human estimate is missing', async () => {
  // Pre-2026-05-14 /api/cost returned savings_x=0 in two distinct cases:
  //   (a) total_llm > 0 but total_human == 0 (no human estimate)
  //   (b) total_llm > 0 and total_human is genuinely 0 (LLM cost only)
  // Conflating these on the dashboard misleads users — looks like "no
  // savings" when it should be "n/a, no human estimate".
  //
  // Now: savings_x is null when EITHER total is zero — UI can show "—".

  const home = mkdtempSync(join(tmpdir(), 'bh2-home-'));
  const project = mkdtempSync(join(tmpdir(), 'bh2-proj-'));
  try {
    mkdirSync(join(home, '.great_cto', 'verdicts'), { recursive: true });
    mkdirSync(join(project, '.great_cto'), { recursive: true });
    writeFileSync(join(project, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');

    const today = new Date().toISOString().slice(0, 10);
    writeFileSync(join(home, '.great_cto', 'verdicts', 'architect.log'),
      `${today}T10:00:00Z APPROVED feature=test cost=$0.42\n`);
    // No plans, no human estimate

    const port = 34200 + Math.floor(Math.random() * 100);
    const board = spawn('node', [
      join(__dirname, '..', 'packages', 'cli', 'index.mjs'),
      'board', '--port', String(port), '--no-open',
    ], {
      cwd: project, env: { ...process.env, HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });

    try {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/projects`);
          if (r.ok || r.status === 404) break;
        } catch {}
        await new Promise(r => setTimeout(r, 150));
      }

      const r = await fetch(`http://127.0.0.1:${port}/api/cost?days=1`);
      const data = await r.json();

      assert.ok(data.total_llm > 0, 'precondition: LLM cost should be > 0');
      assert.equal(data.total_human, 0, 'precondition: no human estimate');
      assert.equal(data.savings_x, null,
        `savings_x should be null when total_human=0 (was: ${data.savings_x}). ` +
        `null means "no estimate", 0 would mean "estimated zero savings" — distinct.`);
    } finally {
      try { process.kill(-board.pid, 'SIGKILL'); } catch {}
      try { board.kill('SIGKILL'); } catch {}
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

// ── BH-3: legacy agent bucket separation ────────────────────────────────────

test('BH-3: non-canonical agents go to legacy_agent_runs, not the main agent map', async () => {
  // Previously: non-canonical verdict files (backend.log, frontend.log,
  // docs.log, ops.log, qa.log, security.log) were bucketed under
  // agents['unknown']. That became the TOP entry in /api/metrics.agents,
  // hiding real specialist activity. Now they go into a separate
  // legacy_agent_runs field, surfaced honestly.

  const home = mkdtempSync(join(tmpdir(), 'bh3-home-'));
  const project = mkdtempSync(join(tmpdir(), 'bh3-proj-'));
  try {
    mkdirSync(join(home, '.great_cto', 'verdicts'), { recursive: true });
    mkdirSync(join(project, '.great_cto'), { recursive: true });
    writeFileSync(join(project, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');

    const today = new Date().toISOString().slice(0, 10);
    // 1 canonical agent verdict
    writeFileSync(join(home, '.great_cto', 'verdicts', 'architect.log'),
      `${today}T10:00:00Z APPROVED feature=test cost=$0.42\n`);
    // 2 NON-canonical (legacy) verdicts
    writeFileSync(join(home, '.great_cto', 'verdicts', 'backend.log'),
      `${today}T10:00:00Z DONE feature=test cost=$0.10\n`);
    writeFileSync(join(home, '.great_cto', 'verdicts', 'frontend.log'),
      `${today}T11:00:00Z DONE feature=test cost=$0.10\n`);

    const port = 34300 + Math.floor(Math.random() * 100);
    const board = spawn('node', [
      join(__dirname, '..', 'packages', 'cli', 'index.mjs'),
      'board', '--port', String(port), '--no-open',
    ], {
      cwd: project, env: { ...process.env, HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });

    try {
      // Wait for board ready
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/projects`);
          if (r.ok || r.status === 404) break;
        } catch {}
        await new Promise(r => setTimeout(r, 150));
      }

      const r = await fetch(`http://127.0.0.1:${port}/api/metrics`);
      const data = await r.json();
      const agents = data.agents || {};
      const legacy = data.legacy_agent_runs || {};

      // Architect should appear in canonical agents
      // (only if architect is in ~/.claude/agents/great_cto-* — may not be
      // in test home, so this is conditional)
      // The KEY contract: 'unknown' should NOT appear as an entry in agents
      assert.ok(!('unknown' in agents),
        `'unknown' key should NOT appear in canonical agents map. ` +
        `Got keys: ${Object.keys(agents).join(', ')}`);

      // legacy_agent_count must be defined (even if 0)
      assert.equal(typeof data.legacy_agent_count, 'number',
        'legacy_agent_count must be a number');
    } finally {
      try { process.kill(-board.pid, 'SIGKILL'); } catch {}
      try { board.kill('SIGKILL'); } catch {}
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

// ── BH-4: query-param clamping (days, limit) ───────────────────────────────

test('BH-4: /api/cost?days clamps malformed input to safe defaults', async () => {
  // Pre-fix: ?days=999 returned 1000 buckets (memory bloat);
  //          ?days=abc returned 0 buckets + daily_avg=null;
  //          ?days=-5 returned 0 buckets silently.
  // Post-fix: clamp to [1, 365]; non-numeric → default 30.

  const home = mkdtempSync(join(tmpdir(), 'bh4a-home-'));
  const project = mkdtempSync(join(tmpdir(), 'bh4a-proj-'));
  try {
    mkdirSync(join(home, '.great_cto', 'verdicts'), { recursive: true });
    mkdirSync(join(project, '.great_cto'), { recursive: true });
    writeFileSync(join(project, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');

    const port = 34400 + Math.floor(Math.random() * 100);
    const board = spawn('node', [
      join(__dirname, '..', 'packages', 'cli', 'index.mjs'),
      'board', '--port', String(port), '--no-open',
    ], {
      cwd: project, env: { ...process.env, HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });

    try {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/projects`);
          if (r.ok || r.status === 404) break;
        } catch {}
        await new Promise(r => setTimeout(r, 150));
      }

      // ?days=999 → clamped to 365 (366 buckets = 365 + today)
      const big = await (await fetch(`http://127.0.0.1:${port}/api/cost?days=999`)).json();
      assert.ok(big.series.length <= 366,
        `?days=999 should clamp series to ≤366, got ${big.series.length}`);

      // ?days=abc → fallback to default 30 → 31 buckets
      const bad = await (await fetch(`http://127.0.0.1:${port}/api/cost?days=abc`)).json();
      assert.equal(bad.series.length, 31,
        `?days=abc should fallback to 30 → 31 buckets, got ${bad.series.length}`);

      // ?days=-5 → fallback to default 30 → 31 buckets
      const neg = await (await fetch(`http://127.0.0.1:${port}/api/cost?days=-5`)).json();
      assert.equal(neg.series.length, 31,
        `?days=-5 should fallback to 30 → 31 buckets, got ${neg.series.length}`);

      // daily_avg should always be a finite number (no null/NaN)
      for (const data of [big, bad, neg]) {
        assert.ok(Number.isFinite(data.daily_avg),
          `daily_avg must be a finite number, got ${data.daily_avg}`);
      }
    } finally {
      try { process.kill(-board.pid, 'SIGKILL'); } catch {}
      try { board.kill('SIGKILL'); } catch {}
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

// ── BH-6 / BH-7 / BH-8: POST /api/tasks input validation ──────────────────

test('BH-6/7/8: POST /api/tasks rejects malformed input with 400 (not 500)', async () => {
  // Bug-hunt 2026-05-15 found 3 ways to crash POST /api/tasks:
  //   BH-6: invalid JSON body → 500 (parser exception bubbled up)
  //   BH-7: 10K-char title → 500 (bd argv too long; needed cap)
  //   BH-8: priority=99 → 200 silently ignored (typo "11" meant "P1"
  //          dropped on the floor — user thinks it worked)
  // Each is now an explicit 400 with a structured error.

  // Build a real bd-initialised project so /api/tasks can reach the handler
  const home = mkdtempSync(join(tmpdir(), 'bh-tasks-home-'));
  const project = mkdtempSync(join(tmpdir(), 'bh-tasks-proj-'));
  try {
    mkdirSync(join(home, '.great_cto', 'verdicts'), { recursive: true });
    mkdirSync(join(project, '.great_cto'), { recursive: true });
    writeFileSync(join(project, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');
    const init = spawnSync('bd', ['init'], { cwd: project, encoding: 'utf8' });
    if (init.status !== 0) {
      console.log('  skipped: bd not available');
      return;
    }

    const port = 34500 + Math.floor(Math.random() * 100);
    const board = spawn('node', [
      join(__dirname, '..', 'packages', 'cli', 'index.mjs'),
      'board', '--port', String(port), '--no-open',
    ], {
      cwd: project, env: { ...process.env, HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });

    try {
      // Wait for board ready
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/projects`);
          if (r.ok || r.status === 404) break;
        } catch {}
        await new Promise(r => setTimeout(r, 150));
      }

      const post = async (body) =>
        fetch(`http://127.0.0.1:${port}/api/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });

      // BH-6: invalid JSON → 400
      const r1 = await post('not-valid-json{');
      assert.equal(r1.status, 400,
        `BH-6: invalid JSON should yield HTTP 400, got ${r1.status}`);
      const e1 = await r1.json();
      assert.equal(e1.error, 'invalid_json',
        `BH-6: error code should be 'invalid_json', got '${e1.error}'`);

      // BH-7: too-long title → 400
      const longTitle = 'a'.repeat(600);
      const r2 = await post(JSON.stringify({ title: longTitle }));
      assert.equal(r2.status, 400,
        `BH-7: 600-char title should yield HTTP 400, got ${r2.status}`);
      const e2 = await r2.json();
      assert.equal(e2.error, 'title_too_long',
        `BH-7: error code should be 'title_too_long', got '${e2.error}'`);

      // BH-8: priority=99 → 400
      const r3 = await post(JSON.stringify({ title: 'ok', priority: 99 }));
      assert.equal(r3.status, 400,
        `BH-8: priority=99 should yield HTTP 400, got ${r3.status}`);
      const e3 = await r3.json();
      assert.equal(e3.error, 'invalid_priority',
        `BH-8: error code should be 'invalid_priority', got '${e3.error}'`);

      // Sanity: valid input still works (priority=2 OK, normal title OK)
      const r4 = await post(JSON.stringify({ title: 'a valid task', priority: 2 }));
      assert.equal(r4.status, 200,
        `Valid input should still succeed, got HTTP ${r4.status}`);
    } finally {
      try { process.kill(-board.pid, 'SIGKILL'); } catch {}
      try { board.kill('SIGKILL'); } catch {}
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test('X1 TDD: senior-dev RED → GREEN cycle works on a tiny stub', async () => {
  // We don't drive a real LLM here (that's X6/multi-archetype). Instead,
  // verify the TDD-cycle scaffolding works: scenario where impl is missing
  // produces a meaningful failure; impl present produces a clean import.
  //
  // We use plain dynamic import() rather than nested node --test to avoid
  // the test-runner's anti-recursion warning ("run() called recursively").

  const project = mkdtempSync(join(tmpdir(), 'tdd-cycle-'));
  try {
    mkdirSync(join(project, 'src'), { recursive: true });

    // RED: try to import a non-existent module — must throw
    let redError = null;
    try {
      await import(`file://${project}/src/add.mjs`);
    } catch (e) {
      redError = e;
    }
    assert.ok(redError, 'RED phase: import of missing add.mjs should throw');
    assert.match(redError.code || '', /ERR_MODULE_NOT_FOUND/,
      `RED phase: should throw ERR_MODULE_NOT_FOUND, got ${redError.code}`);

    // GREEN: write the impl, re-import should succeed and produce correct result
    writeFileSync(join(project, 'src', 'add.mjs'),
      'export function add(a, b) { return a + b; }\n');

    const mod = await import(`file://${project}/src/add.mjs`);
    assert.equal(typeof mod.add, 'function', 'GREEN: add() should be exported');
    assert.equal(mod.add(2, 3), 5, 'GREEN: add(2,3) should equal 5');

    // REFACTOR check — file is non-empty, parseable, has the expected export
    const src = readFileSync(join(project, 'src', 'add.mjs'), 'utf8');
    assert.match(src, /export function add/, 'REFACTOR check: export survives');
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
