// A declaration that loses is not a declaration.
//
// Twice in two days a conditional block in the board's stylesheet was written
// ABOVE the rules it overrides. At equal specificity the later rule wins, so
// half of each block was ignored while reading as entirely correct in the diff:
//
//   - `@media (max-width: 768px)` set `.inbox-summary` to two columns and lost
//     to the four-column rule declared 1100 lines below. Four columns of numbers
//     kept overflowing a 375px screen, and the fix looked applied.
//   - `@media (pointer: coarse)` set `.inbox-row .actions { gap: 12px }` and lost
//     to that rule's own `gap: 4px`. Approve and Reject sat 4px apart on a touch
//     screen — on the one pair where a mis-tap advances work nobody can
//     un-advance — beneath a block that said 12.
//
// Both were found by looking at the rendered page, not by reading the CSS. This
// reads the CSS. It is a mechanical comparison over a file already in the repo,
// so it costs nothing to run and cannot get bored.
//
// Reported, never inferred: each finding names the losing declaration, the rule
// that beats it, and both line numbers.

/** Blank out comments while preserving every byte offset. */
function blankComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
}

const lineOf = (css, index) => css.slice(0, index).split('\n').length;

/**
 * Specificity of a single (non-grouped) selector, as [ids, classes, types].
 *
 * Deliberately coarse — pseudo-elements, :is()/:where() and attribute
 * subtleties are not modelled. It is used only to decide whether two rules can
 * TIE, and a wrong guess makes the check quieter, never louder.
 */
export function specificity(sel) {
  const s = sel.replace(/\s*[>+~]\s*/g, ' ').trim();
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes = (s.match(/\.[\w-]+/g) || []).length
    + (s.match(/\[[^\]]+\]/g) || []).length
    + (s.match(/:(?!:)[\w-]+/g) || []).length;
  const types = (s.replace(/[#.[][^\s]*/g, ' ').match(/\b[a-zA-Z][\w-]*/g) || []).length;
  return [ids, classes, types];
}

const cmpSpec = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);

/**
 * Flatten a stylesheet into one entry per (selector, property).
 *
 * @returns {Array<{sel:string, prop:string, cond:string|null, at:number, line:number}>}
 */
export function declarations(rawCss) {
  const css = blankComments(rawCss);
  const out = [];
  let i = 0;

  const readBlock = (start) => {            // start = index of '{'
    let depth = 0;
    for (let j = start; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') { depth--; if (depth === 0) return j; }
    }
    return css.length;
  };

  const emitRules = (body, offset, cond) => {
    let k = 0;
    while (k < body.length) {
      const brace = body.indexOf('{', k);
      if (brace < 0) break;
      const selRaw = body.slice(k, brace).trim();
      const close = (() => { let d = 0; for (let j = brace; j < body.length; j++) {
        if (body[j] === '{') d++; else if (body[j] === '}') { d--; if (!d) return j; } } return body.length; })();
      const decls = body.slice(brace + 1, close);
      // Nested at-rules inside a conditional block are not this check's business.
      if (!selRaw.startsWith('@') && selRaw) {
        for (const sel of selRaw.split(',').map((x) => x.trim()).filter(Boolean)) {
          for (const d of decls.split(';')) {
            const c = d.indexOf(':');
            if (c < 0) continue;
            const prop = d.slice(0, c).trim().toLowerCase();
            if (!/^[a-z-]+$/.test(prop) || prop.startsWith('--')) continue;
            out.push({ sel, prop, cond, at: offset + brace, line: lineOf(rawCss, offset + brace) });
          }
        }
      }
      k = close + 1;
    }
  };

  while (i < css.length) {
    const brace = css.indexOf('{', i);
    if (brace < 0) break;
    const head = css.slice(i, brace).trim();
    const close = readBlock(brace);

    if (/^@(media|supports|container)\b/.test(head)) {
      emitRules(css.slice(brace + 1, close), brace + 1, head);
    } else if (/^@/.test(head)) {
      // @keyframes / @font-face / @import — no cascade question here.
    } else if (head) {
      emitRules(css.slice(i, close + 1), i, null);
    }
    i = close + 1;
  }
  return out;
}

/**
 * Declarations inside a conditional block that a later rule already beats.
 *
 * A rule wins on higher specificity regardless of order, so only a LATER rule of
 * EQUAL-OR-HIGHER specificity is a finding — and a later `!important` is out of
 * scope, as is anything inside a different conditional block (two media queries
 * that both match are a deliberate authoring choice, not a silent loss).
 */
export function losingDeclarations(css) {
  const all = declarations(css);
  const unconditional = all.filter((d) => d.cond === null);
  const findings = [];

  for (const d of all) {
    if (d.cond === null) continue;
    const spec = specificity(d.sel);
    for (const u of unconditional) {
      if (u.prop !== d.prop || u.sel !== d.sel) continue;
      if (u.at <= d.at) continue;                       // it comes first — the block wins
      if (cmpSpec(specificity(u.sel), spec) < 0) continue;
      findings.push({
        selector: d.sel,
        property: d.prop,
        condition: d.cond,
        losingLine: d.line,
        winningLine: u.line,
        why: `\`${d.sel} { ${d.prop} }\` inside \`${d.cond}\` (line ${d.line}) is beaten by the same `
           + `declaration at line ${u.line} — equal specificity, and the later rule wins, so the `
           + `conditional value never applies`,
      });
      break;
    }
  }
  return findings;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
//
//   node scripts/lib/css-cascade.mjs <file.html|file.css> [--json]

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const file = process.argv[2];
  if (!file) { console.error('usage: css-cascade.mjs <file> [--json]'); process.exit(2); }
  const text = readFileSync(file, 'utf8');
  const css = file.endsWith('.css') ? text
    : [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const f = losingDeclarations(css);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(f, null, 2)); process.exit(f.length ? 1 : 0); }
  console.log(`css-cascade: ${f.length} declaration(s) that never apply`);
  for (const x of f) console.log(`\n  ${x.selector} { ${x.property} }  in ${x.condition}\n    ${x.why}`);
  process.exit(f.length ? 1 : 0);
}
