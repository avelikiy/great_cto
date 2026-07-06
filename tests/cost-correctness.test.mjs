// E2E test #3 — Cost dashboard correctness.
//
// Defends against the 7,638× regression class of bugs: outdated pricing,
// missing context tokens, double-counting, wrong currency.
//
// Seeds known verdict cost values into a tmp HOME, starts the board server,
// hits /api/cost, asserts:
//   1. total_llm matches sum of seeded costs
//   2. daily buckets isolate correctly (today vs yesterday)
//   3. ratio total_human/total_llm is in plausible bounds [0, 1000]
//   4. empty state returns zero (no false numbers)
//
// Run: node --test tests/cost-correctness.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = join(__dirname, '..', 'packages', 'cli', 'index.mjs');

// ── helpers ────────────────────────────────────────────────────────────────

function pickPort() {
  return 33000 + Math.floor(Math.random() * 2000);
}

async function waitForBoard(port, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/projects`);
      if (r.ok || r.status === 404) return; // 404 also means server is up
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`board did not start on port ${port}`);
}

async function fetchJson(port, path) {
  const r = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!r.ok) throw new Error(`${path} returned ${r.status}`);
  return r.json();
}

function makeProject({ verdicts = {}, projectMd = 'archetype: web-service\n' } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'gcto-cost-home-'));
  const project = mkdtempSync(join(tmpdir(), 'gcto-cost-proj-'));
  // Verdicts are per-project: write to <project>/.great_cto/verdicts/
  mkdirSync(join(project, '.great_cto', 'verdicts'), { recursive: true });
  writeFileSync(join(project, '.great_cto', 'PROJECT.md'), projectMd);
  for (const [agent, content] of Object.entries(verdicts)) {
    writeFileSync(join(project, '.great_cto', 'verdicts', `${agent}.log`), content);
  }
  return { home, project };
}

function spawnBoard(project, home, port) {
  // detached: true puts the board in its own process group, so we can kill
  // the whole tree (including any child SSE keep-alive threads) with one
  // signal to -PID. Without this, board.kill('SIGTERM') hits only the main
  // process and orphans children → test runner never exits.
  return spawn('node', [CLI_ENTRY, 'board', '--port', String(port), '--no-open'], {
    cwd: project,
    env: { ...process.env, HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
}

function killBoardTree(board) {
  try { process.kill(-board.pid, 'SIGKILL'); } catch {}
  // Belt-and-braces — also kill the main pid if the group kill missed it.
  try { board.kill('SIGKILL'); } catch {}
}

function cleanup(...dirs) {
  for (const d of dirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch {}
  }
}

// ── tests ──────────────────────────────────────────────────────────────────

test('cost: verdict cost=$X values sum into total_llm', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);

  const { home, project } = makeProject({
    verdicts: {
      'architect':     `${today}T10:00:00Z ok cost=$0.42\n${today}T11:00:00Z ok cost=$0.38\n`,
      'senior-dev':    `${today}T12:00:00Z ok cost=$1.20\n${yesterday}T10:00:00Z ok cost=$0.80\n`,
      'code-reviewer': `${yesterday}T11:00:00Z ok cost=$0.15\n`,
    },
  });
  const port = pickPort();
  const board = spawnBoard(project, home, port);

  try {
    await waitForBoard(port);
    const data = await fetchJson(port, '/api/cost?days=30');

    const expected = 0.42 + 0.38 + 1.20 + 0.80 + 0.15; // 2.95

    assert.ok(
      Math.abs(data.total_llm - expected) < 0.02,
      `expected total_llm ≈ ${expected.toFixed(2)}, got ${data.total_llm}`
    );

    // Daily isolation: today vs yesterday
    const todayBucket = data.series.find(s => s.date === today);
    const yBucket = data.series.find(s => s.date === yesterday);
    assert.ok(todayBucket, `today (${today}) bucket missing from series`);
    assert.ok(yBucket, `yesterday (${yesterday}) bucket missing`);

    const todayExpected = 0.42 + 0.38 + 1.20;     // 2.00
    const yExpected     = 0.80 + 0.15;            // 0.95
    assert.ok(
      Math.abs(todayBucket.llm - todayExpected) < 0.02,
      `today.llm: expected ${todayExpected.toFixed(2)}, got ${todayBucket.llm}`
    );
    assert.ok(
      Math.abs(yBucket.llm - yExpected) < 0.02,
      `yesterday.llm: expected ${yExpected.toFixed(2)}, got ${yBucket.llm}`
    );
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

test('cost: ratio sanity bounds — anti-regression for the 7,638× class', async () => {
  // Same seed as previous test — we just check the human/LLM ratio shape.
  const today = new Date().toISOString().slice(0, 10);
  const { home, project } = makeProject({
    verdicts: {
      'architect':  `${today}T10:00:00Z ok cost=$0.42\n`,
      'senior-dev': `${today}T12:00:00Z ok cost=$1.20\n`,
    },
  });
  const port = pickPort();
  const board = spawnBoard(project, home, port);

  try {
    await waitForBoard(port);
    const data = await fetchJson(port, '/api/cost?days=30');

    // total_human comes from plans + bd tasks. With no plans + no closed
    // tasks, total_human should be 0. Real test of "implausible ratio" only
    // bites when human cost exists. Seed a fake plan with both fields.
    // For the bare-verdicts case here we just assert the math doesn't
    // produce a NaN/Infinity or wildly negative number.
    const totalLlm = data.total_llm;
    const totalHuman = data.total_human;

    assert.ok(Number.isFinite(totalLlm), `total_llm is not a finite number: ${totalLlm}`);
    assert.ok(Number.isFinite(totalHuman), `total_human is not a finite number: ${totalHuman}`);
    assert.ok(totalLlm >= 0, `total_llm went negative: ${totalLlm}`);
    assert.ok(totalHuman >= 0, `total_human went negative: ${totalHuman}`);

    // If both present, check ratio plausibility — the 7,638× check.
    if (totalLlm > 0 && totalHuman > 0) {
      const ratio = totalHuman / totalLlm;
      assert.ok(
        ratio <= 1000,
        `cost ratio ${ratio.toFixed(0)}× exceeds plausible 1000× ceiling — likely outdated token pricing or context-tokens dropped from accounting (the 7,638× bug class).`
      );
    }
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

test('cost: empty state returns zero (no false numbers)', async () => {
  const { home, project } = makeProject(); // no verdicts seeded
  const port = pickPort();
  const board = spawnBoard(project, home, port);

  try {
    await waitForBoard(port);
    const data = await fetchJson(port, '/api/cost?days=30');

    assert.equal(data.total_llm, 0, `empty state total_llm should be 0, got ${data.total_llm}`);
    assert.equal(data.total_human, 0, `empty state total_human should be 0, got ${data.total_human}`);
    assert.equal(data.total_plans, 0, `empty state total_plans should be 0, got ${data.total_plans}`);
    assert.ok(Array.isArray(data.series), `series must be an array`);
    assert.equal(data.series.length, 31, `30-day window should yield 31 buckets (inclusive), got ${data.series.length}`);
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

test('cost: malformed verdict lines do not crash /api/cost', async () => {
  // Defence against parse-error regressions — server should tolerate junk.
  const today = new Date().toISOString().slice(0, 10);
  const { home, project } = makeProject({
    verdicts: {
      'architect': [
        '',                                          // empty line
        'not-a-timestamp ok cost=$5.00',             // bad ts
        `${today}T10:00:00Z ok cost=$invalid`,       // bad number
        `${today}T11:00:00Z ok cost=$0.50`,          // good
        `${today}T12:00:00Z malformed`,              // no cost
        `${today}T13:00:00Z ok cost=$abc cost=$0.25`, // regex skips abc, matches 0.25
      ].join('\n'),
    },
  });
  const port = pickPort();
  const board = spawnBoard(project, home, port);

  try {
    await waitForBoard(port);
    const data = await fetchJson(port, '/api/cost?days=30');
    // Valid lines: $0.50 + $0.25 (regex skips the unparseable "abc" and
    // picks up the next numeric cost= match on that line). $5.00 line is
    // dropped because its ts doesn't slice to a valid date bucket.
    // $invalid line returns cost_usd=null. "no cost" line returns null too.
    const expected = 0.50 + 0.25;
    assert.ok(
      Math.abs(data.total_llm - expected) < 0.02,
      `expected ~$${expected.toFixed(2)} from 2 valid lines, got $${data.total_llm}`
    );
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

test('cost: rejects mid-line "LLM" reference (the $240 regression bug)', async () => {
  // This is the bug a real LLM-written PLAN doc triggered:
  //   "**Cost**: $0.50–1.20 LLM | $240–360 human equivalent"
  // The old regex /LLM[^\n]*?\$(\d+\.?\d*)/i grabbed $240 as LLM cost because
  // it found "LLM" mid-line and then the NEXT $-amount, which was the human
  // number. Anchored regex (line-start) now rejects mid-line labels.
  const { home, project } = makeProject();
  const today = new Date().toISOString().slice(0, 10);

  // Set up project with a docs/plans dir containing the trap content
  const plansDir = join(project, 'docs', 'plans');
  mkdirSync(plansDir, { recursive: true });
  const trapPlan = `# PLAN

## Quick summary
- **Cost**: $0.50–1.20 LLM | $240–360 human equivalent
- **Duration**: 15 min

## Tasks
1. Build endpoint
`;
  writeFileSync(join(plansDir, 'PLAN-trap.md'), trapPlan);

  const port = pickPort();
  const board = spawnBoard(project, home, port);
  try {
    await waitForBoard(port);
    const data = await fetchJson(port, '/api/cost?days=1');
    // No anchored LLM label, no anchored Human label → both should be zero
    assert.equal(data.total_llm, 0,
      `mid-line "LLM" should not match. Got total_llm=$${data.total_llm}`);
    assert.equal(data.total_human, 0,
      `mid-line "human" should not match. Got total_human=$${data.total_human}`);
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

test('cost: ratio guard suppresses implausible human/LLM ratios', async () => {
  // Even if the LLM parser succeeds with a tiny value, the human parser
  // matching a "$7,500 saved" line should NOT produce a 7,500× ratio.
  const { home, project } = makeProject();
  const plansDir = join(project, 'docs', 'plans');
  mkdirSync(plansDir, { recursive: true });
  writeFileSync(join(plansDir, 'PLAN-implausible.md'),
    `# PLAN\n\n**LLM**: $0.01 (one cent, comically low)\n**Human**: $50,000 saved (5 weeks)\n`);

  const port = pickPort();
  const board = spawnBoard(project, home, port);
  try {
    await waitForBoard(port);
    const data = await fetchJson(port, '/api/cost?days=1');
    // LLM matches $0.01. Human matches $50,000 → ratio = 5,000,000× → suppressed.
    assert.ok(data.total_llm > 0 && data.total_llm < 1,
      `expected tiny but non-zero total_llm, got $${data.total_llm}`);
    assert.equal(data.total_human, 0,
      `total_human should be suppressed when ratio > 1000×. Got $${data.total_human}`);
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

test('cost: by_feature aggregates verdict feature= tags', async () => {
  // Verdicts with feature= tags should be aggregated into by_feature array.
  const today = new Date().toISOString().slice(0, 10);
  const { home, project } = makeProject({
    verdicts: {
      'architect':   `${today}T10:00:00Z APPROVED feature=auth cost=$0.30\n${today}T11:00:00Z APPROVED feature=auth cost=$0.20\n`,
      'senior-dev':  `${today}T12:00:00Z DONE feature=billing cost=$0.50\n`,
      'qa-engineer': `${today}T13:00:00Z DONE feature=auth cost=$0.10\n`,
    },
  });
  const port = pickPort();
  const board = spawnBoard(project, home, port);
  try {
    await waitForBoard(port);
    const data = await fetchJson(port, '/api/cost?days=7');

    assert.ok(Array.isArray(data.by_feature), 'by_feature must be an array');
    // auth: 0.30 + 0.20 + 0.10 = 0.60 (3 runs)
    const auth = data.by_feature.find(f => f.feature === 'auth');
    assert.ok(auth, 'auth feature missing from by_feature');
    assert.ok(Math.abs(auth.llm - 0.60) < 0.02, `auth.llm expected 0.60, got ${auth.llm}`);
    assert.equal(auth.runs, 3, `auth.runs expected 3, got ${auth.runs}`);
    // billing: 0.50 (1 run)
    const billing = data.by_feature.find(f => f.feature === 'billing');
    assert.ok(billing, 'billing feature missing from by_feature');
    assert.ok(Math.abs(billing.llm - 0.50) < 0.02, `billing.llm expected 0.50, got ${billing.llm}`);
    // sorted desc by cost — auth (0.60) before billing (0.50)
    assert.equal(data.by_feature[0].feature, 'auth', 'by_feature should be sorted desc by llm');
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

test('metrics: measured verdict cost becomes canonical when it clears the trust gate', async () => {
  const today = new Date().toISOString().slice(0, 10);
  // 4 windowed verdicts all carrying a real cost → coverage ≥ 3, spend ≥ 1¢.
  const { home, project } = makeProject({
    verdicts: {
      'architect':     `${today}T10:00:00Z ok cost=$0.40\n`,
      'senior-dev':    `${today}T11:00:00Z ok cost=$1.10\n${today}T12:00:00Z ok cost=$0.90\n`,
      'code-reviewer': `${today}T13:00:00Z ok cost=$0.20\n`,
    },
  });
  const port = pickPort();
  const board = spawnBoard(project, home, port);
  try {
    await waitForBoard(port);
    const m = await fetchJson(port, '/api/metrics?days=30');
    assert.equal(m.cost.source, 'measured', `expected measured source, got ${m.cost.source}`);
    assert.ok(Math.abs(m.cost.llm_usd - 2.60) < 0.05, `measured llm ~2.60, got ${m.cost.llm_usd}`);
    assert.ok(typeof m.cost.savings_x === 'number' && m.cost.savings_x > 0, 'measured savings_x is a real number, not null');
    assert.equal(m.cost.real_llm_usd != null, true, 'real_llm_usd populated');
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

test('metrics: too few verdict costs → does NOT promote to measured (stays estimate/none)', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const { home, project } = makeProject({
    verdicts: { 'architect': `${today}T10:00:00Z ok cost=$0.40\n` }, // only 1 → below the coverage bar
  });
  const port = pickPort();
  const board = spawnBoard(project, home, port);
  try {
    await waitForBoard(port);
    const m = await fetchJson(port, '/api/metrics?days=30');
    assert.notEqual(m.cost.source, 'measured', 'a single verdict cost must not be treated as measured');
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});

test('metrics: cost-history enrichment reads PROJECT-LOCAL file (regression — was global-only, so it never fired)', async () => {
  const today = new Date().toISOString();      // full ISO; minute+agent key matches
  const min = today.slice(0, 16);
  // Verdicts WITHOUT a cost tag — cost must come from the project cost-history.log
  const { home, project } = makeProject({
    verdicts: {
      'architect':     `${min}:05Z | architect | APPROVED | feature=a\n`,
      'senior-dev':    `${min}:06Z | senior-dev | APPROVED | feature=b\n`,
      'code-reviewer': `${min}:07Z | code-reviewer | APPROVED | feature=c\n`,
    },
  });
  // Project-local cost-history (where log-verdict.sh + the SubagentStop hook write it).
  writeFileSync(join(project, '.great_cto', 'cost-history.log'),
    `${min}:05Z architect 0.80\n${min}:06Z senior-dev 1.40\n${min}:07Z code-reviewer 0.30\n`);
  const port = pickPort();
  const board = spawnBoard(project, home, port);
  try {
    await waitForBoard(port);
    const m = await fetchJson(port, '/api/metrics?days=30');
    // Enrichment fired from the project file → measured cost is canonical.
    assert.equal(m.cost.source, 'measured', `expected measured (project cost-history enriched), got ${m.cost.source}`);
    assert.ok(Math.abs(m.cost.llm_usd - 2.50) < 0.05, `enriched llm ~2.50, got ${m.cost.llm_usd}`);
  } finally {
    killBoardTree(board);
    cleanup(home, project);
  }
});
