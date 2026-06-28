// scripts/lib/cross-model-review.mjs — cross-model adversarial review (architect-loop R3).
//
// great_cto's reviews are Claude-on-Claude → same-model blind spots. This red-teams
// the diff with a DIFFERENT model via OpenRouter (default openai/gpt-5), flagging
// ONLY correctness / requirement / invariant gaps with file:line — no style. The
// code-reviewer agent merges these with its own findings for high-stakes changes.
//
// Pure (buildReviewPrompt / parseFindings / pickReviewerModel) is unit-tested with
// no network; the CLI does the live OpenRouter call.
//
// Usage:
//   git diff main...HEAD | node scripts/lib/cross-model-review.mjs --diff -
//   node scripts/lib/cross-model-review.mjs --diff /tmp/d.diff --spec docs/architecture/ARCH-x.md
//   GREAT_CTO_CROSS_REVIEW_MODEL=google/gemini-2.5-pro node ... --diff -

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { costForUsage, round4 } from './cost-meter.mjs';

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';

/** A genuinely non-Claude reviewer model (cross-model). Override via env. */
export function pickReviewerModel(env = process.env) {
  return env.GREAT_CTO_CROSS_REVIEW_MODEL || 'openai/gpt-5';
}

/** Build the red-team prompt. Calibrated: correctness/invariant only, file:line, no style. */
export function buildReviewPrompt({ diff, spec }) {
  const system =
    'You are an adversarial code reviewer from a DIFFERENT model family than the author. ' +
    'Your job is to catch what a same-model reviewer would miss. Review ONLY for: ' +
    'correctness bugs, violated requirements, broken invariants, security holes, data loss. ' +
    'Do NOT report style, naming, or preferences. Ground every finding in the diff with file:line. ' +
    'Default to silence over a weak finding. ' +
    'Output ONE finding per line in EXACTLY this format:\n' +
    '<file>:<line> | <P0|P1|P2> | <one-sentence concrete issue>\n' +
    'P0 = data loss / security / broken build or prod path. ' +
    'After the findings, output a final line: VERDICT: BLOCK (if any P0) or VERDICT: PASS.';
  const user =
    (spec ? `Spec / intent:\n${spec}\n\n` : '') +
    `Diff under review:\n${diff}\n\n` +
    `Report findings (file:line | severity | issue), then VERDICT:`;
  return { system, user };
}

/** Parse the model's findings + verdict. */
export function parseFindings(text) {
  const findings = [];
  let verdict = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    const v = line.match(/^VERDICT:\s*(BLOCK|PASS)/i);
    if (v) { verdict = v[1].toUpperCase(); continue; }
    // <file>:<line> | <SEV> | <issue>
    const m = line.match(/^(.+?):(\d+)\s*\|\s*(P[012])\s*\|\s*(.+)$/i);
    if (m) findings.push({ file: m[1].trim(), line: parseInt(m[2], 10), severity: m[3].toUpperCase(), issue: m[4].trim() });
  }
  // Derive verdict if the model omitted it: any P0 → BLOCK.
  if (!verdict) verdict = findings.some(f => f.severity === 'P0') ? 'BLOCK' : 'PASS';
  return { findings, verdict };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function callOpenRouter({ apiKey, model, system, user }) {
  const res = await fetch(OPENROUTER_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'HTTP-Referer': 'https://greatcto.systems', 'X-Title': 'great_cto-xmodel-review', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1200, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const u = data.usage || null;
  return { text: data.choices?.[0]?.message?.content?.trim() || '', usage: u ? { input_tokens: u.prompt_tokens ?? 0, output_tokens: u.completion_tokens ?? 0 } : null, model };
}

function readArg(argv, name) { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : null; }

async function main(argv) {
  const diffPath = readArg(argv, '--diff');
  if (!diffPath) { console.error('Usage: cross-model-review.mjs --diff <file|-> [--spec <file>] [--model <slug>]'); process.exit(2); }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) { console.error('ERROR: OPENROUTER_API_KEY not set — cross-model review needs OpenRouter (a non-Claude model).'); process.exit(1); }

  const diff = diffPath === '-' ? readFileSync(0, 'utf8') : readFileSync(diffPath, 'utf8');
  if (!diff.trim()) { console.log('cross-model-review: empty diff, nothing to review.'); process.exit(0); }
  const specFile = readArg(argv, '--spec');
  const spec = specFile ? readFileSync(specFile, 'utf8').slice(0, 4000) : null;
  const model = readArg(argv, '--model') || pickReviewerModel();

  console.error(`cross-model-review: reviewer=${model} (cross-model red-team)`);
  const res = await callOpenRouter({ apiKey, model, ...buildReviewPrompt({ diff: diff.slice(0, 24000), spec }) });
  const { findings, verdict } = parseFindings(res.text);
  const cost = round4(costForUsage({ model: res.model, usage: res.usage }));

  for (const f of findings) console.log(`  ${f.severity} ${f.file}:${f.line} — ${f.issue}`);
  console.log(`\ncross-model-review (${model}): ${findings.length} finding(s), VERDICT: ${verdict}  ($${cost})`);
  process.exit(verdict === 'BLOCK' ? 1 : 0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2)).catch(e => { console.error('FATAL:', e.message); process.exit(1); });
