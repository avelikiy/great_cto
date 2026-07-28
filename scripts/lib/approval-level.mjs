// Which gates stop the human, for a given approval-level.
//
// The pipeline already chains itself: shared/pipeline.toml holds the transition
// map and pipeline-dispatcher.mjs injects the next agent after each verdict. The
// only question left is where it should PAUSE — and the existing levels could not
// express the one an operator most often wants: "ask me about the product, decide
// the technical parts yourself".
//
// `gates-only` (the default) stops at `arch` — an architectural question — and
// never at `product`. `auto` asks nothing at all, including what to build. So the
// operator had to either review architecture they did not want to review, or run
// with no human decision anywhere. `product-only` closes that: the two gates it
// keeps are exactly the two ADR-009 calls expensive to undo — choosing what to
// build (a wrong answer wastes the entire build) and shipping it (it escapes the
// machine and reaches users).
//
// This is a pure function on purpose. The rule used to live as prose in every
// agent's prompt, re-derived each time; one testable definition means the agents
// agree by construction.

/** Gate sets per level, in pipeline order. */
const LEVEL_GATES = Object.freeze({
  auto:            [],
  'product-only':  ['product', 'ship'],
  'gates-only':    ['arch', 'ship'],
  strict:          ['arch', 'code', 'ship'],
  expert:          ['product', 'arch', 'plan', 'code', 'qa', 'security', 'ship'],
  'step-by-step':  ['product', 'arch', 'plan', 'code', 'qa', 'security', 'ship'],
});

export const APPROVAL_LEVELS = Object.freeze(Object.keys(LEVEL_GATES));
export const DEFAULT_LEVEL = 'gates-only';

/**
 * Archetypes where a compliance/security sign-off is not the operator's to skip.
 * SKILL.md already states these carry a `strict` minimum; encoding it here means
 * a new level cannot become a bypass by omission.
 */
const REGULATED = new Set([
  'ai-system', 'agent-product', 'commerce', 'web3', 'iot-embedded', 'regulated',
  'fintech', 'healthcare', 'insurance', 'legal', 'gov-public', 'defense-govcon',
]);
const REGULATED_FLOOR = ['security', 'compliance'];

export function isRegulated(archetype) {
  return REGULATED.has(String(archetype || '').toLowerCase());
}

/**
 * The gates that must stop a human for this level.
 *
 * @param {string} level
 * @param {{archetype?: string}} [opts]
 * @returns {string[]} gate names, pipeline order, deduped
 */
export function gatesForApprovalLevel(level, { archetype } = {}) {
  // An unrecognised or missing level falls back to the default rather than to
  // "no gates": a typo in PROJECT.md must not silently disable human review.
  const key = LEVEL_GATES[level] ? level : DEFAULT_LEVEL;
  const base = [...LEVEL_GATES[key]];

  if (isRegulated(archetype)) {
    for (const g of REGULATED_FLOOR) if (!base.includes(g)) base.push(g);
    if (!base.includes('ship')) base.push('ship');
  }

  const order = ['product', 'arch', 'plan', 'code', 'qa', 'security', 'compliance', 'ship'];
  return [...new Set(base)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** Should this specific gate pause the human under this level? */
export function gateApplies(gate, level, opts) {
  return gatesForApprovalLevel(level, opts).includes(String(gate).replace(/^gate:/, ''));
}

/** Read the level out of a PROJECT.md body. Missing → the default. */
export function levelFromProjectMd(text = '') {
  const m = String(text).match(/^approval-level:\s*(\S+)/m);
  const raw = m ? m[1].trim() : DEFAULT_LEVEL;
  return LEVEL_GATES[raw] ? raw : DEFAULT_LEVEL;
}

/** One-line explanation for an operator asking why they were (not) asked. */
export function describeLevel(level, opts) {
  const gates = gatesForApprovalLevel(level, opts);
  const key = LEVEL_GATES[level] ? level : `${level} (unknown → ${DEFAULT_LEVEL})`;
  return gates.length
    ? `${key}: pauses at ${gates.map((g) => `gate:${g}`).join(', ')}`
    : `${key}: no human gates — fully unattended`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const argv = process.argv.slice(2);
  const level = argv.find((a) => !a.startsWith('--')) || DEFAULT_LEVEL;
  const i = argv.indexOf('--archetype');
  const archetype = i > -1 ? argv[i + 1] : undefined;
  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ level, archetype: archetype ?? null, gates: gatesForApprovalLevel(level, { archetype }) }, null, 2) + '\n');
  } else {
    process.stdout.write(describeLevel(level, { archetype }) + '\n');
  }
}
