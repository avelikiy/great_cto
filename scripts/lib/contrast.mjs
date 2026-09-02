/**
 * contrast — WCAG contrast ratios for the board's own colour tokens.
 *
 * WHY THIS EXISTS
 * ---------------
 * The landing's stylesheet carries this comment, written after the fact:
 *
 *   `--muted` was USED in 61 places and DEFINED in none, so every one of them
 *   fell through to its inline fallback #5f5e5a — a light-theme grey authored
 *   before this page was dark. Measured 2.62:1 on the chip surface, against a
 *   4.5:1 AA floor: the 60-chip industries grid, the densest block on the page,
 *   was rendering unreadable.
 *
 * That was found by a person looking at it, months late. Nothing could have
 * caught it, because the three CSS checks this repository already runs ask
 * whether a declaration APPLIES, whether a token RESOLVES, and whether the type
 * scale is consistent — all questions about the code. None of them asks whether
 * the result can be read.
 *
 * This asks that. It is arithmetic, not taste: the WCAG 2.2 relative-luminance
 * formula over the tokens as declared. A ratio is a fact about two colours, so
 * it needs no browser, no screenshot and no judgement.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not know which text lands on which surface — that depends on markup
 * this cannot see. So it reports the WORST pairing for each text token across
 * every surface the theme declares, which is the honest bound: in a single-page
 * app where cards sit inside panels inside the page, text does meet more than
 * one background, and a token that fails on any of them is a token that will be
 * unreadable somewhere.
 *
 * Translucent colours are composited over the page background before measuring,
 * because that is what a reader's eye receives. A colour whose alpha cannot be
 * resolved is reported as `unknown` rather than assumed opaque — the third
 * state, again: a pairing nobody could measure must not read as one that passed.
 */

/** WCAG 2.2 §1.4.3 — normal text. */
export const AA_TEXT = 4.5;
/** WCAG 2.2 §1.4.11 — large text, icons, and UI component boundaries. */
export const AA_LARGE = 3.0;

/** #rgb, #rrggbb, #rrggbbaa, rgb(), rgba() → {r,g,b,a} | null */
export function parseColor(raw) {
  const s = String(raw || '').trim();
  let m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    const h = m[1];
    const ex = h.length === 3 || h.length === 4
      ? h.split('').map((c) => c + c).join('')
      : h;
    if (ex.length !== 6 && ex.length !== 8) return null;
    return {
      r: parseInt(ex.slice(0, 2), 16),
      g: parseInt(ex.slice(2, 4), 16),
      b: parseInt(ex.slice(4, 6), 16),
      a: ex.length === 8 ? parseInt(ex.slice(6, 8), 16) / 255 : 1,
    };
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.%]+))?\s*\)$/i);
  if (m) {
    let a = 1;
    if (m[4] != null) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a: Number.isFinite(a) ? a : 1 };
  }
  return null; // oklch, hsl, colour keywords — not guessed at
}

/** Source-over composite of `fg` onto an opaque `bg`. */
export function composite(fg, bg) {
  const a = fg.a ?? 1;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

/** WCAG relative luminance. */
export function luminance({ r, g, b }) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** @returns {number} 1…21 */
export function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Every theme the stylesheet defines, as a name → tokens map.
 *
 * `readTokens` reads `:root` and nothing else, so for months the audit measured
 * ONE of the two themes this board ships. The light theme redefines 39 tokens and
 * had never been checked; when it finally was, four pairings were below the floor
 * and one — the green accent on a light surface — sat at 1.51:1 against a 3:1
 * requirement, which is half.
 *
 * A check that covers half its subject looks exactly like a check that passed.
 *
 * Each theme is returned FULLY RESOLVED: a theme block overrides `:root` rather
 * than replacing it, so the tokens it does not mention still apply, and auditing
 * the override block alone would miss every inherited pairing.
 *
 * @returns {Record<string, Record<string,string>>}
 */
export function readThemes(css) {
  const text = stripComments(css);
  const base = readTokens(text);
  const themes = { dark: base };
  for (const m of text.matchAll(/\[data-theme=["']?([a-z-]+)["']?\]\s*\{([\s\S]*?)\n\s*\}/gi)) {
    const over = {};
    for (const [, k, v] of m[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) over[k] = v.trim();
    if (Object.keys(over).length) themes[m[1]] = { ...base, ...over };
  }
  return themes;
}

/** Pull `--name: value;` pairs out of the first `:root { … }` block. */
/**
 * Remove CSS comments, keeping every newline so the brace-matching that follows
 * still sees the same line structure.
 *
 * A comment is prose, and prose in this file talks about tokens by name and
 * quotes ratios with colons — "--text3 sits at 4.53:1 on --bg-strong: the
 * darkest surface;". The declaration regex below reads `--token : anything ;`,
 * which that sentence satisfies exactly, so `--bg-strong` took the value
 * "the darkest surface" and stopped being a colour. The audit then reported it
 * as unmeasurable and failed closed — correctly, but naming a token when the
 * fault was a sentence about it. Shortening the comment "fixed" it, which is
 * the kind of fix that comes back.
 */
export function stripComments(css) {
  return String(css).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));
}

export function readTokens(css) {
  const m = stripComments(css).match(/:root\s*\{([\s\S]*?)\n\s*\}/);
  if (!m) return {};
  const out = {};
  for (const [, k, v] of m[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[k] = v.trim();
  return out;
}

/**
 * @param {object} o
 * @param {Record<string,string>} o.tokens
 * @param {string[]} o.surfaces  token names that text sits on
 * @param {Array<{name:string, floor:number}>} o.text  token names that carry text
 * @param {string} o.base        opaque token every translucent colour composites over
 * @returns {{results: object[], failures: object[],
 *            unknown: {token: string, state: 'undeclared'|'unparseable', value?: string}[]}}
 */
export function auditContrast({ tokens, surfaces, text, base = '--bg-page' }) {
  const unknown = [];
  const baseColor = parseColor(tokens[base]);
  if (!baseColor) {
    return { results: [], failures: [], unknown: [tokens[base] === undefined
      ? { token: base, state: 'undeclared' }
      : { token: base, state: 'unparseable', value: String(tokens[base]).slice(0, 80) }] };
  }

  // Two ways to be unmeasurable, and they need different fixes: a token nobody
  // declared (add it, or stop referring to it) and a token declared as something
  // that is not a colour (fix the value). Reporting both as "unknown" sent the
  // last one on a hunt through token declarations for a fault that was in a
  // comment. Both still fail closed — the distinction is in what you are told,
  // never in whether it passes.
  const solid = (name) => {
    const raw = tokens[name];
    const c = parseColor(raw);
    if (!c) {
      unknown.push(raw === undefined
        ? { token: name, state: 'undeclared' }
        : { token: name, state: 'unparseable', value: String(raw).slice(0, 80) });
      return null;
    }
    return c.a < 1 ? composite(c, baseColor) : c;
  };

  const beds = surfaces.map((n) => ({ name: n, color: solid(n) })).filter((s) => s.color);
  const results = [];
  for (const { name, floor } of text) {
    const fg = solid(name);
    if (!fg) continue;
    let worst = null;
    for (const bed of beds) {
      const r = ratio(fg, bed.color);
      if (!worst || r < worst.ratio) worst = { ratio: r, on: bed.name };
    }
    if (worst) results.push({ token: name, floor, ...worst, ok: worst.ratio >= floor });
  }
  // Dedupe by token name — a Set of objects would keep every duplicate, since
  // each `solid()` call builds a fresh one.
  const seen = new Set();
  const uniq = unknown.filter((u) => (seen.has(u.token) ? false : seen.add(u.token)));
  return { results, failures: results.filter((r) => !r.ok), unknown: uniq };
}

/**
 * Colour declarations that bypass the token system.
 *
 * Found by the browser check, which reported `rgb(4, 20, 13)` reaching the page
 * — `#04140d`, written straight into a rule. That check could only see it when
 * the element using it happened to be on screen, so it caught a real violation
 * intermittently, which is the worst of both: a true finding delivered as a
 * flake. The same fact is static, so it is read from the source instead, where
 * the answer is the same every time.
 *
 * @returns {Array<{prop:string, value:string}>}
 */
export function hardcodedColors(css) {
  const out = [];
  const re = /(?:^|[;{\s"'])(color|background|background-color|border-color|fill|stroke)\s*:\s*(#[0-9a-fA-F]{3,8})/g;
  for (const m of String(css).matchAll(re)) out.push({ prop: m[1], value: m[2].toLowerCase() });
  return out;
}
