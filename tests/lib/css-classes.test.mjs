// A class that no selector names is not an error.
//
// `<span class="muted">` with no `.muted` rule renders as ordinary prose: no
// console message, no fallback, nothing in the diff to read as wrong. It was
// applied 70 times on this board and declared nowhere, so every de-emphasised
// line in the UI rendered at full weight — for as long as the board has existed.
//
// Same shape as css-tokens, one level up: that one asks whether a var() name
// exists, this one asks whether the class carrying it does. The interesting
// half is not the comparison, it is what counts as a use and what counts as a
// declaration — a scan that believes a comment, or that guesses at the class a
// template literal builds, reports classes nobody applies and gets switched off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  asClassValue, checkClassParity, declaredClasses, leadingLiteralArgs,
  literalClasses, strayCloseBraces, stylesheet, usedClasses,
} from '../../scripts/lib/css-classes.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── What counts as declared ─────────────────────────────────────────────────

test('a class counts as declared however the selector names it', () => {
  // The first pass required `.x` followed by `,` or `{` and flagged three
  // classes that were fine: `.ab-rm` exists only as `.ab-btn.ab-rm:hover`,
  // `.idle` only as `.pl-stage.idle`, `.bt-slug` only as a descendant. A guard
  // whose first act is to cry wolf three times does not get a second run.
  const d = declaredClasses(`
    .ab-btn.ab-rm:hover { color: red }
    .pl-stage.idle .dot { background: grey }
    .budgets-table .bt-slug { font-family: monospace }
    .a, .b { color: blue }
  `);
  assert.deepEqual([...d].sort(), ['a', 'ab-btn', 'ab-rm', 'b', 'bt-slug', 'budgets-table', 'dot', 'idle', 'pl-stage']);
});

test('a name inside a declaration block or a string is not a declaration', () => {
  // `url(logo.png)` reads as `.png` to a scan that does not know where the
  // selector ends — and a bogus declaration is worse than a missing one: it
  // silently exempts a real `class="png"` from ever being reported.
  const d = declaredClasses(`
    /* .commented-out { } */
    a { background: url(logo.png); content: ".fake"; }
  `);
  assert.deepEqual([...d], [], 'nothing here declares a class');
});

test('at-rule preludes are not selectors, the rules inside them are', () => {
  const d = declaredClasses('@media (max-width: 880px) { .resume-grid { grid-template-columns: 1fr } }');
  assert.deepEqual([...d], ['resume-grid']);
});

// ── What counts as a use ────────────────────────────────────────────────────

test('a word glued to an interpolation is a prefix, not a class', () => {
  // The motivating case is in this board's own source: `class="why why-${tone}"`
  // applies `.why` and `.why-gate`. A scan that keeps the literal text reports
  // `.why-`, which nothing applies and nothing should declare — and this file's
  // first version did exactly that, from a COMMENT explaining the bug.
  assert.deepEqual(literalClasses('why why-${tone}'), ['why']);
  assert.deepEqual(literalClasses('inbox-row${aged ? \' row-aged\' : \'\'}'), []);
  assert.deepEqual(literalClasses('cost-cell ${over ? \'warn\' : \'\'}'), ['cost-cell']);
  assert.deepEqual(literalClasses('pl-stage pl-gate active${fresh}'), ['pl-stage', 'pl-gate']);
  assert.deepEqual(literalClasses('${cls} ri-tag'), ['ri-tag']);
});

test('a class quoted in a comment is not applied by anything', () => {
  const html = `
    <style>.real { color: red }</style>
    // no entry renders \`class="why why-"\` and is styled by nothing
    <!-- <div class="removed-last-week"></div> -->
    <div class="real"></div>
  `;
  assert.deepEqual([...usedClasses(html).keys()], ['real']);
});

// ── Classes the script applies, not the markup ──────────────────────────────

test('a class set from JS is applied just as much as one in the markup', () => {
  // The blind spot a whole-file guard is most likely to ship with. This board
  // sets classes 19 times through `className` and 21 through `classList`, and a
  // scan that reads only `class="…"` passes all of them without looking — an
  // all-clear over a third of the surface, which is worse than no guard because
  // it gets believed.
  const html = `
    <style>.declared { color: red }</style>
    <script>
      el.className = 'from-assignment';
      box.classList.add('from-add', 'and-this-one');
      tab.classList.toggle('from-toggle', view === 'logs');
    </script>
  `;
  assert.deepEqual(
    [...usedClasses(html).keys()].sort(),
    ['and-this-one', 'from-add', 'from-assignment', 'from-toggle'],
  );
});

test('a concatenated prefix is not a class, and neither is a condition', () => {
  // Two ways to invent a class that does not exist: read `'tier-badge tier-' +
  // t.tier` as `.tier-`, or read the second argument of
  // `classList.toggle('active', view === 'logs')` as `.logs`. Both would be
  // reported forever, by a guard nobody could ever get to green.
  assert.deepEqual(literalClasses(asClassValue("'tier-badge tier-' + t.tier")), ['tier-badge']);
  assert.deepEqual(leadingLiteralArgs("'active', view === 'logs'"), ['active']);
  assert.deepEqual(leadingLiteralArgs("'open', 'wide'"), ['open', 'wide']);
});

test('where a concatenation is ambiguous the scan gives up the class', () => {
  // `'judge-status ' + (connected ? 'ok' : 'off')` really does apply `.ok` and
  // `.off`, and this returns neither: the same reading that recovers them also
  // harvests every unrelated string in an expression. A gap is a gap; an
  // invented finding is a guard switched off. Documented here so the next
  // person sees it as a decision rather than a bug.
  const v = asClassValue("'judge-status ' + (connected ? 'ok' : 'off')");
  assert.deepEqual(literalClasses(v), ['judge-status']);
});

test('the same class in two places is counted twice, not once', () => {
  // The count is what makes a report readable — `.muted ×70` and `.tbl ×1` are
  // the same defect and very different jobs.
  const u = usedClasses('<a class="x y"></a><b class="x"></b>');
  assert.equal(u.get('x'), 2);
  assert.equal(u.get('y'), 1);
});

// ── The comparison ──────────────────────────────────────────────────────────

test('an applied class with no selector is reported, a declared one is not', () => {
  const r = checkClassParity('<style>.here { color: red }</style><i class="here gone"></i>');
  assert.deepEqual(r.undeclared, [{ cls: 'gone', count: 1 }]);
});

test('a declared class applied nowhere is not a finding', () => {
  // Dead CSS renders nothing wrong. Mixing it in would bury the real finding —
  // the same call css-tokens makes about its `unused` list.
  const r = checkClassParity('<style>.spare { color: red } .used { color: blue }</style><i class="used"></i>');
  assert.deepEqual(r.undeclared, []);
});

// ── Rules that never parse at all ───────────────────────────────────────────

test('a stray close brace is found, and reported at its own line', () => {
  // Not a parity question: the rule is discarded, so the class it would have
  // declared never existed to be missing and BOTH sides agree. CSS has no error
  // for it — at the top level a `}` opens a rule whose prelude runs to the next
  // `{`, so the brace, the comment after it and the next selector become one
  // invalid prelude and that rule is dropped.
  const css = '.a { color: red }\n}\n/* left behind */\n.b { color: blue }\n';
  assert.deepEqual(strayCloseBraces(css), [{ line: 2, text: '}' }]);
});

test('braces inside comments and strings do not count as structure', () => {
  // A comment that closes a brace it never opened would report a fault on every
  // stylesheet that documents CSS in its own comments.
  assert.deepEqual(strayCloseBraces('/* } */ a { content: "}" }'), []);
});

test('a balanced stylesheet with nesting reports nothing', () => {
  assert.deepEqual(strayCloseBraces('@media (min-width: 1px) { .a { color: red } }'), []);
});

// ── Against the real board ──────────────────────────────────────────────────

test('the board and the share report both parse without a discarded rule', () => {
  // Wired to the real files on purpose. css-tokens.mjs and css-type-scale.mjs
  // both sat here fully unit-tested and pointed at nothing, exiting 0 against a
  // file with a planted defect — this repository has already learned that a
  // check nobody calls and a check that cannot fail are the same artefact.
  for (const f of ['index.html', 'share.html']) {
    const html = readFileSync(join(REPO, 'packages', 'board', 'public', f), 'utf8');
    assert.deepEqual(strayCloseBraces(stylesheet(html)), [], `${f} has a stray close brace`);
  }
});

test('every class the share report applies is declared in its own stylesheet', () => {
  // share.html is published to an external host and has no allowlist — it is
  // clean, and this is what keeps it that way. index.html's parity, with its
  // written exemptions, is asserted in packages/board/harnesses.test.mjs.
  const html = readFileSync(join(REPO, 'packages', 'board', 'public', 'share.html'), 'utf8');
  const r = checkClassParity(html);
  assert.deepEqual(r.undeclared.map((u) => `.${u.cls} ×${u.count}`), []);
  assert.ok(r.usedCount > 50, `read the whole file (saw ${r.usedCount} classes)`);
});
