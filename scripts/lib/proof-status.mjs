// One vocabulary for "did this check actually prove anything?".
//
// The same idea was implemented four times in this codebase, each with its own
// shape: the quality oracle returns `overall: null` plus an `unmeasured` string,
// the board readers return `{ok:false, reason:'unreadable'}`, product-eval sets
// `tests.ran = false` with a reason, and the QA report prints the literal string
// `mutation: not configured`. All four say the same thing in four dialects, so
// nothing can aggregate them and every new caller invents a fifth.
//
// The enum is the point. "Report honestly" is a convention someone eventually
// forgets; a closed set of four values is a constraint — there is no optimistic
// fifth status to reach for, and `assertStatus` rejects one loudly rather than
// letting it through as a plausible-looking string.
//
// PASSED       — the check ran and the thing it checks is true.
// FAILED       — the check ran and the thing it checks is false. A real result.
// NOT_RUN      — the check never executed: no tool, no config, skipped, crashed
//                before producing output. Says nothing about the subject.
// INCONCLUSIVE — the check ran but its output does not settle the question: a
//                partial run, an unparsable summary, a timeout mid-way, a signal
//                inside the noise band. The distinction from NOT_RUN matters:
//                effort was spent and the answer is still unknown, which is a
//                different thing to report and often a different thing to fix.
//
// Neither NOT_RUN nor INCONCLUSIVE may be rendered as success. That is the whole
// rule, and it is enforced by `isProven` rather than left to each caller's mood.

export const PROOF = Object.freeze({
  PASSED: 'passed',
  FAILED: 'failed',
  NOT_RUN: 'not_run',
  INCONCLUSIVE: 'inconclusive',
});

export const PROOF_VALUES = Object.freeze(Object.values(PROOF));

/** True only for a status this module recognises. */
export function isProofStatus(s) {
  return PROOF_VALUES.includes(s);
}

/**
 * Throw on an unrecognised status. Use at boundaries where a status arrives from
 * elsewhere (a parsed report, a subagent's JSON) — an invented status must fail
 * loudly, not flow onward looking plausible.
 */
export function assertStatus(s, where = 'proof status') {
  if (!isProofStatus(s)) {
    throw new TypeError(
      `${where}: "${s}" is not a proof status. Use one of: ${PROOF_VALUES.join(', ')}. ` +
      'If the check did not run, that is not_run; if it ran and settled nothing, that is inconclusive.',
    );
  }
  return s;
}

/**
 * Did this check actually establish that the subject is good?
 * ONLY `passed` does. Absence of evidence is not evidence — the defect this
 * whole module exists to prevent.
 */
export function isProven(s) {
  return s === PROOF.PASSED;
}

/** Was a verdict about the subject reached at all (either way)? */
export function isMeasured(s) {
  return s === PROOF.PASSED || s === PROOF.FAILED;
}

/**
 * Should this block a gate? Everything that is not a pass blocks, including the
 * two "we don't know" statuses — a gate exists to require evidence, and "no
 * evidence" is precisely the case it must not wave through.
 */
export function blocksGate(s) {
  return !isProven(s);
}

/**
 * Map a legacy shape onto the enum, so existing call sites can be migrated
 * without rewriting their internals at the same time.
 *
 * @param {{ran?: boolean, ok?: boolean, passed?: number, total?: number,
 *          failed?: number, reason?: string|null, partial?: boolean}} r
 */
export function fromLegacy(r = {}) {
  if (r.reason === 'missing') return PROOF.NOT_RUN;          // board reader: no file is not a failure
  if (r.reason === 'unreadable' || r.reason === 'unparsable') return PROOF.INCONCLUSIVE;
  if (r.ran === false || r.ok === false) return PROOF.NOT_RUN;
  if (r.partial) return PROOF.INCONCLUSIVE;                   // a truncated run settles nothing
  if (typeof r.total === 'number' && r.total > 0) {
    return (r.failed ?? 0) > 0 ? PROOF.FAILED : PROOF.PASSED;
  }
  // Ran, but produced no countable result — effort spent, question open.
  return r.ran === true ? PROOF.INCONCLUSIVE : PROOF.NOT_RUN;
}

/** One-line human rendering. Never dresses an unknown as a pass. */
export function describe(s, detail = '') {
  const base = {
    [PROOF.PASSED]: '✓ passed',
    [PROOF.FAILED]: '✗ failed',
    [PROOF.NOT_RUN]: '— not run (no result; this is not a pass)',
    [PROOF.INCONCLUSIVE]: '? inconclusive (ran, but settles nothing)',
  }[s] ?? `! unknown status "${s}"`;
  return detail ? `${base} — ${detail}` : base;
}
