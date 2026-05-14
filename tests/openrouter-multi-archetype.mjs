// Multi-archetype real-orchestration test via OpenRouter.
//
// Runs the full great_cto pipeline (architect → pm → senior-dev → archetype
// reviewer → qa-engineer) for N different archetypes, exercising different
// code paths through the agent prompts.
//
// Each archetype runs in an isolated tmp project with the right
// PROJECT.md archetype field, a representative feature description,
// and the correct archetype-specific reviewer in stage 4.
//
// Usage:
//   export OPENROUTER_API_KEY=sk-or-v1-...
//   node tests/openrouter-multi-archetype.mjs                # all 8
//   node tests/openrouter-multi-archetype.mjs fintech mlops  # subset
//
// Cost: ~$0.15-0.25 per archetype × ~8 = $1.20-2.00 per full run.
// DO NOT add to CI.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const CLI_ENTRY = join(REPO_ROOT, 'packages', 'cli', 'index.mjs');
const AGENTS_DIR = join(REPO_ROOT, 'agents');

const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY) {
  console.error('FATAL: OPENROUTER_API_KEY env var is not set.');
  process.exit(1);
}

const MODEL = process.env.OR_MODEL || 'anthropic/claude-sonnet-4';
const MAX_TOKENS = 1500;

// ── archetype configs ──────────────────────────────────────────────────────

const ARCHETYPES = {
  'web-service': {
    feature: 'simple-hello-endpoint',
    task: 'Add a GET /hello endpoint returning {"msg":"hi"}. Node 20, Express, no DB. Under 30 lines.',
    reviewer: 'qa-engineer',
    projectMd: 'archetype: web-service\nprimary: web-service\nproject_size: nano\ncompliance:\n  - gdpr\n',
  },
  'fintech': {
    feature: 'stripe-webhook-hmac',
    task: 'Build a /webhook endpoint that receives Stripe events, verifies the HMAC signature using stripe-signature header, and acknowledges. Handle replay attacks via idempotency. Node 20.',
    reviewer: 'pci-reviewer',
    projectMd: 'archetype: fintech\nprimary: fintech\nproject_size: small\ncompliance:\n  - pci-dss\n  - sox\n  - gdpr\n',
  },
  'mlops': {
    feature: 'drift-monitor',
    task: 'Build a service that loads a sklearn model and computes KS-distance between training set distribution and live request distribution every hour. Python 3.11, scikit-learn, MLflow logging.',
    reviewer: 'mlops-reviewer',
    projectMd: 'archetype: mlops\nprimary: mlops\nproject_size: small\ncompliance:\n  - eu-ai-act\n  - iso42001\n',
  },
  'enterprise-saas': {
    feature: 'tenant-onboarding',
    task: 'POST /tenants endpoint that creates a new tenant with isolated DB schema, SCIM-provisioned admin user, and Stripe Customer for billing. Multi-tenant row-level security via postgres RLS.',
    reviewer: 'enterprise-saas-reviewer',
    projectMd: 'archetype: enterprise-saas\nprimary: enterprise-saas\nproject_size: medium\ncompliance:\n  - soc2-type-2\n  - iso27001\n  - gdpr\n',
  },
  'agent-product': {
    feature: 'rag-private-docs',
    task: 'RAG endpoint: POST /query with {question, user_id} reads embeddings from pgvector, retrieves top-5, calls LLM with citations. Strict per-user tenant isolation in retrieval filter.',
    reviewer: 'ai-security-reviewer',
    projectMd: 'archetype: agent-product\nprimary: agent-product\nproject_size: small\ncompliance:\n  - eu-ai-act\n  - owasp-llm-top-10\n',
  },
  'gov-public': {
    feature: 'citizen-forms-portal',
    task: 'POST /forms/submission accepts a benefits-application form (PII fields), validates required fields, stores encrypted at rest with KMS, returns ticket number. Section 508 a11y on the front-end.',
    reviewer: 'gov-reviewer',
    projectMd: 'archetype: gov-public\nprimary: gov-public\nproject_size: small\ncompliance:\n  - fedramp-moderate\n  - nist-800-53\n  - section-508\n',
  },
  'healthcare': {
    feature: 'phi-export-endpoint',
    task: 'GET /patient/:id/export returns FHIR JSON bundle for a patient. Requires JWT scope phi:export. All access logged to immutable audit table with reason field.',
    reviewer: 'healthcare-reviewer',
    projectMd: 'archetype: healthcare\nprimary: healthcare\nproject_size: small\ncompliance:\n  - hipaa\n  - hitech\n  - gdpr\n',
  },

  // ── Recent missing (Wave 2-4) ───────────────────────────────────────────
  'cli-tool': {
    feature: 'env-vars-loader',
    task: 'Build a Node CLI that reads .env file from disk and prints parsed variables as JSON. Support --help, --version, --json, NO_COLOR env. Exit 0 success / 2 file-not-found.',
    reviewer: 'cli-reviewer',
    projectMd: 'archetype: cli-tool\nprimary: cli-tool\nproject_size: nano\ncompliance: []\n',
  },
  'streaming': {
    feature: 'order-events-cdc',
    task: 'Debezium-style CDC from Postgres orders table to Kafka topic order-events. Idempotent producer with transactional outbox. Schema Registry compatibility BACKWARD. Avro schema.',
    reviewer: 'streaming-reviewer',
    projectMd: 'archetype: streaming\nprimary: streaming\nproject_size: small\ncompliance:\n  - gdpr\n',
  },
  'marketplace': {
    feature: 'seller-onboarding-payout',
    task: 'POST /sellers — accepts seller signup (name, address, tax_id), runs Stripe Connect onboarding, creates platform-managed Connect account. 7-day hold-and-release escrow on first payout.',
    reviewer: 'marketplace-reviewer',
    projectMd: 'archetype: marketplace\nprimary: marketplace\nproject_size: small\ncompliance:\n  - pci-dss\n  - kyc-aml\n  - gdpr\n  - 1099-k\n  - dsa-eu\n  - p2b-eu\n',
  },
  'cms': {
    feature: 'image-upload-with-srcset',
    task: 'POST /upload accepts image file, generates AVIF + WebP variants with responsive srcset, strips EXIF metadata, stores to S3 with cache-control. Returns schema.org Article markup.',
    reviewer: 'cms-reviewer',
    projectMd: 'archetype: cms\nprimary: cms\nproject_size: small\ncompliance:\n  - dmca\n  - dsa-eu\n  - gdpr\n  - wcag-2.2\n',
  },
  'edtech': {
    feature: 'student-roster-import',
    task: 'CSV bulk-import endpoint for student records (name, age, grade, parent_email). Auto-detect minors (<13) → trigger COPPA parental consent flow. Section 508-compliant errors (no color-only signalling).',
    reviewer: 'edtech-reviewer',
    projectMd: 'archetype: edtech\nprimary: edtech\nproject_size: small\ncompliance:\n  - coppa\n  - ferpa\n  - gdpr-k\n  - section-508\n  - sopipa-ca\n  - wcag-2.2-aa\n',
  },
  'insurance': {
    feature: 'quote-pricing-engine',
    task: 'POST /quote — accepts (state, age, vehicle, zip), returns auto insurance premium. Pricing must be explainable (audit log of factors used). State-specific multipliers from filed rate tables.',
    reviewer: 'insurance-reviewer',
    projectMd: 'archetype: insurance\nprimary: insurance\nproject_size: small\ncompliance:\n  - naic\n  - solvency-ii\n  - ifrs-17\n  - actuarial-asops\n  - anti-discrimination-pricing\n  - state-doi\n  - gdpr\n',
  },

  // ── Base / Wave 1 missing (12) ──────────────────────────────────────────
  'mobile-app': {
    feature: 'iap-receipt-validation',
    task: 'Server endpoint POST /iap/verify — validates an Apple/Google in-app purchase receipt by calling vendor verify-endpoint, then unlocks the user feature. Handle replay (idempotency by transaction_id).',
    reviewer: 'mobile-store-reviewer',
    projectMd: 'archetype: mobile-app\nprimary: mobile-app\nproject_size: small\ncompliance:\n  - gdpr\n  - app-store-policy\n  - play-store-policy\n',
  },
  'ai-system': {
    feature: 'chat-with-citation',
    task: 'POST /chat — LLM endpoint that answers questions over a corpus of company docs. Each answer must include citation block (doc_id + offset). Token budget enforced per-user per-day.',
    reviewer: 'ai-security-reviewer',
    projectMd: 'archetype: ai-system\nprimary: ai-system\nproject_size: small\ncompliance:\n  - eu-ai-act\n  - owasp-llm-top-10\n',
  },
  'data-platform': {
    feature: 'dbt-model-with-contract',
    task: 'Build a dbt model dim_users that materializes user master data from raw.user_events. Define schema.yml with model contract + freshness 24h + uniqueness on user_id. Add 3 column tests.',
    reviewer: 'data-platform-reviewer',
    projectMd: 'archetype: data-platform\nprimary: data-platform\nproject_size: small\ncompliance:\n  - gdpr\n',
  },
  'infra': {
    feature: 'terraform-s3-bucket',
    task: 'Terraform module that provisions an S3 bucket with server-side encryption (KMS), versioning, lifecycle rules (30d→IA, 90d→Glacier), and a bucket-policy DENY for public-read.',
    reviewer: 'infra-reviewer',
    projectMd: 'archetype: infra\nprimary: infra\nproject_size: small\ncompliance:\n  - cis-aws\n  - gdpr\n',
  },
  'library': {
    feature: 'npm-utility-extract',
    task: 'New public NPM package @org/parse-date — exports parseISO(s: string): Date | null. Includes README, TypeScript types, CHANGELOG. Semver 0.1.0 initial.',
    reviewer: 'library-reviewer',
    projectMd: 'archetype: library\nprimary: library\nproject_size: nano\ncompliance:\n  - openssf\n  - sbom\n',
  },
  'web3': {
    feature: 'chainlink-price-oracle-adapter',
    task: 'Solidity 0.8 contract reading ETH/USD from Chainlink AggregatorV3Interface. Staleness check (revert if updatedAt > 1h ago). Decimal normalization. Negative-price revert.',
    reviewer: 'oracle-reviewer',
    projectMd: 'archetype: web3\nprimary: web3\nproject_size: small\ncompliance:\n  - soc2\n',
  },
  'iot-embedded': {
    feature: 'zephyr-ota-update',
    task: 'Zephyr RTOS firmware update routine: download new image to slot B, verify cryptographic signature (Ed25519), reboot via mcuboot, rollback on first-boot failure. Watchdog enabled throughout.',
    reviewer: 'firmware-reviewer',
    projectMd: 'archetype: iot-embedded\nprimary: iot-embedded\nproject_size: small\ncompliance:\n  - etsi-en-303-645\n  - iso27001\n',
  },
  'regulated': {
    feature: 'change-mgmt-approval-flow',
    task: 'Add formal change-management workflow: every prod deploy requires (a) RFC document, (b) approval from a different person (4-eyes), (c) audit log entry. SOX ITGC compliant.',
    reviewer: 'regulated-reviewer',
    projectMd: 'archetype: regulated\nprimary: regulated\nproject_size: medium\ncompliance:\n  - sox\n  - iso27001\n  - dora\n  - nis2\n',
  },
  'commerce': {
    feature: 'stripe-refund-flow',
    task: 'POST /refunds — accepts (charge_id, amount, reason). Validates against original charge. Calls Stripe refund API. Handles chargeback time-lock (no refund after dispute opened). Logs to immutable audit.',
    reviewer: 'pci-reviewer',
    projectMd: 'archetype: commerce\nprimary: commerce\nproject_size: small\ncompliance:\n  - pci-dss\n  - gdpr\n',
  },
  'devtools': {
    feature: 'cli-plugin-skeleton',
    task: 'CLI plugin published to npm with Sigstore signing on release. SLSA Level 3 provenance via GitHub Actions OIDC. No path/username/source-code in telemetry. Reproducible build.',
    reviewer: 'devtools-reviewer',
    projectMd: 'archetype: devtools\nprimary: devtools\nproject_size: small\ncompliance:\n  - openssf-scorecard\n  - sbom\n  - sigstore\n',
  },
  'browser-extension': {
    feature: 'page-summarizer-mv3',
    task: 'Chrome MV3 extension that adds a "summarize page" button. Content script reads page text, sends to background service worker, calls LLM, displays summary in popup. host_permissions: <all_urls>. CSP-compliant.',
    reviewer: 'web-store-reviewer',
    projectMd: 'archetype: browser-extension\nprimary: browser-extension\nproject_size: small\ncompliance:\n  - chrome-web-store-policy\n  - mv3-csp\n',
  },
  'game': {
    feature: 'lootbox-with-odds-disclosure',
    task: 'Unity in-game loot box: player spends 100 coins, receives random reward by rarity (60% common / 30% rare / 10% legendary). Odds shown to player BEFORE purchase. Spend limits per session for <18 users.',
    reviewer: 'game-reviewer',
    projectMd: 'archetype: game\nprimary: game\nproject_size: small\ncompliance:\n  - coppa\n  - esrb\n  - loot-box-odds-disclosure\n  - age-rating\n',
  },
};

// ── helpers ────────────────────────────────────────────────────────────────

function loadAgentPrompt(name) {
  const file = join(AGENTS_DIR, `${name}.md`);
  if (!existsSync(file)) throw new Error(`agent prompt not found: ${file}`);
  const raw = readFileSync(file, 'utf8');
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
      'X-Title': 'great_cto multi-archetype E2E',
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
  if (!r.ok) throw new Error(`OpenRouter ${r.status} for ${label}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const u = data.usage || {};
  const cost = ((u.prompt_tokens || 0) / 1_000_000) * 3 + ((u.completion_tokens || 0) / 1_000_000) * 15;
  return {
    content: data.choices?.[0]?.message?.content || '',
    cost,
    pt: u.prompt_tokens || 0,
    ct: u.completion_tokens || 0,
    elapsed: ((Date.now() - t0) / 1000).toFixed(1),
  };
}

function parseFiles(text) {
  const out = [];
  const re = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
  let m;
  while ((m = re.exec(text))) out.push({ path: m[1].trim(), content: m[2].trim() });
  return out;
}

function parseVerdict(text) {
  const m = text.match(/VERDICT:\s*(\w+)\s+reason="([^"]+)"/i);
  return {
    verdict: m?.[1]?.toUpperCase() || 'DONE',
    reason: m?.[2] || 'no reason',
  };
}

function appendVerdict(home, agent, verdict, details, costUsd) {
  const ts = new Date().toISOString();
  const file = join(home, '.great_cto', 'verdicts', `${agent}.log`);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${ts} ${verdict} ${details} cost=$${costUsd.toFixed(4)}\n`);
}

const ORCH_WRAPPER = `

---
AUTOMATED TEST HARNESS — IMPORTANT:
- You cannot use Bash, Read, Write, or any tool. Emit files as XML blocks:
  <file path="docs/foo.md">CONTENT</file>
- End with VERDICT: <APPROVED|DONE|PASS|BLOCKED|FAIL> reason="<short>"
- TOTAL output under 1500 tokens. Be CONCISE.
- No prose outside file blocks and verdict.
---
`;

function makeProject(archetypeKey, config) {
  const home = mkdtempSync(join(tmpdir(), `or-${archetypeKey}-h-`));
  const project = mkdtempSync(join(tmpdir(), `or-${archetypeKey}-p-`));
  mkdirSync(join(home, '.great_cto', 'verdicts'), { recursive: true });
  mkdirSync(join(project, '.great_cto'), { recursive: true });
  mkdirSync(join(project, 'docs', 'architecture'), { recursive: true });
  mkdirSync(join(project, 'docs', 'plans'), { recursive: true });
  mkdirSync(join(project, 'docs', 'decisions'), { recursive: true });
  mkdirSync(join(project, 'src'), { recursive: true });
  const init = spawnSync('bd', ['init'], { cwd: project, encoding: 'utf8' });
  if (init.status !== 0) throw new Error(`bd init: ${init.stderr || init.stdout}`);
  writeFileSync(join(project, '.great_cto', 'PROJECT.md'), config.projectMd);
  return { home, project };
}

function spawnBoard(project, home, port) {
  return spawn('node', [CLI_ENTRY, 'board', '--port', String(port), '--no-open'], {
    cwd: project, env: { ...process.env, HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
}

function killBoard(b) {
  try { process.kill(-b.pid, 'SIGKILL'); } catch {}
  try { b.kill('SIGKILL'); } catch {}
}

async function waitBoard(port, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/projects`);
      if (r.ok || r.status === 404) return;
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`board not ready on :${port}`);
}

async function runStage({ stage, agentName, taskPrompt, project, home }) {
  const sys = loadAgentPrompt(agentName) + ORCH_WRAPPER;
  const res = await callOpenRouter({ system: sys, user: taskPrompt, label: stage });
  const files = parseFiles(res.content);
  for (const f of files) {
    const abs = join(project, f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.content);
  }
  const { verdict, reason } = parseVerdict(res.content);
  appendVerdict(home, agentName, verdict,
    `stage=${stage} files=${files.length} reason="${reason.replace(/[\s"]/g, '_').slice(0, 30)}"`,
    res.cost);
  return { ...res, files, verdict, reason };
}

async function runArchetype(archetypeKey) {
  const config = ARCHETYPES[archetypeKey];
  if (!config) throw new Error(`unknown archetype: ${archetypeKey}`);

  process.stdout.write(`\n▸ [${archetypeKey}] `);
  const { home, project } = makeProject(archetypeKey, config);
  const port = 38000 + Math.floor(Math.random() * 1500);
  const board = spawnBoard(project, home, port);
  await waitBoard(port);

  let totalCost = 0;
  const stages = [];
  try {
    // Stage 1: architect
    process.stdout.write('architect.');
    const arch = await runStage({
      stage: 'architect', agentName: 'architect',
      taskPrompt: `Archetype: ${archetypeKey}\nFeature: "${config.feature}"\n\nUser request: ${config.task}\n\nProduce: 1 short ARCH document (under 50 lines) at docs/architecture/ARCH-${config.feature}.md and 1 ADR at docs/decisions/ADR-001-${config.feature}.md. Reference the archetype's compliance requirements.`,
      project, home,
    });
    totalCost += arch.cost;
    stages.push({ stage: 'architect', cost: arch.cost, files: arch.files.length, verdict: arch.verdict });

    // Stage 2: pm
    process.stdout.write('pm.');
    const archDoc = arch.files.find(f => f.path.includes('ARCH-'))?.content || '';
    const pm = await runStage({
      stage: 'pm', agentName: 'pm',
      taskPrompt: `Archetype: ${archetypeKey}\nFeature: "${config.feature}"\n\nArchitect's ARCH:\n\n${archDoc.slice(0, 1200)}\n\nProduce: docs/plans/PLAN-${config.feature}.md with 3 implementation tasks. Be brief.`,
      project, home,
    });
    totalCost += pm.cost;
    stages.push({ stage: 'pm', cost: pm.cost, files: pm.files.length, verdict: pm.verdict });

    // Stage 3: senior-dev
    process.stdout.write('senior-dev.');
    const planDoc = pm.files.find(f => f.path.includes('PLAN-'))?.content || '';
    const dev = await runStage({
      stage: 'senior-dev', agentName: 'senior-dev',
      taskPrompt: `Archetype: ${archetypeKey}\nFeature: "${config.feature}"\n\nPM's plan:\n\n${planDoc.slice(0, 1200)}\n\nImplement task #1 only as a single file in src/. Production-quality, ~30 lines, plus 1 simple test.`,
      project, home,
    });
    totalCost += dev.cost;
    stages.push({ stage: 'senior-dev', cost: dev.cost, files: dev.files.length, verdict: dev.verdict });

    // Stage 4: archetype-specific reviewer
    process.stdout.write(`${config.reviewer}.`);
    const implFile = dev.files.find(f => f.path.startsWith('src/'));
    const implContent = implFile?.content || '(no impl)';
    const review = await runStage({
      stage: config.reviewer, agentName: config.reviewer,
      taskPrompt: `Archetype: ${archetypeKey}\nFeature: "${config.feature}"\n\nReview this implementation at ${implFile?.path}:\n\n\`\`\`\n${implContent.slice(0, 1500)}\n\`\`\`\n\nProduce a short review at docs/reviews/REVIEW-${config.feature}.md (under 30 lines) focused on YOUR DOMAIN. Emit VERDICT: APPROVED if acceptable for stub, BLOCKED if you find a real domain-specific gap.`,
      project, home,
    });
    totalCost += review.cost;
    stages.push({ stage: config.reviewer, cost: review.cost, files: review.files.length, verdict: review.verdict });

    // Final verification: query board /api/cost
    const cost = await (await fetch(`http://127.0.0.1:${port}/api/cost?days=1`)).json();
    const pipeline = await (await fetch(`http://127.0.0.1:${port}/api/pipeline`)).json();
    const doneStages = pipeline.filter(s => s.status === 'done').length;

    process.stdout.write(' done\n');
    return {
      archetype: archetypeKey,
      stages,
      total_cost_or: totalCost,
      board_total_llm: cost.total_llm,
      board_total_human: cost.total_human,
      pipeline_done_stages: doneStages,
      success: stages.every(s => ['APPROVED', 'DONE', 'PASS'].includes(s.verdict)),
    };
  } finally {
    killBoard(board);
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const requested = process.argv.slice(2);
  const archetypeKeys = requested.length > 0 ? requested : Object.keys(ARCHETYPES);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Multi-archetype real-orchestration test via OpenRouter');
  console.log(`   model      : ${MODEL}`);
  console.log(`   archetypes : ${archetypeKeys.join(', ')}`);
  console.log('═══════════════════════════════════════════════════════════════');

  const results = [];
  for (const key of archetypeKeys) {
    try {
      const r = await runArchetype(key);
      results.push(r);
    } catch (e) {
      console.error(`\n  ✗ ${key} FAILED: ${e.message}`);
      results.push({ archetype: key, error: e.message, success: false });
    }
  }

  // Print summary table
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' Summary');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('  archetype'.padEnd(22) + 'stages  cost      board_llm  board_hum  status');
  console.log('  ' + '─'.repeat(70));
  let grandTotal = 0;
  for (const r of results) {
    grandTotal += r.total_cost_or || 0;
    if (r.error) {
      console.log(`  ${r.archetype.padEnd(20)} ERROR: ${r.error.slice(0, 50)}`);
      continue;
    }
    const stageVerdicts = r.stages.map(s =>
      ({ APPROVED: '✓', DONE: '✓', PASS: '✓', BLOCKED: '✗', FAIL: '✗' })[s.verdict] || '?'
    ).join('');
    const status = r.success ? '✅' : '⚠️';
    console.log(
      `  ${r.archetype.padEnd(20)} ${stageVerdicts.padEnd(7)} $${r.total_cost_or.toFixed(4)}  $${(r.board_total_llm).toFixed(2).padStart(8)}  $${(r.board_total_human).toFixed(0).padStart(8)}   ${status}`
    );
  }
  console.log('  ' + '─'.repeat(70));
  console.log(`  Grand total cost: $${grandTotal.toFixed(4)}`);

  // Verify ratio sanity across the board — catches the 7,638× regression class
  for (const r of results) {
    if (r.board_total_llm > 0 && r.board_total_human > 0) {
      const ratio = r.board_total_human / r.board_total_llm;
      if (ratio > 1000) {
        console.log(`  ⚠️ ${r.archetype}: ratio ${ratio.toFixed(0)}× implausible — 7,638× regression`);
      }
    }
  }
}

main().catch(e => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
