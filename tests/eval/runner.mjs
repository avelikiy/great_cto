// tests/eval/runner.mjs — Automated LLM-judge runner for EVAL-*.md scenario files.
//
// Two-agent pattern:
//   Actor  (claude-sonnet-4-5) — responds AS the agent under test. The actor's
//                                system prompt is the real body of agents/<X>.md
//                                (or a candidate --prompt-file), NOT a generic
//                                stand-in — otherwise baseline ≡ candidate and the
//                                whole learning loop measures sampling noise.
//   Judge  (claude-opus-4-5)   — evaluates the actor's response against criteria
//
// Provider (same fallback as the rest of great_cto): OPENROUTER_API_KEY (default
// path here) or ANTHROPIC_API_KEY (direct; wins if both set).
//
// Usage:
//   export OPENROUTER_API_KEY=sk-or-...               # or ANTHROPIC_API_KEY=sk-ant-...
//   node tests/eval/runner.mjs                       # run all EVAL files
//   node tests/eval/runner.mjs --agent security-officer --split holdout --samples 5
//   node tests/eval/runner.mjs --agent security-officer --prompt-file cand.md --out cand.jsonl
//   node tests/eval/runner.mjs --filter privacy      # only EVAL files matching "privacy"
//   node tests/eval/runner.mjs --dry-run             # parse only, no API calls
//   node tests/eval/runner.mjs --judge rubric        # force the 0-1 judge (see below)
//
// Judging: an eval is scored by tests/eval/dags/<slug>.dag.json when that file
// exists — closed questions, score computed from the path, same answers always
// giving the same score. Otherwise the original 0-1 rubric judge runs. `--judge
// rubric` forces the rubric everywhere, which is what an A/B against the graph
// needs. --judge-votes applies to the rubric judge only: voting a deterministic
// score is paying three times for one answer.
//
// Env overrides (model ids):
//   EVAL_ACTOR_MODEL / EVAL_JUDGE_MODEL  — override regardless of provider
//   OpenRouter defaults: anthropic/claude-sonnet-4 (override via GREAT_CTO_ROUTER_MODEL
//     / GREAT_CTO_JUDGE_MODEL); Anthropic defaults: claude-sonnet-4-5 / claude-opus-4-5
//
// Recommended flags for AGENT evals (`> Agent:`): --actor-tools --judge-votes 3
//   A/B (security-officer holdout, n=3): --actor-tools raised mean rate 0.50→0.64 and
//   got finding-gate to clear its 67% bar (50%→72%) — higher fidelity. It does NOT
//   reduce variance (±~0.09 either way — that's inherent LLM non-determinism; mitigate
//   with more --samples + the variance-aware eval-gate). Default off: the "diff under
//   review" fixture fits agent evals, less so archetype pack evals.
//
// Output:
//   tests/eval/results.jsonl          — latest run only (read by eval-gate)
//   tests/eval/results-history.jsonl  — APPEND-ONLY, every row stamped with
//                                       run_id + commit sha (never truncated)
// Exits 1 if any EVAL file's pass rate is below its threshold.

import { readdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { judgeWithDag, questionPrompt, validateDag, dagFingerprint } from '../../scripts/lib/dag-metric.mjs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { costForUsage, round4 } from '../../scripts/lib/cost-meter.mjs';
import { verdict as powerVerdict, dropout as dropoutOf } from '../../scripts/lib/eval-power.mjs';
import { classifyProviderError, exhaustionReport, admissibleToHistory } from '../../scripts/lib/provider-exhaustion.mjs';
import { parseAdherenceMarker, adherence, explainAdherence } from '../../scripts/lib/adherence.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVAL_DIR = __dirname;
const REPO_ROOT = join(__dirname, '..', '..');
const AGENTS_DIR = join(REPO_ROOT, 'agents');
const RESULTS_PATH = join(EVAL_DIR, 'results.jsonl');
const HISTORY_PATH = join(EVAL_DIR, 'results-history.jsonl');

// ── CLI args ────────────────────────────────────────────────────────────────

export function parseArgs(argv = process.argv.slice(2)) {
  let sample = 0;
  let dryRun = false;
  let split = 'all'; // all | tuning | holdout
  let agent = null;       // restrict to EVALs for this agent + bind actor to it
  let filter = null;      // restrict to EVAL filenames containing this substring
  let promptFile = null;  // candidate prompt: override the actor system for ALL evals
  let samples = 1;        // run each EVAL file N times → rate mean + stddev
  let out = null;         // override results.jsonl output path (baseline vs candidate)
  let judgeVotes = 1;
  let judgeMode = 'auto';     // 'auto' = use the eval's DAG when it has one; 'rubric' = the 0-1 judge
  // null = decide per eval. An agent-bound eval gets tools; a pack or component
  // eval does not, because the "diff under review" fixture does not fit it.
  let actorTools = null; // ReAct inspect-then-conclude actor loop (vs one-shot)
  let actorTurns = 4;     // max INSPECT turns before forcing FINAL
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sample' && argv[i + 1]) {
      sample = parseInt(argv[++i], 10);
      if (isNaN(sample) || sample < 0) sample = 0;
    } else if (argv[i] === '--dry-run') {
      dryRun = true;
    } else if (argv[i] === '--split' && argv[i + 1]) {
      const v = argv[++i].toLowerCase();
      if (['all', 'tuning', 'holdout'].includes(v)) split = v;
    } else if (argv[i] === '--actor-max-tokens' && argv[i + 1]) {
      // The actor's budget is part of the measurement, not a detail. An agent
      // prompt whose opening ceremony is longer than the budget produces a
      // response that is all setup and no answer — and the judge correctly fails
      // it for not answering, which measures the budget rather than the agent.
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n > 0) ACTOR_MAX_TOKENS = n;
    } else if (argv[i] === '--agent' && argv[i + 1]) {
      agent = argv[++i];
    } else if (argv[i] === '--filter' && argv[i + 1]) {
      filter = argv[++i];
    } else if (argv[i] === '--prompt-file' && argv[i + 1]) {
      promptFile = argv[++i];
    } else if (argv[i] === '--samples' && argv[i + 1]) {
      samples = parseInt(argv[++i], 10);
      if (isNaN(samples) || samples < 1) samples = 1;
    } else if (argv[i] === '--out' && argv[i + 1]) {
      out = argv[++i];
    } else if (argv[i] === '--judge-votes' && argv[i + 1]) {
      judgeVotes = parseInt(argv[++i], 10);
      if (isNaN(judgeVotes) || judgeVotes < 1) judgeVotes = 1;
    } else if (argv[i] === '--judge' && argv[i + 1]) {
      // 'auto' (default) scores with the eval's DAG when one exists; 'rubric'
      // forces the original 0-1 judge, which is the other half of an A/B.
      judgeMode = argv[++i] === 'rubric' ? 'rubric' : 'auto';
    } else if (argv[i] === '--no-actor-tools') {
      actorTools = false;
    } else if (argv[i] === '--actor-tools') {
      actorTools = true;
    } else if (argv[i] === '--actor-turns' && argv[i + 1]) {
      actorTurns = parseInt(argv[++i], 10);
      if (isNaN(actorTurns) || actorTurns < 1) actorTurns = 4;
    }
  }
  return { sample, dryRun, split, agent, filter, promptFile, samples, out, judgeVotes, judgeMode, actorTools, actorTurns };
}

/** Selects the case list for a parsed EVAL file given a split filter. */
export function selectCases(parsed, split = 'all') {
  if (split === 'tuning') return parsed.tuningCases ?? [];
  if (split === 'holdout') return parsed.holdoutCases ?? [];
  return parsed.cases ?? [];
}

// ── EVAL file parser ─────────────────────────────────────────────────────────

/**
 * Splits markdown into `## `-delimited sections. Robust against a missing
 * trailing heading (unlike the `\Z`-based lookahead used elsewhere).
 * Returns [{ heading, body }]. Content before the first `## ` is ignored.
 */
export function splitSections(content) {
  const sections = [];
  let cur = null;
  for (const line of String(content).split('\n')) {
    const m = line.match(/^##\s+(.*\S)\s*$/);
    if (m) {
      if (cur) sections.push(cur);
      cur = { heading: m[1].trim(), body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  if (cur) sections.push(cur);
  return sections.map(s => ({ heading: s.heading, body: s.body.join('\n') }));
}

/**
 * Parses a markdown table body into case objects, skipping the column-header
 * and separator rows. Columns: (#, Test/Input, Expected, Pass).
 */
export function parseCasesTable(tableText) {
  const out = [];
  const rows = tableText.split('\n').filter(l => l.trim().startsWith('|'));
  const dataRows = rows.filter(l => !l.match(/\|\s*[-:]+\s*\|/));
  let headerParsed = false;
  for (const row of dataRows) {
    if (!headerParsed) {
      headerParsed = true;
      continue; // skip column header row
    }
    const cols = row.split('|').map(s => s.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    if (cols.length >= 3) {
      out.push({
        num: cols[0],
        test: cols[1] || '',
        expected: cols[2] || '',
        pass: cols[3] || '',
      });
    }
  }
  return out;
}

/**
 * Parses a single EVAL-*.md file into a structured object.
 * Never throws — returns null on malformed input.
 *
 * Header line is one of:
 *   > Agent: <agent-name> · Reviewer: ...   → binds the actor to agents/<name>.md
 *   > Pack:  <pack-name>  · Reviewer: ...    → archetype pack eval (no single agent)
 */
export function parseEvalFile(content, filename) {
  try {
    // Agent binding — "> Agent: X · ..." (10+ EVALs use this; runner previously ignored it)
    //
    // A pack eval declares `> Pack: voice-pack · Reviewer: voice-ai-reviewer`, and
    // that reviewer IS an agent — agents/voice-ai-reviewer.md exists for all
    // twelve of them. Reading only `> Agent:` meant those evals ran against a
    // generic stub, so they measured whether the SCENARIO was answerable rather
    // than whether our prompt answers it. That is why they passed at 92% while
    // the agent-bound evals failed at 55%: the difference was never agent quality.
    //
    // `Agent:` still wins when both are present — an explicit binding beats an
    // inferred one.
    // `> Actor: generic` opts out. Inferring the reviewer is right when the cases
    // ask for a REVIEW judgement, and wrong when they ask the actor to BE the
    // system under review — the four voice evals demand a live
    // `transfer_to_human("medical-emergency")` tool call, which a
    // pre-implementation reviewer that writes threat models will never produce.
    // The eval knows which kind it is; the runner cannot infer it.
    const actorMatch = content.match(/^>[^\n]*\bActor:\s*([a-z0-9-]+)/m);
    const explicitGeneric = actorMatch && actorMatch[1].trim().toLowerCase() === 'generic';

    const agentMatch = content.match(/^>\s*Agent:\s*([^·\n]+)/m);
    const reviewerMatch = content.match(/^>[^\n]*\bReviewer:\s*([a-z0-9-]+)/m);
    const agent = explicitGeneric ? null
                : agentMatch ? agentMatch[1].trim()
                : reviewerMatch ? reviewerMatch[1].trim()
                : null;

    // Pack name — "> Pack: X · ..." line
    const packMatch = content.match(/^>\s*Pack:\s*([^·\n]+)/m);
    const pack = packMatch ? packMatch[1].trim() : 'unknown';

    // "> Component: scripts/lib/x" — this eval tests a deterministic library, not
    // an agent, and the generic actor is correct for it. Recording it means an
    // unbound eval can be told apart from one that is deliberately unbound.
    const componentMatch = content.match(/^>\s*Component:\s*([^·\n]+)/m);
    const component = componentMatch ? componentMatch[1].trim() : null;

    // Section-based extraction via splitSections — robust to the threshold/scenario
    // being the LAST section (the `\Z`-anchored regex previously used here is not a
    // valid JS anchor and silently returned empty when no `##` followed).
    const sections = splitSections(content);
    const findSection = (re) => {
      const s = sections.find(x => re.test(x.heading));
      return s ? s.body.trim() : '';
    };

    const scenario = findSection(/^scenario$/i);

    // Cases tables — scan ALL case-bearing sections and assign each a split.
    //   ## Cases / ## Cases (≥ N per release) / ## Cases (tuning)  → split "tuning" (visible to prompt author)
    //   ## Holdout / ## Holdout cases / ## Cases (holdout)         → split "holdout" (gate-only, prevents overfit)
    // SIA discipline: data/public (tuning) vs data/private (holdout). A prompt revision
    // may only ship if it does NOT regress on the holdout split.
    const cases = [];
    for (const section of sections) {
      const h = section.heading.toLowerCase();
      const isHoldout = /^holdout\b/.test(h) || /\bholdout\b/.test(h);
      const isCases = /^cases\b/.test(h) || isHoldout;
      if (!isCases) continue;
      const split = isHoldout ? 'holdout' : 'tuning';
      for (const c of parseCasesTable(section.body)) {
        cases.push({ ...c, split });
      }
    }
    const tuningCases = cases.filter(c => c.split === 'tuning');
    const holdoutCases = cases.filter(c => c.split === 'holdout');

    // Pass threshold — ## Pass threshold section (robust even when it is the last section)
    const thresholdRaw = findSection(/^pass threshold$/i);
    const threshold = parseThreshold(thresholdRaw);

    return { agent, component, pack, scenario, cases, tuningCases, holdoutCases, thresholdRaw, threshold, adherenceMarker: parseAdherenceMarker(content) };
  } catch (err) {
    console.warn(`[WARN] Failed to parse ${filename}: ${err.message}`);
    return null;
  }
}

/**
 * Parses threshold strings to a numeric ratio [0..1].
 * "5/5" → 1.0, "3/5" → 0.6, "≥ 95%" → 0.95, "100%" → 1.0
 * Returns null if not parseable as a simple numeric threshold.
 */
export function parseThreshold(raw) {
  if (!raw) return null;
  const text = raw.replace(/\.$/, '').trim();

  // Fraction: "5/5", "3/5"
  const fracMatch = text.match(/^(\d+)\s*\/\s*(\d+)/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    if (den > 0) return num / den;
  }

  // Percentage with optional ≥: "≥ 95%", "100%", "> 90%"
  const pctMatch = text.match(/[≥>]?\s*(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) return parseFloat(pctMatch[1]) / 100;

  // Text-based thresholds that can't be reduced to a number
  return null;
}

/**
 * Resolve the threshold for the split being run. Dual-threshold strings like
 * "5/5 tuning · 2/3 holdout" carry a per-split bar — running --split holdout must
 * use 2/3, not the leading 5/5. Falls back to the single parseThreshold otherwise.
 */
export function thresholdForSplit(raw, split) {
  if (!raw) return null;
  if (split === 'holdout' || split === 'tuning') {
    const m = raw.match(new RegExp('([0-9]+\\s*/\\s*[0-9]+|[≥>]?\\s*[0-9.]+\\s*%)\\s*' + split, 'i'));
    if (m) return parseThreshold(m[1]);
  }
  return parseThreshold(raw);
}

/**
 * Both bars of a dual threshold, or null when the string carries only one.
 *
 * "5/5 tuning · 2/3 holdout" is two gates, and a run of everything has to clear
 * both. Reducing it to one number takes the leading bar — so a `--split all` run
 * was judging the whole set against the TUNING bar. devops cleared 5/5 tuning
 * and 16/20 holdout against its own 2/3, and still printed
 * `FAIL: 84% < 5/5 tuning · 2/3 holdout`: 84% is below 100%, and 100% was never
 * the bar for the holdout cases. A red that the eval's own thresholds do not
 * support teaches people to ignore the red.
 */
/**
 * The bar as applied, for the failure line.
 *
 * At `--split holdout` the runner correctly uses 2/3 and then printed
 * `63% < 5/5 tuning · 2/3 holdout` — the whole dual string, including a bar that
 * was never applied to these cases. A reader checks 63% against the first number
 * they see. Print what was used.
 */
export function appliedThresholdLabel(raw, split) {
  if (!raw) return null;
  if (split === 'tuning' || split === 'holdout') {
    const m = raw.match(new RegExp('([0-9]+\\s*/\\s*[0-9]+|[≥>]?\\s*[0-9.]+\\s*%)\\s*' + split, 'i'));
    if (m) return m[0].trim();
  }
  return raw;
}

export function dualThreshold(raw) {
  const tuning = thresholdForSplit(raw, 'tuning');
  const holdout = thresholdForSplit(raw, 'holdout');
  if (tuning === null || holdout === null) return null;
  // Both matched the named-bar pattern only if the string actually names them;
  // otherwise thresholdForSplit fell through to the same single number twice.
  if (!/tuning/i.test(raw) || !/holdout/i.test(raw)) return null;
  return { tuning, holdout };
}

/**
 * Per-split outcome for a whole-set run: {split: {passed, judged, rate, threshold, below}}.
 * `holdoutNums` is the set of case numbers belonging to the holdout split — the
 * classification lives in the parsed EVAL, not in a naming convention.
 */
export function splitOutcomes(bars, caseResults, holdoutNums) {
  const of = (want) => {
    const rows = (caseResults ?? []).filter(
      (c) => (holdoutNums.has(String(c.num)) ? 'holdout' : 'tuning') === want && c.verdict !== 'SKIP',
    );
    const passed = rows.filter((c) => c.verdict === 'PASS').length;
    const threshold = bars[want];
    // No case of a split ran — say nothing about it rather than failing it on an
    // empty sample, the same reason a run with no cases reports NOT RUN.
    const rate = rows.length ? passed / rows.length : null;
    return { passed, judged: rows.length, rate, threshold, below: rate !== null && rate < threshold };
  };
  return { tuning: of('tuning'), holdout: of('holdout') };
}

// ── Actor prompt resolution ───────────────────────────────────────────────────

const GENERIC_ACTOR_SYSTEM =
  'You are a great_cto specialist agent enforcing domain-specific safety and compliance rules. ' +
  'great_cto helps engineering teams with clinical, financial, robotics, security, and other regulated domains. ' +
  'Given a scenario and a specific test case, respond exactly as a well-implemented great_cto agent should. ' +
  'Be concise and precise — your response will be evaluated by a judge.';

/** Strip a leading YAML frontmatter block, if present. */
function stripFrontmatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
}

/**
 * Expand `agents/_shared/*.md` references into the prompt body.
 *
 * An agent file points at shared contracts — verdict format, phase task,
 * privacy guardrails, handoff format — and in production the agent has Read and
 * opens them. The eval actor has no filesystem: `buildFixture` answers every
 * INSPECT with the scenario text, so a pointer resolves to nothing.
 *
 * The cost of that was measured. A catalogue of deploy failure modes was added
 * behind a pointer and appeared in 1 of 40 answers — not because the pointer was
 * weak, but because the file was never reachable. Forty of sixty-nine agents
 * carry at least one such pointer, so every run of those judged an agent without
 * the half of its contract that lives in `_shared`.
 *
 * Inlining is an approximation, and it is the generous one: it measures the
 * agent given the material, not the agent choosing to fetch it. A harness with
 * no filesystem cannot measure the second, and reporting the generous number as
 * if it were the strict one is the mistake this comment exists to prevent.
 * Runs record `sharedExpanded` so a result carries which it was.
 */
export function expandSharedRefs(body, { root = AGENTS_DIR, seen = new Set() } = {}) {
  if (!body) return { text: body, expanded: [] };
  const expanded = [];
  const text = body.replace(/`?agents\/_shared\/([a-z0-9-]+\.md)`?/gi, (match, file) => {
    if (seen.has(file)) return match;   // a pointer back to something already inlined
    let content;
    try {
      content = stripFrontmatter(readFileSync(join(root, '_shared', file), 'utf8'));
    } catch {
      return match;   // a pointer at a file that does not exist stays a pointer
    }
    seen.add(file);
    expanded.push(file);
    // Nested: a shared file may point at another. Same `seen` set bounds the walk.
    const inner = expandSharedRefs(content, { root, seen });
    expanded.push(...inner.expanded);
    return `${match}\n\n<<< BEGIN agents/_shared/${file} >>>\n${inner.text}\n<<< END agents/_shared/${file} >>>`;
  });
  return { text, expanded };
}

/** Load an agent's prompt body from agents/<name>.md. Returns null if absent. */
export function loadAgentPrompt(agentName) {
  if (!agentName) return null;
  try {
    return stripFrontmatter(readFileSync(join(AGENTS_DIR, `${agentName}.md`), 'utf8'));
  } catch {
    return null;
  }
}

/** Load a candidate prompt from an arbitrary file path. */
export function loadPromptFile(promptFile) {
  if (!promptFile) return null;
  try {
    return stripFrontmatter(readFileSync(promptFile, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Resolve the actor system prompt for an eval run.
 * Priority: explicit candidate --prompt-file > the eval's bound agent body > generic.
 * Returns { system, source } where source is 'prompt-file' | 'agent:<name>' | 'generic'.
 */
export function resolveActorSystem({ promptFileBody, agentName }) {
  // A candidate prompt file is expanded too: an A/B between two prompts has to
  // give both sides the same shared contracts, or it measures the expansion.
  if (promptFileBody) {
    const { text, expanded } = expandSharedRefs(promptFileBody);
    return { system: text, source: 'prompt-file', sharedExpanded: expanded };
  }
  if (agentName) {
    const body = loadAgentPrompt(agentName);
    if (body) {
      const { text, expanded } = expandSharedRefs(body);
      return { system: text, source: `agent:${agentName}`, sharedExpanded: expanded };
    }
  }
  return { system: GENERIC_ACTOR_SYSTEM, source: 'generic', sharedExpanded: [] };
}

// ── Anthropic API caller (two-agent: Actor → Judge) ──────────────────────────

// Provider-agnostic: try Anthropic-direct (ANTHROPIC_API_KEY) first, else OpenRouter
// (OPENROUTER_API_KEY) — the same fallback the rest of great_cto uses
// (scripts/generate-summary.mjs, scripts/memory-filter.mjs). Models are picked per
// role + provider and overridable by env.
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';

const DEFAULT_ACTOR_MODEL_ANTHROPIC = 'claude-sonnet-4-5';
const DEFAULT_JUDGE_MODEL_ANTHROPIC = 'claude-opus-4-5';
const DEFAULT_ACTOR_MODEL_OPENROUTER = 'anthropic/claude-sonnet-4';
const DEFAULT_JUDGE_MODEL_OPENROUTER = 'anthropic/claude-sonnet-4';

/** Which provider to use, based on which key is present (Anthropic wins if both). */
export function pickProvider(env = process.env) {
  if (env.ANTHROPIC_API_KEY) return { provider: 'anthropic', apiKey: env.ANTHROPIC_API_KEY };
  if (env.OPENROUTER_API_KEY) return { provider: 'openrouter', apiKey: env.OPENROUTER_API_KEY };
  return { provider: null, apiKey: null };
}

/** Resolve the model for a role ('actor'|'judge') given the active provider + env overrides. */
export function modelFor(role, env = process.env) {
  const { provider } = pickProvider(env);
  if (role === 'actor') {
    if (env.EVAL_ACTOR_MODEL) return env.EVAL_ACTOR_MODEL;
    return provider === 'openrouter'
      ? (env.GREAT_CTO_ROUTER_MODEL || DEFAULT_ACTOR_MODEL_OPENROUTER)
      : DEFAULT_ACTOR_MODEL_ANTHROPIC;
  }
  if (env.EVAL_JUDGE_MODEL) return env.EVAL_JUDGE_MODEL;
  return provider === 'openrouter'
    ? (env.GREAT_CTO_JUDGE_MODEL || env.GREAT_CTO_ROUTER_MODEL || DEFAULT_JUDGE_MODEL_OPENROUTER)
    : DEFAULT_JUDGE_MODEL_ANTHROPIC;
}

/**
 * Minimum system-prompt size worth a cache breakpoint.
 *
 * Anthropic will not cache a prefix under 1024 tokens for Sonnet, and a write
 * costs 1.25x a plain read — so caching something small and rarely reused is a
 * surcharge, not a saving. ~4000 characters is comfortably over that line.
 */
export const CACHE_MIN_CHARS = 4000;

/**
 * Mark the system prompt as a cacheable prefix.
 *
 * The actor's system prompt is one agent file with its `_shared` contracts
 * inlined — 58k characters for devops, identical for every case in a run and
 * re-sent on every ReAct turn within a case. That prefix was ~97% of the bill:
 * the judge, which people reach for first when a run costs too much, is 3%.
 *
 * A cache read bills at a tenth of fresh input, so a run of forty cases pays the
 * prefix once instead of forty times. Nothing about the measurement changes —
 * same tokens, same model, same temperature; only the price of re-sending an
 * identical prefix does.
 *
 * The TTL is five minutes from last use, which a run keeps alive case to case.
 * A second `--samples` pass usually still lands inside it; if it does not, the
 * only cost is one more write.
 */
export function cacheableSystem(system, provider) {
  const text = String(system ?? '');
  if (text.length < CACHE_MIN_CHARS) return null;   // caller sends it plainly
  const block = { type: 'text', text, cache_control: { type: 'ephemeral' } };
  // Anthropic takes a system block array; OpenRouter's OpenAI-compatible shape
  // carries the same marker inside a structured message content part.
  return provider === 'anthropic' ? [block] : [{ role: 'system', content: [block] }];
}

/** Cache counters, normalized across providers, folded into the usage record. */
export function normalizeCacheUsage(usage, raw) {
  if (!usage) return usage;
  const read = raw?.cache_read_input_tokens
    ?? raw?.prompt_tokens_details?.cached_tokens
    ?? 0;
  const write = raw?.cache_creation_input_tokens
    ?? raw?.prompt_tokens_details?.cache_creation_tokens
    ?? 0;
  // OpenAI-style `prompt_tokens` INCLUDES the cached ones; Anthropic's
  // `input_tokens` excludes them. Double-counting a cached prefix as fresh input
  // reports a saving that did not happen.
  const fresh = raw?.prompt_tokens !== undefined
    ? Math.max(0, (usage.input_tokens || 0) - read - write)
    : (usage.input_tokens || 0);
  return { ...usage, input_tokens: fresh, cache_read_input_tokens: read, cache_creation_input_tokens: write };
}

/**
 * One provider-agnostic completion. Returns a normalized
 * { text, usage:{input_tokens,output_tokens}, stopReason, model } (usage keys
 * are normalized so cost-meter works for both providers). Throws on non-2xx.
 */
async function callLlm({ model, system, user, maxTokens = 300 }) {
  const { provider, apiKey } = pickProvider();
  if (!provider) throw new Error('No ANTHROPIC_API_KEY or OPENROUTER_API_KEY set.');

  if (provider === 'anthropic') {
    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: maxTokens,
        system: cacheableSystem(system, 'anthropic') ?? system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!response.ok) throw new Error(`Anthropic API ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const data = await response.json();
    return {
      text: data.content?.[0]?.text?.trim() || '',
      usage: normalizeCacheUsage(data.usage || null, data.usage),
      stopReason: data.stop_reason || null, model,
    };
  }

  // OpenRouter — OpenAI-compatible chat/completions; system folded into messages.
  const response = await fetch(OPENROUTER_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://greatcto.systems',
      'X-Title': 'great_cto-evals',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature: 0,
      messages: [
        ...(cacheableSystem(system, 'openrouter') ?? [{ role: 'system', content: system }]),
        { role: 'user', content: user },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter API ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = await response.json();
  const u = data.usage || null;
  return {
    text: data.choices?.[0]?.message?.content?.trim() || '',
    // normalize OpenAI-style usage keys → Anthropic-style for cost-meter
    usage: u ? normalizeCacheUsage({ input_tokens: u.prompt_tokens ?? 0, output_tokens: u.completion_tokens ?? 0 }, u) : null,
    stopReason: data.choices?.[0]?.finish_reason || null,
    model,
  };
}

// ── Actor fidelity (DEEPEN a9tp, actor side) ──────────────────────────────────
//
// The one-shot actor is a weak proxy for the real agent (which inspects before
// concluding) — the dominant ±35% variance is actor-side. `--actor-tools` runs a
// provider-agnostic ReAct text loop: the actor may emit `INSPECT: <q>` to look at
// the code/diff under review (resolved deterministically by buildFixture — no extra
// LLM noise) before emitting `FINAL: <response>`. Investigate→conclude is closer to
// the real agent and the deterministic fixture removes a noise source. Opt-in
// (default off) until a live A/B confirms it lowers stddev. llmFn is injectable so
// the loop is unit-tested with no network.

const ACTOR_TOOLS_INSTRUCTION = (n) =>
  `\n\n--- inspection protocol ---\n` +
  `Before concluding you may inspect the code/diff under review. To inspect, reply with EXACTLY one line:\n` +
  `INSPECT: <what you want to look at>\n` +
  `You will receive the result and may inspect again (at most ${n} times). When ready, reply:\n` +
  `FINAL: <your complete agent response>\n` +
  `Prefer to inspect at least once before concluding.`;

/** Parse one ReAct step. FINAL wins; INSPECT next; no marker → treat text as FINAL. */
export function parseActorStep(text) {
  const t = String(text).trim();
  const fin = t.match(/^\s*FINAL:\s*([\s\S]*)$/im);
  if (fin) return { kind: 'final', payload: fin[1].trim() };
  const ins = t.match(/^\s*INSPECT:\s*(.+)$/im);
  if (ins) return { kind: 'inspect', payload: ins[1].trim() };
  return { kind: 'final', payload: t };
}

/** Deterministic tool resolver: the eval's scenario+test IS the artifact under review. */
export function buildFixture({ scenario, test, query }) {
  return `Inspection "${query}":\n--- code / diff under review ---\n` +
    `Scenario: ${scenario}\nCase: ${test}\n--- end ---\n` +
    `(This is the complete material under review; base your verdict only on it.)`;
}

/** Sum two usage objects (Anthropic-normalized). */
function addUsage(a, b) {
  return {
    input_tokens: (a?.input_tokens || 0) + (b?.input_tokens || 0),
    output_tokens: (a?.output_tokens || 0) + (b?.output_tokens || 0),
  };
}

/**
 * ReAct actor loop. `llmFn({system,user}) → {text, usage, model}` is injectable.
 * Returns the same {text, usage, model} shape as a one-shot call.
 */
export async function runActorLoop({ system, scenario, test, llmFn, maxTurns = 4 }) {
  const fullSystem = (system || GENERIC_ACTOR_SYSTEM) + ACTOR_TOOLS_INSTRUCTION(maxTurns);
  let transcript = `Scenario: ${scenario}\n\nTest case: ${test}\n\nInspect if useful, then reply FINAL: <response>.`;
  let usage = { input_tokens: 0, output_tokens: 0 };
  let model = null;
  for (let turn = 0; turn < maxTurns; turn++) {
    const res = await llmFn({ system: fullSystem, user: transcript });
    usage = addUsage(usage, res.usage); model = res.model;
    const step = parseActorStep(res.text);
    if (step.kind === 'final') return { text: step.payload, usage, model };
    const obs = buildFixture({ scenario, test, query: step.payload });
    transcript += `\n\nINSPECT: ${step.payload}\n${obs}\n\nContinue (INSPECT: ... or FINAL: ...).`;
  }
  // Turn cap reached → force a final answer.
  const res = await llmFn({ system: fullSystem, user: transcript + `\n\nInspection limit reached. Reply FINAL: now.` });
  usage = addUsage(usage, res.usage); model = res.model;
  return { text: parseActorStep(res.text).payload, usage, model };
}

// The actor's token budget — part of the measurement, not a detail.
//
// This was 600, chosen when the actor was a generic stub. Once the actor became
// the REAL agent body, 600 stopped measuring the agent: architect, senior-dev,
// l3-support and project-auditor all open with phase tracking, environment
// setup, past-lesson lookup and discovery gates, and a faithful actor spends the
// whole budget doing exactly that. The judge then fails the response for never
// answering — which is true, and which measures the cap rather than the agent.
//
// The evidence is the same eval at two budgets. At 600 every reason read "only
// shows setup commands without completing". At 2500 they read "classified this
// as MEDIUM instead of recognizing the EU compliance signal" — a real judgement
// about the agent's behaviour. Same prompt, same cases; one number was about the
// runner and the other is about the agent.
//
// A cap is not a spend: raising it costs nothing unless the model uses it. The
// old value was quietly buying cheaper runs by truncating the thing under test.
let ACTOR_MAX_TOKENS = 2500;

/**
 * Step 1 — Actor: responds AS the agent under test.
 * `actorSystem` is the real agent body (or candidate prompt). One-shot by default;
 * with useTools, runs the ReAct inspection loop. Returns the raw call result.
 */
async function callActor({ actorModel, scenario, test, actorSystem, useTools = false, actorTurns = 4 }) {
  if (useTools) {
    const llmFn = ({ system, user }) => callLlm({ model: actorModel, system, user, maxTokens: ACTOR_MAX_TOKENS });
    return runActorLoop({ system: actorSystem, scenario, test, llmFn, maxTurns: actorTurns });
  }
  const user = `Scenario: ${scenario}\n\nTest case: ${test}\n\nProvide your agent response:`;
  return callLlm({ model: actorModel, system: actorSystem || GENERIC_ACTOR_SYSTEM, user, maxTokens: ACTOR_MAX_TOKENS });
}

/**
 * How much of the judge's reasoning is kept.
 *
 * It was 120 characters, and the judge is asked for "a one-sentence reason" with
 * 220 tokens to write it — so the budget was raised to stop the MODEL running
 * out mid-sentence, and the string was still cut at 120 by the code. Stored
 * reasons end like "...while requiring proper", severed exactly where the
 * judgement stops being generic and starts naming what went wrong.
 *
 * That truncated half-sentence is the only record of WHY a case failed. The
 * actor's full response is already stored beside it at ~2900 characters, so
 * keeping the explanation costs a rounding error against the thing it explains,
 * and it is the input any grounded prompt revision has to start from.
 */
export const JUDGE_REASON_CHARS = 400;

/**
 * Step 2 — Judge: evaluates whether the actor's response meets the expected criteria.
 * 220 tokens: a one-line verdict + a full-sentence reason was being truncated at 120.
 * `judgeModel` optional — defaults to the provider-appropriate judge model.
 */
export async function callJudge({ judgeModel, scenario, test, expected, passCriterion, actorResponse }) {
  const system =
    'You are an eval judge for great_cto, an AI-native engineering system. ' +
    'You receive a scenario, a test case, the expected behaviour, an explicit PASS criterion, ' +
    'and the actual agent response. Grade STRICTLY against the PASS criterion when one is given — ' +
    'it is the crisp, gradeable bar; the expected behaviour is supporting context. ' +
    'Judge only what the response demonstrates; do not reward intentions it does not show, ' +
    'and do not penalise correct behaviour for stylistic reasons. ' +
    'Respond with EXACTLY one line: PASS or FAIL followed by a dash and a one-sentence reason. ' +
    'Example: PASS - The agent correctly refuses to invent drug dosages without hedging.';

  const user =
    `Scenario: ${scenario}\n\n` +
    `Test case: ${test}\n\n` +
    `Expected behaviour: ${expected}\n\n` +
    (passCriterion ? `PASS criterion (grade against THIS): ${passCriterion}\n\n` : '') +
    `Agent response: ${actorResponse}\n\n` +
    `Verdict (PASS or FAIL - reason):`;

  return callLlm({ model: judgeModel || modelFor('judge'), system, user, maxTokens: 220 });
}

/** Majority verdict over an odd number of judge replies. UNKNOWN only if no PASS/FAIL at all. */
export function majorityVerdict(verdicts) {
  const pass = verdicts.filter(v => v === 'PASS').length;
  const fail = verdicts.filter(v => v === 'FAIL').length;
  if (pass === 0 && fail === 0) return 'UNKNOWN';
  return pass >= fail ? 'PASS' : 'FAIL';
}

/**
 * Run the judge `votes` times and take the majority — cuts the judge non-determinism
 * that produced ±35% rate swings. Returns { verdict, reason, costUsd, raw }.
 */
async function judgeVote(args, votes = 1) {
  const replies = [];
  let costUsd = 0;
  for (let i = 0; i < votes; i++) {
    const j = await callJudge(args);
    costUsd += costForUsage({ model: j.model, usage: j.usage });
    replies.push({ verdict: parseJudgeVerdict(j.text), text: j.text });
  }
  const verdict = majorityVerdict(replies.map(r => r.verdict));
  const reason = (replies.find(r => r.verdict === verdict) || replies[0]).text
    .replace(/^(PASS|FAIL)\s*[-–]\s*/i, '').slice(0, JUDGE_REASON_CHARS);
  return { verdict, reason, costUsd };
}

export function parseJudgeVerdict(reply) {
  const upper = reply.toUpperCase();
  if (upper.startsWith('PASS')) return 'PASS';
  if (upper.startsWith('FAIL')) return 'FAIL';
  if (upper.includes('PASS')) return 'PASS';
  if (upper.includes('FAIL')) return 'FAIL';
  return 'UNKNOWN';
}

/**
 * A DAG for this eval, or null. Opt-in by existence: drop
 * tests/eval/dags/<slug>.dag.json next to the EVAL and this eval starts being
 * scored by the graph. A graph that does not validate is ignored with a warning
 * rather than silently scoring everything zero.
 */
export function loadDagFor(evalName, dir) {
  // The runner passes the FILE name ('EVAL-x.md'); earlier code and the first
  // test both assumed the bare eval name. Stripping only the prefix made every
  // lookup miss, so the graph was never selected and an A/B silently compared
  // the rubric judge against itself.
  const slug = String(evalName).replace(/^EVAL-/, '').replace(/\.md$/, '');
  const path = join(dir || join(EVAL_DIR, 'dags'), `${slug}.dag.json`);
  if (!existsSync(path)) return null;
  try {
    const dag = JSON.parse(readFileSync(path, 'utf8'));
    const { errors } = validateDag(dag);
    if (errors.length) { console.warn(`    [WARN] ${slug}.dag.json ignored: ${errors[0]}`); return null; }
    return dag;
  } catch (e) {
    console.warn(`    [WARN] ${slug}.dag.json unreadable: ${e.message.slice(0, 60)}`);
    return null;
  }
}

/**
 * Judge one case by walking the graph, asking one closed question at a time.
 *
 * The verdict still has to be PASS or FAIL for the rate arithmetic upstream, so
 * the graph's score is compared against `passAt` (default 1 — a case passes only
 * on a full-credit leaf). The score itself is carried through so an A/B against
 * the rubric judge has something finer than a boolean to compare.
 */
async function dagJudgeCase({ dag, judgeModel, scenario, test, expected, passCriterion, actorResponse }) {
  let costUsd = 0;
  const ask = async (question, allowed) => {
    const { system, user } = questionPrompt(question, allowed,
      { scenario, test, expected: passCriterion || expected, actorResponse });
    const r = await callLlm({ model: judgeModel || modelFor('judge'), system, user, maxTokens: 8 });
    costUsd += costForUsage({ model: r.model, usage: r.usage });
    return r.text;
  };

  const r = await judgeWithDag(dag, ask);
  if (r.score === null) {
    return { verdict: 'UNKNOWN', reason: (r.error || 'graph did not reach a leaf').slice(0, 120), score: null, costUsd, dagPath: r.path || [] };
  }
  const passAt = typeof dag.passAt === 'number' ? dag.passAt : 1;
  return {
    verdict: r.score >= passAt ? 'PASS' : 'FAIL',
    reason: `${r.score} — ${r.reason || r.leaf}`.slice(0, 120),
    score: r.score, costUsd, dagPath: r.path,
  };
}

/** Sample standard deviation of an array of numbers (0 if < 2 elements). */
export function stddev(arr) {
  if (!arr || arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/**
 * The actor's answer as stored on a case result.
 *
 * Kept whole when it fits. When it does not, the head and the tail are both
 * kept: a judge's complaint is usually either about the opening disposition
 * (refused / asked / proceeded) or about what the closing summary failed to
 * name, and a head-only clip loses the second one every time.
 */
export const ANSWER_LIMIT = 6000;
export function truncateAnswer(text, limit = ANSWER_LIMIT) {
  const s = String(text ?? '');
  if (s.length <= limit) return s;
  const head = Math.floor(limit * 0.6);
  const tail = limit - head;
  return `${s.slice(0, head)}\n\n…[${s.length - limit} chars elided]…\n\n${s.slice(-tail)}`;
}

// ── Runner core ──────────────────────────────────────────────────────────────

/** Run a single EVAL file ONCE. Returns the per-run result (with cost). */
export async function runEvalFileOnce({ parsed, evalName, actorModel, judgeModel, actorSystem, split, judgeVotes = 1, useTools = false, actorTurns = 4, judgeMode = 'auto' }) {
  const selectedCases = selectCases(parsed, split);
  // 'auto' uses the graph when one exists for this eval; 'rubric' keeps the
  // original 0-1 judge, which is what an A/B needs on the other side.
  const dag = judgeMode === 'rubric' ? null : loadDagFor(evalName);
  if (dag) console.log(`    judge: DAG (${Object.keys(dag.nodes).length} questions)`);
  let passed = 0;
  let skipped = 0;
  let costUsd = 0;
  let terminalFailure = null;
  const caseResults = [];

  for (const c of selectedCases) {
    if (!c.test || !c.expected) {
      skipped++;
      caseResults.push({ num: c.num, verdict: 'SKIP', reason: 'empty test or expected' });
      continue;
    }

    try {
      const actor = await callActor({ actorModel, scenario: parsed.scenario, test: c.test, actorSystem, useTools, actorTurns });
      costUsd += costForUsage({ model: actor.model, usage: actor.usage });

      const judgeArgs = {
        judgeModel,
        scenario: parsed.scenario, test: c.test, expected: c.expected,
        passCriterion: c.pass, actorResponse: actor.text,
      };
      // The graph asks closed questions and computes; the rubric judge votes on a
      // free-form verdict. Votes are wasted on the graph — the same answers always
      // give the same score, so the only variance left is in the answers themselves.
      const judge = dag
        ? await dagJudgeCase({ dag, ...judgeArgs })
        : await judgeVote(judgeArgs, judgeVotes);
      costUsd += judge.costUsd;

      const verdict = judge.verdict;
      if (verdict === 'PASS') passed++;
      else if (verdict === 'UNKNOWN') skipped++;
      caseResults.push({
        num: c.num, verdict, reason: judge.reason,
        // What the agent actually said. Without it a run records only the
        // judge's summary, and "does not name the migration" is unfalsifiable
        // from the record — it could be a gap in the agent or a keyword the
        // judge wanted. Three prompt rewrites on devops were flat because that
        // question could not be answered from the results file.
        // Bounded: a tool-using actor can emit tens of KB per case, and this
        // file accumulates across every run.
        answer: truncateAnswer(actor.text),
        ...(dag ? { score: judge.score, dagPath: judge.dagPath, judge: 'dag' } : { judge: 'rubric' }),
      });
    } catch (err) {
      // Some failures mean "this case did not work". Others mean "no case will
      // work again in this process". A run that ran out of credits made 147
      // more calls, each returning the same 402, before anyone found out.
      const cls = classifyProviderError(err);
      if (cls.terminal) {
        console.warn(`    [STOP] ${cls.kind}: ${cls.why}`);
        skipped += selectedCases.length - selectedCases.indexOf(c);
        caseResults.push({ num: c.num, verdict: 'SKIP', reason: `${cls.kind}: run stopped` });
        terminalFailure = cls;
        break;
      }
      console.warn(`    [WARN] Case ${c.num} in ${evalName} skipped: ${err.message.slice(0, 80)}`);
      skipped++;
      caseResults.push({ num: c.num, verdict: 'SKIP', reason: err.message.slice(0, 80) });
    }
  }

  const judged = selectedCases.length - skipped;
  const rate = judged > 0 ? passed / judged : 0;
  return {
    cases: selectedCases.length, judged, passed, skipped, rate, costUsd, caseResults,
    // Propagated so the file loop can stop the whole run rather than starting
    // the next file into the same wall.
    terminalFailure,
    // Which ruler scored this run, and — only when it was the graph — exactly
    // which graph. Every case in a run scores through the same judge (`dag` is
    // resolved once above, before the case loop), so this is unambiguous per
    // run, unlike a field that could vary case to case.
    judge: dag ? 'dag' : 'rubric',
    ...(dag ? { dagHash: dagFingerprint(dag) } : {}),
  };
}

/** Run an EVAL file `samples` times and aggregate (rate mean + stddev + flaky). */
export async function runEvalFile({ evalPath, evalName, actorModel, judgeModel, dryRun, split = 'all', promptFileBody, agentOverride, samples = 1, judgeVotes = 1, useTools = false, actorTurns = 4, judgeMode = 'auto' }) {
  let content;
  try {
    content = readFileSync(evalPath, 'utf8');
  } catch (err) {
    console.warn(`[WARN] Cannot read ${evalName}: ${err.message}`);
    return null;
  }

  const parsed = parseEvalFile(content, evalName);
  if (!parsed) return null;
  const selectedCases = selectCases(parsed, split);
  if (selectedCases.length === 0) {
    if (split === 'all') console.warn(`[WARN] No cases found in ${evalName}, skipping.`);
    return null;
  }

  // The eval's own declaration wins. An override that silently swaps the prompt
  // under test measures a different agent and reports it under this eval's name;
  // `--prompt-file` is the supported way to try a different prompt.
  const agentName = parsed.agent || agentOverride || null;
  const { system: actorSystem, source: actorSource, sharedExpanded } = resolveActorSystem({ promptFileBody, agentName });

  if (dryRun) {
    console.log(`  [dry-run] ${evalName} — ${selectedCases.length} cases (split=${split}), agent=${agentName || '-'}, actor=${actorSource}${parsed.component ? " (component)" : ""}, pack=${parsed.pack}, threshold="${parsed.thresholdRaw}"`);
    return null;
  }

  const runs = [];
  for (let s = 0; s < samples; s++) {
    const one = await runEvalFileOnce({ parsed, evalName, actorModel, judgeModel, actorSystem, split, judgeVotes, useTools, actorTurns, judgeMode });
    runs.push(one);
    // No point drawing a second sample from a provider that has stopped
    // answering — and every extra attempt delays the message that says why.
    if (one.terminalFailure) break;
  }

  const rates = runs.map(r => r.rate);
  const rateMean = mean(rates);
  const rateStddev = stddev(rates);
  const totalCost = runs.reduce((a, r) => a + r.costUsd, 0);
  const last = runs[runs.length - 1];
  // Use the threshold for THIS split (dual-threshold EVALs carry a per-split bar).
  const threshold = thresholdForSplit(parsed.thresholdRaw, split);

  const orderedNums = selectCases(parsed, split).map((c) => String(c.num));
  const runDropout = dropoutOf({
    skippedNums: last.caseResults.filter((c) => c.verdict === 'SKIP').map((c) => String(c.num)),
    orderedNums,
    skipped: runs.reduce((a, r) => a + r.skipped, 0),
    attempted: orderedNums.length * runs.length,
  });

  // A whole-set run against a dual threshold is two gates, not one — see
  // dualThreshold(). Judge each split against its own bar.
  const bars = split === 'all' ? dualThreshold(parsed.thresholdRaw) : null;
  const splits = bars
    ? splitOutcomes(bars, last.caseResults, new Set((parsed.holdoutCases ?? []).map((c) => String(c.num))))
    : null;

  return {
    eval: evalName.replace(/\.md$/, ''),
    agent: agentName,
    actorSource,
    // Which _shared contracts were inlined into the actor's prompt. A result
    // that does not say this cannot be compared with one from before the
    // expansion existed.
    sharedExpanded,
    pack: parsed.pack,
    split,
    // Which judge scored every sample of this run, and — only on a DAG-scored
    // run — the fingerprint of the exact graph. `dag` is resolved once per file
    // in runEvalFileOnce, so it is identical across every sample here; carrying
    // it from `last` rather than recomputing keeps this the single source.
    judge: last.judge,
    ...(last.dagHash !== undefined ? { dagHash: last.dagHash } : {}),
    cases: last.cases,
    judged: last.judged,
    passed: last.passed,
    skipped: last.skipped,
    rate: rateMean,
    stddev: rateStddev,
    samples,
    flaky: rateStddev > 0.1,
    costUsd: round4(totalCost),
    threshold,
    thresholdRaw: parsed.thresholdRaw,
    // Whether the instruction under test reached the response at all. Four
    // rewordings of one devops instruction moved the holdout by nothing, because
    // it appeared in 4 of 22 answers — no phrasing changes what is absent.
    adherence: adherence(last.caseResults, parsed.adherenceMarker),
    splits,
    // A rate over nothing is not a failing rate. A run that never reached the
    // provider printed `0/0 NOT RUN` and then `FAIL: 0% < 2/3 holdout` two lines
    // apart — a threshold applied to an empty result, contradicting the dropout
    // line beside it. Same for a truncated run: 26/29 is the rate over the cases
    // that ran, and comparing it to the bar asserts the thing dropout withheld.
    belowThreshold: (last.judged === 0 || runDropout.severe)
      ? false
      : splits
        ? (splits.tuning.below || splits.holdout.below)
        : (threshold !== null && rateMean < threshold),
    // The point estimate decides `belowThreshold`, which is what every report
    // read until now. `power` decides from the INTERVAL: at three holdout cases
    // the 95% band for 2/3 is 21%–94%, so a verdict of pass or fail is asserting
    // something the sample cannot support. `inconclusive` is the honest third
    // answer, and it is the vocabulary proof-status already defines.
    // Across every sample, not the last run alone. Each sample is an independent
    // draw from the same stochastic actor, so two runs of forty cases are eighty
    // observations of the pass rate — and forty cases at 74% cannot clear a 67%
    // bar while eighty can. Reading only the last run threw half the evidence
    // away and then reported the result as underpowered.
    // Dropout over every sample, in the order the cases ran: a run cut short by
    // a rate limit or exhausted credits leaves a prefix of the case list, and a
    // prefix is not a draw from the cases. See eval-power.dropout().
    dropout: runDropout,
    // Surfaced to the file loop, which stops the whole run on it.
    terminalFailure: runs.find((r) => r.terminalFailure)?.terminalFailure ?? null,
    power: powerVerdict(
      runs.reduce((a, r) => a + r.passed, 0),
      runs.reduce((a, r) => a + r.judged, 0),
      threshold,
      { dropout: runDropout },
    ),
    ts: new Date().toISOString(),
    caseResults: last.caseResults,
  };
}

// ── Summary table ────────────────────────────────────────────────────────────

function printSummary(results) {
  const divider = '─'.repeat(82);
  console.log('\n' + divider);
  console.log(' Evals Runner — Summary');
  console.log(divider);
  console.log(
    ' EVAL file'.padEnd(38) +
    'Agent'.padEnd(16) +
    'Rate'.padEnd(10) +
    '95% CI'.padEnd(14) +
    'Cost'.padEnd(9) +
    'Status'
  );
  console.log(divider);

  for (const r of results) {
    const p = r.power || {};
    const status = p.status === 'passed' ? 'PASS'
                 : p.status === 'failed' ? 'FAIL'
                 : p.status === 'not_run' ? 'NOT RUN'
                 : 'INCONCLUSIVE';
    const ci = (p.low != null && p.high != null)
      ? `${(p.low * 100).toFixed(0)}–${(p.high * 100).toFixed(0)}%`
      : '-';
    console.log(
      ` ${r.eval.replace('EVAL-', '').slice(0, 36).padEnd(36)}` +
      `${(r.agent || '-').slice(0, 14).padEnd(16)}` +
      `${`${r.passed}/${r.judged}`.padEnd(10)}` +
      `${ci.padEnd(14)}` +
      `${('$' + (r.costUsd ?? 0).toFixed(3)).padEnd(9)}` +
      status
    );
  }

  const total = results.length;
  const failing = results.filter(r => r.power?.status === 'failed').length;
  const unsettled = results.filter(r => r.power?.status === 'inconclusive').length;
  const totalCases = results.reduce((a, r) => a + r.cases, 0);
  const totalPassed = results.reduce((a, r) => a + r.passed, 0);
  const totalSkipped = results.reduce((a, r) => a + r.skipped, 0);
  const totalCost = results.reduce((a, r) => a + (r.costUsd ?? 0), 0);

  console.log(divider);
  console.log(` Files: ${total}  |  Cases: ${totalCases}  |  Passed: ${totalPassed}  |  Skipped: ${totalSkipped}  |  Cost: $${totalCost.toFixed(3)}`);
  if (failing > 0) console.log(` FAILED: ${failing} EVAL file(s) — the interval is entirely below the bar`);
  // Only the runs whose interval is the problem. A run that stopped is
  // unsettled too, and telling its operator to raise --samples sends them to
  // buy more of the thing that already failed.
  const spanning = results.filter((r) => r.power?.status === 'inconclusive' && !r.dropout?.severe);
  if (spanning.length > 0) {
    console.log(` INCONCLUSIVE: ${spanning.length} EVAL file(s) — the interval spans the bar; the run settled nothing`);
    const n = spanning[0]?.judged ?? 0;
    if (n > 0) console.log(`   At ${n} cases one case is worth ${(100 / n).toFixed(0)} points.`);
    console.log('   Raise cases or --samples before reading these as pass or fail.');
  }
  // Dropout is a separate cause with a separate remedy: more samples do not fix
  // a run that stopped, and the rate on the surviving cases is not the rate
  // that was asked for.
  for (const r of results.filter((x) => x.dropout?.severe)) {
    console.log(` DROPOUT: ${r.eval} — ${r.dropout.why}.`);
    console.log(`   ${r.passed}/${r.judged} is over the cases that ran. Fix the cause and re-run;`);
    console.log('   raising --samples measures the same truncation twice.');
  }
  console.log(divider + '\n');
}

// ── main ─────────────────────────────────────────────────────────────────────

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: EVAL_DIR, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'nogit';
  }
}

async function main() {
  const { sample, dryRun, split, agent, filter, promptFile, samples, out, judgeVotes, judgeMode, actorTools, actorTurns } = parseArgs();

  const { provider } = pickProvider();
  if (!dryRun && !provider) {
    console.error('ERROR: no LLM provider key set.');
    console.error('  Set OPENROUTER_API_KEY (export OPENROUTER_API_KEY=sk-or-...) — or ANTHROPIC_API_KEY for direct Anthropic.');
    console.error('  Optional model overrides: EVAL_ACTOR_MODEL, EVAL_JUDGE_MODEL, GREAT_CTO_ROUTER_MODEL.');
    process.exit(1);
  }

  const actorModel = modelFor('actor');
  const judgeModel = modelFor('judge');
  const resultsPath = out ? (isAbsolute(out) ? out : join(process.cwd(), out)) : RESULTS_PATH;

  // Candidate prompt (overrides actor for ALL evals in this run)
  const promptFileBody = loadPromptFile(promptFile);
  if (promptFile && !promptFileBody) {
    console.error(`ERROR: --prompt-file ${promptFile} not found or empty.`);
    process.exit(1);
  }

  // Glob EVAL-*.md files
  let evalFiles = readdirSync(EVAL_DIR)
    .filter(f => f.startsWith('EVAL-') && f.endsWith('.md'))
    .sort();

  // --filter: filename substring
  if (filter) evalFiles = evalFiles.filter(f => f.toLowerCase().includes(filter.toLowerCase()));

  // --agent: keep only EVALs bound to this agent.
  //
  // An eval that DECLARES a different agent is never selected, whatever its
  // filename looks like. `--agent architect` used to match
  // EVAL-ai-prompt-architect-versioning by substring and then run it against
  // `architect`, because the flag also overrode the eval's own binding. The
  // result was 0/8 — read as an agent that gets everything wrong, and
  // improve-loop's first live output proposed a content edit to architect.md to
  // make it discuss prompt versioning, which is not its job.
  //
  // The filename is still a fallback, but only for evals that declare nothing.
  if (agent) {
    evalFiles = evalFiles.filter(f => {
      try {
        const parsed = parseEvalFile(readFileSync(join(EVAL_DIR, f), 'utf8'), f);
        if (!parsed) return false;
        if (parsed.agent) return parsed.agent === agent;
        return f.toLowerCase().includes(agent.toLowerCase());
      } catch { return false; }
    });
  }

  if (evalFiles.length === 0) {
    console.error('ERROR: No EVAL-*.md files matched' + (agent ? ` agent=${agent}` : '') + (filter ? ` filter=${filter}` : '') + '.');
    process.exit(1);
  }

  // Random sample if requested
  if (sample > 0 && sample < evalFiles.length) {
    const arr = [...evalFiles];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    evalFiles = arr.slice(0, sample);
  }

  if (dryRun) {
    console.log(`[dry-run] Would evaluate ${evalFiles.length} EVAL file(s)`);
    console.log(`[dry-run] Actor: ${actorModel}  Judge: ${judgeModel}  Samples: ${samples}`);
    if (agent) console.log(`[dry-run] Agent filter: ${agent}`);
    if (promptFile) console.log(`[dry-run] Candidate prompt: ${promptFile}`);
    console.log(`[dry-run] Files:`);
    for (const f of evalFiles) {
      const content = readFileSync(join(EVAL_DIR, f), 'utf8');
      const parsed = parseEvalFile(content, f);
      if (parsed) {
        const agentName = agent || parsed.agent || null;
        const { source } = resolveActorSystem({ promptFileBody, agentName });
        console.log(`  ${f} — ${parsed.cases.length} cases, agent=${agentName || '-'}, actor=${source}, pack=${parsed.pack}, threshold="${parsed.thresholdRaw}"`);
      } else {
        console.log(`  ${f} — [parse failed or malformed]`);
      }
    }
    console.log(`[dry-run] Results would be written to: ${resultsPath}`);
    console.log('[dry-run] No API calls made. Exiting 0.');
    process.exit(0);
  }

  const runId = new Date().toISOString();
  const commit = gitSha();

  console.log(`Evals Runner — two-agent mode (${provider})`);
  console.log(`  Actor:  ${actorModel}`);
  console.log(`  Judge:  ${judgeModel}`);
  console.log(`  Files:  ${evalFiles.length}${sample > 0 ? ` (sample of ${sample})` : ''}${agent ? ` (agent=${agent})` : ''}`);
  console.log(`  Split:  ${split}   Samples: ${samples}   Judge-votes: ${judgeVotes}   Actor: ${actorTools === false ? 'one-shot (forced)' : actorTools ? `tools(${actorTurns})` : 'tools when agent-bound'}`);
  console.log(`  Run:    ${runId} @ ${commit}`);
  console.log(`  Output: ${resultsPath}`);
  console.log(`  History:${HISTORY_PATH}\n`);

  // results.jsonl = latest run only (eval-gate reads it). History is append-only.
  writeFileSync(resultsPath, '');

  const results = [];
  for (const f of evalFiles) {
    process.stdout.write(`  Running ${f}...`);
    const result = await runEvalFile({
      evalPath: join(EVAL_DIR, f),
      evalName: f,
      actorModel, judgeModel,
      dryRun: false, split,
      promptFileBody,
      agentOverride: agent,
      samples,
      judgeVotes,
      judgeMode,
      // Default: tools for an agent-bound eval, one-shot otherwise. An explicit
      // flag on either side wins.
      useTools: actorTools ?? Boolean(parseEvalFile(readFileSync(join(EVAL_DIR, f), 'utf8'), f)?.agent),
      actorTurns,
    });

    if (!result) {
      console.log(' skipped (parse error or no cases)');
      continue;
    }

    const jsonlEntry = {
      eval: result.eval,
      agent: result.agent,
      actorSource: result.actorSource,
      // Persisted, not just returned: a history row without it cannot be told
      // apart from a row written before the expansion existed, and the same
      // score would then mean two different measurements.
      sharedExpanded: result.sharedExpanded,
      adherence: result.adherence,
      pack: result.pack,
      split: result.split,
      // Which ruler scored this row — 'rubric' or 'dag' — and, on a dag row
      // only, the fingerprint of the exact graph. Two runs are comparable only
      // if the ruler was the same; this is what lets a reader (and eval-gate,
      // in JP-3) tell whether it was.
      judge: result.judge,
      ...(result.dagHash !== undefined ? { dagHash: result.dagHash } : {}),
      cases: result.cases,
      judged: result.judged,
      passed: result.passed,
      skipped: result.skipped,
      rate: parseFloat(result.rate.toFixed(4)),
      stddev: parseFloat(result.stddev.toFixed(4)),
      samples: result.samples,
      flaky: result.flaky,
      costUsd: result.costUsd,
      threshold: result.threshold,
      thresholdRaw: result.thresholdRaw,
      // The verdict from the interval, persisted alongside the rate. A history
      // row with a rate and no power invites reading 74% as a pass when the
      // interval spanned the bar — which is the whole reason power exists.
      power: result.power,
      dropout: result.dropout,
      // How many observations never reached the provider. A run that lost a
      // quarter of its cases to fetch failures reports the same rate as one
      // that lost none, and they are not the same measurement.
      skipped: result.skipped,
      belowThreshold: result.belowThreshold,
      ts: result.ts,
      // Per-case detail, so a run can be ARGUED WITH without paying to repeat it.
      // The aggregate rate says an eval moved; only these say which case moved and
      // why. Under the DAG judge each entry also carries the score and the path
      // through the graph, which is the whole point of scoring by path.
      caseResults: result.caseResults || [],
    };
    appendFileSync(resultsPath, JSON.stringify(jsonlEntry) + '\n');
    // Append-only history: same row + run identity, NEVER truncated.
    //
    // But a file whose cases never reached the provider does not go in at all.
    // The run that prompted this wrote thirteen such rows with `rate: 0` while
    // correctly printing NOT MEASURED for them — and eval-drift reads `rate`,
    // so the next comparison would have seen thirteen evals collapse from ~0.85
    // to zero overnight and alarmed on an empty wallet.
    //
    // `results.jsonl` above still records them: that file is this run's account
    // of itself, including what it failed to measure. History is the trend
    // baseline, and a run that did not happen must not become tomorrow's
    // baseline.
    const admissible = admissibleToHistory(result);
    if (admissible.ok) {
      appendFileSync(HISTORY_PATH, JSON.stringify({ run_id: runId, commit, ...jsonlEntry }) + '\n');
    } else {
      console.log(`    (not added to trend history — ${admissible.why})`);
    }

    const statusIcon = result.belowThreshold ? '✗' : '✓';
    console.log(` ${statusIcon} ${result.passed}/${result.judged} (${(result.rate * 100).toFixed(0)}%` +
      (result.stddev ? ` ±${(result.stddev * 100).toFixed(0)}%` : '') + `) $${result.costUsd.toFixed(3)}` +
      (result.skipped > 0 ? ` [${result.skipped} skipped]` : ''));

    results.push(result);

    // Stop the RUN, not just this file. The alternative is what happened on
    // 2026-08-10: credits ran out at file 58 of 75, and the remaining seventeen
    // files each opened, made every one of their calls into the same 402, and
    // recorded a zero.
    if (result.terminalFailure) {
      console.log('');
      console.log(exhaustionReport({
        kind: result.terminalFailure.kind,
        why: result.terminalFailure.why,
        completed: results.length,
        total: evalFiles.length,
        costUsd: results.reduce((a, r) => a + (r.costUsd || 0), 0),
      }));
      break;
    }
  }

  if (results.length === 0) {
    console.warn('\nNo results collected (all files skipped or failed to parse).');
    process.exit(0);
  }

  printSummary(results);

  // A run that never reached the provider must not exit 0 under "All evaluated
  // EVAL files meet their pass thresholds" — a green CI over a measurement that
  // did not happen is worse than the false red this replaced.
  const unmeasured = results.filter((r) => r.judged === 0 || r.dropout?.severe);
  if (unmeasured.length > 0) {
    console.error(`NOT MEASURED: ${unmeasured.length} EVAL file(s) did not produce a verdict:`);
    for (const r of unmeasured) console.error(`  ${r.eval}: ${r.dropout?.why ?? 'no cases ran'}`);
    console.error('No threshold is applied to these — the rate is over the cases that ran.');
    process.exit(1);
  }

  for (const r of results) {
    const note = explainAdherence(r.eval.replace('EVAL-', ''), r.adherence);
    // Printed whenever it was measured, pass or fail: an instruction that fires
    // 40% of the time is worth knowing about on a run that scraped by.
    if (note) console.log(`\n${note}`);
  }

  const failing = results.filter(r => r.belowThreshold);
  if (failing.length > 0) {
    console.error(`FAIL: ${failing.length} EVAL file(s) below pass threshold:`);
    for (const r of failing) {
      console.error(`  ${r.eval}: ${(r.rate * 100).toFixed(0)}% < ${appliedThresholdLabel(r.thresholdRaw, r.split)}`);
      // Name the split that actually missed. "84% < 5/5 tuning · 2/3 holdout"
      // does not say which gate failed, and on a dual threshold it is usually
      // only one of them.
      if (r.splits) {
        for (const name of ['tuning', 'holdout']) {
          const s = r.splits[name];
          if (s.rate === null) continue;
          console.error(`    ${name.padEnd(8)} ${s.passed}/${s.judged} = ${(s.rate * 100).toFixed(0)}%`
            + ` vs ${(s.threshold * 100).toFixed(0)}% — ${s.below ? 'BELOW' : 'ok'}`);
        }
      }
    }
    process.exit(1);
  }

  console.log('All evaluated EVAL files meet their pass thresholds.');
}

// Only run main() when this file is executed directly (not when imported by tests).
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch(err => {
    console.error('\nFATAL:', err.message);
    process.exit(1);
  });
}
