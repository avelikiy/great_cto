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
 * The eval count above which the evidence is at least plural.
 *
 * Found by reading our own output rather than the code: of the fifteen agents
 * whose gate stands down today, FOURTEEN qualified on a single eval file. One
 * file is roughly six holdout cases at three samples — about eighteen trials —
 * and that was the entire basis for deciding a human need not be asked.
 *
 * The statistics were never wrong. `power.status === 'passed'` means the
 * interval clears the bar ON THE CASES THAT EXIST, and it says nothing about
 * whether those cases span what the agent is responsible for. `insurance-
 * reviewer` answers for NAIC, IFRS 17, Solvency II, ACORD and actuarial
 * auditability; one passing eval dropped its gate for all of it.
 *
 * So this threshold does NOT measure coverage — nothing here can, and claiming
 * otherwise would be the same defect one layer up. It marks the case where
 * coverage is UNMEASURED, so that a narrow result stops reading exactly like a
 * broad one.
 */
export const BROAD_EVALS = 2;

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
 * Three answers, not two — the same rule this repository applies everywhere
 * else. `notify` is a stand-down on plural evidence; `notify-thin` is a
 * stand-down on ONE eval, where the statistics are sound and the coverage is
 * simply unmeasured. Collapsing the two would put "we checked one thing and it
 * was fine" and "we checked broadly and it was fine" behind one word, which is
 * how an absent measurement comes to wear a result's clothes.
 *
 * `notify-thin` is a real tier, not a warning label: whether it stands down or
 * keeps its gate is the CALLER's decision (see `notifyOnlyAgents`), because
 * that is a policy about risk appetite and this is a fact about evidence.
 *
 * @returns {{tier:'gated'|'notify'|'notify-thin', why:string, evals:number}}
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

  const passed = `${ev.length} eval(s) conclusively passed at ${REQUIRED_SPLIT}×${REQUIRED_SAMPLES}, none fixture-inlined`;

  if (ev.length < BROAD_EVALS) {
    return {
      tier: 'notify-thin',
      evals: ev.length,
      why: `${passed} — but on a single eval, so how much of this agent's responsibility was exercised is unmeasured, not broad`,
    };
  }

  return { tier: 'notify', evals: ev.length, why: passed };
}

/** Every agent that appears in the evidence, tiered. */
export function tierAll(rows = [], opts = {}) {
  const agents = [...new Set(rows.map((r) => r?.agent).filter(Boolean))].sort();
  return agents.map((a) => ({ agent: a, ...tierFor(a, { rows, ...opts }) }));
}


/**
 * The agents whose gate may stand down, as a Set the pipeline can consult.
 *
 * OFF unless the project asks for it. Tiering changes when a human is asked to
 * decide, and shipping that on by default would change behaviour for every
 * project that never saw the evidence — the ADR-009 "crosses a project
 * boundary" case. A project opts in with `gate-tiering: evidence` in its
 * PROJECT.md.
 *
 * Derived at read time, never a list. A stored list of blessed agents is a
 * snapshot that rots silently: an agent that regresses keeps its pass until
 * someone remembers to revoke it, which is `ARCHITECTURE.md` saying "34 agents"
 * for three months. Computed from the history, a regression restores the gate on
 * the next measurement without anybody acting.
 */
export function notifyOnlyAgents(rows = [], { enabled = false, classA = CLASS_A, thin = 'notify' } = {}) {
  if (!enabled) return new Set();
  const stands = thin === 'gated' ? ['notify'] : ['notify', 'notify-thin'];
  return new Set(tierAll(rows, { classA }).filter((a) => stands.includes(a.tier)).map((a) => a.agent));
}

/**
 * How much evidence this project wants before a gate stops asking.
 *
 *   off             — every gate stands. The default, and what a project that
 *                     never saw the evidence gets.
 *   evidence        — a conclusive holdout stands a gate down, including on a
 *                     single eval. What `gate-tiering: evidence` has meant
 *                     since it shipped; unchanged, so no project's behaviour
 *                     moves under it without the owner asking.
 *   evidence-broad  — the same, except a single-eval pass (`notify-thin`) keeps
 *                     its gate. Costs fourteen of today's fifteen stand-downs
 *                     on this repository; buys not treating one eval as breadth.
 *
 * Anything unrecognised is `off`. A misspelt mode must not be read as the more
 * permissive one — the failure of a mis-read here is a gate that quietly
 * stopped asking.
 */
export function tieringMode(projectMdText) {
  const m = String(projectMdText ?? '').match(/^\s*gate-tiering:\s*(evidence-broad|evidence)\s*$/mi);
  return m ? m[1].toLowerCase() : 'off';
}

/** Does this project want evidence-based tiering at all? Default: no. */
export function tieringEnabled(projectMdText) {
  return tieringMode(projectMdText) !== 'off';
}


/**
 * The notify-only set for a project, assembled from its own opt-in and the
 * measured history. One place, so callers cannot each get it subtly wrong.
 *
 * Fails closed: any problem reading either file leaves every gate standing. The
 * failure mode of a mis-read here is a gate that quietly stops asking, and that
 * is the one outcome this must never produce by accident.
 */
export async function notifyOnlyForProject(cwd = process.cwd()) {
  try {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const projectMd = join(cwd, '.great_cto', 'PROJECT.md');
    if (!existsSync(projectMd)) return new Set();
    const mode = tieringMode(readFileSync(projectMd, 'utf8'));
    if (mode === 'off') return new Set();

    const history = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tests', 'eval', 'results-history.jsonl');
    if (!existsSync(history)) return new Set();

    const rows = [];
    for (const line of readFileSync(history, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { rows.push(JSON.parse(line)); } catch { /* a bad row is not evidence */ }
    }
    return notifyOnlyAgents(rows, { enabled: true, thin: mode === 'evidence-broad' ? 'gated' : 'notify' });
  } catch {
    return new Set();   // fail closed — every gate stands
  }
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
  const thin = all.filter((a) => a.tier === 'notify-thin');

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(all, null, 2));
  } else {
    const projectMd = join(process.cwd(), '.great_cto', 'PROJECT.md');
    const mode = existsSync(projectMd) ? tieringMode(readFileSync(projectMd, 'utf8')) : 'off';

    console.log(`gate-tier: ${notify.length} broad, ${thin.length} thin, ${all.length - notify.length - thin.length} gated — of ${all.length} agent(s)`);
    console.log(`  this project: gate-tiering: ${mode}${mode === 'evidence' ? '  (thin stands down too — `evidence-broad` would keep those gates)' : ''}\n`);

    for (const a of notify) console.log(`  notify      ${a.agent.padEnd(28)} ${a.why}`);
    if (notify.length) console.log('');
    for (const a of thin) console.log(`  notify-thin ${a.agent.padEnd(28)} ${a.why}`);
    if (thin.length) console.log('');
    for (const a of all.filter((x) => x.tier === 'gated')) console.log(`  gated       ${a.agent.padEnd(28)} ${a.why}`);
  }
}
