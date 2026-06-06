// scripts/lib/compress/json-minify.mjs — minify + optionally crush JSON.
//
// Phase 1 compression. Deterministic, $0. Safe: if the input is not valid JSON,
// the original string is returned unchanged (never corrupts a tool output).

/**
 * Minify JSON (drop all insignificant whitespace). With { crushArrays }, long
 * homogeneous arrays are sampled to the first `sampleN` items plus a
 * "__elided__": "+M more items" marker — use only where item-level completeness
 * is not required (must pass the compression-fidelity gate before enabling).
 *
 * @returns {{ text: string, ok: boolean, crushed: number }}
 */
export function minifyJson(text, { crushArrays = false, sampleN = 3, threshold = 10 } = {}) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { text: String(text), ok: false, crushed: 0 };
  }
  let crushed = 0;
  const walk = (v) => {
    if (Array.isArray(v)) {
      if (crushArrays && v.length > threshold) {
        crushed++;
        const head = v.slice(0, sampleN).map(walk);
        return [...head, { __elided__: `+${v.length - sampleN} more items` }];
      }
      return v.map(walk);
    }
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v)) o[k] = walk(v[k]);
      return o;
    }
    return v;
  };
  const out = crushArrays ? walk(data) : data;
  return { text: JSON.stringify(out), ok: true, crushed };
}
