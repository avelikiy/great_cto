// scripts/coverage-gate.mjs — agent → EVAL coverage gate (DEEPEN-PIPELINE Wave 1).
//
// Problem: a perfectly-wired eval runner measures NOTHING for an agent that has no
// EVAL file. This gate blocks adding/editing an agent unless ≥1 EVAL references it.
//
// An agent `agents/<name>.md` is COVERED if some tests/eval/EVAL-*.md contains:
//   "> Agent: <name>"            (preferred, explicit binding)
//   "Reviewer: <name>"           (pack reviewer that maps to the agent)
//   or the agent name in its filename (EVAL-<name>-*.md)
//
// Covered is a claim about a FILE, not about a measurement, and reporting it as a
// single percentage let it be read as a test result. It is not: 33 EVAL files
// exist and 2 have ever been executed. So coverage is reported as a ladder, and
// each rung says exactly what is known:
//
//   missing    no EVAL file references this agent at all
//   present    a file names it — nothing has run, so nothing is measured
//   exercised  a case actually ran, and its result was retained
//   passing    the latest run met the file's own threshold
//
// The rungs above `present` are the ones that mean anything, and separating them
// is the whole point: a mechanism that exists and a mechanism that runs are
// different facts, and collapsing them is how a repo reports 29% coverage over
// two executions.
//
// Usage:
//   node scripts/coverage-gate.mjs                         # advisory report (exit 0)
//   node scripts/coverage-gate.mjs --changed agents/x.md   # exit 1 if a changed agent is uncovered
//   node scripts/coverage-gate.mjs --strict                # exit 1 if ANY agent is uncovered
//   node scripts/coverage-gate.mjs --json                  # machine-readable report
//   node scripts/coverage-gate.mjs --require exercised     # a file that exists is not enough
//
// CI wires the --changed form against the PR diff (see plugin-ci.yml).

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEvalMeta, parseHistory, statusFor, summarise } from './lib/eval-status.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const AGENTS_DIR = join(ROOT, 'agents');
const EVAL_DIR = join(ROOT, 'tests', 'eval');
const HISTORY = join(EVAL_DIR, 'results-history.jsonl');

/** Build the set of agent names that at least one EVAL file references. */
export function coveredAgents(evalFiles /* [{name, content}] */) {
  const covered = new Set();
  for (const { name, content } of evalFiles) {
    for (const m of content.matchAll(/^>\s*Agent:\s*([^·\n]+)/gm)) covered.add(m[1].trim());
    for (const m of content.matchAll(/Reviewer:\s*([a-z0-9-]+)/g)) covered.add(m[1].trim());
    const fn = basename(name).replace(/^EVAL-/, '').replace(/\.md$/, '');
    covered.add(fn); // filename stem, used as a loose fallback below
  }
  return covered;
}

/** The evidence rungs, weakest first. Order is meaningful — index is the rank. */
export const EVIDENCE = Object.freeze(['missing', 'present', 'exercised', 'passing']);

/** Which EVAL files reference a given agent. */
export function evalsForAgent(agent, evalFiles) {
  const a = agent.toLowerCase();
  return evalFiles.filter(({ name, content }) => {
    if (name.toLowerCase().includes(a)) return true;
    for (const m of content.matchAll(/^>\s*Agent:\s*([^·\n]+)/gm)) if (m[1].trim().toLowerCase() === a) return true;
    for (const m of content.matchAll(/Reviewer:\s*([a-z0-9-]+)/g)) if (m[1].trim().toLowerCase() === a) return true;
    return false;
  });
}

/**
 * How much is actually known about one agent's behaviour.
 *
 * An agent rises to the strongest rung any of its EVAL files reaches: one file
 * that runs and passes is real evidence even if a second file beside it never
 * ran. It never rises on a file's existence alone.
 *
 * @returns {{agent:string, level:string, evals:string[], why:string}}
 */
export function agentEvidence(agent, evalFiles, historyRows = [], now = Date.now()) {
  const mine = evalsForAgent(agent, evalFiles);
  if (!mine.length) return { agent, level: 'missing', evals: [], why: 'no EVAL file references this agent' };

  const names = mine.map((e) => basename(e.name));
  let best = 'present';
  let why = `${names.length} EVAL file(s), none ever executed`;
  for (const e of mine) {
    const st = statusFor(parseEvalMeta(e.content, basename(e.name)), historyRows, { now });
    if (st.state === 'never-run') continue;
    if (st.state === 'passing' || st.state === 'stale') {
      // Stale is still a pass that happened — it is old, not absent. eval-status
      // reports the age separately; here it counts as measured.
      best = 'passing';
      why = `${basename(e.name)} last ran ${st.ageDays}d ago at ${Math.round((st.rate ?? 0) * 100)}%`;
      break;
    }
    if (best !== 'passing') {
      best = 'exercised';
      why = `${basename(e.name)} ran but did not pass (${st.state})`;
    }
  }
  return { agent, level: best, evals: names, why };
}

/** Ladder report for a list of agents. */
export function evidenceReport(agentNames, evalFiles, historyRows = [], now = Date.now()) {
  const rows = agentNames.map((a) => agentEvidence(a, evalFiles, historyRows, now));
  const counts = Object.fromEntries(EVIDENCE.map((l) => [l, rows.filter((r) => r.level === l).length]));
  return { rows, counts, total: rows.length };
}

/** Is `level` at least as strong as `min`? */
export function meetsEvidence(level, min) {
  return EVIDENCE.indexOf(level) >= EVIDENCE.indexOf(min);
}

/**
 * Pure coverage report.
 * @param {string[]} agentNames           e.g. ['architect','security-officer']
 * @param {Array<{name,content}>} evalFiles
 * @returns {{covered:string[], uncovered:string[]}}
 */
export function coverageReport(agentNames, evalFiles) {
  const covered = coveredAgents(evalFiles);
  const isCovered = (a) =>
    covered.has(a) ||
    evalFiles.some(e => e.name.toLowerCase().includes(a.toLowerCase()));
  const out = { covered: [], uncovered: [] };
  for (const a of agentNames) (isCovered(a) ? out.covered : out.uncovered).push(a);
  return out;
}

// ── filesystem loaders ────────────────────────────────────────────────────────

function loadEvalFiles() {
  if (!existsSync(EVAL_DIR)) return [];
  return readdirSync(EVAL_DIR)
    .filter(f => f.startsWith('EVAL-') && f.endsWith('.md'))
    .map(f => ({ name: f, content: readFileSync(join(EVAL_DIR, f), 'utf8') }));
}

function allAgentNames() {
  if (!existsSync(AGENTS_DIR)) return [];
  return readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'))
    .map(f => f.replace(/\.md$/, ''));
}

/** Map a changed path like "agents/foo.md" → "foo". Ignores non-agent paths. */
function changedAgentNames(paths) {
  return paths
    .map(p => p.trim())
    .filter(p => /(^|\/)agents\/[^/]+\.md$/.test(p) && !/\/_/.test(p))
    .map(p => basename(p).replace(/\.md$/, ''));
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function main(argv) {
  const opts = { changed: [], strict: false, json: false, require: 'present' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--changed') { while (argv[i + 1] && !argv[i + 1].startsWith('--')) opts.changed.push(argv[++i]); }
    else if (argv[i] === '--strict') opts.strict = true;
    else if (argv[i] === '--json') opts.json = true;
    else if (argv[i] === '--require') {
      const want = argv[++i];
      // An unknown rung must not silently become the weakest one — that would
      // turn a raised bar into a lowered one.
      if (!EVIDENCE.includes(want)) {
        console.error(`coverage-gate: --require must be one of ${EVIDENCE.join(' | ')}, got '${want}'`);
        process.exit(2);
      }
      opts.require = want;
    }
  }

  const evalFiles = loadEvalFiles();
  const targets = opts.changed.length ? changedAgentNames(opts.changed) : allAgentNames();

  if (targets.length === 0) {
    if (opts.changed.length) { console.log('coverage-gate: no agent files changed — OK'); process.exit(0); }
    console.error('coverage-gate: no agents found'); process.exit(0);
  }

  const hist = (() => {
    try { return existsSync(HISTORY) ? parseHistory(readFileSync(HISTORY, 'utf8')) : []; }
    catch { return []; }
  })();

  const { covered, uncovered } = coverageReport(targets, evalFiles);
  const evidence = evidenceReport(targets, evalFiles, hist);
  const below = evidence.rows.filter((r) => !meetsEvidence(r.level, opts.require));

  if (opts.json) {
    console.log(JSON.stringify({
      covered, uncovered, total: targets.length,
      require: opts.require, counts: evidence.counts, agents: evidence.rows,
    }, null, 2));
  } else {
    const c = evidence.counts;
    // No single percentage. One number invites being read as a test result, and
    // the distance between `present` and `exercised` is the whole finding.
    console.log(
      `coverage-gate: ${c.passing} passing · ${c.exercised} exercised · ` +
      `${c.present} present-only · ${c.missing} missing   (of ${evidence.total} agents)`,
    );
    if (c.present && !c.exercised && !c.passing) {
      console.log('               every EVAL that exists has never been executed — this measures nothing yet');
    }
    try {
      const sum = summarise(evalFiles.map(e => statusFor(parseEvalMeta(e.content, basename(e.name)), hist)));
      console.log(`               ${sum.line}`);
    } catch { /* the report is a courtesy — never break the gate over it */ }
    if (below.length) {
      console.log(`Below \`${opts.require}\`:`);
      for (const r of below) console.log(`  ✗ ${r.agent.padEnd(26)} ${r.level.padEnd(10)} ${r.why}`);
    }
  }

  // Block when a CHANGED agent is below the required rung, or --strict and any is.
  const blocking = opts.changed.length ? below.length > 0 : (opts.strict && below.length > 0);
  if (blocking) {
    const how = opts.require === 'present'
      ? 'Add tests/eval/EVAL-<agent>-*.md with a "> Agent: <name>" header.'
      : `Run it: node tests/eval/runner.mjs --split holdout (needs an API key). ` +
        `\`--require ${opts.require}\` means a file that exists is not enough.`;
    console.error(`\ncoverage-gate: BLOCK — ${below.length} agent(s) below \`${opts.require}\`. ${how}`);
    // exitCode, not exit(): on a pipe stdout is asynchronous and process.exit()
      // discards whatever has not drained — anything past the ~8KB pipe buffer
      // vanishes, leaving a truncated report that reads as a complete one right
      // up to the byte it stops at. See tests/lib/lint-json-not-truncated.test.mjs.
      process.exitCode = 1;
      return;
  }
  process.exitCode = 0;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
