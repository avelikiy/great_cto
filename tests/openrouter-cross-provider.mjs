// Cross-provider real-pipeline test via OpenRouter (Sprint 2).
//
// Runs the same 5 representative archetypes through 4 different LLM
// providers (Sonnet 4 baseline + Haiku 4.5 + GPT-5 + Gemini 2.5 Pro)
// to surface prompt assumptions that depend on Anthropic specifics.
//
// Output: docs/testing/CROSS-PROVIDER-MATRIX.md with a ✅/⚠️/❌ matrix
// per (archetype × model). Plus per-cell cost + verdict.
//
// Usage:
//   export OPENROUTER_API_KEY=sk-or-v1-...
//   node tests/openrouter-cross-provider.mjs                       # all 5×4
//   node tests/openrouter-cross-provider.mjs --model sonnet,haiku  # subset
//   node tests/openrouter-cross-provider.mjs --archetype fintech   # single archetype
//
// Cost: ~$10 per full run (5 archetypes × 4 models × 4 stages = 80 calls).
//   Sonnet 4    ~$3.00  (20 calls × $0.15)
//   Haiku 4.5   ~$0.60  (20 calls × $0.03)
//   GPT-5       ~$5.00  (20 calls × $0.25, estimate)
//   Gemini 2.5  ~$1.20  (20 calls × $0.06)
// DO NOT add to CI.

import { writeFileSync, readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const AGENTS_DIR = join(REPO_ROOT, 'agents');

const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY) {
  console.error('FATAL: OPENROUTER_API_KEY env var not set.');
  process.exit(1);
}

// ── model registry ─────────────────────────────────────────────────────────

const MODELS = {
  sonnet:  { slug: 'anthropic/claude-sonnet-4',     priceIn: 3.0,  priceOut: 15.0, label: 'Sonnet 4'      },
  haiku:   { slug: 'anthropic/claude-haiku-4.5',    priceIn: 0.8,  priceOut: 4.0,  label: 'Haiku 4.5'     },
  gpt5:    { slug: 'openai/gpt-5',                  priceIn: 10.0, priceOut: 30.0, label: 'GPT-5'         },
  gemini:  { slug: 'google/gemini-2.5-pro',         priceIn: 1.25, priceOut: 5.0,  label: 'Gemini 2.5 Pro'},
};

// ── 5 representative archetypes (covers full reviewer diversity) ──────────

const ARCHETYPES = {
  'fintech': {
    feature: 'stripe-webhook-hmac',
    task: 'Build /webhook endpoint that receives Stripe events, verifies HMAC signature via stripe-signature header, handles idempotency for replay protection.',
    reviewer: 'pci-reviewer',
    expectedBlocked: ['signature', 'idempot', 'pci', 'replay'],
  },
  'healthcare': {
    feature: 'phi-export-endpoint',
    task: 'GET /patient/:id/export returns FHIR JSON bundle. Requires JWT scope phi:export. All access logged to immutable audit table with reason field.',
    reviewer: 'healthcare-reviewer',
    expectedBlocked: ['audit', 'jwt', 'scope', 'phi', 'break-glass', 'baa'],
  },
  'web3': {
    feature: 'chainlink-price-oracle',
    task: 'Solidity 0.8 contract reading ETH/USD from Chainlink AggregatorV3Interface. Add staleness check (revert if updatedAt > 1h ago), decimals normalization, negative-price revert.',
    reviewer: 'oracle-reviewer',
    expectedBlocked: ['stale', 'decimal', 'negative', 'mev'],
  },
  'enterprise-saas': {
    feature: 'tenant-onboarding',
    task: 'POST /tenants — creates a new tenant with isolated DB schema, SCIM-provisioned admin, Stripe Customer. Multi-tenant Postgres RLS.',
    reviewer: 'enterprise-saas-reviewer',
    expectedBlocked: ['rls', 'isolation', 'tenant', 'scim', 'audit'],
  },
  'cli-tool': {
    feature: 'env-vars-loader',
    task: 'Node CLI reading .env file from disk, prints parsed vars as JSON. Support --help, --version, --json, NO_COLOR. Exit 0 success / 2 file-not-found.',
    reviewer: 'cli-reviewer',
    expectedBlocked: ['help', 'version', 'confirm', 'destructive', 'argv'],
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

async function callOR({ system, user, model, label }) {
  const t0 = Date.now();
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/avelikiy/great_cto',
      'X-Title': 'great_cto cross-provider matrix',
    },
    body: JSON.stringify({
      model: model.slug,
      max_tokens: 1500,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!r.ok) {
    const errBody = await r.text();
    throw new Error(`${model.slug} ${r.status}: ${errBody.slice(0, 250)}`);
  }
  const data = await r.json();
  const u = data.usage || {};
  // Per-million-token pricing → per-call cost
  const cost = ((u.prompt_tokens || 0) / 1_000_000) * model.priceIn
             + ((u.completion_tokens || 0) / 1_000_000) * model.priceOut;
  return {
    content: data.choices?.[0]?.message?.content || '',
    cost,
    promptTokens: u.prompt_tokens || 0,
    completionTokens: u.completion_tokens || 0,
    elapsed: ((Date.now() - t0) / 1000).toFixed(1),
  };
}

function parseVerdict(text) {
  const strict = text.match(/VERDICT:\s*(\w+)\s+reason="([^"]+)"/i);
  if (strict) return { verdict: strict[1].toUpperCase(), reason: strict[2] };
  const loose = text.match(/\*?\*?Verdict\*?\*?:?\s*\*?\*?\s*(APPROVED|BLOCKED|PASS|FAIL|DONE)\b/i);
  return { verdict: loose?.[1]?.toUpperCase() || 'UNKNOWN', reason: '' };
}

function parseFiles(text) {
  const out = [];
  const re = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
  let m;
  while ((m = re.exec(text))) out.push({ path: m[1].trim(), content: m[2].trim() });
  return out;
}

const ORCH_WRAPPER = `

---
AUTOMATED CROSS-PROVIDER TEST — IMPORTANT:
- Emit files as XML blocks: <file path="docs/foo.md">CONTENT</file>
- End with: VERDICT: <APPROVED|BLOCKED|DONE|PASS> reason="<short>"
- Output under 1200 tokens. Be CONCISE.
---
`;

// ── runner ─────────────────────────────────────────────────────────────────

async function runCell({ archetypeKey, modelKey }) {
  const cfg = ARCHETYPES[archetypeKey];
  const model = MODELS[modelKey];
  if (!cfg || !model) throw new Error(`bad combo: ${archetypeKey} × ${modelKey}`);

  let totalCost = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  const stages = [];
  let lastImpl = '';

  // Stage 1: architect
  const arch = await callOR({
    system: loadAgentPrompt('architect') + ORCH_WRAPPER,
    user: `Archetype: ${archetypeKey}\nFeature: "${cfg.feature}"\n\n${cfg.task}\n\nProduce SHORT ARCH doc + ADR.`,
    model, label: 'architect',
  });
  totalCost += arch.cost; promptTokens += arch.promptTokens; completionTokens += arch.completionTokens;
  stages.push({ stage: 'architect', verdict: parseVerdict(arch.content).verdict, cost: arch.cost });

  // Stage 2: pm
  const archDoc = parseFiles(arch.content).find(f => f.path.includes('ARCH'))?.content || '';
  const pm = await callOR({
    system: loadAgentPrompt('pm') + ORCH_WRAPPER,
    user: `Archetype: ${archetypeKey}\nFeature: "${cfg.feature}"\n\nARCH:\n${archDoc.slice(0, 1000)}\n\nProduce 3-task PLAN doc.`,
    model, label: 'pm',
  });
  totalCost += pm.cost; promptTokens += pm.promptTokens; completionTokens += pm.completionTokens;
  stages.push({ stage: 'pm', verdict: parseVerdict(pm.content).verdict, cost: pm.cost });

  // Stage 3: senior-dev
  const planDoc = parseFiles(pm.content).find(f => f.path.includes('PLAN'))?.content || '';
  const dev = await callOR({
    system: loadAgentPrompt('senior-dev') + ORCH_WRAPPER,
    user: `Archetype: ${archetypeKey}\nFeature: "${cfg.feature}"\n\nPLAN:\n${planDoc.slice(0, 1000)}\n\nImplement task #1 as a single file in src/. ~30 lines + 1 test.`,
    model, label: 'senior-dev',
  });
  totalCost += dev.cost; promptTokens += dev.promptTokens; completionTokens += dev.completionTokens;
  stages.push({ stage: 'senior-dev', verdict: parseVerdict(dev.content).verdict, cost: dev.cost });
  lastImpl = parseFiles(dev.content).find(f => f.path.startsWith('src/'))?.content || '(no impl)';

  // Stage 4: archetype reviewer
  const review = await callOR({
    system: loadAgentPrompt(cfg.reviewer) + ORCH_WRAPPER,
    user: `Archetype: ${archetypeKey}\nFeature: "${cfg.feature}"\n\nReview this implementation:\n\`\`\`\n${lastImpl.slice(0, 1500)}\n\`\`\`\n\nFocus on YOUR domain. Emit VERDICT.`,
    model, label: cfg.reviewer,
  });
  totalCost += review.cost; promptTokens += review.promptTokens; completionTokens += review.completionTokens;
  const { verdict: reviewerVerdict } = parseVerdict(review.content);
  stages.push({ stage: cfg.reviewer, verdict: reviewerVerdict, cost: review.cost });

  // Did reviewer flag expected concerns?
  const lower = review.content.toLowerCase();
  const flagged = cfg.expectedBlocked.filter(kw => lower.includes(kw));

  // Cell verdict:
  //   ✅ PASS  — reviewer BLOCKED + flagged ≥1 expected keyword
  //   ⚠️ partial — reviewer BLOCKED but missed keywords (shallow review)
  //   ❌ FAIL — reviewer APPROVED a clearly-deficient stub
  let cellVerdict;
  if (reviewerVerdict === 'BLOCKED' && flagged.length > 0) cellVerdict = 'PASS';
  else if (reviewerVerdict === 'BLOCKED') cellVerdict = 'PARTIAL';
  else cellVerdict = 'FAIL';

  return {
    archetype: archetypeKey, model: modelKey, modelLabel: model.label,
    cellVerdict, reviewerVerdict, flagged, stages,
    totalCost, promptTokens, completionTokens,
  };
}

// ── main ───────────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  let models = Object.keys(MODELS);
  let archetypes = Object.keys(ARCHETYPES);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--model' && argv[i + 1]) {
      models = argv[++i].split(',').map(s => s.trim()).filter(m => MODELS[m]);
    } else if (argv[i] === '--archetype' && argv[i + 1]) {
      archetypes = argv[++i].split(',').map(s => s.trim()).filter(a => ARCHETYPES[a]);
    }
  }
  return { models, archetypes };
}

async function main() {
  const { models, archetypes } = parseArgs();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Cross-provider matrix — real-LLM E2E');
  console.log(`   models:     ${models.map(m => MODELS[m].label).join(', ')}`);
  console.log(`   archetypes: ${archetypes.join(', ')}`);
  console.log(`   total cells: ${models.length * archetypes.length}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const results = [];
  let totalCost = 0;

  for (const archetype of archetypes) {
    for (const model of models) {
      process.stdout.write(`▸ [${archetype}/${MODELS[model].label.padEnd(15)}] running ${4} stages... `);
      try {
        const r = await runCell({ archetypeKey: archetype, modelKey: model });
        totalCost += r.totalCost;
        const symbol = r.cellVerdict === 'PASS' ? '✅'
                     : r.cellVerdict === 'PARTIAL' ? '⚠️'
                     : '❌';
        console.log(`${symbol} verdict=${r.reviewerVerdict.padEnd(8)} flagged=[${r.flagged.join(',')}]  $${r.totalCost.toFixed(4)}`);
        results.push(r);
      } catch (e) {
        console.log(`💥 ${e.message.slice(0, 100)}`);
        results.push({ archetype, model, modelLabel: MODELS[model].label, error: e.message, cellVerdict: 'ERROR', totalCost: 0 });
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' Matrix');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Header
  const hdr = '  archetype'.padEnd(20) + models.map(m => MODELS[m].label.padEnd(16)).join('');
  console.log(hdr);
  console.log('  ' + '─'.repeat(20 + models.length * 16));
  for (const archetype of archetypes) {
    let row = '  ' + archetype.padEnd(18);
    for (const model of models) {
      const cell = results.find(r => r.archetype === archetype && r.model === model);
      if (!cell || cell.error) { row += '💥 ERROR'.padEnd(16); continue; }
      const sym = cell.cellVerdict === 'PASS' ? '✅'
                : cell.cellVerdict === 'PARTIAL' ? '⚠️'
                : '❌';
      row += `${sym} ${cell.cellVerdict.padEnd(7)} `.padEnd(16);
    }
    console.log(row);
  }

  // Per-model summary
  console.log('\nPer-model:');
  for (const model of models) {
    const cells = results.filter(r => r.model === model);
    const pass = cells.filter(c => c.cellVerdict === 'PASS').length;
    const partial = cells.filter(c => c.cellVerdict === 'PARTIAL').length;
    const fail = cells.filter(c => c.cellVerdict === 'FAIL').length;
    const cost = cells.reduce((a, c) => a + (c.totalCost || 0), 0);
    console.log(`  ${MODELS[model].label.padEnd(15)} ${pass}/${cells.length} pass · ${partial} partial · ${fail} fail · $${cost.toFixed(4)}`);
  }

  console.log(`\nGrand total cost: $${totalCost.toFixed(4)}`);

  // Write matrix doc
  const matrixDoc = generateMatrixDoc(results, models, archetypes, totalCost);
  const outPath = join(REPO_ROOT, 'docs', 'testing', 'CROSS-PROVIDER-MATRIX.md');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, matrixDoc);
  console.log(`\nMatrix doc: ${outPath}`);
}

function generateMatrixDoc(results, models, archetypes, totalCost) {
  const now = new Date().toISOString();
  let out = `# Cross-provider matrix — ${now.slice(0, 10)}\n\n`;
  out += `Generated by \`tests/openrouter-cross-provider.mjs\`.\n\n`;
  out += `**Total cost:** $${totalCost.toFixed(4)}\n\n`;
  out += `## Matrix\n\n`;
  out += `| Archetype | ${models.map(m => MODELS[m].label).join(' | ')} |\n`;
  out += `|---|${models.map(() => '---').join('|')}|\n`;
  for (const archetype of archetypes) {
    let row = `| ${archetype} `;
    for (const model of models) {
      const cell = results.find(r => r.archetype === archetype && r.model === model);
      if (!cell || cell.error) { row += `| 💥 `; continue; }
      const sym = cell.cellVerdict === 'PASS' ? '✅' : cell.cellVerdict === 'PARTIAL' ? '⚠️' : '❌';
      row += `| ${sym} ${cell.cellVerdict} `;
    }
    out += row + '|\n';
  }
  out += `\n**Legend:**\n- ✅ PASS — reviewer BLOCKED + flagged ≥1 expected keyword\n`;
  out += `- ⚠️ PARTIAL — reviewer BLOCKED but missed expected keywords (shallow review)\n`;
  out += `- ❌ FAIL — reviewer APPROVED a clearly-deficient stub\n\n`;
  out += `## Per-model summary\n\n`;
  out += `| Model | Pass | Partial | Fail | Cost |\n|---|---|---|---|---|\n`;
  for (const model of models) {
    const cells = results.filter(r => r.model === model);
    const pass = cells.filter(c => c.cellVerdict === 'PASS').length;
    const partial = cells.filter(c => c.cellVerdict === 'PARTIAL').length;
    const fail = cells.filter(c => c.cellVerdict === 'FAIL').length;
    const cost = cells.reduce((a, c) => a + (c.totalCost || 0), 0);
    out += `| ${MODELS[model].label} | ${pass}/${cells.length} | ${partial} | ${fail} | $${cost.toFixed(4)} |\n`;
  }
  out += `\n## Per-cell detail\n\n`;
  for (const r of results) {
    if (r.error) { out += `### ${r.archetype} × ${r.modelLabel}\n\n💥 ERROR: ${r.error}\n\n`; continue; }
    out += `### ${r.archetype} × ${r.modelLabel}\n\n`;
    out += `- Cell verdict: **${r.cellVerdict}**\n`;
    out += `- Reviewer verdict: ${r.reviewerVerdict}\n`;
    out += `- Flagged keywords: ${r.flagged.length > 0 ? r.flagged.map(k => `\`${k}\``).join(', ') : '_(none)_'}\n`;
    out += `- Cost: $${r.totalCost.toFixed(4)} (${r.promptTokens}p / ${r.completionTokens}c tokens)\n`;
    out += `- Stages: ${r.stages.map(s => `${s.stage}:${s.verdict}`).join(' → ')}\n\n`;
  }
  return out;
}

main().catch(e => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
