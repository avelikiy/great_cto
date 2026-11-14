#!/usr/bin/env node
/**
 * pipeline-dry-run — walk a pipeline map with stub verdicts, before a real run pays for it.
 *
 * A project may override `shared/pipeline.toml` (scripts/lib/contract-path.mjs). Until now
 * a broken edge in an override — a `next` naming a stage with no rule, a join whose partner
 * never runs, a verdict token the map does not list — was found on a live, paid run, as a
 * pipeline that stopped and said nothing. tests/pipeline-fixture checks ONE decision against
 * a hand-written map; this walks the WHOLE map, the shipped one or a project's, from a start
 * stage to the end, and says where it would hold, where it would stop, and why.
 *
 * Borrowed from coleam00/Archon's workflow dry-run (`fixtures/*.stubs.yaml`: stub every
 * node's output, assert the outcome and the nodes reached, call no provider) — adapted to
 * this pipeline's own decision function. Every step calls the REAL `decideNext`
 * (scripts/hooks/pipeline-dispatcher.mjs); nothing about routing is reimplemented here.
 * Not simulated: budgets, verification scores and artefact checks (`cwd` is null), which
 * need a project on disk — the dry run is about the shape of the map.
 *
 * Two parts:
 *   lintGraph(transitions)  — static: edges into stages with no rule, asymmetric joins,
 *                             rules that accept no verdict. No stubs needed.
 *   dryRun({ transitions, start, stubs, … }) — dynamic: the path the stubs take.
 *
 * CLI:
 *   node scripts/lib/pipeline-dry-run.mjs [--pipeline FILE] [--stubs FILE.json]
 *        [--start AGENT] [--level LEVEL] [--archetype NAME] [--hold-at-gates] [--json]
 *   Stubs: { "<agent>": "TOKEN" | ["TOKEN", …] | { "verdict": "TOKEN", "meta": { … } } }
 *          A list is consumed one per visit (a rework loop: ["BLOCKED", "APPROVED"]).
 *          A stage with no stub returns the first token its own rule accepts.
 *   Exit 0: the walk reached an end and the map has no problems; 1: problems found;
 *   2: unusable input.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideNext } from '../hooks/pipeline-dispatcher.mjs';
import { parsePipelineToml } from './pipeline-toml.mjs';
import { contractPath } from './contract-path.mjs';
import { gatesForApprovalLevel, DEFAULT_LEVEL } from './approval-level.mjs';
import { isMainModule } from './is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The rule keys for a stage: its default rule and its verdict branches (`agent.TOKEN`). */
function rulesOf(transitions, agent) {
  return Object.keys(transitions).filter((k) => k === agent || k.startsWith(`${agent}.`));
}
const baseOf = (key) => String(key).split('.')[0];
const isReviewer = (agent) => String(agent).endsWith('-reviewer'); // decideNext's built-in default

/** The agents this plugin ships (agents/*.md), for "names a stage that does not exist". */
export function shippedAgents(root = ROOT) {
  try { return readdirSync(join(root, 'agents')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)); }
  catch { return null; }
}

/**
 * Static problems in a map. Each: { kind, at, detail }.
 *   dangling-next   — an edge into a stage with no rule (the run would stop there, silently)
 *   unknown-agent   — an edge into a stage no shipped agent implements
 *   asymmetric-join — A waits for B, but B does not wait for A or goes elsewhere
 *   no-tokens       — a rule that accepts no verdict at all
 */
export function lintGraph(transitions, { agents = shippedAgents() } = {}) {
  const problems = [];
  const known = agents ? new Set(agents) : null;
  for (const [key, rule] of Object.entries(transitions)) {
    if (!(rule.on || []).length) problems.push({ kind: 'no-tokens', at: key, detail: `${key} accepts no verdict token` });
    for (const next of rule.next || []) {
      if (!rulesOf(transitions, next).length && !isReviewer(next)) {
        problems.push({ kind: 'dangling-next', at: key, detail: `${key} → ${next}, but ${next} has no rule: the run would stop after ${next} with no next step` });
      }
      if (known && !known.has(next)) problems.push({ kind: 'unknown-agent', at: key, detail: `${key} → ${next}, and no agents/${next}.md exists` });
    }
    for (const partner of rule.join || []) {
      const theirs = transitions[partner];
      if (!theirs) { problems.push({ kind: 'asymmetric-join', at: key, detail: `${key} joins ${partner}, which has no rule of its own` }); continue; }
      if (!(theirs.join || []).includes(baseOf(key))) {
        problems.push({ kind: 'asymmetric-join', at: key, detail: `${key} waits for ${partner}, but ${partner} does not wait for ${baseOf(key)}` });
      }
      const same = JSON.stringify([...(theirs.next || [])].sort()) === JSON.stringify([...(rule.next || [])].sort());
      if (!same) problems.push({ kind: 'asymmetric-join', at: key, detail: `${key} and its join partner ${partner} go to different next stages` });
    }
  }
  return problems;
}

/** A stub as a verdict object for `agent`'s nth visit; null when the agent has no rule to read a default from. */
function stubFor(stubs, agent, visit, transitions) {
  let s = stubs?.[agent];
  if (Array.isArray(s)) s = s[Math.min(visit, s.length - 1)];
  if (typeof s === 'string') s = { verdict: s };
  if (s && typeof s === 'object' && s.verdict) {
    return { verdict: String(s.verdict).toUpperCase(), meta: { agent, ...(s.meta || {}) }, stubbed: true };
  }
  const rule = transitions[agent] || (isReviewer(agent) ? { on: ['APPROVED'] } : null);
  const token = rule?.on?.[0];
  return token ? { verdict: String(token).toUpperCase(), meta: { agent }, stubbed: false } : null;
}

/**
 * Walk the map from `start`. Returns { steps, ended, held, problems, reached }.
 *   steps[i] = { agent, verdict, stubbed, kind, nexts?, gates?, pending? }
 *   ended    — every branch the walk followed reached a `done` (end of chain)
 *   held     — branches stopped at a hold because of `holdAtGates`: { agent, gates, nexts }
 *   problems — { kind: 'no-rule' | 'unknown-verdict' | 'stopped' | 'join-never-met' | 'loop' | 'step-cap', at, detail }
 *
 * Gates hold the real run; the dry run records the hold and walks on as though the human
 * approved (unless `holdAtGates`), so one walk shows the whole map, not the first gate.
 */
export function dryRun({ transitions, start, stubs = {}, activeGates = null, holdAtGates = false, maxSteps = 64, maxVisits = 3 }) {
  const steps = [];
  const problems = [];
  const recorded = {};
  const visits = {};
  const queue = [start];
  const waiting = new Map(); // agent → partners it still waits for
  let sawDone = false;
  const held = []; // { agent, gates, nexts } — branches stopped at a hold (holdAtGates)
  let n = 0;

  while (queue.length) {
    if (n++ >= maxSteps) { problems.push({ kind: 'step-cap', at: queue[0], detail: `stopped after ${maxSteps} steps` }); break; }
    const agent = queue.shift();
    const visit = visits[agent] = (visits[agent] ?? -1) + 1;
    if (visit >= maxVisits) { problems.push({ kind: 'loop', at: agent, detail: `${agent} reached ${maxVisits} times — the stubs loop; give it a list ending in a passing token` }); continue; }

    const stub = stubFor(stubs, agent, visit, transitions);
    if (!stub) {
      steps.push({ agent, verdict: null, kind: 'no-rule' });
      problems.push({ kind: 'no-rule', at: agent, detail: `${agent} has no rule in the map: a real run would stop here with nothing next` });
      continue;
    }
    const verdict = { agent, verdict: stub.verdict, ts: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(), meta: stub.meta, hasCost: true };
    recorded[agent] = verdict;
    const d = decideNext({ agent, transitions, verdict, joinVerdicts: recorded, activeGates, gateStates: null, cwd: null });
    const step = { agent, verdict: stub.verdict, stubbed: stub.stubbed, kind: d ? d.kind : (rulesOf(transitions, agent).length || isReviewer(agent) ? 'unknown-verdict' : 'no-rule') };
    if (d?.nexts) step.nexts = d.nexts;
    if (d?.gates) step.gates = d.gates;
    if (d?.pending) step.pending = d.pending;
    steps.push(step);

    const enqueue = (list) => { for (const a of list || []) if (!queue.includes(a)) queue.push(a); };
    if (!d) {
      problems.push({ kind: step.kind, at: agent, detail: step.kind === 'no-rule'
        ? `${agent} has no rule in the map: a real run would stop here with nothing next`
        : `${agent} returned ${stub.verdict}, which none of its rules accepts: a real run would stay silent here` });
    } else if (d.kind === 'next') {
      waiting.delete(agent); enqueue(d.nexts);
    } else if (d.kind === 'gate') {
      waiting.delete(agent);
      if (holdAtGates) held.push({ agent, gates: d.gates, nexts: d.nexts });
      else enqueue(d.nexts);
    } else if (d.kind === 'join-wait') {
      waiting.set(agent, d.pending);
    } else if (d.kind === 'done') {
      waiting.delete(agent); sawDone = true;
    } else {
      problems.push({ kind: 'stopped', at: agent, detail: `${agent} → ${d.kind}: ${String(d.text).slice(0, 160)}` });
    }
    // A join partner that will never run: the quorum cannot be met.
    if (!queue.length) {
      for (const [a, pending] of waiting) {
        const never = (pending || []).filter((p) => !recorded[p]);
        if (never.length) problems.push({ kind: 'join-never-met', at: a, detail: `${a} waits for ${never.join(', ')}, which this walk never runs` });
      }
      waiting.clear();
    }
  }
  const reached = [...new Set(steps.map((s) => s.agent))];
  // Ended means every branch the walk followed reached an end of chain — not that one
  // did. A branch held at a gate has not ended (Codex review on #292: a map fanning out
  // to a gated branch and a finishing one reported "ended" off the finishing one).
  const ended = sawDone && held.length === 0;
  return { steps, ended, held, problems, reached };
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { throw new Error(`cannot read ${path}: ${e.message}`); }
}

function render(lint, run, { pipeline, start, level }) {
  const out = [`pipeline: ${pipeline}`, `start: ${start}   level: ${level}`, ''];
  for (const s of run.steps) {
    const tail = s.kind === 'gate' ? `  ⏸ hold at ${s.gates.join(' + ')} → ${s.nexts.join(', ')}`
      : s.kind === 'next' ? `  → ${s.nexts.join(', ')}`
        : s.kind === 'join-wait' ? `  … waits for ${s.pending.join(', ')}`
          : s.kind === 'done' ? '  ■ end of chain'
            : `  ✗ ${s.kind}`;
    out.push(`  ${s.agent.padEnd(26)} ${String(s.verdict ?? '-').padEnd(14)}${s.stubbed ? '' : ' (default)'}${tail}`);
  }
  const problems = [...lint.map((p) => ({ ...p, static: true })), ...run.problems];
  out.push('');
  for (const h of run.held || []) out.push(`  ⏸ held at ${h.gates.join(' + ')} after ${h.agent}; not walked: ${h.nexts.join(', ')}`);
  if (!problems.length) {
    out.push(run.ended ? 'ok: the walk reached the end of the chain, and the map has no problems'
      : run.held?.length ? 'stopped at the holds above (--hold-at-gates); no problems up to there — not a walk to the end'
        : 'no problems, but the walk did not reach an end');
  }
  for (const p of problems) out.push(`  ✗ ${p.kind} at ${p.at}: ${p.detail}`);
  return out.join('\n');
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  try {
    const pipeline = opt('--pipeline') || contractPath('pipeline.toml');
    const transitions = parsePipelineToml(readFileSync(pipeline, 'utf8'));
    if (!transitions || !Object.keys(transitions).length) throw new Error(`${pipeline} has no transitions`);
    const stubs = opt('--stubs') ? readJson(opt('--stubs')) : {};
    const start = opt('--start') || 'product-owner';
    const level = opt('--level') || DEFAULT_LEVEL;
    const activeGates = gatesForApprovalLevel(level, { archetype: opt('--archetype') });
    const lint = lintGraph(transitions);
    const run = dryRun({ transitions, start, stubs, activeGates, holdAtGates: argv.includes('--hold-at-gates') });
    // A hold the caller asked to stop at is not a failure; a walk that neither ended nor
    // was held is one.
    const bad = lint.length + run.problems.length > 0 || (!run.ended && !run.held.length);
    if (argv.includes('--json')) console.log(JSON.stringify({ pipeline, start, level, activeGates, lint, ...run }, null, 2));
    else console.log(render(lint, run, { pipeline, start, level }));
    process.exit(bad ? 1 : 0);
  } catch (e) {
    console.error(`pipeline-dry-run: ${e.message}`);
    process.exit(2);
  }
}
