// shared/gp-schema.mjs — single source of truth for Global Pattern (GP) frontmatter.
//
// Why it exists (DEEPEN-PIPELINE Wave 1, recall loop):
//   /crystallize WRITES a GP file and architect Step 0 READS it back to surface
//   learned patterns as design constraints. They drifted: crystallize wrote
//   `target_agents` / `applicable_archetypes` / `mttr_reduction_estimate` while
//   architect grepped `applies_to` / `stack_fingerprint` / `symptom` /
//   `detection_order` / `mttr_reduction` — ZERO overlap, so no pattern ever
//   resurfaced. This module pins the contract in ONE place; the conformance test
//   (tests/eval/gp-schema.test.mjs) fails if either side diverges from it again.

/**
 * Keys architect Step 0 greps for in a GP file (agents/architect.md "Pattern Lookup").
 * The GP writer MUST emit every one of these, or recall silently breaks.
 *   - status            : "status: active" gates which GPs are scanned
 *   - applies_to        : matched against archetype/stack ("applies_to:.*<ARCH|STACK>")
 *   - stack_fingerprint : alternative match against stack
 *   - symptom           : human-readable "known issue" line
 *   - detection_order   : list block; architect reads the first "  - " item
 *   - hits              : how often the pattern recurred
 *   - mttr_reduction    : evidence weight (NOT "mttr_reduction_estimate")
 */
export const RECALL_REQUIRED_KEYS = Object.freeze([
  'status',
  'applies_to',
  'stack_fingerprint',
  'symptom',
  'detection_order',
  'hits',
  'mttr_reduction',
]);

/** Full canonical key set the writer emits (superset of the recall keys). */
export const CANONICAL_FRONTMATTER_KEYS = Object.freeze([
  'id',
  'slug',
  'status',
  'version',
  'created',
  'last_validated',
  'source_ke',
  'target_agents',
  'applies_to',
  'stack_fingerprint',
  'symptom',
  'detection_order',
  'confidence',
  'hits',
  'mttr_reduction',
]);

/**
 * Render a GP frontmatter block (between the --- fences) from field values.
 * Guarantees every RECALL_REQUIRED_KEY is present. List-valued keys
 * (target_agents, applies_to, detection_order) render as YAML.
 *
 * @param {object} f
 * @returns {string} the frontmatter body (no surrounding --- fences)
 */
export function renderGpFrontmatter(f = {}) {
  const list = (arr) => (Array.isArray(arr) ? arr : (arr ? [arr] : []));
  const inline = (arr) => `[${list(arr).join(', ')}]`;
  const block = (arr) => list(arr).map(x => `  - ${x}`).join('\n');

  const detection = list(f.detection_order);
  const lines = [
    `id: ${f.id ?? ''}`,
    `slug: ${f.slug ?? ''}`,
    `status: ${f.status ?? 'active'}`,
    `version: ${f.version ?? 1}`,
    `created: ${f.created ?? ''}`,
    `last_validated: ${f.last_validated ?? f.created ?? ''}`,
    `source_ke: ${f.source_ke ?? ''}`,
    `target_agents: ${inline(f.target_agents)}`,
    `applies_to: ${inline(f.applies_to)}`,
    `stack_fingerprint: ${f.stack_fingerprint ?? ''}`,
    `symptom: ${f.symptom ?? ''}`,
    detection.length ? `detection_order:\n${block(detection)}` : 'detection_order:',
    `confidence: ${f.confidence ?? ''}`,
    `hits: ${f.hits ?? 1}`,
    `mttr_reduction: ${f.mttr_reduction ?? ''}`,
  ];
  return lines.join('\n');
}

/**
 * Validate that a GP frontmatter string carries every recall-required key.
 * @param {string} text  the frontmatter (or whole file) text
 * @returns {{ok:boolean, missing:string[]}}
 */
export function validateGpFrontmatter(text) {
  const missing = RECALL_REQUIRED_KEYS.filter(k => !new RegExp(`^${k}:`, 'm').test(String(text)));
  return { ok: missing.length === 0, missing };
}
