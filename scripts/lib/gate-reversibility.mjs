/**
 * gate-reversibility — how expensive is this gate to get wrong?
 *
 * ADR-009 says gates follow cost-of-undo, not pipeline position. The pipeline
 * obeys that: `product` joined the default set precisely because it is the most
 * expensive decision to reverse. But every gate the board draws renders the same
 * — one purple chip, `--status-gate` — so `gate:ship` to production and a brief
 * approval look identical at the moment somebody clicks.
 *
 * The doctrine exists in the ADR and in the map. It has never reached the pixel
 * where the decision is actually taken.
 *
 * NOTHING here decides anything. It classifies, so the surface can weight what it
 * shows. A gate is still a human's call; this only stops the expensive one from
 * looking like the cheap one.
 */

/**
 * ADR-009's four categories, verbatim in meaning, plus one this project already
 * argues for in `approval-level.mjs` — recorded as its own thing rather than
 * quietly widening the ADR.
 */
export const CATEGORIES = Object.freeze({
  'escapes-the-machine': 'published to a registry, pushed to a shared remote, or deployed where users can reach it',
  'crosses-a-boundary': 'writes global state that other projects\' agents read',
  'costs-money': 'provisioned infrastructure or paid API capacity',
  'destroys-evidence': 'force-push, history rewrite, log truncation, or overwriting data a reviewer would need',
  // Not one of ADR-009's four. It is the argument `approval-level.mjs` already
  // makes for putting `product` in the default set: "you learn it was wrong only
  // after architect, pm, senior-dev, qa, security and devops have all run".
  // Different currency — sunk work rather than an external effect — so it is
  // named separately instead of being folded in.
  'sunk-work': 'reversing it means redoing every stage that ran after it',
  // Also not one of ADR-009's four, and added for `agent-posture.mjs`, which
  // reuses this vocabulary rather than inventing a second one for the same axis.
  // A leaked credential is not undone by reverting anything: a key that reached
  // 605 transcripts stayed valid until it was revoked, and revocation was the
  // only fix. Distinct currency again — so, named, not folded in.
  'unrevocable-disclosure': 'a secret that has been read cannot be un-read; only revocation ends it',
});

/**
 * What each gate in `shared/pipeline.toml` actually guards.
 *
 * Every entry cites the thing that makes it expensive, so a reader can disagree
 * with a specific claim rather than with a verdict.
 */
const GATE_COST = Object.freeze({
  ship: {
    categories: ['escapes-the-machine', 'costs-money'],
    why: 'guards the transition into devops and infra-provisioner — the two stages `gate-tier.mjs` already names CLASS_A and `pipeline-tick` refuses to dispatch unattended',
  },
  import: {
    categories: ['destroys-evidence'],
    why: 'guards migration-import-engineer; the map\'s own comment: an approval level "is not permission to overwrite a client\'s data unattended"',
  },
  product: {
    categories: ['sunk-work'],
    why: 'the WHAT decision — approval-level.mjs put it in the default set for exactly this reason',
  },
  compliance: {
    categories: ['escapes-the-machine'],
    why: 'sits beside gate:ship on the security-officer edge; a compliance miss reaches users with the release',
  },

  // Cheap to undo: the repair is to run the stage again. Listed explicitly rather
  // than left to the default, so that `routine` means "someone judged this" and
  // not "the classifier had never heard of it".
  arch:     { categories: [], why: 'the repair is to redo the architecture stage' },
  plan:     { categories: [], why: 'the repair is to redo the decomposition' },
  code:     { categories: [], why: 'the repair is another review round' },
  qa:       { categories: [], why: 'the repair is another test round' },
  security: { categories: [], why: 'the repair is another audit round' },
});

// Lowercased and prefix-stripped case-insensitively: the name comes out of a bead
// TITLE a person typed, so `gate:Ship` and `gate:ship` are the same gate. Before
// this, the capitalised one fell through to `unclassified` — which is the safe
// direction to fail, but it is still a wrong answer about a gate we do know.
const bare = (g) => String(g ?? '').trim().replace(/^gate:/i, '').toLowerCase();

/**
 * @returns {{state:'expensive'|'routine'|'unclassified', gate:string,
 *            categories:string[], why:string}}
 *
 * THREE states. `unclassified` is the one that earns its keep: a gate this table
 * has never heard of — a new one, a project-specific one — must not inherit the
 * cheap treatment by default. The whole defect this repository chases is a thing
 * that was never judged looking like a thing that was judged and passed.
 */
export function reversibilityOf(gate) {
  const key = bare(gate);
  if (!key) {
    return { state: 'unclassified', gate: '', categories: [], why: 'no gate given' };
  }
  const hit = GATE_COST[key];
  if (!hit) {
    return {
      state: 'unclassified', gate: key, categories: [],
      why: `not in the cost table — treat as unjudged, not as cheap. Add it to gate-reversibility.mjs with a reason.`,
    };
  }
  return {
    state: hit.categories.length ? 'expensive' : 'routine',
    gate: key,
    categories: [...hit.categories],
    why: hit.why,
  };
}

/** One line for a human deciding, in their words. */
export function describeReversibility(r) {
  if (r.state === 'expensive') {
    const names = r.categories.map((c) => CATEGORIES[c]).filter(Boolean);
    return `expensive to undo — ${names.join('; ')}`;
  }
  if (r.state === 'routine') return `routine — ${r.why}`;
  return `not classified — ${r.why}`;
}

/** Every gate the table knows, for a surface that wants to render a legend. */
export function knownGates() {
  return Object.keys(GATE_COST).sort();
}
