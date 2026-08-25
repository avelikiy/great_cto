/**
 * Type-scale parity: every authored font-size is a step on the scale.
 *
 * The board reached 22 distinct font sizes — 9, 10, 11, 11.5, 12, 12.5, 13,
 * 13.5, 14, 15, 16, 17, 18, 20, 21, 22, 24, 26, 28, 30, 36, 52 — because
 * nothing ever said no. Each one was reasonable where it was written; the
 * half-pixels (11.5 / 12.5 / 13.5) are what a scale looks like when it is
 * being invented one declaration at a time.
 *
 * Sizes that are DELIBERATELY off-scale still exist — icon glyphs sized to
 * their box, and longform document typography, which is content rather than
 * chrome. Those pass by naming their selector, not by being under some
 * threshold: an exception you have to write down is one you have to defend.
 */

/** Strip comments and quoted strings so their contents never read as CSS. */
function scrub(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
            .replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => '"' + ' '.repeat(Math.max(0, m.length - 2)) + '"');
}

/** Every authored `font-size: <n>px`, with the selector or attribute it sits in. */
export function fontSizes(css) {
  const text = scrub(css);
  const out = [];
  for (const m of text.matchAll(/font-size:\s*([0-9.]+)px/g)) {
    const before = text.slice(0, m.index);
    const line = before.split('\n').length;
    // The nearest selector above: the last `{` that is not a media/supports at-rule.
    const open = before.lastIndexOf('{');
    const sel = open === -1 ? '' : before.slice(before.lastIndexOf('}', open) + 1, open)
      .replace(/\s+/g, ' ').trim().slice(-90);
    out.push({ px: parseFloat(m[1]), line, selector: sel });
  }
  return out;
}

/**
 * @param {string} css
 * @param {{ scale: number[], exceptions?: Array<{ match: RegExp, why: string }> }} spec
 * @returns {Array<{px,line,selector}>} sizes that are neither on the scale nor excused
 */
export function offScaleSizes(css, { scale, exceptions = [] }) {
  const allowed = new Set(scale);
  return fontSizes(css).filter((f) => {
    if (allowed.has(f.px)) return false;
    return !exceptions.some((e) => e.match.test(f.selector));
  });
}
