// Whether to retry depends on what the failed attempt already DID.
//
// `provider-exhaustion.mjs` classifies a failure on one axis: could waiting or
// retrying change the answer? 429 resolves, 402 does not. That axis is correct
// and it is not sufficient, which is the one idea worth taking from
// `cosmicstack-labs/mercury-agent` — a repository whose own numbers say it is
// winding down, and which got this one thing right.
//
// The missing axis is what the attempt already did before it died. An agent that
// failed *after* writing `docs/architecture/ARCH-x.md` but *before* recording its
// verdict is not in the same position as one that failed on its first token, even
// when the provider error is byte-identical. Re-dispatching the first produces a
// second architecture document, and nothing downstream can tell that from a clean
// first run.
//
// So there is a third answer beside "retry" and "give up": **the state is
// ambiguous and someone has to look**. Not a success, not a retryable failure.
//
// Fail-closed on the question itself: when we cannot establish whether an effect
// happened, we act as though it did. The cost of a wrong "no effects" is a
// duplicate artefact nobody knows is duplicate; the cost of a wrong "effects" is
// a human glancing at a directory.

/**
 * What one attempt is known to have done.
 *
 * Every field is `true | false | null`, and `null` means "could not establish" —
 * deliberately distinct from `false`. Two states here would collapse "it did not
 * happen" into "we did not check", which is the failure this module exists to
 * prevent one level up.
 *
 * @typedef {{
 *   wroteArtefacts: boolean|null,   // docs/, ADRs, plans — durable output
 *   recordedVerdict: boolean|null,  // a line in .great_cto/verdicts/<agent>.log
 *   deliveredOutput: boolean|null,  // a human or the board already saw it
 * }} AttemptEffects
 */

export const UNKNOWN_EFFECTS = Object.freeze({
  wroteArtefacts: null, recordedVerdict: null, deliveredOutput: null,
});

/** The fields that make a re-run unsafe, in the order they are reported. */
const EFFECT_FIELDS = Object.freeze([
  ['recordedVerdict', 'it already recorded a verdict, and a second run would record a second one'],
  ['wroteArtefacts', 'it already wrote durable artefacts, and a second run would produce duplicates beside them'],
  ['deliveredOutput', 'its output already reached a reader, and a second answer would contradict the first'],
]);

/**
 * Did this attempt leave anything behind, and do we actually know?
 *
 * @param {AttemptEffects} effects
 * @returns {{state:'none'|'some'|'unknown', why:string, fields:string[]}}
 */
export function summariseEffects(effects = UNKNOWN_EFFECTS) {
  const present = [];
  const unknown = [];
  for (const [field, why] of EFFECT_FIELDS) {
    const v = effects?.[field];
    if (v === true) present.push({ field, why });
    else if (v !== false) unknown.push(field);
  }
  if (present.length) {
    return { state: 'some', why: present[0].why, fields: present.map((p) => p.field) };
  }
  if (unknown.length) {
    return {
      state: 'unknown',
      why: `cannot establish whether the attempt left anything behind (${unknown.join(', ')}) — treated as though it did`,
      fields: unknown,
    };
  }
  return { state: 'none', why: 'the attempt left nothing behind', fields: [] };
}

/**
 * What to do after a failed attempt.
 *
 * The effects axis is checked FIRST and wins. A transient error is only a reason
 * to retry when retrying cannot duplicate work — and whether it can is a fact
 * about the attempt, not about the error.
 *
 * @param {{classification?: {terminal?: boolean, kind?: string, why?: string}, effects?: AttemptEffects, autoContinues?: number, maxAutoContinues?: number}} o
 * @returns {{action:'retry-same'|'failover'|'stop-terminal'|'stop-ambiguous', why:string, effects:string}}
 */
export function decideRetry({ classification = null, effects = UNKNOWN_EFFECTS, autoContinues = 0, maxAutoContinues = 2 } = {}) {
  const eff = summariseEffects(effects);

  if (eff.state !== 'none') {
    return {
      action: 'stop-ambiguous',
      effects: eff.state,
      why: `${eff.why}. Neither succeeded nor safely retryable — the state has to be looked at before anything continues.`,
    };
  }

  // Nothing was left behind, so a retry is safe. Now the existing axis decides
  // whether it is useful.
  if (classification?.terminal) {
    return {
      action: 'stop-terminal',
      effects: 'none',
      why: classification.why || `${classification.kind || 'terminal'} — retrying cannot change the answer`,
    };
  }

  // A bounded number of silent continuations, then a human. An unbounded retry
  // loop that leaves nothing behind is not dangerous, but it is indistinguishable
  // from progress, and something has to end it.
  if (autoContinues >= maxAutoContinues) {
    return {
      action: 'stop-ambiguous',
      effects: 'none',
      why: `${autoContinues} automatic continuations already — stopping rather than looping, so a person decides whether this is worth another attempt`,
    };
  }

  if (classification?.kind === 'rate-limit') {
    return { action: 'retry-same', effects: 'none', why: 'rate limited and nothing was left behind — the same provider will answer once it lets us' };
  }
  return {
    action: 'failover',
    effects: 'none',
    why: classification?.why
      ? `${classification.why} — and nothing was left behind, so another provider may answer`
      : 'nothing was left behind, so another provider may answer',
  };
}

/**
 * Observe the effects of a run from the project on disk.
 *
 * Injectable rather than doing its own IO checks inline, so a caller can supply
 * what it already knows. Anything it cannot determine stays `null`, which
 * `decideRetry` treats as present.
 *
 * @param {{verdictSeenAt?: number|null, since?: number|null, changedPaths?: string[]|null, delivered?: boolean|null}} o
 */
export function observeEffects({ verdictSeenAt = null, since = null, changedPaths = null, delivered = null } = {}) {
  // A verdict newer than the attempt started is a verdict this attempt wrote.
  // Without `since` we cannot tell whose it is, so we do not claim to know.
  const recordedVerdict = (verdictSeenAt === null || since === null)
    ? null
    : verdictSeenAt >= since;

  const DURABLE = /^(docs\/|\.great_cto\/verdicts\/|skills\/|agents\/|shared\/)/;
  const wroteArtefacts = changedPaths === null
    ? null
    : changedPaths.some((p) => DURABLE.test(String(p)));

  return { wroteArtefacts, recordedVerdict, deliveredOutput: delivered };
}

/** One line for a human, naming the action and the reason it was chosen. */
export function describeRetry(d) {
  if (!d) return '';
  const label = {
    'retry-same': 'RETRY (same provider)',
    failover: 'FAILOVER (another provider)',
    'stop-terminal': 'STOP — retrying cannot help',
    'stop-ambiguous': 'STOP — state ambiguous, needs a look',
  }[d.action] || d.action;
  return `${label}: ${d.why}`;
}
