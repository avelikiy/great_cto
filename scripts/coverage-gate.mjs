// scripts/coverage-gate.mjs — agent → EVAL coverage gate (DEEPEN-PIPELINE Wave 1).
//
// Problem: a perfectly-wired eval runner measures NOTHING for an agent that has no
// EVAL file. Today only ~10 of 59 agents are covered, so most prompt edits ship
// blind. This gate blocks adding/editing an agent unless ≥1 EVAL references it.
//
// An agent `agents/<name>.md` is COVERED if some tests/eval/EVAL-*.md contains:
//   "> Agent: <name>"            (preferred, explicit binding)
//   "Reviewer: <name>"           (pack reviewer that maps to the agent)
//   or the agent name in its filename (EVAL-<name>-*.md)
//
// Usage:
//   node scripts/coverage-gate.mjs                         # advisory report (exit 0)
//   node scripts/coverage-gate.mjs --changed agents/x.md   # exit 1 if a changed agent is uncovered
//   node scripts/coverage-gate.mjs --strict                # exit 1 if ANY agent is uncovered
//   node scripts/coverage-gate.mjs --json                  # machine-readable report
//
// CI wires the --changed form against the PR diff (see plugin-ci.yml).

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const AGENTS_DIR = join(ROOT, 'agents');
const EVAL_DIR = join(ROOT, 'tests', 'eval');

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
  const opts = { changed: [], strict: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--changed') { while (argv[i + 1] && !argv[i + 1].startsWith('--')) opts.changed.push(argv[++i]); }
    else if (argv[i] === '--strict') opts.strict = true;
    else if (argv[i] === '--json') opts.json = true;
  }

  const evalFiles = loadEvalFiles();
  const targets = opts.changed.length ? changedAgentNames(opts.changed) : allAgentNames();

  if (targets.length === 0) {
    if (opts.changed.length) { console.log('coverage-gate: no agent files changed — OK'); process.exit(0); }
    console.error('coverage-gate: no agents found'); process.exit(0);
  }

  const { covered, uncovered } = coverageReport(targets, evalFiles);

  if (opts.json) {
    console.log(JSON.stringify({ covered, uncovered, total: targets.length }, null, 2));
  } else {
    const pct = targets.length ? Math.round((covered.length / targets.length) * 100) : 0;
    console.log(`coverage-gate: ${covered.length}/${targets.length} agents covered (${pct}%)`);
    if (uncovered.length) {
      console.log('Uncovered (need ≥1 EVAL with "> Agent: <name>"):');
      for (const a of uncovered) console.log(`  ✗ ${a}`);
    }
  }

  // Block when: a CHANGED agent is uncovered, or --strict and anything is uncovered.
  const blocking = opts.changed.length ? uncovered.length > 0 : (opts.strict && uncovered.length > 0);
  if (blocking) {
    console.error(`\ncoverage-gate: BLOCK — ${uncovered.length} agent(s) without an EVAL. Add tests/eval/EVAL-<agent>-*.md with a "> Agent: <name>" header.`);
    process.exit(1);
  }
  process.exit(0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
