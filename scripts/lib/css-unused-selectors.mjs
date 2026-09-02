#!/usr/bin/env node
/**
 * css-unused-selectors.mjs — classes a stylesheet declares that no page renders.
 *
 * The neighbouring guards answer different questions. css-tokens asks whether a
 * `var(--x)` resolves; css-cascade asks whether a declaration is overridden by a
 * later one; css-type-scale asks whether a size is on the scale. None of them
 * asks the plainest question of all: does anything on the site actually have
 * this class?
 *
 * On the site this was written for, the answer was no for 174 of 358 classes —
 * 281 rules, 36% of the stylesheet. That is not only weight. A contrast audit of
 * the same file reported fifteen rules below the WCAG floor, and eleven of them
 * were for classes nothing renders. Eleven phantoms in a list of fifteen is how
 * a guard teaches the person reading it to skim, and the four real findings were
 * hiding among them.
 *
 * ── Why a class can look dead and not be ───────────────────────────────────
 *
 * A class can arrive at runtime — `classList.add('p-flash')` — or be assembled
 * in a template literal. Neither shows up in a grep for `class="…"`, and
 * p-flash was in the first cut of a delete list built that way. So a class is
 * only reported when it appears in NO markup AND is mentioned nowhere in the
 * source at all. That is deliberately generous: this guard's job is to be
 * trusted, and one wrong deletion costs more than ten missed ones.
 *
 * Three states, as everywhere else here:
 *   rendered   — appears in a class attribute in some built page
 *   mentioned  — appears only inside code, so it may be applied at runtime
 *   unused     — appears nowhere; this is the only state reported
 *
 * Usage:
 *   node css-unused-selectors.mjs <stylesheet> [--root DIR] [--strict] [--json]
 *
 * Exit: 0 ok (or findings without --strict) · 1 findings with --strict · 2 cannot run
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

/**
 * Directories whose HTML is not this site's own markup, so a class found there
 * proves nothing about whether this stylesheet's rules are live.
 *
 *   node_modules, vendor, _vendor  third-party or snapshotted copies of another
 *                                  project — their classes belong to their CSS
 *   dist, build-output, coverage   generated duplicates of pages already scanned
 *                                  in place; counting both double-counts nothing
 *                                  and risks reading a stale build as current
 *   .git                           object storage, not pages
 *   covers, assets                 images and fonts; no class attributes to read
 *
 * Erring here is one-directional and safe: a skipped directory can only make a
 * class look LESS used, and a class that looks unused is checked against the
 * whole source corpus before it is ever reported.
 */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build-output', 'coverage',
  '_vendor', 'vendor', 'covers', 'assets',
]);

/** Walk for files, never following a symlink out of the tree. */
export function* walk(dir, match, depth = 0, max = 6) {
  if (depth > max) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    // A symlink can point at another repository's working tree, and reading
    // through one makes this guard's answer depend on what is checked out next
    // door — a class used only over there would make a dead rule look live.
    //
    // Belt and braces, honestly labelled: with `withFileTypes` a symlink to a
    // directory reports isDirectory() === false, so the recursion below already
    // will not enter it. This line states the intent so that swapping the dirent
    // check for statSync() — which DOES follow links — reads as the behaviour
    // change it is. The test covers the contract, not this line: it fails on the
    // statSync form and passes with or without this guard.
    if (e.isSymbolicLink()) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, match, depth + 1, max);
    else if (match.test(e.name)) yield p;
  }
}

/** Class names a stylesheet declares, comments stripped first. */
export function declaredClasses(css) {
  const out = new Set();
  const text = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of text.matchAll(/([^{}]+)\{/g)) {
    const sel = m[1];
    if (sel.trim().startsWith('@')) continue;
    for (const c of sel.match(/\.[a-zA-Z_][\w-]*/g) || []) out.add(c.slice(1));
  }
  return out;
}

/**
 * @returns {{rendered:Set<string>, corpus:string, pages:number}}
 */
export function scanPages(root) {
  const rendered = new Set();
  let corpus = '';
  let pages = 0;
  for (const f of walk(root, /\.(html|htm)$/)) {
    pages++;
    const s = readFileSync(f, 'utf8');
    corpus += s;
    for (const m of s.matchAll(/class\s*=\s*["']([^"']*)["']/g))
      for (const c of m[1].split(/\s+/)) if (c) rendered.add(c);
  }
  for (const f of walk(root, /\.(mjs|cjs|js|jsx|ts|tsx)$/)) corpus += readFileSync(f, 'utf8');
  return { rendered, corpus, pages };
}

/**
 * @returns {{state:'ok'|'findings'|'unreadable',
 *            unused:string[], mentioned:string[], rendered:number, declared:number,
 *            pages:number, reason?:string}}
 */
export function audit(cssPath, root) {
  if (!existsSync(cssPath)) return { state: 'unreadable', reason: `no such stylesheet: ${cssPath}`, unused: [], mentioned: [], rendered: 0, declared: 0, pages: 0 };
  let css;
  try { css = readFileSync(cssPath, 'utf8'); }
  catch (err) { return { state: 'unreadable', reason: String(err.message || err), unused: [], mentioned: [], rendered: 0, declared: 0, pages: 0 }; }

  const declared = declaredClasses(css);
  const { rendered, corpus, pages } = scanPages(root);

  // A page corpus of zero is not "everything is unused" — it is a guard that
  // could not run. Reporting every class as dead here is how a broken sweep
  // gets acted on.
  if (pages === 0) {
    return { state: 'unreadable', reason: `no HTML found under ${root} — cannot tell used from unused`, unused: [], mentioned: [], rendered: 0, declared: declared.size, pages: 0 };
  }

  const mentioned = [];
  const unused = [];
  for (const c of declared) {
    if (rendered.has(c)) continue;
    // Word-boundary match anywhere in the source: quoted, interpolated, or
    // concatenated. Generous on purpose.
    if (new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(corpus)) mentioned.push(c);
    else unused.push(c);
  }
  unused.sort(); mentioned.sort();
  return {
    state: unused.length ? 'findings' : 'ok',
    unused, mentioned,
    rendered: declared.size - unused.length - mentioned.length,
    declared: declared.size, pages,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const cssPath = args.find((a) => !a.startsWith('--'));
  const rootFlag = args.indexOf('--root');
  const root = rootFlag !== -1 ? args[rootFlag + 1] : dirname(resolve(cssPath || '.'));
  const strict = args.includes('--strict');

  if (!cssPath) {
    console.error('usage: css-unused-selectors.mjs <stylesheet> [--root DIR] [--strict] [--json]');
    process.exit(2);
  }
  const r = audit(resolve(cssPath), resolve(root));
  if (args.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else if (r.state === 'unreadable') {
    console.error(`css-unused-selectors: NOT RUN — ${r.reason}`);
    process.exit(2);
  } else if (r.state === 'ok') {
    console.log(`css-unused-selectors: ${r.declared} class(es) declared, all rendered or referenced in code (${r.pages} page(s) scanned)`);
  } else {
    console.log(`css-unused-selectors: ${r.unused.length} class(es) declared but rendered by no page and named nowhere in code`);
    console.log(`  scanned ${r.pages} page(s) · ${r.rendered} rendered · ${r.mentioned.length} referenced only in code (left alone)`);
    for (let i = 0; i < r.unused.length; i += 8) console.log(`  ${r.unused.slice(i, i + 8).join(' ')}`);
  }
  process.exit(r.state === 'unreadable' ? 2 : (strict && r.state === 'findings' ? 1 : 0));
}
