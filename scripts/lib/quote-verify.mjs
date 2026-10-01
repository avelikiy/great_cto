#!/usr/bin/env node
/**
 * quote-verify — a quoted passage must exist in the file it cites.
 *
 * Why this exists
 * ---------------
 * Reviewers and the architect quote regulations, ADRs, specs and code in their
 * findings, and a quotation reads as evidence: the reader assumes somebody copied
 * it. finding-evidence.mjs already asks for the command behind a claim about
 * live state, but nothing asked whether a passage in quotation marks is actually
 * in the file next to it. An invented quote — fluent, plausible, attributed to a
 * real file — passed every check that existed. This one is a substring search,
 * not a judgement: the passage is in the file, or it is not.
 *
 * Two passes, in order:
 *   exact      — the quote is a byte-for-byte substring of the file.
 *   normalized — the same after collapsing whitespace (including line breaks),
 *                unifying typographic quotes, dashes and the ellipsis, and
 *                dropping markdown emphasis and backticks. Case-sensitive unless
 *                `ci` is set. A normalized pass is a pass; it says the author
 *                re-typed rather than copied.
 * Otherwise `not-found`, with the nearest line by token overlap so the author
 * can re-copy the real sentence — or `file-missing` when there is no file.
 *
 * Idea (strict pass, then a whitespace/markdown-normalised pass) from kb-verify.py
 * in techwolf-ai/ai-first-toolkit (MIT, Copyright (c) 2026 TechWolf). This is an
 * independent Node implementation; no code was copied.
 *
 * CLI:
 *   node scripts/lib/quote-verify.mjs --file F --quote "…" [--ci] [--json]
 *   node scripts/lib/quote-verify.mjs --scan report.md [--cwd DIR] [--ci] [--json]
 * Exit 1 when any quote is not-found or file-missing, 2 on a usage error.
 */

import fs from 'node:fs';
import path from 'node:path';

export const QUOTE_STATUS = Object.freeze({
  EXACT: 'exact',
  NORMALIZED: 'normalized',
  NOT_FOUND: 'not-found',
  FILE_MISSING: 'file-missing',
});

/** A quote that verifies — either pass. */
export const isVerified = (status) => status === QUOTE_STATUS.EXACT || status === QUOTE_STATUS.NORMALIZED;

// Files larger than this are not read: a quote check is not a reason to pull a
// data dump into memory, and a cited source that large is not prose anyway.
const MAX_BYTES = 8 * 1024 * 1024;

const CHAR_MAP = new Map([
  ...[...'“”„‟″«»'].map((c) => [c, '"']),
  ...[...'‘’‚‛′'].map((c) => [c, "'"]),
  ...[...'‐‑‒–—―−'].map((c) => [c, '-']),
  ['…', '...'],
]);
const DROP = new Set(['*', '_', '`']);

/**
 * Normalise text, keeping for every output character the index of the input
 * character it came from — so a normalized match can still report the line it
 * starts on in the ORIGINAL file.
 */
function normalizeWithMap(text, { ci = false } = {}) {
  const src = String(text ?? '').normalize('NFC');
  let out = '';
  const map = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (DROP.has(c)) continue;
    if (/\s/.test(c)) {
      if (out.length && out[out.length - 1] !== ' ') { out += ' '; map.push(i); }
      continue;
    }
    let r = CHAR_MAP.get(c) ?? c;
    if (ci) r = r.toLowerCase();
    for (const ch of r) { out += ch; map.push(i); }
  }
  if (out.endsWith(' ')) { out = out.slice(0, -1); map.pop(); }
  return { text: out, map };
}

/** The normalised form of a string (see the header for what it unifies). */
export function normalizeText(text, opts) {
  return normalizeWithMap(text, opts).text;
}

const lineAt = (text, index) => {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
};

const tokens = (s) => new Set((String(s).toLowerCase().match(/[\p{L}\p{N}_]+/gu) || []));

/** The file line sharing the most words with the quote — ≤ 80 chars. */
function nearestLine(content, quote) {
  const want = tokens(quote);
  if (!want.size) return null;
  let best = null;
  content.split('\n').forEach((raw, i) => {
    const have = tokens(raw);
    if (!have.size) return;
    let hits = 0;
    for (const t of want) if (have.has(t)) hits++;
    if (!hits) return;
    // Most shared words first; between equals, the line that is more nearly
    // the quote (fewer words of its own) — a long line shares everything.
    const density = hits / have.size;
    if (!best || hits > best.hits || (hits === best.hits && density > best.density)) {
      best = { line: i + 1, hits, density, raw };
    }
  });
  if (!best) return null;
  const t = best.raw.trim();
  return {
    line: best.line,
    text: t.length > 80 ? `${t.slice(0, 77)}...` : t,
    overlap: Number((best.hits / want.size).toFixed(2)),
  };
}

function readSource(file, cwd) {
  const abs = path.resolve(cwd || process.cwd(), file);
  let st;
  try { st = fs.statSync(abs); } catch { return { abs, missing: 'no such file' }; }
  if (!st.isFile()) return { abs, missing: 'not a regular file' };
  if (st.size > MAX_BYTES) return { abs, missing: `larger than ${MAX_BYTES} bytes` };
  try { return { abs, content: fs.readFileSync(abs, 'utf8') }; } catch (e) {
    return { abs, missing: `unreadable (${e.code || e.message})` };
  }
}

/**
 * Check one quote against one file.
 * @param {{file: string, quote: string, cwd?: string, ci?: boolean}} args
 * @returns {{status: 'exact'|'normalized'|'not-found'|'file-missing', line?: number,
 *            nearest?: {line: number, text: string, overlap: number}, reason?: string}}
 */
export function verifyQuote({ file, quote, cwd, ci = false } = {}) {
  const src = readSource(String(file ?? ''), cwd);
  if (src.missing) return { status: QUOTE_STATUS.FILE_MISSING, reason: src.missing };
  return matchQuote(src.content, quote, { ci });
}

function matchQuote(content, quote, { ci }) {
  const q = String(quote ?? '');
  if (!normalizeText(q).length) return { status: QUOTE_STATUS.NOT_FOUND, reason: 'empty quote' };

  const at = content.indexOf(q);
  if (at !== -1) return { status: QUOTE_STATUS.EXACT, line: lineAt(content, at) };

  const hay = normalizeWithMap(content, { ci });
  const needle = normalizeText(q, { ci });
  const nat = hay.text.indexOf(needle);
  if (nat !== -1) return { status: QUOTE_STATUS.NORMALIZED, line: lineAt(content, hay.map[nat]) };

  const nearest = nearestLine(content, q);
  return nearest ? { status: QUOTE_STATUS.NOT_FOUND, nearest } : { status: QUOTE_STATUS.NOT_FOUND };
}

// ── citations in prose ──────────────────────────────────────────────────────

// A path with an extension (letter-led, so `3.38.0` and `e.g` are not files),
// optionally `:line`, `:line-line` or `#Lline`.
const PATH_SRC = String.raw`(?:~\/|\.{1,2}\/|\/)?(?:[\w.~-]+\/)*[\w-][\w.-]*\.[A-Za-z][A-Za-z0-9]{0,7}`;
const CITE = new RegExp(String.raw`(?<![\w/:.@-])(${PATH_SRC})(?:(?::|#L)(\d+)(?:-L?\d+)?)?(?![\w/])`, 'g');
const QUOTED = /"([^"\n]+)"|“([^”\n]+)”/g;
const PARAPHRASE = /\(paraphrase[d]?\)|\[paraphrase[d]?\]|\bparaphras(?:e|ed|ing)\s*:/i;
const MIN_INLINE_CHARS = 12;

/**
 * Citations on one line. A bare word with an extension is a citation only when
 * it looks like a path (has a `/`), carries a line number, or sits in backticks
 * or parentheses — otherwise "e.g." or a domain name would be read as a file.
 */
function citationsIn(line) {
  const clean = line.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, (m) => ' '.repeat(m.length));
  const out = [];
  for (const m of clean.matchAll(CITE)) {
    const p = m[1];
    const before = clean[m.index - 1];
    const after = clean[m.index + m[0].length];
    const wrapped = (before === '`' && after === '`') || (before === '(' && after === ')');
    if (!p.includes('/') && !m[2] && !wrapped) continue;
    out.push({ file: p, citedLine: m[2] ? Number(m[2]) : undefined, index: m.index });
  }
  return out;
}

/** Quoted passages on a line, with code spans blanked so `"x"` in code is not prose. */
function inlineQuotesIn(line) {
  const prose = line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
  const out = [];
  for (const m of prose.matchAll(QUOTED)) {
    const q = (m[1] ?? m[2]).trim();
    if (normalizeText(q).length < MIN_INLINE_CHARS || !/\S\s+\S/.test(q)) continue;
    out.push({ quote: q, index: m.index });
  }
  return out;
}

const unwrap = (s) => {
  const t = s.trim();
  const m = t.match(/^["“]([\s\S]*)["”]$/);
  return m ? m[1] : t;
};

/**
 * Find quoted passages paired with the file they cite.
 *
 * Recognised:
 *   - a citation and a "quoted passage" on the same line;
 *   - a `> …` blockquote with a citation on the line before it (one blank line
 *     allowed), on the line after it, or inside it as `> Source: path` /
 *     `> — path`.
 * Not recognised, on purpose: anything inside a code fence (that is command
 * output, not a quotation), quotes under 12 characters or of one word, and a
 * passage marked `(paraphrase)` — the honest alternative to a quote.
 *
 * @returns {Array<{file, quote, citedLine?, reportLine}>}
 */
export function findQuoteCitations(text) {
  const lines = String(text ?? '').split('\n');
  const out = [];
  let inFence = false;
  const fenced = lines.map((l) => {
    if (/^\s*(```|~~~)/.test(l)) { inFence = !inFence; return true; }
    return inFence;
  });

  const isQuoteLine = (i) => !fenced[i] && /^\s*>/.test(lines[i] ?? '');
  const neighbour = (from, step) => {
    let i = from + step;
    if (i >= 0 && i < lines.length && !lines[i].trim()) i += step;
    return i >= 0 && i < lines.length && !fenced[i] && !isQuoteLine(i) ? i : -1;
  };

  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;

    if (isQuoteLine(i)) {
      const start = i;
      const body = [];
      while (i < lines.length && isQuoteLine(i)) { body.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      const end = i - 1;
      i = end; // the for-loop's i++ moves past the block

      let cite = null;
      const ATTRIB = /^\s*(?:Source:|[-–—]{1,2}\s)\s*/i;
      const src = body.findIndex((l) => ATTRIB.test(l) && l.replace(ATTRIB, '').trim());
      if (src !== -1) {
        const rest = body[src].replace(ATTRIB, '').trim();
        // `Source:` names a file even when it is a bare name with no slash;
        // a `— x` attribution line counts only if x looks like a path.
        const named = /^\s*Source:/i.test(body[src])
          ? citationsIn(`\`${rest.replace(/^`|`$/g, '').replace(/(?::|#L)\d+(?:-L?\d+)?$/, '')}\``)[0]
          : null;
        const lineNo = (rest.match(/(?::|#L)(\d+)/) || [])[1];
        cite = citationsIn(rest)[0] || (named && { ...named, citedLine: lineNo });
        if (cite) body.splice(src, 1);
      }
      if (!cite) {
        const prev = neighbour(start, -1);
        const next = neighbour(end, +1);
        const pc = prev !== -1 ? citationsIn(lines[prev]) : [];
        const nc = next !== -1 ? citationsIn(lines[next]) : [];
        cite = pc[pc.length - 1] || nc[0] || null;
        if (cite && PARAPHRASE.test(lines[cite === pc[pc.length - 1] ? prev : next])) continue;
      }
      const joined = body.join('\n');
      if (!cite || PARAPHRASE.test(joined)) continue;
      const quote = unwrap(joined);
      if (!normalizeText(quote).length) continue;
      out.push({
        file: cite.file,
        quote,
        citedLine: cite.citedLine !== undefined ? Number(cite.citedLine) : undefined,
        reportLine: start + 1,
      });
      continue;
    }

    const line = lines[i];
    if (PARAPHRASE.test(line)) continue;
    const cites = citationsIn(line);
    if (!cites.length) continue;
    for (const q of inlineQuotesIn(line)) {
      // Pair with the citation nearest to the quote on the line.
      const c = cites.reduce((a, b) => (Math.abs(b.index - q.index) < Math.abs(a.index - q.index) ? b : a));
      out.push({ file: c.file, quote: q.quote, citedLine: c.citedLine, reportLine: i + 1 });
    }
  }
  return out;
}

/** Is `abs` inside `root`, after resolving symlinks on both? */
function inside(root, abs) {
  let r; let a;
  try { r = fs.realpathSync(root); } catch { r = path.resolve(root); }
  try { a = fs.realpathSync(abs); } catch { a = path.resolve(abs); }
  const rel = path.relative(r, a);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Find every quote-with-citation in a report and verify it.
 *
 * The report is untrusted text, so a citation may not reach outside `cwd`:
 * otherwise a report could make the checker print the nearest line of any file
 * on the machine. An escaping path is `file-missing`.
 *
 * @returns {Array<{file, quote, citedLine?, reportLine, status, line?, nearest?, reason?}>}
 */
export function verifyQuotesInText(text, { cwd = process.cwd(), ci = false } = {}) {
  return findQuoteCitations(text).map((c) => {
    const abs = path.resolve(cwd, c.file.replace(/^~(?=\/)/, process.env.HOME || '~'));
    if (!inside(cwd, abs)) {
      return { ...c, status: QUOTE_STATUS.FILE_MISSING, reason: 'outside the working directory' };
    }
    return { ...c, ...verifyQuote({ file: abs, quote: c.quote, ci }) };
  });
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const clip = (s, n = 80) => {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 3)}...` : t;
};

function describe(r) {
  const where = r.line ? ` at line ${r.line}` : '';
  let s = `${r.status}${where}`;
  if (r.citedLine && r.line && r.citedLine !== r.line) s += ` (cited :${r.citedLine})`;
  if (r.reason) s += ` — ${r.reason}`;
  if (r.nearest) s += `\n      nearest: line ${r.nearest.line}: ${r.nearest.text}`;
  return s;
}

function main(argv) {
  const val = (flag) => { const i = argv.indexOf(flag); return i !== -1 ? argv[i + 1] : undefined; };
  const ci = argv.includes('--ci');
  const json = argv.includes('--json');
  const cwd = val('--cwd') || process.cwd();
  const scan = val('--scan');
  const file = val('--file');
  const quote = val('--quote');

  if (scan) {
    let text;
    try { text = fs.readFileSync(path.resolve(cwd, scan), 'utf8'); } catch {
      console.error(`quote-verify: cannot read ${scan}`);
      return 2;
    }
    const results = verifyQuotesInText(text, { cwd, ci });
    const bad = results.filter((r) => !isVerified(r.status));
    if (json) console.log(JSON.stringify(results, null, 2));
    else {
      for (const r of results) {
        const mark = isVerified(r.status) ? 'ok ' : 'BAD';
        console.log(`${mark} ${scan}:${r.reportLine} → ${r.file}  "${clip(r.quote, 60)}"\n      ${describe(r)}`);
      }
      console.log(`${results.length} quote(s), ${bad.length} not verified`);
      if (bad.length) {
        console.log('A quote that does not verify is removed, or rewritten as a paraphrase marked (paraphrase).');
      }
    }
    return bad.length ? 1 : 0;
  }

  if (file && quote !== undefined) {
    const r = verifyQuote({ file, quote, cwd, ci });
    if (json) console.log(JSON.stringify(r, null, 2));
    else console.log(`${file}: ${describe(r)}`);
    return isVerified(r.status) ? 0 : 1;
  }

  console.error('usage: quote-verify.mjs --file F --quote "…" [--ci] [--json]\n'
    + '       quote-verify.mjs --scan report.md [--cwd DIR] [--ci] [--json]');
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
