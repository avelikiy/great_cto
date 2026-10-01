#!/usr/bin/env node
/**
 * findings-dedupe — one bug, one triage.
 *
 * Why this exists
 * ---------------
 * `/review` runs ~12 angles and the pipeline runs several reviewers in
 * parallel, on purpose: coverage comes from looking at the same diff from many
 * directions. The cost of that design is that the same bug is reported more
 * than once — Security, SQL Safety and Data Privacy all see the string-built
 * query on line 42 — and every copy then went through skeptical triage (three
 * rounds + an arbiter) on its own. Three times the work for one fact, and room
 * for three different verdicts on one line of code.
 *
 * So findings are merged BEFORE verification. Each group is triaged once and
 * carries the list of angles/reviewers that raised it — agreement between
 * independent angles is itself signal, and it is kept rather than thrown away.
 *
 * When two findings are the same bug
 * ----------------------------------
 *   1. Same file (normalised path). Never across files — a pattern repeated in
 *      two files is two bugs, fixed in two places.
 *   2. Nearby lines: the two line ranges are within ±window (default 3) of each
 *      other. A finding with no line matches on content alone.
 *   3. Same content, either:
 *        - normalised evidence is equal, or one contains the other (lowercased,
 *          whitespace collapsed, quotes and line numbers stripped — so
 *          `42: db.query("…")` and `db.query('…')` compare equal), or
 *        - the titles' token sets overlap at Jaccard ≥ 0.6.
 *   Matching is pairwise and symmetric; groups are its transitive closure, so
 *   the result does not depend on input order.
 *
 * Merging never lowers a severity: a group carries the most severe label any
 * member had. Demotion is triage's job, with reasons, not the dedupe's.
 *
 * Input shapes read (existing ones, not a new schema):
 *   - {file, line, severity, issue}            cross-model-review.mjs parseFindings
 *   - {severity, title, body}                  finding-evidence.mjs parseFindings
 *     (file:line from the `**Location**` field, evidence from its fenced block)
 *   - {file, line?, endLine?, location?, severity, title, evidence?, angle|reviewer|source}
 *
 * CLI:
 *   node scripts/lib/findings-dedupe.mjs <findings.json|->
 *     stdout: {raw, unique, groups:[…]}   (pipeable)
 *     stderr: findings-dedupe: N raw → M unique
 */

import { createHash } from 'node:crypto';
import { evidenceBlock } from './finding-evidence.mjs';

export const DEFAULTS = Object.freeze({ window: 3, jaccard: 0.6 });

/**
 * Severity rank, lower = more severe. Both vocabularies in use map onto one
 * scale: /review's P0–P3 and the Structured Findings Format's Critical…Info.
 */
const RANK = {
  p0: 0, critical: 0, blocker: 0,
  p1: 1, high: 1,
  p2: 2, medium: 2, moderate: 2,
  p3: 3, low: 3, minor: 3,
  info: 4, informational: 4, note: 4,
};
const UNKNOWN_RANK = 5;

export function severityRank(sev) {
  const r = RANK[String(sev ?? '').trim().toLowerCase()];
  return r === undefined ? UNKNOWN_RANK : r;
}

/** `./src\\a.js` and `src/a.js` are one file. */
function normaliseFile(f) {
  if (f == null) return null;
  const s = String(f).trim().replace(/^`|`$/g, '').replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  return s || null;
}

/** `` `src/a.js:12-15` `` → {file, line, endLine}. */
export function parseLocation(loc) {
  const s = String(loc ?? '').trim().replace(/^`|`$/g, '').trim();
  const m = s.match(/^([^\s:`]+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?/);
  if (!m) return { file: null, line: null, endLine: null };
  return {
    file: normaliseFile(m[1]),
    line: m[2] ? Number(m[2]) : null,
    endLine: m[3] ? Number(m[3]) : null,
  };
}

/**
 * Evidence text in a comparable form. Line numbers go because two reviewers
 * quoting one line will number it differently (or not at all); quotes go
 * because one angle writes `"…"` and another `'…'` for the same literal.
 */
export function normaliseEvidence(ev) {
  if (ev == null) return '';
  const text = typeof ev === 'string' ? ev : (ev.raw ?? ev.output ?? ev.command ?? '');
  return String(text)
    .split('\n')
    .map((l) => l
      .replace(/^\s*[+-](?=\s)/, '')              // diff markers
      .replace(/^\s*\$\s+/, '')                   // shell prompt
      .replace(/^\s*(?:l(?:ine)?\s*)?\d+\s*[:|]\s?/i, '')) // "42:", "42 |", "line 42:"
    .join(' ')
    .replace(/:\d+(?::\d+)?\b/g, '')              // file:12 / file:12:3
    .replace(/#L\d+(?:-L?\d+)?/gi, '')            // #L12-L15
    .replace(/\bline\s+\d+\b/gi, '')
    .replace(/["'`‘’“”]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set(['a', 'an', 'the', 'in', 'on', 'of', 'to', 'for', 'and', 'or', 'is', 'are',
  'be', 'by', 'at', 'with', 'from', 'into', 'this', 'that', 'it', 'as', 'not', 'no']);

function titleTokens(t) {
  return new Set(String(t ?? '').toLowerCase().split(/[^a-z0-9_]+/).filter((w) => w.length > 1 && !STOP.has(w)));
}

/** |A∩B| / |A∪B| over title tokens; 0 when either side is empty. */
export function titleJaccard(a, b) {
  const A = titleTokens(a); const B = titleTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Any accepted input shape → one internal record. */
function canonical(f, index) {
  const x = f && typeof f === 'object' ? f : {};
  let file = normaliseFile(x.file ?? x.path);
  let line = Number.isFinite(Number(x.line)) && x.line !== null && x.line !== '' ? Number(x.line) : null;
  let endLine = Number.isFinite(Number(x.endLine)) && x.endLine != null ? Number(x.endLine) : null;

  const locText = x.location
    ?? (typeof x.body === 'string' ? (x.body.match(/^\s*[-*]?\s*\*\*Location\*\*\s*:\s*(.+)$/mi) || [])[1] : null);
  if (locText && (!file || line == null)) {
    const loc = parseLocation(locText);
    file = file ?? loc.file;
    if (line == null) { line = loc.line; endLine = endLine ?? loc.endLine; }
  }

  let evidence = x.evidence ?? null;
  if (evidence == null && typeof x.body === 'string') evidence = evidenceBlock(x.body);
  const evText = evidence == null ? null : (typeof evidence === 'string' ? evidence : (evidence.raw ?? evidence.output ?? null));

  const title = String(x.title ?? x.issue ?? x.description ?? '').trim();
  const severity = x.severity == null ? null : String(x.severity).trim();
  const source = String(x.angle ?? x.reviewer ?? x.source ?? x.agent ?? '').trim() || null;

  return {
    index,
    file,
    start: line,
    end: line == null ? null : Math.max(line, endLine ?? line),
    title,
    severity,
    rank: severityRank(severity),
    source,
    evidence: evText,
    ev: normaliseEvidence(evText),
  };
}

/** Evidence equal, or the shorter (≥ 12 chars) contained in the longer. */
function evidenceMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 12 && l.includes(s);
}

function near(a, b, window) {
  if (a.start == null || b.start == null) return true;   // no line → content decides
  const gap = Math.max(a.start, b.start) - Math.min(a.end, b.end);
  return gap <= window;
}

function sameBug(a, b, { window, jaccard }) {
  if (!a.file || !b.file || a.file !== b.file) return false;
  if (!near(a, b, window)) return false;
  return evidenceMatch(a.ev, b.ev) || titleJaccard(a.title, b.title) >= jaccard;
}

const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
const uniqSorted = (xs) => [...new Set(xs)].sort(cmp);

/**
 * Merge findings that describe the same bug.
 *
 * @param {Array<object>} findings
 * @param {{window?: number, jaccard?: number}} [opts]
 * @returns {Array<{key, file, lines, severity, titles, sources, evidence, count}>}
 */
export function dedupeFindings(findings, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const recs = (Array.isArray(findings) ? findings : []).map(canonical);

  // Union-find: a symmetric pairwise predicate plus transitive closure has one
  // answer whatever the input order is.
  const parent = recs.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < recs.length; i++) {
    for (let j = i + 1; j < recs.length; j++) {
      if (sameBug(recs[i], recs[j], o)) {
        const a = find(i); const b = find(j);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
    }
  }
  const buckets = new Map();
  for (const r of recs) {
    const root = find(r.index);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(r);
  }

  const groups = [...buckets.values()].map((members) => {
    // Representative: most severe, then earliest line, then content — never
    // input position, which would make the output order-dependent.
    const rep = [...members].sort((a, b) =>
      a.rank - b.rank
      || (a.start ?? Infinity) - (b.start ?? Infinity)
      || cmp(a.title, b.title)
      || cmp(a.ev, b.ev)
      || cmp(a.source ?? '', b.source ?? ''))[0];
    const lines = uniqSorted(members.flatMap((m) => (m.start == null ? [] : [m.start])).map(Number)).sort((a, b) => a - b);
    const titles = uniqSorted(members.map((m) => m.title).filter(Boolean));
    const sources = uniqSorted(members.map((m) => m.source).filter(Boolean));
    const fingerprint = uniqSorted(members.map((m) => `${m.ev}\u0000${m.title.toLowerCase()}`)).join('\u0001');
    const hash = createHash('sha1').update(fingerprint).digest('hex').slice(0, 8);
    const span = lines.length ? `${lines[0]}${lines.length > 1 ? `-${lines.at(-1)}` : ''}` : '?';
    return {
      key: `${rep.file ?? '(no-file)'}:${span}#${hash}`,
      file: rep.file,
      lines,
      severity: rep.severity,
      titles,
      sources,
      evidence: rep.evidence,
      count: members.length,
    };
  });

  const firstLine = (g) => (g.lines.length ? g.lines[0] : Infinity);
  return groups.sort((a, b) =>
    cmp(a.file ?? '￿', b.file ?? '￿')
    || firstLine(a) - firstLine(b)
    || severityRank(a.severity) - severityRank(b.severity)
    || cmp(a.key, b.key));
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main(argv) {
  const { readFileSync } = await import('node:fs');
  const file = argv.find((a) => !a.startsWith('--') || a === '-');
  if (!file) {
    console.error('usage: findings-dedupe.mjs <findings.json|->   (array, or {findings:[…]})');
    return 2;
  }
  let data;
  try {
    data = JSON.parse(readFileSync(file === '-' ? 0 : file, 'utf8'));
  } catch (e) {
    // An unreadable input is not "0 unique findings" — that would read as a
    // clean review.
    console.error(`findings-dedupe: cannot read ${file}: ${e.message}`);
    return 2;
  }
  const list = Array.isArray(data) ? data : data?.findings;
  if (!Array.isArray(list)) {
    console.error('findings-dedupe: expected a JSON array of findings, or {findings:[…]}');
    return 2;
  }
  const groups = dedupeFindings(list);
  console.log(JSON.stringify({ raw: list.length, unique: groups.length, groups }, null, 2));
  console.error(`findings-dedupe: ${list.length} raw → ${groups.length} unique`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
