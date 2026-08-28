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

// --- CLI ---------------------------------------------------------------------
//
// The scale is read from the file's own `--fs-*` declarations rather than
// hardcoded here. A checker carrying its own copy of the scale drifts from the
// stylesheet the moment either changes, and then enforces a scale nobody uses.
//
// The exceptions are hardcoded, deliberately, and each carries its reason. That
// asymmetry is the point: the scale is a fact about the file, an exception is a
// decision about the design, and decisions get written down where someone has
// to read them to change them.

/**
 * Shared with the rendered-layout check, which had its own idea of what counts.
 *
 * That check reported five screens off-scale; every one was one of these — a
 * longform document ramp and the Share hero, both decided on purpose and written
 * down here. Two checks enforcing one rule from two lists is how a deliberate
 * decision starts reading as a defect, and how somebody "fixes" it.
 */
export const EXCEPTIONS = [
  { match: /\.ac-mark/,        why: 'checkmark glyph sized to its 34px circle, not text' },
  { match: /\.emoji/,          why: 'icon glyph' },
  { match: /\.star/,           why: 'favourite glyph' },
  { match: /\.ap-x/,           why: 'close glyph' },
  { match: /\.memory-doc h[12]/, why: 'longform document ramp — content typography, not chrome' },
  { match: /\.side-desc\.md h1/, why: 'longform markdown heading inside the drawer' },
  { match: /\.share-card h2/,  why: 'showcase hero — Share is the one outward-facing screen' },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const file = process.argv[2];
  if (!file) { console.error('usage: css-type-scale.mjs <file> [--json]'); process.exit(2); }

  const css = readFileSync(file, 'utf8');
  const scale = [...css.matchAll(/--fs-[a-z-]+:\s*([0-9.]+)px/g)].map((m) => parseFloat(m[1]));
  if (!scale.length) {
    console.error(`  ${file}: no --fs-* scale declared — nothing to check against`);
    process.exit(2);   // not "clean": unmeasured is its own answer
  }

  const off = offScaleSizes(css, { scale, exceptions: EXCEPTIONS });

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ scale, off }, null, 2));
    process.exit(off.length ? 1 : 0);
  }

  const total = fontSizes(css).length;
  if (!off.length) {
    console.log(`  ${file}: ${total} font-size declarations, all on the ${scale.length}-step scale or excused`);
    process.exit(0);
  }

  console.error(`  ${file}: ${off.length} of ${total} font-size declarations are off the scale\n`);
  console.error(`    scale: ${[...new Set(scale)].sort((a, b) => a - b).join(' / ')}px\n`);
  for (const f of off) console.error(`    line ${f.line}: ${f.px}px  in  ${f.selector || '(inline)'}`);
  console.error(`\n    Either snap to a step, or add the selector to EXCEPTIONS with its reason.`);
  process.exit(1);
}
