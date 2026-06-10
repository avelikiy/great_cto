// E2E test — domain pack overlays via OpenRouter (Task 1, Sprint 1).
//
// Tests each of the 10 v2.8.0 domain packs by running a planted-vuln
// stub through 5 stages:
//   architect → pm → senior-dev → base-archetype-reviewer → pack-reviewer
//
// The pack-reviewer is the test target — it should BLOCK the stub
// with at least one expected pack-specific keyword.
//
// Cost: ~$0.15 × 10 packs = ~$1.50 per full run.
// DO NOT add to CI.
//
// Usage:
//   export OPENROUTER_API_KEY=sk-or-v1-...
//   node tests/openrouter-pack-overlays.mjs                   # all 10
//   node tests/openrouter-pack-overlays.mjs voice-pack hr-ai-pack  # subset

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
  console.error('FATAL: OPENROUTER_API_KEY env var not set.');
  process.exit(1);
}

const MODEL = process.env.OR_MODEL || 'anthropic/claude-sonnet-4';
const MAX_TOKENS = 1500;

// ── pack configurations ────────────────────────────────────────────────────

const PACKS = {
  'voice-pack': {
    baseArchetype: 'agent-product',
    baseReviewer: 'ai-security-reviewer',
    packReviewers: ['voice-ai-reviewer'],
    feature: 'twilio-voice-ivr',
    task: 'Build POST /call/handle for Twilio voice IVR. Capture user speech via Deepgram STT, generate TTS reply via ElevenLabs cloned voice. Persist call transcripts to S3.',
    expectedBlocked: ['tcpa', 'consent', 'disclosure', 'synth', 'pii', 'redact', 'biometric'],
  },
  'clinical-pack': {
    baseArchetype: 'healthcare',
    baseReviewer: 'healthcare-reviewer',
    packReviewers: ['ai-clinical-reviewer', 'fda-reviewer'],
    feature: 'clinical-decision-support',
    task: 'POST /cds/dose-suggest endpoint: reads patient EHR (age, weight, comorbidities), suggests drug dosage. Used by clinicians during rounds.',
    expectedBlocked: ['samd', 'class', 'fda', 'clinical', 'validation', 'premarket', '510k'],
  },
  'hr-ai-pack': {
    baseArchetype: 'ai-system',
    baseReviewer: 'ai-security-reviewer',
    packReviewers: ['hr-ai-reviewer'],
    feature: 'resume-screening-ranker',
    task: 'POST /candidates/rank endpoint: takes job description + N resumes, returns ranked scores. Used for initial screening in ATS.',
    expectedBlocked: ['aedt', 'audit', 'll-144', 'nyc', 'bias', 'disparate', 'notification', 'eeoc'],
  },
  'api-platform-pack': {
    baseArchetype: 'web-service',
    baseReviewer: 'security-officer',
    packReviewers: ['api-platform-reviewer'],
    feature: 'public-widget-api',
    task: 'Public API: POST /v1/widgets, GET /v1/widgets/{id}. OpenAPI 3.1 spec. API-key auth. Webhooks for widget.created events. Rate limit 100/min/key.',
    expectedBlocked: ['version', 'deprecation', 'webhook', 'signature', 'sign', 'breaking', 'idempot'],
  },
  'lending-pack': {
    baseArchetype: 'fintech',
    baseReviewer: 'pci-reviewer',
    packReviewers: ['lending-credit-reviewer'],
    feature: 'plaid-loan-approval',
    task: 'POST /loans/decide endpoint: pulls Plaid bank-data, runs internal credit model, returns approve/deny + APR.',
    expectedBlocked: ['fcra', 'adverse', 'action', 'fair-lending', 'disparate', 'ecoa', 'notice', 'reason'],
  },
  'clinical-trials-pack': {
    baseArchetype: 'healthcare',
    baseReviewer: 'healthcare-reviewer',
    packReviewers: ['clinical-trials-reviewer', 'bio-data-reviewer'],
    feature: 'edc-vitals-capture',
    task: 'Electronic Data Capture endpoint: clinician records subject vitals (BP, HR, temp) per CDISC SDTM. eConsent signature collected. Data pushed to CTMS nightly.',
    expectedBlocked: ['part-11', 'part11', 'e-signature', 'esignature', 'irb', 'protocol', 'deidentif', 'audit-trail', 'validated'],
  },
  'robotics-pack': {
    baseArchetype: 'agent-product',
    baseReviewer: 'ai-security-reviewer',
    packReviewers: ['robotics-safety-reviewer'],
    feature: 'cobot-grasp-planning',
    task: 'ROS 2 node for cobot grasp planning. Takes target object pose, plans MoveIt motion. Cobot operates alongside human worker on assembly line.',
    expectedBlocked: ['hara', 'iso', '15066', 'cobot', 'force', 'safety', 'risk', 'sil', 'functional-safety', 'collision'],
  },
  'em-fintech-pack': {
    baseArchetype: 'fintech',
    baseReviewer: 'pci-reviewer',
    packReviewers: ['emerging-markets-fintech-reviewer'],
    feature: 'india-bnpl-checkout',
    task: 'BNPL India: at e-commerce checkout user splits payment 3-month installments. Razorpay UPI for collections. Loan booked on NBFC partner balance sheet.',
    expectedBlocked: ['rbi', 'nbfc', 'license', 'tier', 'lender-of-record', 'kyc', 'aadhaar'],
  },
  'climate-pack': {
    baseArchetype: 'web-service',
    baseReviewer: 'security-officer',
    packReviewers: ['climate-mrv-reviewer', 'biosecurity-reviewer'],
    feature: 'carbon-credit-calculator',
    task: 'Endpoint /api/emissions/calc: takes business activity data (electricity kWh, fuel litres, supply-chain), returns Scope 1+2+3 footprint + tradeable Verra carbon credits.',
    expectedBlocked: ['mrv', 'methodology', 'verra', 'cbam', 'registered', 'emission-factor', 'ghg-protocol', 'verification', 'additionality'],
  },
  'drug-discovery-pack': {
    baseArchetype: 'ai-system',
    baseReviewer: 'ai-security-reviewer',
    packReviewers: ['drug-discovery-ml-reviewer', 'glp-glab-reviewer', 'lab-automation-reviewer'],
    feature: 'protein-fold-predictor',
    task: 'POST /predict/structure endpoint: takes amino-acid sequence, runs AlphaFold-style protein structure prediction. Wet-lab confirms via X-ray crystallography (results uploaded via SiLA2).',
    // Broader keyword set — drug-discovery reviewers use varied terminology
    expectedBlocked: ['model-card', 'model card', 'csv', 'computer-system', 'validation', 'iq', 'oq', 'pq', 'glp', 'gxp', '21 cfr', '21-cfr', 'audit', 'glab', 'reproduc', 'data integrity', 'data-integrity', 'lineage', 'training data', 'wet-lab', 'wet lab', 'lab-automation', 'sila', 'documentation'],
  },
  'digital-health-pack': {
    baseArchetype: 'healthcare',
    baseReviewer: 'healthcare-reviewer',
    packReviewers: ['digital-health-reviewer', 'ai-clinical-reviewer', 'healthcare-reviewer'],
    feature: 'symptom-triage-chatbot',
    task: 'POST /triage endpoint: a consumer health app chatbot reads symptoms and returns a care recommendation (self-care / see a doctor / ER). Logs PHI to analytics.',
    expectedBlocked: ['samd', 'fda', 'clinical', 'phi', 'hipaa', 'disclaimer', 'medical advice', 'validation', 'safety'],
  },
  'sec-cyber-pack': {
    baseArchetype: 'enterprise',
    baseReviewer: 'enterprise-saas-reviewer',
    packReviewers: ['sec-cyber-disclosure-reviewer'],
    feature: 'incident-disclosure-workflow',
    task: 'Build the breach-response workflow for a US public company: detect a material cyber incident and auto-file. No human sign-off, no materiality assessment, no 4-business-day clock.',
    expectedBlocked: ['8-k', '8k', 'item 1.05', 'material', 'four business day', '4 business day', 'disclosure', 'sec', 'regulation s-k', 'cybersecurity'],
  },
  'adtech-privacy-pack': {
    baseArchetype: 'agent-product',
    baseReviewer: 'ai-security-reviewer',
    packReviewers: ['adtech-privacy-reviewer', 'us-privacy-reviewer'],
    feature: 'cross-site-ad-targeting',
    task: 'Build a programmatic ad pipeline that builds cross-site user profiles from third-party cookies + device fingerprints, sells audience segments. No consent, no opt-out, no sensitive-category exclusion.',
    expectedBlocked: ['consent', 'opt-out', 'opt out', 'gpc', 'global privacy control', 'cpra', 'ccpa', 'sensitive', 'fingerprint', 'do not sell', 'tcf'],
  },
  'us-ai-pack': {
    baseArchetype: 'ai-system',
    baseReviewer: 'ai-security-reviewer',
    packReviewers: ['us-ai-reviewer'],
    feature: 'automated-hiring-screener',
    task: 'Build an AI that screens job applicants and auto-rejects below a score, deployed to NYC employees. No bias audit, no candidate notice, no adverse-impact testing.',
    expectedBlocked: ['bias audit', 'aedt', 'local law 144', 'nyc', 'adverse impact', 'disparate', 'notice', 'colorado ai act', 'transparency', 'discrimination'],
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

async function callOR({ system, user, label }) {
  const t0 = Date.now();
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/avelikiy/great_cto',
      'X-Title': 'great_cto pack overlays test',
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: MAX_TOKENS,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error(`OR ${r.status} for ${label}: ${(await r.text()).slice(0, 250)}`);
  const data = await r.json();
  const u = data.usage || {};
  const cost = ((u.prompt_tokens || 0) / 1_000_000) * 3 + ((u.completion_tokens || 0) / 1_000_000) * 15;
  return {
    content: data.choices?.[0]?.message?.content || '',
    cost,
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
  const strict = text.match(/VERDICT:\s*(\w+)\s+reason="([^"]+)"/i);
  if (strict) return { verdict: strict[1].toUpperCase(), reason: strict[2] };
  const loose = text.match(/\*?\*?Verdict\*?\*?:?\s*\*?\*?\s*(APPROVED|BLOCKED|PASS|FAIL|DONE)\b/i);
  return { verdict: loose?.[1]?.toUpperCase() || 'UNKNOWN', reason: '(no reason parsed)' };
}

const ORCH_WRAPPER = `

---
AUTOMATED PACK TEST — IMPORTANT:
- You cannot use Bash, Read, Write, or any tool. Emit files as XML blocks:
  <file path="docs/foo.md">CONTENT</file>
- End reply with: VERDICT: <APPROVED|BLOCKED|PASS|DONE> reason="<short>"
- Output under 1200 tokens. Be CONCISE.
- No prose outside file blocks and verdict.
- BLOCKED is the correct answer if you find any Critical/High pack-specific concern.
---
`;

async function runStage({ stageName, agentName, taskPrompt }) {
  const sys = loadAgentPrompt(agentName) + ORCH_WRAPPER;
  const res = await callOR({ system: sys, user: taskPrompt, label: stageName });
  const files = parseFiles(res.content);
  const { verdict, reason } = parseVerdict(res.content);
  return { ...res, files, verdict, reason };
}

// ── pack runner ────────────────────────────────────────────────────────────

async function runPack(packKey) {
  const cfg = PACKS[packKey];
  if (!cfg) throw new Error(`unknown pack: ${packKey}`);

  process.stdout.write(`▸ [${packKey}] arch.`);
  let cost = 0;

  // Stage 1: architect
  const arch = await runStage({
    stageName: 'architect', agentName: 'architect',
    taskPrompt: `Pack: ${packKey}\nBase archetype: ${cfg.baseArchetype}\nFeature: "${cfg.feature}"\n\n${cfg.task}\n\nProduce: short ARCH at docs/architecture/ARCH-${cfg.feature}.md (under 40 lines). Mention pack-specific compliance requirements explicitly.`,
  });
  cost += arch.cost;

  process.stdout.write('pm.');
  const archDoc = arch.files.find(f => f.path.includes('ARCH-'))?.content || '';
  const pm = await runStage({
    stageName: 'pm', agentName: 'pm',
    taskPrompt: `Pack: ${packKey}\nFeature: "${cfg.feature}"\n\nArchitect ARCH:\n${archDoc.slice(0, 1200)}\n\nProduce: docs/plans/PLAN-${cfg.feature}.md with 3 tasks. Be brief.`,
  });
  cost += pm.cost;

  process.stdout.write('senior-dev.');
  const planDoc = pm.files.find(f => f.path.includes('PLAN-'))?.content || '';
  const dev = await runStage({
    stageName: 'senior-dev', agentName: 'senior-dev',
    taskPrompt: `Pack: ${packKey}\nFeature: "${cfg.feature}"\n\nPlan:\n${planDoc.slice(0, 1200)}\n\nImplement task #1 as a single file in src/. ~30 lines, plus 1 simple test.`,
  });
  cost += dev.cost;

  // Stage 4: base archetype reviewer (uses existing healthcare-reviewer etc.)
  process.stdout.write(`${cfg.baseReviewer}.`);
  const implFile = dev.files.find(f => f.path.startsWith('src/'));
  const implContent = implFile?.content || '(no impl)';
  const baseReview = await runStage({
    stageName: cfg.baseReviewer, agentName: cfg.baseReviewer,
    taskPrompt: `Pack: ${packKey}\nFeature: "${cfg.feature}"\n\nReview this implementation at ${implFile?.path}:\n\n\`\`\`\n${implContent.slice(0, 1200)}\n\`\`\`\n\nFocus on YOUR archetype-level concerns. Verdict: APPROVED if base-level acceptable for stub.`,
  });
  cost += baseReview.cost;

  // Stage 5: pack-specific reviewer (the THE one we want to test)
  // Run only the FIRST pack-reviewer (if multiple, others are confirmatory)
  const packReviewer = cfg.packReviewers[0];
  process.stdout.write(`${packReviewer}.`);
  const packReview = await runStage({
    stageName: packReviewer, agentName: packReviewer,
    taskPrompt: `Pack: ${packKey}\nFeature: "${cfg.feature}"\n\nReview this implementation at ${implFile?.path}:\n\n\`\`\`\n${implContent.slice(0, 1500)}\n\`\`\`\n\nYou are the PACK-SPECIFIC reviewer. Focus EXCLUSIVELY on pack-domain concerns (NOT generic security). Find pack-specific gaps. BLOCK if any Critical/High.`,
  });
  cost += packReview.cost;

  // Did pack reviewer flag expected pack-specific concern?
  const lower = packReview.content.toLowerCase();
  const flagged = cfg.expectedBlocked.filter(kw => lower.includes(kw.toLowerCase()));

  const isPass = packReview.verdict === 'BLOCKED' && flagged.length > 0;
  const symbol = isPass ? '✅' : '❌';
  console.log(` ${symbol}  pack-verdict=${packReview.verdict.padEnd(8)} flagged=[${flagged.join(',')}]  $${cost.toFixed(3)}`);

  return {
    pack: packKey,
    cost,
    packVerdict: packReview.verdict,
    flagged,
    isPass,
  };
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const requested = process.argv.slice(2);
  const packs = requested.length > 0 ? requested : Object.keys(PACKS);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Domain pack overlays — real-LLM test');
  console.log(`   model:  ${MODEL}`);
  console.log(`   packs:  ${packs.join(', ')}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  let total = 0, passed = 0, failed = 0;
  const results = [];

  for (const packKey of packs) {
    try {
      const r = await runPack(packKey);
      total += r.cost;
      if (r.isPass) passed++; else failed++;
      results.push(r);
    } catch (e) {
      console.log(` 💥 ${e.message.slice(0, 80)}`);
      failed++;
      results.push({ pack: packKey, error: e.message, isPass: false });
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(` Summary: ${passed}/${packs.length} passed   |   $${total.toFixed(4)} total`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (failed > 0) {
    console.log('\nFailures:');
    for (const r of results) {
      if (r.isPass) continue;
      console.log(`  ✗ ${r.pack}: verdict=${r.packVerdict || 'ERROR'} flagged=[${(r.flagged || []).join(',') || 'none'}]`);
      if (r.error) console.log(`    err: ${r.error.slice(0, 100)}`);
    }
    process.exit(1);
  }
}

main().catch(e => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
