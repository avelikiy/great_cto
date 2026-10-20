#!/usr/bin/env node
/**
 * lessons-merge.mjs — move a project lesson into global decisions, only with evidence.
 *
 * Reads ~/.great_cto/projects/*\/lessons.md (symlinks to project lessons.md files
 * registered via /start). A lesson slug seen in ≥3 distinct projects is a
 * CANDIDATE. It is written to ~/.great_cto/decisions.md — which every session
 * of every project reads — only when it carries an A/B eval stamp that is not a
 * regression (ADR-037, same decision as `/crystallize approve`, ADR-009).
 *
 * Usage:
 *   node scripts/lessons-merge.mjs                     # promote what is measured; list the rest
 *   node scripts/lessons-merge.mjs --dry-run           # preview only, no writes
 *   node scripts/lessons-merge.mjs --force             # re-promote even if already in decisions.md
 *   node scripts/lessons-merge.mjs --measure <slug>    # print the A/B plan and its cost
 *   node scripts/lessons-merge.mjs --measure <slug> --yes   # run it (spends money) and stamp the lesson
 *   node scripts/lessons-merge.mjs --no-eval "<why>" --slug <slug>   # promote one unmeasured lesson; logged
 *
 * A lesson is measured against the eval it names in its frontmatter
 * (`eval: EVAL-<name>.md`). Baseline arm: the eval's agent as is. Candidate arm:
 * the same agent with the lesson appended. One sample per case per arm.
 *
 * @see docs/LEARNING.md
 * @see docs/adr/ADR-037-lesson-needs-evidence.md
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregate, promotionDecision, measurePlan, armPrompts, stampLesson, CANDIDATE_THRESHOLD } from './lib/lesson-promotion.mjs';
import { computeDelta } from './lib/gp-eval-trace.mjs';
import { estimateRun, costLine } from './lib/eval-cost-estimate.mjs';
import { parseResultsJsonl } from './eval-gate.mjs';
import { runArm, shortHead } from './lib/eval-arm.mjs';

const ROOT           = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOME           = homedir();
const PROJECTS_DIR   = join(HOME, '.great_cto', 'projects');
const DECISIONS_PATH = join(HOME, '.great_cto', 'decisions.md');
const AUDIT_LOG      = join(HOME, '.great_cto', 'metrics', 'crystallize.log');

// --- args --------------------------------------------------------------------

const argv     = process.argv.slice(2);
const arg      = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] ?? null : null; };
const DRY_RUN  = argv.includes('--dry-run');
const FORCE    = argv.includes('--force');
const MEASURE  = arg('--measure');
const YES      = argv.includes('--yes');
const NO_EVAL  = arg('--no-eval');
const SLUG     = arg('--slug');

const die = (msg, code = 2) => { console.error(`[lessons-merge] ${msg}`); process.exit(code); };

if (NO_EVAL !== null && !SLUG) {
  die('--no-eval promotes ONE lesson: name it with --slug <slug>. A bypass for every candidate at once is not offered.');
}

// --- collect lessons from all projects ---------------------------------------

function lessonFiles() {
  const out = [];
  if (!existsSync(PROJECTS_DIR)) return out;
  for (const entry of readdirSync(PROJECTS_DIR)) {
    const path = join(PROJECTS_DIR, entry, 'lessons.md');
    try {
      const st = statSync(path);
      if (st.isFile()) out.push({ project: entry, path, text: readFileSync(path, 'utf8') });
    } catch { /* not registered with lessons */ }
  }
  return out;
}

const patternMap = aggregate(lessonFiles());

// --- measure -----------------------------------------------------------------

if (MEASURE) {
  const agg = patternMap.get(MEASURE);
  if (!agg) die(`no lesson "${MEASURE}" in any registered project`);
  const sample = agg.samples.find((s) => s.fm.eval);
  if (!sample) die(`lesson "${MEASURE}" declares no \`eval:\` — there is nothing to measure it against; it stays local`);
  const evalName = sample.fm.eval;
  const evalPath = join(ROOT, 'tests', 'eval', evalName);
  if (!existsSync(evalPath)) die(`eval ${evalName} not found under tests/eval — run from a great_cto checkout`);
  const agent = (readFileSync(evalPath, 'utf8').match(/^>\s*Agent:\s*([^·\n]+)/m) || [])[1]?.trim();
  if (!agent) die(`${evalName} binds no agent (\`> Agent:\`) — a lesson cannot be A/B-tested against it`);
  const agentPath = join(ROOT, 'agents', `${agent}.md`);
  if (!existsSync(agentPath)) die(`agents/${agent}.md not found`);
  // The arms follow what the lesson changes (ADR-038). Refuse before pricing:
  // an unlabelled lesson cannot be measured, so nothing should look about to run.
  const plan = measurePlan(agg);
  if (plan.refuse) die(`lesson "${MEASURE}" ${plan.refuse}`);
  let skillText = null;
  if (plan.changes) {
    const skillPath = join(ROOT, plan.changes);
    if (!existsSync(skillPath)) die(`lesson "${MEASURE}" changes ${plan.changes}, which is not in this checkout`);
    skillText = readFileSync(skillPath, 'utf8');
  }
  const runner = process.env.GREAT_CTO_EVAL_RUNNER || join(ROOT, 'tests', 'eval', 'runner.mjs');
  const filter = evalName.replace(/\.md$/, '');

  // Price it before spending. An unpriced run is said to be unpriced, not $0.
  const rows = [];
  const history = join(ROOT, 'tests', 'eval', 'results-history.jsonl');
  if (existsSync(history)) {
    for (const line of readFileSync(history, 'utf8').split('\n')) {
      try { const o = JSON.parse(line); if (o?.eval) rows.push({ eval: o.eval, split: o.split ?? null, samples: Number(o.samples) || 1, costUsd: o.costUsd }); } catch { /* skip */ }
    }
  }
  const est = estimateRun({ rows, split: null, samples: 1, evals: plan.arms.length });
  console.log(`[lessons-merge] measure ${MEASURE} (${plan.component}) against ${evalName} (agent ${agent}), 1 sample per case, arms: ${plan.arms.join(' · ')}`);
  console.log(`  ${costLine(est)}`);
  if (!YES) {
    console.log('  nothing was run. To spend it and stamp the lesson:');
    console.log(`  node scripts/lessons-merge.mjs --measure ${MEASURE} --yes`);
    process.exit(0);
  }

  const work = mkdtempSync(join(tmpdir(), 'lesson-ab-'));
  try {
    const prompts = armPrompts(readFileSync(agentPath, 'utf8'), sample, skillText);
    const arm = (name) => {
      let extra = [];
      if (prompts[name]) {
        const file = join(work, name + '.md');
        writeFileSync(file, prompts[name]);
        extra = ['--prompt-file', file];
      }
      try { return parseResultsJsonl(runArm({ runner, root: ROOT, work, name, filter, extra })); }
      catch (e) { die(e.message, 1); }
    };
    const results = Object.fromEntries(plan.arms.map((name) => [name, arm(name)]));
    const treated = plan.arms.includes('full') ? 'full' : 'lesson';
    const delta = computeDelta(results.baseline, results[treated], agent);
    if (!delta.perEval.length) die('the arms share no scored eval — nothing stamped', 1);
    const hint = plan.arms.includes('hint') ? computeDelta(results.baseline, results.hint, agent) : null;
    const pct = (d) => `${(d.meanDelta * 100).toFixed(1)}% (±${(d.noiseBand * 100).toFixed(1)}%) → ${d.direction}`;
    const text = readFileSync(sample.path, 'utf8');
    writeFileSync(sample.path, stampLesson(text, sample.raw, delta, { ts: new Date().toISOString(), commit: shortHead(ROOT), ke: `lesson:${MEASURE}`, hint }));
    console.log(`[lessons-merge] ${MEASURE}: ${treated} Δ ${pct(delta)}; stamped in project ${sample.project}`);
    if (hint) {
      console.log(`  hint alone Δ ${pct(hint)}`);
      if (hint.direction === 'regression') console.log('  the hint alone is a regression — promote the skill, never the hint as advice');
    }
    process.exit(0);
  } finally { rmSync(work, { recursive: true, force: true }); }
}

// --- read existing decisions.md (for de-dupe) --------------------------------

let existingDecisions = '';
const promotedSlugs = new Set();
if (existsSync(DECISIONS_PATH)) {
  existingDecisions = readFileSync(DECISIONS_PATH, 'utf8');
  for (const m of existingDecisions.matchAll(/^##\s+pattern:\s*(.+?)\s*$/gm)) promotedSlugs.add(m[1].trim());
}
// Entries promoted before ADR-037 carry no stamp. They are listed, not deleted.
const unmeasured = existingDecisions.split(/\n(?=---\s*\n)/)
  .filter((b) => /^##\s+pattern:/m.test(b) && !/^eval_confidence:/m.test(b) && !/^promotion: bypassed/m.test(b))
  .map((b) => b.match(/^##\s+pattern:\s*(.+?)\s*$/m)[1]);

// --- decide ------------------------------------------------------------------

const decisions = [];
for (const agg of patternMap.values()) {
  if (SLUG && agg.slug !== SLUG) continue;
  if (promotedSlugs.has(agg.slug) && !FORCE) continue;
  const d = promotionDecision(agg, { bypassReason: SLUG ? NO_EVAL : null });
  if (d.state !== 'below-threshold') decisions.push({ d, agg });
}
if (SLUG && !decisions.length) die(`no candidate "${SLUG}" (seen in ≥${CANDIDATE_THRESHOLD} projects and not yet promoted)`);

for (const { d } of decisions) {
  if (d.state !== 'promote') console.log(`  ${d.state.padEnd(10)} ${d.slug} — ${d.reason}`);
}
if (unmeasured.length) console.log(`  unmeasured  ${unmeasured.length} entr(y/ies) already in decisions.md predate evidence: ${unmeasured.join(', ')}`);

const toPromote = decisions.filter(({ d }) => d.state === 'promote');

function consolidate(d, agg) {
  const sample = agg.samples.find((s) => s.fm.eval_confidence || s.fm.eval_delta) || agg.samples[0];
  const today = new Date().toISOString().slice(0, 10);
  const projects = [...agg.projects].slice(0, 10);
  const archetypes = [...agg.archetypes];
  const priority = archetypes.length >= 3 ? 'high' : 'medium';
  const stamp = d.bypassed
    ? [`promotion: bypassed — ${String(NO_EVAL).trim()}`]
    : [`eval: ${d.evalName || sample.fm.eval || '?'}`, `eval_delta: ${sample.fm.eval_delta || '?'}`, `eval_confidence: ${sample.fm.eval_confidence || d.evidence}`,
       ...(sample.fm.eval_delta_hint ? [`eval_delta_hint: ${sample.fm.eval_delta_hint}`] : [])];
  const component = agg.samples.map((s) => s.fm.component).find(Boolean);
  const changes = agg.samples.map((s) => s.fm.changes).find(Boolean);
  const hintHurt = /regression\)\s*$/.test(sample.fm.eval_delta_hint || '');
  return [
    '---',
    `promoted: ${today}`,
    `occurrences: ${agg.projects.size}`,
    `projects: [${projects.map((p) => `"${p}"`).join(', ')}]`,
    `archetypes: [${archetypes.map((a) => `"${a}"`).join(', ')}]`,
    `skill-candidate-priority: ${priority}`,
    ...(component ? [`component: ${component}`] : []),
    ...(changes ? [`changes: ${changes}`] : []),
    ...stamp,
    '---',
    '',
    `## pattern: ${agg.slug}`,
    '',
    `**Cross-project lesson** — observed in ${agg.projects.size} project(s), ${archetypes.length} archetype(s); ${d.bypassed ? 'promoted WITHOUT measurement by an explicit, logged decision' : `measured: ${d.evidence}`}.`,
    '',
    ...(hintHurt ? [`**The hint alone made it worse** in the control arm — what helps is ${changes || 'the skill'} itself; do not apply this lesson as advice without it.`, ''] : []),
    sample.raw.replace(/^---[\s\S]*?\n---\s*\n/, '').replace(/^##\s+pattern:[^\n]*\n/m, '').trim(),
    '',
  ].join('\n');
}

// --- write -------------------------------------------------------------------

if (toPromote.length === 0) {
  console.log(`[lessons-merge] nothing to promote — a lesson needs ≥${CANDIDATE_THRESHOLD} projects AND an eval stamp that is not a regression`);
  console.log(`  scanned: ${patternMap.size} pattern slug(s) across all projects`);
  process.exit(0);
}

console.log(`[lessons-merge] promoting ${toPromote.length} pattern(s):`);
for (const { d, agg } of toPromote) {
  console.log(`  - ${d.slug} (${agg.projects.size} project(s), ${d.bypassed ? 'BYPASS' : d.evidence})`);
}

if (DRY_RUN) {
  console.log('[lessons-merge] --dry-run: not writing');
  process.exit(0);
}

mkdirSync(join(HOME, '.great_cto'), { recursive: true });

let header = '';
if (!existsSync(DECISIONS_PATH)) {
  header = `# Cross-project decisions\n\n` +
    `Written by \`lessons-merge.mjs\`. Each entry is a lesson seen in ${CANDIDATE_THRESHOLD}+ projects\n` +
    `whose A/B eval did not show harm (ADR-037), or one promoted by an explicit,\n` +
    `logged decision without measurement.\n\n` +
    `Read by architect, pm, senior-dev, and code-reviewer agents at session start.\n\n`;
}

const block = toPromote.map(({ d, agg }) => consolidate(d, agg)).join('\n');
if (header) writeFileSync(DECISIONS_PATH, header + block);
else appendFileSync(DECISIONS_PATH, '\n' + block);

// An override is a decision: it goes in the same audit trail as `/crystallize`'s.
for (const { d } of toPromote.filter(({ d }) => d.bypassed)) {
  mkdirSync(dirname(AUDIT_LOG), { recursive: true });
  appendFileSync(AUDIT_LOG, `${new Date().toISOString().slice(0, 10)} EVAL_BYPASS lesson:${d.slug} reason="${String(NO_EVAL).replace(/"/g, "'")}"\n`);
}

console.log(`[lessons-merge] wrote ${toPromote.length} entries → ${DECISIONS_PATH}`);
