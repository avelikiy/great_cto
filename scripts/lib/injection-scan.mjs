/**
 * injection-scan — text that reaches a model, read for what a human cannot see.
 *
 * `read-global-memory.mjs` pours ~/.great_cto lessons, decisions and preferences
 * into EVERY session of EVERY project, and it checked them for secrets only. A
 * secret there leaks outward; an injection there steers inward — instructions to
 * every agent in every project. The worst ones are the ones a reviewer cannot
 * see: zero-width and bidi characters render as nothing, and an HTML comment is
 * hidden by every Markdown renderer while still reaching the model verbatim.
 *
 * Three kinds, and severity is the false-positive budget:
 *
 *   invisible-unicode         high    — invisible anywhere, fence or not
 *   html-comment-instruction  high    — hidden from a reader, addressed to a model
 *   injection-cue             medium  — the classic phrases, in prose
 *                             low     — the same phrases QUOTED: in a code fence,
 *                                       an inline code span, or after "e.g." /
 *                                       "for example" / "such as". A lesson that
 *                                       documents an attack is not an attack.
 *
 * What renders as one glyph is not hidden: a ZWJ inside an emoji sequence, a
 * ZWJ/ZWNJ between letters of a script that needs it, and the tag characters of
 * a subdivision flag are allowed. A BOM at offset 0 is an encoding, not a payload.
 *
 * Pure and zero-dependency. Excerpts are escaped so a finding never carries the
 * raw character onward into a log or a context.
 */

export const KINDS = Object.freeze(['invisible-unicode', 'html-comment-instruction', 'injection-cue']);
export const SEVERITY_ORDER = Object.freeze(['low', 'medium', 'high']);

const EXCERPT_MAX = 80;

// ── Invisible characters ────────────────────────────────────────────────────

const ZWNJ = 0x200C;
const ZWJ = 0x200D;
const BOM = 0xFEFF;
const BLACK_FLAG = 0x1F3F4;
const CANCEL_TAG = 0xE007F;

function isInvisibleCp(cp) {
  return (cp >= 0x200B && cp <= 0x200F)
    || (cp >= 0x2060 && cp <= 0x2064)
    || cp === BOM
    || (cp >= 0x202A && cp <= 0x202E)
    || (cp >= 0x2066 && cp <= 0x2069)
    || (cp >= 0xE0000 && cp <= 0xE007F);
}

const PICTO = /\p{Extended_Pictographic}/u;
const LETTER_OR_MARK = /[\p{L}\p{M}]/u;
/** Emoji presentation selector and skin-tone modifiers sit between a pictograph and its ZWJ. */
const isEmojiModifier = (cp) => cp === 0xFE0F || (cp >= 0x1F3FB && cp <= 0x1F3FF);
const isPicto = (cp) => cp != null && PICTO.test(String.fromCodePoint(cp));
/** A letter from a script that uses ZWJ/ZWNJ for shaping (Arabic, Indic, …) — not Latin. */
const isShapingLetter = (cp) => cp != null && cp > 0x024F && LETTER_OR_MARK.test(String.fromCodePoint(cp));

/**
 * Every invisible character the scanner objects to, as UTF-16 offsets.
 * @returns {{index:number, cp:number, width:number}[]}
 */
function invisibleOffsets(text) {
  const cps = [];
  for (let i = 0; i < text.length;) {
    const cp = text.codePointAt(i);
    const width = cp > 0xFFFF ? 2 : 1;
    cps.push({ index: i, cp, width });
    i += width;
  }
  const out = [];
  for (let k = 0; k < cps.length; k++) {
    const { cp, index } = cps[k];
    if (!isInvisibleCp(cp)) continue;
    if (cp === BOM && index === 0) continue;

    if (cp === ZWJ || cp === ZWNJ) {
      let p = k - 1;
      while (p >= 0 && isEmojiModifier(cps[p].cp)) p -= 1;
      const prev = p >= 0 ? cps[p].cp : null;
      const next = k + 1 < cps.length ? cps[k + 1].cp : null;
      if (cp === ZWJ && isPicto(prev) && isPicto(next)) continue;
      if (isShapingLetter(prev) && isShapingLetter(next)) continue;
    }

    if (cp >= 0xE0000 && cp <= CANCEL_TAG) {
      // A subdivision flag: U+1F3F4, a short run of tag characters, U+E007F.
      let s = k;
      while (s > 0 && cps[s - 1].cp >= 0xE0020 && cps[s - 1].cp < CANCEL_TAG) s -= 1;
      let e = k;
      while (e < cps.length && cps[e].cp >= 0xE0020 && cps[e].cp < CANCEL_TAG) e += 1;
      const flagged = s > 0 && cps[s - 1].cp === BLACK_FLAG
        && e < cps.length && cps[e].cp === CANCEL_TAG && e - s >= 1 && e - s <= 8;
      if (flagged) continue;
    }
    out.push(cps[k]);
  }
  return out;
}

/** Remove every character the scanner would flag, plus a leading BOM. */
export function stripInvisible(text) {
  const s = String(text ?? '');
  const drop = invisibleOffsets(s);
  let out = '';
  let at = 0;
  for (const { index, width } of drop) { out += s.slice(at, index); at = index + width; }
  out += s.slice(at);
  return out.charCodeAt(0) === BOM ? out.slice(1) : out;
}

// ── Cues ────────────────────────────────────────────────────────────────────

/** The classic injection phrases. Tuned against ordinary engineering prose. */
const INJECTION_CUES = [
  /\bignore\s+(?:all\s+|any\s+)?(?:the\s+|your\s+)?(?:previous|prior|above|earlier|preceding)\s+(?:instructions?|prompts?|rules|directions|context)\b/i,
  /\bdisregard\s+(?:all\s+|any\s+)?(?:the\s+|your\s+)?(?:above|previous|prior|earlier|preceding|instructions?|system\s+prompt)\b/i,
  /\bforget\s+(?:all\s+)?(?:your|the|previous|prior)\s+(?:previous\s+|prior\s+)?(?:instructions?|rules|prompts?)\b/i,
  /\byou\s+are\s+now\s+(?:a|an|the|DAN|jailbroken|unrestricted|in\s+(?:developer|god|dan)\s+mode)\b/i,
  /\bsystem\s+prompt\s*:/i,
  /<\/?system>/i,
  /\[\/?INST\]/,
  /<\|im_(?:start|end)\|>/,
  /\bnew\s+instructions\s*:/i,
  // Imperative only: "exfiltrate the keys", not "an attacker could exfiltrate".
  /(?:^|[.!;:]\s*|\b(?:and|then|please|now)\s+)exfiltrate\b/i,
  /\bsend\s+(?:the\s+|all\s+|your\s+|any\s+)?(?:contents?|secrets?|env(?:ironment)?(?:\s+variables)?|credentials|api[\s_-]?keys?|tokens?|\.env)\b[^\n]{0,40}?\bto\s+https?:\/\//i,
];

/** Inside a hidden comment, addressing the model is itself the signal. */
const COMMENT_CUES = [
  ...INJECTION_CUES,
  /\b(?:ai|assistant|llm|claude|codex|gpt)\s*[:,]/i,
  /\b(?:always|never)\s+(?:approve|merge|skip|ignore|run|execute|mention|tell|reveal|say|reply|respond|include|disable)\b/i,
  /\byou\s+(?:must|should|will|are\s+to)\b/i,
  /\b(?:do\s+not|don't|never)\s+(?:tell|mention|reveal|inform|show)\b/i,
  /\b(?:curl|wget)\b[^\n]*\|\s*(?:sh|bash|zsh|node|python3?)\b/,
];

/** An example marker earlier on the same line: what follows is quoted, not addressed. */
const QUOTE_LEAD = /(?:\be\.g\.|\bi\.e\.|\bfor\s+example\b|\bsuch\s+as\b)/i;

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeForExcerpt(s) {
  return s.replace(/[\p{Cc}\p{Cf}]/gu, (ch) => (ch === '\t' ? ' ' : `\\u{${ch.codePointAt(0).toString(16)}}`));
}

function clip(s) {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length <= EXCERPT_MAX ? one : `${one.slice(0, EXCERPT_MAX - 1)}…`;
}

/** Offsets at which each line starts. */
function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function lineOf(starts, offset) {
  let lo = 0; let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

/** For each line (0-based), whether it is part of a fenced code block, fences included. */
function fenceMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(lines[i]);
    if (open) {
      mask[i] = true;
      if (m && m[1][0] === open[0] && m[1].length >= open.length) open = null;
    } else if (m) {
      mask[i] = true;
      open = m[1];
    }
  }
  return mask;
}

/** [start, end) ranges of inline code spans on one line. */
function inlineCodeRanges(line) {
  const out = [];
  const re = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g;
  let m;
  while ((m = re.exec(line))) out.push([m.index, m.index + m[0].length]);
  return out;
}

const within = (ranges, pos) => ranges.some(([a, b]) => pos >= a && pos < b);

// ── The scan ────────────────────────────────────────────────────────────────

/**
 * @param {string} text
 * @returns {{kind:string, severity:'low'|'medium'|'high', line:number, endLine?:number, excerpt:string}[]}
 *   ordered by line. At most one finding per kind per line.
 */
export function scanText(text) {
  const src = String(text ?? '');
  const starts = lineStarts(src);
  const lines = src.split('\n');
  const fenced = fenceMask(lines);
  const findings = [];

  // 1. Invisible characters — high wherever they are.
  const seenInvisible = new Set();
  for (const { index, cp, width } of invisibleOffsets(src)) {
    const line = lineOf(starts, index);
    if (seenInvisible.has(line)) continue;
    seenInvisible.add(line);
    const ls = starts[line - 1];
    const le = line < starts.length ? starts[line] - 1 : src.length;
    const before = src.slice(Math.max(ls, index - 25), index);
    const after = src.slice(index + width, Math.min(le, index + width + 25));
    const excerpt = escapeForExcerpt(before) + `\\u{${cp.toString(16)}}` + escapeForExcerpt(after);
    findings.push({ kind: 'invisible-unicode', severity: 'high', line, excerpt: clip(excerpt) });
  }

  // 2. HTML comments — hidden from a reader. Instructions inside are high.
  const hiddenSpans = [];
  const commentRe = /<!--([\s\S]*?)(?:-->|$(?![\s\S]))/g;
  let m;
  while ((m = commentRe.exec(src))) {
    if (m[0].length === 0) { commentRe.lastIndex += 1; continue; }
    const line = lineOf(starts, m.index);
    if (fenced[line - 1]) continue;
    const col = m.index - starts[line - 1];
    if (within(inlineCodeRanges(lines[line - 1]), col)) continue;
    const body = m[1];
    if (!COMMENT_CUES.some((re) => re.test(body))) continue;
    const endLine = lineOf(starts, m.index + m[0].length - 1);
    hiddenSpans.push([m.index, m.index + m[0].length]);
    findings.push({
      kind: 'html-comment-instruction', severity: 'high', line, endLine,
      excerpt: clip(escapeForExcerpt(`<!--${body}${m[0].endsWith('-->') ? '-->' : ''}`)),
    });
  }

  // 3. Injection cues, line by line; quoted ones are low.
  for (let i = 0; i < lines.length; i++) {
    const text1 = lines[i];
    let best = null;
    for (const re of INJECTION_CUES) {
      const hit = re.exec(text1);
      if (!hit) continue;
      // The match may begin with a separator (the imperative-exfiltrate form).
      const pos = hit.index + (hit[0].length - hit[0].trimStart().length);
      if (within(hiddenSpans, starts[i] + pos)) continue; // already reported as hidden
      const quoted = fenced[i] || within(inlineCodeRanges(text1), pos) || QUOTE_LEAD.test(text1.slice(0, pos));
      const severity = quoted ? 'low' : 'medium';
      if (!best || SEVERITY_ORDER.indexOf(severity) > SEVERITY_ORDER.indexOf(best.severity)) {
        best = { kind: 'injection-cue', severity, line: i + 1, excerpt: clip(escapeForExcerpt(text1.slice(Math.max(0, pos - 20)))) };
      }
    }
    if (best) findings.push(best);
  }

  return findings.sort((a, b) => a.line - b.line || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
}

// ── Memory screening ────────────────────────────────────────────────────────

const ENTRY_HEADING = /^#{1,2}\s/;

/**
 * Drop every memory ENTRY (a `#`/`##` section, or the preamble before the first
 * one) that carries a high or medium finding, then strip invisible characters
 * from what remains. One poisoned lesson must not cost the operator the rest.
 *
 * `dropped` carries the entry's heading line and the finding kinds — never its
 * text, which is the payload.
 *
 * @returns {{content:string, dropped:{line:number, kinds:string[]}[]}}
 */
export function screenMemoryText(text) {
  const src = String(text ?? '');
  const lines = src.split('\n');
  const fenced = fenceMask(lines);

  // Entry start lines (1-based). The preamble starts at line 1.
  const entryStarts = [1];
  for (let i = 0; i < lines.length; i++) {
    if (!fenced[i] && ENTRY_HEADING.test(lines[i]) && i > 0) entryStarts.push(i + 1);
  }
  const entryOf = (line) => {
    let k = 0;
    while (k + 1 < entryStarts.length && entryStarts[k + 1] <= line) k += 1;
    return k;
  };

  const kindsByEntry = new Map();
  for (const f of scanText(src)) {
    if (f.severity === 'low') continue;
    const first = entryOf(f.line);
    const last = entryOf(f.endLine ?? f.line);
    for (let e = first; e <= last; e++) {
      if (!kindsByEntry.has(e)) kindsByEntry.set(e, new Set());
      kindsByEntry.get(e).add(f.kind);
    }
  }

  if (!kindsByEntry.size) return { content: stripInvisible(src), dropped: [] };

  const kept = [];
  const dropped = [];
  for (let e = 0; e < entryStarts.length; e++) {
    const from = entryStarts[e] - 1;
    const to = e + 1 < entryStarts.length ? entryStarts[e + 1] - 1 : lines.length;
    if (kindsByEntry.has(e)) {
      dropped.push({ line: entryStarts[e], kinds: KINDS.filter((k) => kindsByEntry.get(e).has(k)) });
    } else {
      kept.push(...lines.slice(from, to));
    }
  }
  return { content: stripInvisible(kept.join('\n')), dropped };
}
