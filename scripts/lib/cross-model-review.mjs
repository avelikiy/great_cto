// scripts/lib/cross-model-review.mjs — cross-model adversarial review (architect-loop R3).
//
// Review the supplied diff through the configured second-opinion provider, flagging
// ONLY correctness / requirement / invariant gaps with file:line — no style. The
// code-reviewer agent merges these with its own findings for high-stakes changes.
// Provider/model metadata alone does not establish cross-model independence.
//
// Pure (buildReviewPrompt / parseFindings / pickReviewerModel) is unit-tested with
// no network; the CLI does the live OpenRouter call.
//
// Usage:
//   git diff main...HEAD | node scripts/lib/cross-model-review.mjs --diff -
//   node scripts/lib/cross-model-review.mjs --diff /tmp/d.diff --spec docs/architecture/ARCH-x.md
//   GREAT_CTO_CROSS_REVIEW_MODEL=google/gemini-2.5-pro node ... --diff -

import { readFileSync, lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { costForUsage, round4, resolvePrice } from './cost-meter.mjs';
import { resolveSecondOpinion, codexReview } from './second-opinion.mjs';
import { principalError } from './provider-exhaustion.mjs';
import { existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, resolve, parse, sep } from 'node:path';
import { reviewInputBinding, parseLegacyReview } from './review-contract.mjs';

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
 * Which provider reviews, decided from two sources in a fixed order:
 * an explicit `--provider`, then the project's `capabilities: second_opinion`.
 *
 * An exported OPENROUTER_API_KEY used to be a third source: with nothing
 * declared, the key chose OpenRouter and the diff left the machine without
 * anyone deciding it should (CSO SEC-2, 27.10). The key is a credential, not a
 * decision — undeclared stays undeclared, and the skip line names the
 * declaration that would turn the review on.
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
  if (fromProject.state === 'undeclared' && env.OPENROUTER_API_KEY) {
    return { ...fromProject, source: 'PROJECT.md',
      why: `${fromProject.why}; OPENROUTER_API_KEY is set but does not choose the provider — declare \`second_opinion: openrouter\` or pass --provider openrouter` };
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
export function reviewLogLine({ provider, model, state, verdict, findings, cost, source, error_kind, resets_at, sha, dirty, review_input }) {
  return JSON.stringify({
    ts: new Date().toISOString(), provider, model: model ?? null, state, verdict: verdict ?? null,
    error_kind: error_kind ?? null, resets_at: resets_at ?? null,
    findings: Array.isArray(findings) ? findings.length : null,
    p0: Array.isArray(findings) ? findings.filter((f) => f.severity === 'P0').length : null,
    cost: cost ?? null, source, sha: sha ?? null, dirty: dirty ?? null,
    review_input: review_input ?? null,
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
    'You are an adversarial code reviewer. Do not assume your model family differs from the author. ' +
    'Review ONLY for: ' +
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
  return parseLegacyReview(text);
}

// ── CLI ───────────────────────────────────────────────────────────────────────

/**
 * One chat call to OpenRouter: text + usage out. Exported so the architecture
 * council (scripts/lib/council.mjs) uses this call rather than a second copy of it.
 * `usage` is null when the provider returns none — a caller must not price that as zero.
 */
export async function callOpenRouter({ apiKey, model, system, user, maxTokens = 1200, title = 'great_cto-xmodel-review' }) {
  const res = await fetch(OPENROUTER_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'HTTP-Referer': 'https://greatcto.systems', 'X-Title': title, 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const u = data.usage || null;
  return { text: data.choices?.[0]?.message?.content?.trim() || '', usage: u ? { input_tokens: u.prompt_tokens ?? 0, output_tokens: u.completion_tokens ?? 0 } : null, model };
}

function readArg(argv, name) { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : null; }

/** Read explicitly selected input without following symlinks or special files. */
function readProfileFile(file, root, cap) {
  if (typeof file !== 'string' || !file || file === '-' || Buffer.byteLength(file) > 4096
      || file.split(/[\\/]/).includes('..') || /[\x00-\x1f\x7f]/.test(file)) throw new Error('invalid-input-file');
  const target = resolve(root, file), parsed = parse(target);
  const parts = target.slice(parsed.root.length).split(sep);
  let current = parsed.root;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '.git' || /^\.env(?:\.|$)/i.test(parts[i])) throw new Error('invalid-input-file');
    current = join(current, parts[i]);
    const st = lstatSync(current);
    if (st.isSymbolicLink() || (i < parts.length - 1 ? !st.isDirectory() : !st.isFile())) throw new Error('invalid-input-file');
  }
  const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > cap) throw new Error('invalid-input-file');
    const bytes = Buffer.alloc(cap + 1);
    let size = 0, n;
    while (size <= cap && (n = readSync(fd, bytes, size, cap + 1 - size, null)) > 0) size += n;
    if (size > cap) throw new Error('invalid-input-file');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size));
  } finally { closeSync(fd); }
}

/** Check explicit runtime roots before any credential getter is evaluated. */
export function validateKimiRuntimePaths(root, operatorRoot) {
  for (const [directory, allowMissing] of [[root, false], [operatorRoot, true]]) {
    if (typeof directory !== 'string' || !directory || Buffer.byteLength(directory) > 4096
        || /[\x00-\x1f\x7f]/.test(directory)) throw new Error('invalid-runtime-path');
    const target = resolve(directory), parsed = parse(target);
    let current = parsed.root, missing = false;
    for (const part of target.slice(parsed.root.length).split(sep).filter(Boolean)) {
      if (Buffer.byteLength(part) > 255 || part === '.git' || /^\.env(?:\.|$)/i.test(part)) throw new Error('invalid-runtime-path');
      current = join(current, part);
      if (missing) continue;
      try {
        const st = lstatSync(current);
        if (st.isSymbolicLink() || !st.isDirectory()) throw new Error('invalid-runtime-path');
      } catch (error) {
        if (allowMissing && error.code === 'ENOENT') missing = true;
        else throw error;
      }
    }
  }
}

/** Explicit extra opinion. Runtime capabilities are resolved only after admission. */
export async function runProfileReview(options = {}) {
  const argv = options.argv ?? [];
  if (!argv.includes('--profile')) return null;
  const denied = () => ({ exitCode: EXIT.USAGE, summary: { status: 'usage-error', verdict: null,
    advisory: true, authority: 'NONE', releaseEligibility: 'NOT_CHECKED', reasonCode: 'invalid-profile-invocation' } });
  const allowed = new Set(['--profile', '--envelope', '--task', '--context-class', '--reason', '--root', '--operator-root', '--diff', '--spec']);
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i], value = argv[i + 1];
    if (!allowed.has(flag) || flags.has(flag) || typeof value !== 'string' || !value || value.startsWith('--')) return denied();
    flags.set(flag, value);
  }
  if (flags.get('--profile') !== 'kimi-readonly-v1'
      || ['--envelope', '--task', '--context-class', '--reason', '--operator-root'].some(k => !flags.has(k))) return denied();
  let root, operatorRoot, envelope, profileApi;
  try {
    root = resolve(flags.get('--root') || process.cwd());
    operatorRoot = resolve(root, flags.get('--operator-root'));
    validateKimiRuntimePaths(root, operatorRoot);
    envelope = JSON.parse(readProfileFile(flags.get('--envelope'), root, 131072));
    if (!envelope || envelope.mode !== 'diff-review' || envelope.taskId !== flags.get('--task')
        || envelope.contextClass !== flags.get('--context-class') || envelope.reason !== flags.get('--reason')) return denied();
    for (const [flag, field, cap] of [['--diff', 'diff', 96000], ['--spec', 'spec', 16000]]) {
      if (flags.has(flag) && readProfileFile(flags.get(flag), root, cap) !== envelope[field]) return denied();
    }
    profileApi = await import('./kimi-review-profile.mjs');
    profileApi.buildKimiInputBinding(envelope);
  } catch { return denied(); }
  const result = await profileApi.runKimiReview({ profile: flags.get('--profile'), envelope, root,
    operatorRoot,
    get apiKey() { return options.apiKey ?? (options.env ?? process.env).OPENROUTER_API_KEY; },
    fetchImpl: options.fetchImpl, now: options.now, uuid: options.uuid, signal: options.signal, timeoutMs: options.timeoutMs });
  const complete = result.status === 'complete' && ['PASS', 'BLOCK'].includes(result.verdict);
  return { exitCode: complete ? result.verdict === 'BLOCK' ? EXIT.BLOCK : EXIT.PASS : EXIT.SKIPPED,
    summary: { status: result.status, reasonCode: result.reasonCode, verdict: complete ? result.verdict : null,
      advisory: true, authority: 'NONE', releaseEligibility: 'NOT_CHECKED', bindingDigest: result.bindingDigest,
      findings: result.result?.findings?.length ?? null, costState: result.costState, costUsd: result.costUsd } };
}

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
  if (argv.includes('--profile')) {
    const r = await runProfileReview({ argv, fetchImpl: fetch });
    console.log(JSON.stringify(r.summary));
    process.exit(r.exitCode);
  }
  const diffPath = readArg(argv, '--diff');
  if (!diffPath) { console.error('Usage: cross-model-review.mjs --diff <file|-> [--spec <file>] [--model <slug>] [--provider codex|openrouter]'); process.exit(EXIT.USAGE); }

  const root = readArg(argv, '--root') || process.cwd();
  const mdPath = join(root, '.great_cto', 'PROJECT.md');
  const projectMd = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : '';
  const decision = decideProvider({ argv, projectMd });
  const identity = gitIdentity(root);
  let review_input = null;
  const logPath = join(root, '.great_cto', 'cross-review.log');
  const log = (rec) => { try { mkdirSync(join(root, '.great_cto'), { recursive: true }); appendFileSync(logPath, reviewLogLine({ ...rec, source: decision.source, sha: identity.sha, dirty: identity.dirty, review_input }) + '\n'); } catch { /* the log is evidence, not a gate */ } };

  // Anything that is not a reviewer reviewing exits SKIPPED — not PASS, and not
  // the BLOCK code either. The line says why, and the log keeps it.
  if (decision.state !== 'declared') {
    console.log(`cross-model-review: SKIPPED (${decision.state}) — ${decision.why}`);
    log({ provider: decision.provider, state: decision.state, verdict: null, findings: null, cost: null });
    process.exit(EXIT.SKIPPED);
  }

  const diff = diffPath === '-' ? readFileSync(0, 'utf8') : readFileSync(diffPath, 'utf8');
  const specFile = readArg(argv, '--spec');
  const spec = specFile ? readFileSync(specFile, 'utf8') : null;
  review_input = reviewInputBinding({ diff, spec, sourceSha: identity.sha });
  // A truncated prefix is not a review of the full input. Never silently approve it.
  if (!diff.trim() || diff.length > 24000 || (spec !== null && spec.length > 4000)) {
    const error_kind = !diff.trim() ? 'empty-diff' : 'input-too-large';
    console.log(`cross-model-review: SKIPPED (${error_kind}) — complete review input required.`);
    log({ provider: decision.provider, state: 'unreadable', verdict: null, findings: null, cost: null, error_kind });
    process.exit(EXIT.SKIPPED);
  }
  const prompt = buildReviewPrompt({ diff, spec });

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
  const calculated = res.usage && priced ? costForUsage({ model: res.model, usage: res.usage }) : null;
  const cost = calculated === null ? null : round4(calculated);

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
