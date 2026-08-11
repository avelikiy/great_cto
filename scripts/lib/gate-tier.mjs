// When a gate may stop asking, and — more usefully — why it may not.
//
// The parent plan's phase 5: once an agent's holdout conclusively clears its
// bar, its gate drops to notify-only. The pipeline proceeds, the entry still
// appears in the board's inbox, the human may intervene and need not.
//
// Why this could not be written until today
// -----------------------------------------
// Every earlier "conclusively passes" rested on single-sample runs, and a single
// sample of a three-case eval can only score 0, 0.33, 0.67 or 1.00 — its own
// history swings 0.83 → 1.00 → 0.83 with nothing changing. The holdout×3
// baseline finished on 2026-08-11, 75 of 75, three samples with a majority
// judge. That is the first evidence in this repository that could carry a
// decision to stop asking a human.
//
// The refusals are the substance
// ------------------------------
// Thirty evals clear the interval. Only some of those may drop a gate, and the
// three cuts are mechanical rather than judgement:
//
//   - `sharedExpanded` non-empty: the harness inlined `_shared` contracts into
//     the actor's prompt, so the agent was handed something it may never fetch
//     on a live run. On 2026-08-07 architect did not fetch the one whose command
//     sat verbatim in its own file. An eval that inlines the handoff measures an
//     agent that does not exist.
//   - `actorSource` not `agent:<name>`: the generic actor measures the eval, not
//     the agent.
//   - Class A: `devops` and `infra-provisioner` both clear the interval today —
//     devops at 82%, [72%, 89%], n=77 — and both stay gated. The question at a
//     production deploy is not competence (ADR-009). A tier that cannot refuse
//     those two is not a tier, it is a rubber stamp.
//
// Each refusal names itself. "Inconclusive" and "fixture-inlined" are different
// work: one needs more samples, the other needs the eval rewritten.

/**
 * Agents whose gate never drops, whatever the evidence says.
 *
 * The same list `pipeline-tick` refuses to dispatch unattended, and for the same
 * reason: a gate is configuration, and this is not. An operation that escapes
 * the machine, costs money, or cannot be undone needs a human in the loop, and
 * "it scored well" is not the same as "a human decided".
 */
export const CLASS_A = Object.freeze(['devops', 'infra-provisioner']);

/** The run shape a tier decision may be based on. Anything else is not evidence. */
export const REQUIRED_SPLIT = 'holdout';
export const REQUIRED_SAMPLES = 3;

/**
 * The newest qualifying row per eval, for one agent.
 *
 * Newest rather than best: an agent that improved and then regressed is at its
 * regression, and picking the best row would be choosing the evidence to suit
 * the conclusion.
 */
export function evidenceFor(agent, rows = []) {
  const mine = rows.filter((r) =>
    r?.agent === agent &&
    r.split === REQUIRED_SPLIT &&
    Number(r.samples || 1) === REQUIRED_SAMPLES &&
    !r.dropout?.severe);

  const newest = new Map();
  for (const r of mine) {
    const prev = newest.get(r.eval);
    if (!prev || String(r.run_id || '') >= String(prev.run_id || '')) newest.set(r.eval, r);
  }
  return [...newest.values()];
}

/**
 * May this agent's gate drop to notify-only?
 *
 * @returns {{tier:'gated'|'notify', why:string, evals:number}}
 */
export function tierFor(agent, { rows = [], classA = CLASS_A } = {}) {
  if (classA.includes(agent)) {
    return { tier: 'gated', evals: 0, why: 'Class A — the question at a production deploy is not competence (ADR-009), so no score drops this gate' };
  }

  const ev = evidenceFor(agent, rows);
  if (!ev.length) {
    return { tier: 'gated', evals: 0, why: `no holdout run at ${REQUIRED_SAMPLES} samples — unmeasured, which is not the same as failing` };
  }

  // Every eval bound to this agent must clear. An agent that passes one of its
  // three evals has not shown it can be left alone; it has shown one thing it
  // can do.
  const failing = ev.filter((r) => r.power?.status !== 'passed');
  if (failing.length) {
    const kinds = [...new Set(failing.map((r) => r.power?.status ?? 'unknown'))].join(', ');
    return { tier: 'gated', evals: ev.length, why: `${failing.length} of ${ev.length} eval(s) not conclusively passed (${kinds}) — the interval, not the point` };
  }

  const inlined = ev.filter((r) => (r.sharedExpanded || []).length);
  if (inlined.length) {
    const names = [...new Set(inlined.flatMap((r) => r.sharedExpanded))].slice(0, 3).join(', ');
    return { tier: 'gated', evals: ev.length, why: `the fixture inlined ${names} — this measures an agent that was handed contracts it may never fetch, not the handoff` };
  }

  const generic = ev.filter((r) => !String(r.actorSource || '').startsWith('agent:'));
  if (generic.length) {
    return { tier: 'gated', evals: ev.length, why: 'ran against the generic actor — that measures the eval, not this agent\'s prompt' };
  }

  return {
    tier: 'notify',
    evals: ev.length,
    why: `${ev.length} eval(s) conclusively passed at ${REQUIRED_SPLIT}×${REQUIRED_SAMPLES}, none fixture-inlined`,
  };
}

/** Every agent that appears in the evidence, tiered. */
export function tierAll(rows = [], opts = {}) {
  const agents = [...new Set(rows.map((r) => r?.agent).filter(Boolean))].sort();
  return agents.map((a) => ({ agent: a, ...tierFor(a, { rows, ...opts }) }));
}

// ── CLI ─────────────────────────────────────────────────────────────────────
//
// Prints who qualifies and, for everyone else, the specific reason — because
// "inconclusive" and "fixture-inlined" are different work.

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const HISTORY = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tests', 'eval', 'results-history.jsonl');
  if (!existsSync(HISTORY)) { console.log('gate-tier: no results-history.jsonl — nothing measured.'); process.exit(0); }

  const rows = [];
  for (const line of readFileSync(HISTORY, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip */ }
  }

  const all = tierAll(rows);
  const notify = all.filter((a) => a.tier === 'notify');

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(all, null, 2));
  } else {
    console.log(`gate-tier: ${notify.length} of ${all.length} agent(s) have evidence to drop to notify-only\n`);
    for (const a of notify) console.log(`  notify  ${a.agent.padEnd(28)} ${a.why}`);
    console.log('');
    for (const a of all.filter((x) => x.tier === 'gated')) console.log(`  gated   ${a.agent.padEnd(28)} ${a.why}`);
  }
}
