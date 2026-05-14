// REAL pipeline test via OpenRouter — orchestrates great_cto agents against
// a live LLM (any provider OpenRouter supports), without depending on Claude
// Code being the host. Validates the *contract* between great_cto agent
// prompts and the board state machine end-to-end.
//
// Usage:
//   export OPENROUTER_API_KEY="sk-or-v1-..."
//   node tests/openrouter-real-pipeline.mjs
//
// What it does:
//   1. Creates a fresh tmp project (bd init, great-cto init)
//   2. Starts the board on a random port
//   3. For each stage [architect, pm, senior-dev, code-reviewer]:
//      - Loads the agent's system prompt from agents/<name>.md
//      - Sends to OpenRouter with a user task
//      - Parses response for file-write blocks (<file path="...">...</file>)
//      - Writes artifacts to project dir
//      - Appends a verdict line to ~/.great_cto/verdicts/<agent>.log
//      - Polls /api/pipeline + /api/cost to verify board reflects new state
//   4. Reports total cost from OpenRouter usage stats
//   5. Cleans up tmp project
//
// Cost: ~$0.15-0.25 per full run on claude-sonnet-4 via OpenRouter.
// DO NOT add to CI — costs money.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir, homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const CLI_ENTRY = join(REPO_ROOT, 'packages', 'cli', 'index.mjs');
const AGENTS_DIR = join(REPO_ROOT, 'agents');

const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY) {
  console.error('FATAL: OPENROUTER_API_KEY env var is not set.');
  process.exit(1);
}

// Configuration — keep cheap
const MODEL = process.env.OR_MODEL || 'anthropic/claude-sonnet-4';
const MAX_TOKENS = 2000;
const TEST_FEATURE = 'or-pipeline-test-greeter';
const TEST_TASK = 'Build a tiny HTTP endpoint GET /hello that returns {"msg":"hello world"}. Node 20, Express, no DB. Keep it under 30 lines of code.';

// ── helpers ────────────────────────────────────────────────────────────────

function loadAgentPrompt(name) {
  const file = join(AGENTS_DIR, `${name}.md`);
  const raw = readFileSync(file, 'utf8');
  // Strip YAML frontmatter
  const m = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return m ? m[1].trim() : raw;
}

async function callOpenRouter({ system, user, label }) {
  const t0 = Date.now();
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/avelikiy/great_cto',
      'X-Title': 'great_cto E2E orchestration test',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!r.ok) {
    const errBody = await r.text();
    throw new Error(`OpenRouter ${r.status} for ${label}: ${errBody.slice(0, 500)}`);
  }
  const data = await r.json();
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  const usage = data.usage || {};
  // OpenRouter returns prompt_tokens, completion_tokens, total_tokens.
  // total_cost is not always returned; compute roughly.
  // Sonnet-4 via OR: ~$3/M input, ~$15/M output.
  const promptT = usage.prompt_tokens || 0;
  const complT = usage.completion_tokens || 0;
  const estCost = (promptT / 1_000_000) * 3 + (complT / 1_000_000) * 15;
  console.log(`  → ${label}: ${promptT}p / ${complT}c tokens · ~$${estCost.toFixed(4)} · ${elapsedSec}s`);
  return {
    content: data.choices?.[0]?.message?.content || '',
    cost: estCost,
    prompt_tokens: promptT,
    completion_tokens: complT,
  };
}

function parseFileWrites(text) {
  // Look for <file path="...">...</file> blocks
  const files = [];
  const re = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    files.push({ path: m[1].trim(), content: m[2].trim() });
  }
  return files;
}

function appendVerdict(home, agent, verdict, details, costUsd) {
  const ts = new Date().toISOString();
  const line = `${ts} ${verdict} ${details} cost=$${costUsd.toFixed(4)}\n`;
  const file = join(home, '.great_cto', 'verdicts', `${agent}.log`);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, line);
}

function makeProject() {
  const home = mkdtempSync(join(tmpdir(), 'or-pipe-home-'));
  const project = mkdtempSync(join(tmpdir(), 'or-pipe-proj-'));
  mkdirSync(join(home, '.great_cto', 'verdicts'), { recursive: true });
  mkdirSync(join(project, '.great_cto'), { recursive: true });
  mkdirSync(join(project, 'docs', 'architecture'), { recursive: true });
  mkdirSync(join(project, 'docs', 'plans'), { recursive: true });
  mkdirSync(join(project, 'src'), { recursive: true });

  const init = spawnSync('bd', ['init'], { cwd: project, encoding: 'utf8' });
  if (init.status !== 0) throw new Error(`bd init failed: ${init.stderr || init.stdout}`);

  // Stub PROJECT.md so board can detect archetype
  writeFileSync(join(project, '.great_cto', 'PROJECT.md'),
    'archetype: web-service\nprimary: web-service\nproject_size: nano\n');

  return { home, project };
}

function startBoard(project, home, port) {
  const proc = spawn('node', [CLI_ENTRY, 'board', '--port', String(port), '--no-open'], {
    cwd: project,
    env: { ...process.env, HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  return proc;
}

function killBoard(board) {
  try { process.kill(-board.pid, 'SIGKILL'); } catch {}
  try { board.kill('SIGKILL'); } catch {}
}

async function waitForBoard(port, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/projects`);
      if (r.ok || r.status === 404) return;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`board did not start on :${port}`);
}

async function apiGet(port, path) {
  const r = await fetch(`http://127.0.0.1:${port}${path}`);
  return r.json();
}

// ── orchestration runner ───────────────────────────────────────────────────

const ORCHESTRATION_WRAPPER = `

---
IMPORTANT: You are being run as part of an automated test harness. You CANNOT use Bash, Read, Write, or any other tool. Instead:

- Emit any files you would write as XML blocks: <file path="docs/path/to/file.md">FILE CONTENT HERE</file>
- Emit a single-line verdict at the end of your reply in this format:
  VERDICT: <APPROVED|DONE|PASS|BLOCKED|FAIL> reason="<short reason>"
- Keep total output under 1500 tokens. Be CONCISE.
- Do not include any prose commentary outside of file blocks and the verdict line. No preambles.

The task to address is below.
---
`;

async function runStage({ stage, agentName, taskPrompt, project, home, port }) {
  console.log(`\n▸ Stage: ${stage} (agent: ${agentName})`);

  const systemPrompt = loadAgentPrompt(agentName) + ORCHESTRATION_WRAPPER;
  const result = await callOpenRouter({
    system: systemPrompt,
    user: taskPrompt,
    label: stage,
  });

  // Parse + write files
  const files = parseFileWrites(result.content);
  for (const f of files) {
    const abs = join(project, f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.content);
    console.log(`    wrote ${f.path} (${f.content.length} bytes)`);
  }

  // Parse verdict line
  const verdictMatch = result.content.match(/VERDICT:\s*(\w+)\s+reason="([^"]+)"/i);
  const verdict = verdictMatch?.[1]?.toUpperCase() || 'DONE';
  const reason = verdictMatch?.[2] || 'no reason';
  appendVerdict(home, agentName, verdict,
    `feature=${TEST_FEATURE} files=${files.length} reason="${reason.replace(/[" ]/g, '_').slice(0, 40)}"`,
    result.cost);
  console.log(`    verdict: ${verdict} — ${reason.slice(0, 60)}`);

  // Wait briefly for board to pick up disk change
  await new Promise(r => setTimeout(r, 800));

  // Verify board reflects this stage
  const pipelineStage = stage === 'reviewers' ? 'reviewers' : stage;
  const pipeline = await apiGet(port, `/api/pipeline?project=${project.split('/').pop()}`);
  const found = pipeline.find(s => s.stage === pipelineStage ||
    (stage === 'code-reviewer' && s.stage === 'reviewers'));
  const status = found ? found.status : 'NOT FOUND';
  const ageMin = found ? found.age_min : '∞';
  console.log(`    board /api/pipeline: ${pipelineStage} → status=${status} age_min=${ageMin}`);

  return { result, files, verdict, reason };
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' OpenRouter real-orchestration E2E test');
  console.log(`   model: ${MODEL}`);
  console.log(`   feature: ${TEST_FEATURE}`);
  console.log('═══════════════════════════════════════════════════════════════');

  const { home, project } = makeProject();
  console.log(`\nProject: ${project}`);
  console.log(`Home:    ${home}`);

  const port = 36000 + Math.floor(Math.random() * 1000);
  const board = startBoard(project, home, port);
  await waitForBoard(port);
  console.log(`Board:   http://127.0.0.1:${port}\n`);

  let totalCost = 0;
  const results = {};
  try {
    // Stage 1: architect
    const archRes = await runStage({
      stage: 'architect',
      agentName: 'architect',
      taskPrompt: `Feature: "${TEST_FEATURE}"\n\nUser request: ${TEST_TASK}\n\nProduce: 1 short ARCH document (under 60 lines) at docs/architecture/ARCH-${TEST_FEATURE}.md and 1 ADR at docs/adr/ADR-001-${TEST_FEATURE}.md. Keep both SHORT.`,
      project, home, port,
    });
    totalCost += archRes.result.cost;
    results.architect = archRes;

    // Stage 2: pm
    const archDoc = archRes.files.find(f => f.path.includes('ARCH-'))?.content || '(architect produced no ARCH doc)';
    const pmRes = await runStage({
      stage: 'pm',
      agentName: 'pm',
      taskPrompt: `Feature: "${TEST_FEATURE}"\n\nThe architect produced this ARCH document:\n\n---\n${archDoc.slice(0, 1500)}\n---\n\nProduce: a PLAN at docs/plans/PLAN-${TEST_FEATURE}.md with exactly 3 implementation tasks. Keep it short.`,
      project, home, port,
    });
    totalCost += pmRes.result.cost;
    results.pm = pmRes;

    // Stage 3: senior-dev
    const planDoc = pmRes.files.find(f => f.path.includes('PLAN-'))?.content || '(pm produced no PLAN doc)';
    const devRes = await runStage({
      stage: 'senior-dev',
      agentName: 'senior-dev',
      taskPrompt: `Feature: "${TEST_FEATURE}"\n\nPM's plan:\n\n---\n${planDoc.slice(0, 1500)}\n---\n\nImplement task #1 from the plan as a single file at src/hello-endpoint.js. Production-quality Express.js handler, ~20 lines. Include 1 simple test at tests/hello-endpoint.test.js.`,
      project, home, port,
    });
    totalCost += devRes.result.cost;
    results['senior-dev'] = devRes;

    // Stage 4: qa-engineer (great_cto has archetype-specific reviewers, not a
    // generic code-reviewer; qa-engineer is the closest "review the impl" agent)
    const implFile = devRes.files.find(f => f.path.startsWith('src/'));
    const implContent = implFile?.content || '(no implementation produced)';
    const reviewRes = await runStage({
      stage: 'qa-engineer',
      agentName: 'qa-engineer',
      taskPrompt: `Feature: "${TEST_FEATURE}"\n\nReview this implementation at ${implFile?.path || 'src/?'}:\n\n\`\`\`js\n${implContent.slice(0, 1500)}\n\`\`\`\n\nProduce a short QA report at docs/qa/QA-${TEST_FEATURE}.md (under 30 lines) covering: happy path, edge cases, regressions to watch. Emit VERDICT: PASS if the code is acceptable for a stub, BLOCKED if you find real test gaps.`,
      project, home, port,
    });
    totalCost += reviewRes.result.cost;
    results['qa-engineer'] = reviewRes;

    // ── Final verification ───────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(' Final board state verification');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const finalPipeline = await apiGet(port, `/api/pipeline?project=${project.split('/').pop()}`);
    console.log('Pipeline state:');
    for (const s of finalPipeline) {
      if (s.status !== 'idle') {
        console.log(`  ${s.stage.padEnd(18)} status=${s.status.padEnd(8)} verdict=${(s.verdict || '?').padEnd(10)} age=${s.age_min}min`);
      }
    }

    const finalCost = await apiGet(port, `/api/cost?days=1&project=${project.split('/').pop()}`);
    console.log(`\nBoard /api/cost.total_llm: $${finalCost.total_llm}`);
    console.log(`OpenRouter total cost:     $${totalCost.toFixed(4)}`);
    console.log(`Match within $0.05:        ${Math.abs(finalCost.total_llm - totalCost) < 0.05 ? '✅ YES' : '❌ NO'}`);

    console.log('\nFiles written by agents:');
    for (const [stage, res] of Object.entries(results)) {
      console.log(`  ${stage}:`);
      for (const f of res.files) {
        const abs = join(project, f.path);
        const exists = existsSync(abs);
        console.log(`    ${exists ? '✓' : '✗'} ${f.path}`);
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(` Total test cost: $${totalCost.toFixed(4)}`);
    console.log('═══════════════════════════════════════════════════════════════');

  } finally {
    killBoard(board);
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
}

main().catch(e => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
