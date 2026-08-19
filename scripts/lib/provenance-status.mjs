// One vocabulary for "where did this claim come from?".
//
// `proof-status.mjs` is the sibling of this file and answers a different
// question: did a CHECK actually prove anything. It exists because four parts of
// this codebase said "we did not measure" in four dialects, so nothing could
// aggregate them. The discovery side had no equivalent at all.
//
// The defect it closes, in the words of a real brief in this repository:
//
//     22 projects × ~3 opens/day ≈ 66 context-switches a day
//
// The `~3` came from nowhere. The rule at the time asked the author to SHOW THE
// ARITHMETIC, and this shows it: a plausible multiplier times a plausible
// multiplier, with visible working and no provenance. Two sentences down the same
// document says `2 of ~20 readers`, which was counted. Both render identically,
// and a reader cannot tell which is which — which is the same failure as a zero
// that might be an unread file, one floor up.
//
// The ladder, weakest to strongest. It is ORDERED on purpose: a downstream gate
// asks "is this at least CITED?" rather than enumerating acceptable values, so a
// level added later does not silently fall out of every comparison.
//
// ASSERTED  — someone believes it. The DEFAULT when nothing is stated, and it is
//             stated out loud rather than left blank: an unlabelled claim is an
//             assertion, and the whole point is that it looks like one.
// DERIVED   — follows by calculation from inputs that each carry their own
//             provenance. A derivation is only as strong as its weakest input,
//             which `weakest()` computes rather than trusting the author's
//             summary of their own arithmetic.
// CITED     — read somewhere outside this room: a report, a vendor page, a
//             competitor's docs. Needs a locator and a date, because a citation
//             nobody can re-open is an assertion with a URL next to it.
// OBSERVED  — data about real people doing real things: interviews, logs, a
//             survey. Needs `n`, because "users told us" is three people or three
//             thousand and the word is identical.
// MEASURED  — an experiment or a production metric: A/B, a shipped feature's
//             numbers. Needs `n`, a method and a window.
//
// Vocabulary and discipline after ICD 203 §D.6.e.(3) (ODNI, public domain), which
// requires an analytic product to separate underlying information from the
// analyst's assumptions and judgments, and to say what follows if an assumption
// is wrong. The names here are ours; the requirement is theirs.

export const PROVENANCE = Object.freeze({
  ASSERTED: 'asserted',
  DERIVED: 'derived',
  CITED: 'cited',
  OBSERVED: 'observed',
  MEASURED: 'measured',
});

/** Weakest to strongest. Index IS the strength — compare by rank, never by name. */
export const PROVENANCE_ORDER = Object.freeze([
  PROVENANCE.ASSERTED,
  PROVENANCE.DERIVED,
  PROVENANCE.CITED,
  PROVENANCE.OBSERVED,
  PROVENANCE.MEASURED,
]);

/** What each level must carry to be that level. Absent evidence downgrades it. */
export const REQUIRED_FIELDS = Object.freeze({
  [PROVENANCE.ASSERTED]: [],
  [PROVENANCE.DERIVED]: ['inputs'],
  [PROVENANCE.CITED]: ['locator', 'date'],
  [PROVENANCE.OBSERVED]: ['locator', 'n'],
  [PROVENANCE.MEASURED]: ['locator', 'n', 'method'],
});

export function isProvenance(s) {
  return typeof s === 'string' && PROVENANCE_ORDER.includes(s);
}

export function assertProvenance(s, where = 'provenance') {
  if (!isProvenance(s)) {
    throw new TypeError(`${where}: expected one of ${PROVENANCE_ORDER.join('|')}, got ${JSON.stringify(s)}`);
  }
  return s;
}

/** Strength as a number. Unknown input is ASSERTED — never better than the floor. */
export function rank(s) {
  const i = PROVENANCE_ORDER.indexOf(s);
  return i < 0 ? 0 : i;
}

/** Is `s` at least as strong as `min`? The only comparison callers should need. */
export function atLeast(s, min) {
  assertProvenance(min, 'minimum provenance');
  return rank(s) >= rank(min);
}

/**
 * The weakest link among inputs — what a DERIVED claim is actually worth.
 *
 * A derivation cannot be stronger than what it multiplies. `22 projects` may be
 * counted and `~3 opens/day` invented; the product of the two is invented, and
 * saying so is the entire job of this function. Empty inputs are ASSERTED: a
 * derivation from nothing is a belief with an equals sign.
 */
export function weakest(levels = []) {
  if (!levels.length) return PROVENANCE.ASSERTED;
  return levels.reduce((lo, s) => (rank(s) < rank(lo) ? (isProvenance(s) ? s : PROVENANCE.ASSERTED) : lo),
    PROVENANCE.MEASURED);
}

/**
 * The level a claim has EARNED, which may be below the level it declares.
 *
 * Self-report is the thing this module exists not to trust. A claim tagged
 * `measured` with no n is an assertion wearing the word, and it downgrades to
 * the strongest level whose evidence it actually carries.
 *
 * @param {{level:string, locator?:string, date?:string, n?:number, method?:string,
 *          inputs?:string[]}} claim
 * @returns {{level:string, declared:string, downgraded:boolean, missing:string[], why:string}}
 */
export function settle(claim = {}) {
  const declared = isProvenance(claim.level) ? claim.level : PROVENANCE.ASSERTED;

  const has = (f) => {
    if (f === 'n') return Number.isFinite(claim.n) && claim.n > 0;
    if (f === 'inputs') return Array.isArray(claim.inputs) && claim.inputs.length > 0;
    return typeof claim[f] === 'string' && claim[f].trim().length > 0;
  };

  // Walk down from the declared level to the first one whose evidence is present.
  let level = declared;
  let missing = REQUIRED_FIELDS[level].filter((f) => !has(f));
  while (missing.length && rank(level) > 0) {
    level = PROVENANCE_ORDER[rank(level) - 1];
    missing = REQUIRED_FIELDS[level].filter((f) => !has(f));
  }

  // A derivation is capped by its weakest input, whatever its own fields say.
  if (level === PROVENANCE.DERIVED && Array.isArray(claim.inputs)) {
    const cap = weakest(claim.inputs);
    if (rank(cap) < rank(level)) level = cap;
  }

  const downgraded = level !== declared;
  const shortfall = REQUIRED_FIELDS[declared].filter((f) => !has(f));
  return {
    level,
    declared,
    downgraded,
    missing: shortfall,
    why: downgraded
      ? `claims ${declared} without ${shortfall.join(', ') || 'stronger inputs'} — settled at ${level}`
      : `${level}, with everything ${level} requires`,
  };
}

/**
 * Does this claim carry enough to put a number in front of a decision-maker?
 *
 * CITED is the floor, not OBSERVED: a competitor's published pricing is a fact
 * about the world even though nobody here watched a user. Below it the figure is
 * the author's belief, and belief may be written — it may not be presented as a
 * measurement.
 */
export function carriesAFigure(claim) {
  return atLeast(settle(claim).level, PROVENANCE.CITED);
}

/** One line for a report. Never renders ASSERTED as though it were evidence. */
export function describe(claim) {
  const s = settle(claim);
  const tag = s.level === PROVENANCE.ASSERTED ? 'ASSUMPTION' : s.level.toUpperCase();
  return s.downgraded ? `${tag} (${s.why})` : tag;
}
