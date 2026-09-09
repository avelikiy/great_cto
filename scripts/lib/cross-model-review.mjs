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
import { execFileSync } from 'node:child_process';
import { costForUsage, round4, resolvePrice } from './cost-meter.mjs';
import { resolveSecondOpinion, codexReview } from './second-opinion.mjs';
import { principalError } from './provider-exhaustion.mjs';
import { existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Exit codes. The first version had two: 0 for PASS and 1 for everything else —
 * BLOCK, a missing API key, a dead network. So "the review blocked this" and
 * "the review did not happen" were the same number to the agent reading it,
 * and the instruction to "note the cross-model pass was skipped" rested on the
 * agent noticing a stderr line. A skipped review now has its own code, and it
 * is neither of the two that mean a verdict was reached.
 */
export const EXIT = Object.freeze({ PASS: 0, BLOCK: 1, USAGE: 2, SKIPPED: 3 });

/**
 * Which provider reviews, decided from three sources in a fixed order:
 * an explicit `--provider`, then the project's `capabilities: second_opinion`,
 * then — for compatibility with every script that set it — the OpenRouter env.
 *
 * Returns the resolver's four states plus `source`, so the log line can say
 * why this provider and not another. Pure: `codex` and `env` are injected.
 */
export function decideProvider({ argv = [], projectMd = '', codex = null, env = process.env } = {}) {
  const forced = readArg(argv, '--provider');
  if (forced) {
    const r = resolveSecondOpinion({ projectMd: `capabilities:\n  second_opinion: ${forced}\n`, codex, env });
    return { ...r, source: '--provider' };
  }
  const fromProject = resolveSecondOpinion({ projectMd, codex, env });
  if (fromProject.state !== 'undeclared') return { ...fromProject, source: 'PROJECT.md' };
  if (env.OPENROUTER_API_KEY) {
    return { state: 'declared', provider: 'openrouter', why: '', source: 'OPENROUTER_API_KEY (second_opinion undeclared)' };
  }
  return { ...fromProject, source: 'PROJECT.md' };
}

/**
 * One line per review, so the board can show what the second opinion DID.
 *
 * `sha` (git HEAD) and `dirty` (working tree had uncommitted changes) are the
 * diff-identity fields BRD-R2's reader keys on, to tell "this line covers the
 * code you're looking at" from "it covered something else". Additive only:
 * both default to `null` — never `undefined`, never omitted — so a line
 * written before this field existed, and any caller that doesn't supply them,
 * still serializes to the same shape a reader already knows how to parse.
 */
export function reviewLogLine({ provider, model, state, verdict, findings, cost, source, error_kind, resets_at, sha, dirty }) {
  return JSON.stringify({
    ts: new Date().toISOString(), provider, model: model ?? null, state, verdict: verdict ?? null,
    error_kind: error_kind ?? null, resets_at: resets_at ?? null,
    findings: Array.isArray(findings) ? findings.length : null,
    p0: Array.isArray(findings) ? findings.filter((f) => f.severity === 'P0').length : null,
    cost: cost ?? null, source, sha: sha ?? null, dirty: dirty ?? null,
  });
}

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
  // Derive a verdict only in the direction that is safe to be wrong about.
  //
  // This used to answer PASS whenever no `VERDICT:` line was found and no P0
  // was parsed. But an empty body, a refusal, a reply in some other format and
  // a model that genuinely said "looks clean" are the SAME input here — all
  // four leave `verdict` null and `findings` without a P0. Reading any of them
  // as PASS reads all of them as PASS, so a review that could not be read
  // became a review that approved, and the Stop hook downstream ended the turn
  // on it.
  //
  // A derivation that BLOCKS costs a second look. A derivation that PASSES
  // spends the guarantee. So: a P0 with no verdict line still blocks; nothing
  // else is turned into a verdict, and `null` means the model never reached
  // one. Callers must treat null as "no verdict", never as a pass.
  if (!verdict && findings.some(f => f.severity === 'P0')) verdict = 'BLOCK';
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

/**
 * The tree's identity at review time — git HEAD and whether it was dirty.
 * CLI-only: the pure `reviewLogLine` above never shells out; per this file's
 * own pure/CLI split (see file header), the git call lives here and the
 * result is injected. Returns nulls outside a git repo rather than throwing —
 * "couldn't determine identity" is data for the log line, not a reason to
 * fail the review.
 */
function gitIdentity(cwd) {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const status = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { sha: sha || null, dirty: status.trim().length > 0 };
  } catch {
    return { sha: null, dirty: null };
  }
}

async function main(argv) {
  const diffPath = readArg(argv, '--diff');
  if (!diffPath) { console.error('Usage: cross-model-review.mjs --diff <file|-> [--spec <file>] [--model <slug>] [--provider codex|openrouter]'); process.exit(EXIT.USAGE); }

  const root = readArg(argv, '--root') || process.cwd();
  const mdPath = join(root, '.great_cto', 'PROJECT.md');
  const projectMd = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : '';
  const decision = decideProvider({ argv, projectMd });
  const identity = gitIdentity(root);
  const logPath = join(root, '.great_cto', 'cross-review.log');
  const log = (rec) => { try { mkdirSync(join(root, '.great_cto'), { recursive: true }); appendFileSync(logPath, reviewLogLine({ ...rec, source: decision.source, sha: identity.sha, dirty: identity.dirty }) + '\n'); } catch { /* the log is evidence, not a gate */ } };

  // Anything that is not a reviewer reviewing exits SKIPPED — not PASS, and not
  // the BLOCK code either. The line says why, and the log keeps it.
  if (decision.state !== 'declared') {
    console.log(`cross-model-review: SKIPPED (${decision.state}) — ${decision.why}`);
    log({ provider: decision.provider, state: decision.state, verdict: null, findings: null, cost: null });
    process.exit(EXIT.SKIPPED);
  }

  const diff = diffPath === '-' ? readFileSync(0, 'utf8') : readFileSync(diffPath, 'utf8');
  if (!diff.trim()) { console.log('cross-model-review: empty diff, nothing to review.'); process.exit(EXIT.PASS); }
  const specFile = readArg(argv, '--spec');
  const spec = specFile ? readFileSync(specFile, 'utf8').slice(0, 4000) : null;
  const prompt = buildReviewPrompt({ diff: diff.slice(0, 24000), spec });

  let res;
  if (decision.provider === 'codex') {
    const model = readArg(argv, '--model') || null;   // null = whatever ~/.codex/config.toml names
    console.error(`cross-model-review: reviewer=codex${model ? ' -m ' + model : ' (' + (decision.codex?.model || 'default model') + ')'} (cross-model red-team, read-only sandbox)`);
    const r = await codexReview({ ...prompt, cwd: root, model, bin: process.env.GREAT_CTO_CODEX_BIN || 'codex' });
    if (r.state !== 'ok') {
      // The reason a human is shown is RANKED, not the first thing Codex said.
      // A quota-exhausted review used to display "Skill descriptions were
      // shortened…" — advisory noise that arrived first — while the sentence
      // naming the cause and its reset date was truncated away.
      const principal = principalError(r.errors);
      const reason = principal ? `${principal.kind}: ${principal.why}` : 'no answer';
      console.log(`cross-model-review: SKIPPED (codex ${r.state}) — ${reason}`);
      if (principal && r.errors.length > 1) {
        console.log(`  (${r.errors.length - 1} other message(s) from codex, not the cause)`);
      }
      log({
        provider: 'codex', model: r.model ?? decision.codex?.model, state: r.state,
        verdict: null, findings: null, cost: null,
        error_kind: principal?.kind ?? null, resets_at: principal?.resetsAt ?? null,
      });
      process.exit(EXIT.SKIPPED);
    }
    res = { text: r.text, usage: r.usage, model: r.model ?? decision.codex?.model ?? 'codex' };
  } else {
    const model = readArg(argv, '--model') || pickReviewerModel();
    console.error(`cross-model-review: reviewer=${model} (cross-model red-team via OpenRouter)`);
    res = await callOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY, model, ...prompt });
  }

  const { findings, verdict } = parseFindings(res.text);
  // Unpriced is null, not zero. The first real Codex review logged `cost: 0`
  // for gpt-5.6-terra — a model the price table does not carry — because usage
  // was present and costForUsage prices an unknown model at nothing. A reviewer
  // that reads as free is the defect this repository has removed twice already.
  const priced = resolvePrice(res.model).price != null;
  const cost = res.usage && priced ? round4(costForUsage({ model: res.model, usage: res.usage })) : null;

  for (const f of findings) console.log(`  ${f.severity} ${f.file}:${f.line} — ${f.issue}`);
  if (verdict == null) {
    // The call succeeded and the answer is unusable. `ok` would put it in the
    // log as a reviewed tree and exit 0 would tell the caller it passed; both
    // are the claim this tool exists to refuse to make.
    console.log(`\ncross-model-review (${decision.provider}:${res.model}): the answer carries no verdict `
      + `(${findings.length} finding(s) parsed). Not a pass — re-run, or say in your answer that the reviewer `
      + `returned nothing readable.`);
    log({ provider: decision.provider, model: res.model, state: 'unreadable', verdict: null, findings, cost,
      error_kind: 'no-verdict' });
    process.exit(EXIT.SKIPPED);
  }
  console.log(`\ncross-model-review (${decision.provider}:${res.model}): ${findings.length} finding(s), VERDICT: ${verdict}  (${cost == null ? 'cost unpriced' : '$' + cost})`);
  log({ provider: decision.provider, model: res.model, state: 'ok', verdict, findings, cost });
  process.exit(verdict === 'BLOCK' ? EXIT.BLOCK : EXIT.PASS);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2)).catch(e => { console.error('FATAL:', e.message); process.exit(EXIT.SKIPPED); });
