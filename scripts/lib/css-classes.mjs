/**
 * Class parity: every class the markup applies must be named by a selector.
 *
 * The sibling module asks whether a `var(--x)` resolves. This one asks the same
 * question one level up, about the thing that carries the var: a class that no
 * selector mentions is not an error either. `<span class="muted">` with no
 * `.muted` rule renders as ordinary prose — no console message, no fallback, no
 * visual hint that a rule was meant to be there. `.muted` was applied 68 times
 * and declared nowhere; `.warn` marked five "unavailable" states that read as
 * plain text. Both survived every other check this repository runs.
 *
 * Two halves, and both have to be careful about the same thing — quoted or
 * commented text that merely LOOKS like markup or CSS:
 *
 *   declaredClasses  scans selector preludes only. A class name harvested from
 *                    inside a declaration block (`url(x.png)` reads as `.png`)
 *                    would silently exempt a real finding named `png`.
 *
 *   usedClasses      scans `class="…"` attributes, in static markup and inside
 *                    template literals. A word glued to a `${…}` is only half a
 *                    class name — `class="why why-${tone}"` applies `.why` and
 *                    `.why-gate`, never `.why-` — so a word touching an
 *                    interpolation is dropped rather than guessed at.
 */

/**
 * Strip comments and quoted strings so their contents never read as CSS.
 * Newlines are kept — a multi-line comment collapsed to a space would move
 * every line number after it, and strayCloseBraces reports by line.
 */
function scrubCss(css) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  return css
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/"(?:[^"\\]|\\.)*"/g, blank)
    .replace(/'(?:[^'\\]|\\.)*'/g, blank);
}

/**
 * Strip the places a `class="…"` can appear without being markup: HTML
 * comments, block comments, and whole-line `//` comments. The motivating case
 * is real — a comment in this board's own source quotes `class="why why-"` to
 * explain the bug of shipping exactly that, and a scan that believes it reports
 * a class nobody applies.
 *
 * Only WHOLE-line `//` comments, deliberately: `//` also appears mid-line in
 * every URL, and a trailing-comment rule would eat real markup after one.
 */
function scrubMarkup(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ');
}

/** The `<style>` blocks of an HTML document, concatenated. */
export function stylesheet(html) {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
}

/**
 * Every class named by a selector, however it is named. A class counts as
 * declared when a selector mentions it AT ALL — `.ab-btn.ab-rm:hover` declares
 * `ab-rm`, and `.budgets-table .bt-slug` declares `bt-slug`. Requiring a rule
 * of its own would flag both, and a guard that cries wolf gets switched off.
 */
export function declaredClasses(css) {
  const out = new Set();
  for (const m of scrubCss(css).matchAll(/([^{}]*)\{/g)) {
    const prelude = m[1].trim();
    if (prelude.startsWith('@')) continue; // at-rule prelude, not a selector
    for (const c of prelude.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) out.add(c[1]);
  }
  return out;
}

/**
 * Every class the page applies, from all three places it applies one.
 *
 * Markup is the obvious one and was very nearly the only one: this board also
 * sets classes from script — `el.className = 'degraded-banner'` 19 times and
 * `classList.add('open', 'wide')` 21 — and a guard that reads only `class="…"`
 * gives those a clean bill of health it never checked. An all-clear that skipped
 * a third of the surface is worse than no guard, because it is believed.
 *
 * @returns {Map<string, number>} class name -> how many places apply it.
 */
export function usedClasses(html) {
  const out = new Map();
  const add = (names) => { for (const c of names) out.set(c, (out.get(c) || 0) + 1); };
  const src = scrubMarkup(html);

  for (const m of src.matchAll(/class="([^"\n]*)"/g)) add(literalClasses(m[1]));
  for (const m of src.matchAll(/\.className\s*\+?=\s*([^;\n]*)/g)) add(literalClasses(asClassValue(m[1])));
  for (const m of src.matchAll(/classList\.(?:add|remove|toggle|replace)\(([^)]*)\)/g)) add(leadingLiteralArgs(m[1]));

  return out;
}

/**
 * Rewrite a `className =` right-hand side as if it were an attribute value:
 * literal text stays, everything else becomes `${…}` so the same prefix rule
 * applies. `'tier-badge tier-' + t.tier` yields `tier-badge`, never `tier-`.
 *
 * Deliberately conservative where it cannot tell. `'judge-status ' + (x ? 'ok'
 * : 'off')` gives up `ok` and `off`, because a scan that harvests every string
 * in an expression also harvests `classList.toggle('active', view === 'logs')`
 * and reports `.logs`, a value that was never a class. Missing a real class is
 * a gap; inventing one is a guard nobody trusts, and only one of those gets
 * fixed.
 */
export function asClassValue(rhs) {
  let out = '';
  let i = 0;
  let gap = false;
  while (i < rhs.length) {
    const q = rhs[i];
    if (q === '"' || q === "'" || q === '`') {
      const m = new RegExp(`^${q}((?:[^${q}\\\\]|\\\\.)*)${q}`).exec(rhs.slice(i));
      if (!m) break;
      if (gap) { out += '${x}'; gap = false; }
      out += m[1];
      i += m[0].length;
    } else {
      if (!/\s/.test(q)) gap = true;
      i += 1;
    }
  }
  if (gap) out += '${x}';
  return out;
}

/**
 * The class arguments of a `classList.*` call: the leading string literals, and
 * only those. `add('open', 'wide')` is two classes; `toggle('active', t.dataset
 * .tab === id)` is one, and the second argument is a condition — reading past
 * the first non-literal is how `=== 'logs'` becomes a class named `logs`.
 */
export function leadingLiteralArgs(args) {
  const out = [];
  for (const arg of splitArgs(args)) {
    const m = /^\s*(['"])((?:[^\\])*?)\1\s*$/.exec(arg);
    if (!m) break;
    out.push(...m[2].split(/\s+/).filter(Boolean));
  }
  return out;
}

/** Split an argument list on commas that are not inside quotes. */
function splitArgs(args) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (quote) {
      if (ch === '\\') { cur += ch + (args[++i] ?? ''); continue; }
      if (ch === quote) quote = null;
      cur += ch;
    } else if (ch === '"' || ch === "'" || ch === '`') { quote = ch; cur += ch; }
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * The class names a `class="…"` value applies for certain — the literal words,
 * minus any word touching an interpolation. Exported for its own test: this is
 * the part with a judgement call in it.
 */
export function literalClasses(value) {
  const chunks = value.split(/\$\{[^{}]*\}/);
  const out = [];
  chunks.forEach((chunk, i) => {
    const words = chunk.split(/\s+/).filter(Boolean);
    // `foo${x}` and `${x}foo` are prefixes and suffixes, not class names.
    if (i > 0 && !/^\s/.test(chunk)) words.shift();
    if (i < chunks.length - 1 && !/\s$/.test(chunk)) words.pop();
    out.push(...words);
  });
  return out;
}

/**
 * @returns {{ undeclared: Array<{cls: string, count: number}>,
 *             declaredCount: number, usedCount: number }}
 */
export function checkClassParity(html) {
  const declared = declaredClasses(stylesheet(html));
  const used = usedClasses(html);

  const undeclared = [...used]
    .filter(([cls]) => !declared.has(cls))
    .map(([cls, count]) => ({ cls, count }))
    .sort((a, b) => b.count - a.count || a.cls.localeCompare(b.cls));

  return { undeclared, declaredCount: declared.size, usedCount: used.size };
}

/**
 * Rules the browser throws away, which parity cannot see. Parity asks whether a
 * class is named by a selector; if a whole RULE was discarded, the class it
 * would have declared never existed to be missing, and both sides of the check
 * agree about a stylesheet that does not do what it says.
 *
 * The signal is a `}` with no `{` to close. CSS has no error for it: at the top
 * level a `}` OPENS a qualified rule, whose prelude then runs to the next `{` —
 * so a stray brace silently eats the comment and the selector after it, and the
 * next rule is dropped. Both of this board's occurrences were exactly that:
 *
 *   - `.budgets-table th`'s selector was overwritten with `.` by an unrelated
 *     commit, leaving its `}` orphaned; the header row and every `td`'s padding
 *     and border went with it.
 *   - a `}` left behind when `.leash-chip` was deleted swallowed `.icon-btn`,
 *     which had been rendering at the browser's default size ever since.
 *
 * Reported by line, because the fault is never where the damage shows.
 *
 * @returns {Array<{line: number, text: string}>}
 */
export function strayCloseBraces(css) {
  const text = scrubCss(css);
  const out = [];
  let depth = 0;
  let line = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') line += 1;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      if (depth === 0) {
        out.push({ line, text: css.split('\n')[line - 1]?.trim() ?? '}' });
      } else depth -= 1;
    }
  }
  return out;
}

// --- CLI ---------------------------------------------------------------------
//
// Same reason as css-tokens.mjs: without this block, running the file loads a
// module, defines some functions and exits 0 on any input at all — a check that
// is green by construction, which is the defect this module exists to catch.

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const file = process.argv[2];
  if (!file) { console.error('usage: css-classes.mjs <file> [--json]'); process.exit(2); }

  const html = readFileSync(file, 'utf8');
  const r = checkClassParity(html);
  const stray = strayCloseBraces(stylesheet(html));

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ...r, stray }, null, 2));
    process.exit(r.undeclared.length || stray.length ? 1 : 0);
  }

  if (!r.undeclared.length && !stray.length) {
    console.log(`  ${file}: ${r.usedCount} classes applied, all declared ` +
                `(${r.declaredCount} declared in the stylesheet)`);
    process.exit(0);
  }

  for (const b of stray) {
    console.error(`  ${file}: stray \`}\` in the stylesheet near line ${b.line} ` +
                  `(\`${b.text}\`) — it swallows the next rule`);
  }
  for (const u of r.undeclared) {
    console.error(`  ${file}: .${u.cls}  ×${u.count}  applied but declared nowhere — renders unstyled`);
  }
  process.exit(1);
}
