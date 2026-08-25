/**
 * Token parity: every var(--x) must resolve to a declared --x.
 *
 * The defect this closes: a custom property that was never declared is not an
 * error. `background: var(--bg1)` where --bg1 does not exist is dropped at
 * computed-value time, and the element renders with a transparent background
 * that looks like a design choice. A fallback is worse in a themed UI —
 * `var(--text-3, #9ca3af)` always paints that grey, so the declaration
 * survives the theme switch that was supposed to change it.
 *
 * Three states, not two: `resolved | undeclared | fallback-only`. The third is
 * the one that renders without complaining.
 */

const DECL = /(--[A-Za-z0-9_-]+)\s*:/g;
const USE = /var\(\s*(--[A-Za-z0-9_-]+)\s*(,)?/g;

/** Strip comments and quoted strings so their contents never read as CSS. */
function scrub(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

export function declaredTokens(css) {
  const out = new Set();
  const text = scrub(css);
  for (const m of text.matchAll(DECL)) out.add(m[1]);
  return out;
}

export function usedTokens(css) {
  const out = new Map(); // name -> { count, withFallback }
  const text = scrub(css);
  for (const m of text.matchAll(USE)) {
    const rec = out.get(m[1]) || { count: 0, withFallback: 0 };
    rec.count += 1;
    if (m[2]) rec.withFallback += 1;
    out.set(m[1], rec);
  }
  return out;
}

/**
 * @returns {{ undeclared: Array<{token,count,withFallback}>,
 *             unused: string[],
 *             declaredCount: number, usedCount: number }}
 */
export function checkTokenParity(css) {
  const declared = declaredTokens(css);
  const used = usedTokens(css);

  const undeclared = [];
  for (const [token, rec] of used) {
    if (!declared.has(token)) {
      undeclared.push({ token, count: rec.count, withFallback: rec.withFallback });
    }
  }
  undeclared.sort((a, b) => b.count - a.count || a.token.localeCompare(b.token));

  const unused = [...declared].filter((t) => !used.has(t)).sort();

  return { undeclared, unused, declaredCount: declared.size, usedCount: used.size };
}
