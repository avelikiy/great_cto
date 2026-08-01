#!/usr/bin/env node
/**
 * prose-slop — find the AI-voice tics in prose that agents write.
 *
 * Why this exists
 * ---------------
 * The advice going around is to paste writing rules into CLAUDE.md — Orwell's
 * six rules, or a list of thirty slop patterns — and trust the model to obey
 * them. That is the same bet this repo keeps losing: a rule stated in prose is
 * not a rule that runs. Our own quality oracle graded by filenames, our
 * quota-check never fired, our dispatcher waited on a gate nobody created. A
 * writing standard nobody can measure decays the same way, only quieter,
 * because nothing ever fails.
 *
 * So this is the part of the advice that can be decided by a machine. It does
 * NOT judge rhythm, insight, or voice — those need a reader. It finds the
 * mechanical tells: dead words, throat-clearing, achievement language, weasel
 * attribution, decorative formatting.
 *
 * What it must never do
 * ---------------------
 * Fire inside code. Prose lives around code in every file we write — fenced
 * blocks, inline spans, paths, URLs, identifiers. `utilize` is slop in a
 * sentence and an API name in a call. A linter that cannot tell them apart gets
 * disabled within a week, so the masking below is the load-bearing part, not the
 * word lists.
 *
 * Advisory by design: it returns findings, it does not decide anyone's fate.
 *
 * CLI:  node scripts/lib/prose-slop.mjs <file>...  [--json] [--quiet]
 *       exit 0 always unless --strict is passed (then 1 when findings exist)
 *
 * Opt out of a single line with a trailing `<!-- slop-ok: reason -->`.
 *
 * Phrases come from agents/_shared/prose-deny.txt (the one list) plus the
 * built-ins below, which add a per-phrase replacement the flat file cannot carry.
 */

/** Words that carry no information in our writing. value = the plain word. */
const DEAD_WORDS = Object.freeze({
  delve: 'dig into / look at',
  utilize: 'use',
  leverage: 'use',
  streamline: 'simplify',
  robust: 'name the property — fast? tested? handles bad input?',
  comprehensive: 'say the scope — "all 68 agents", "every endpoint"',
  seamless: 'cut it, or say what the user does not have to do',
  'paradigm shift': 'say what changed',
  pivotal: 'say why it matters',
  'game-changer': 'say what it changes',
  testament: 'cut it',
  myriad: 'many, or the number',
  plethora: 'many, or the number',
  crucial: 'say what breaks without it',
  vital: 'say what breaks without it',
  'best-in-class': 'cut it, or give the measurement',
  'cutting-edge': 'cut it',
  'state-of-the-art': 'cut it',
});

/** Openers that delay the sentence without adding to it. */
const THROAT_CLEARING = Object.freeze([
  "here's the thing",
  'let me be clear',
  "let's dive in",
  "let's dive into",
  "it's important to note",
  "it's worth noting",
  'needless to say',
  'at the end of the day',
  'in a world where',
  "in today's world",
  "in today's fast-paced",
  'when it comes to',
  'that being said',
  'what most people get wrong',
  'the part everyone misses',
  'what if i told you',
  'think about it',
  'plot twist',
]);

/** Claims with nobody behind them. */
const WEASEL_ATTRIBUTION = Object.freeze([
  'experts agree',
  'studies show',
  'research shows',
  'it is widely known',
  'it is generally accepted',
  'many believe',
  'some would argue',
  'industry leaders',
]);

/** Report language: the "✅ Successfully implemented" wall at the end of a run. */
const ACHIEVEMENT = Object.freeze([
  'successfully implemented',
  'successfully completed',
  'successfully created',
  'successfully added',
  'perfect!',
  'excellent!',
  'great news',
  'i have successfully',
  'now everything works',
  'all set!',
]);

/** Adverbs that survive deletion. Matched as whole words only. */
const EMPTY_ADVERBS = Object.freeze([
  'basically', 'essentially', 'literally', 'honestly', 'truly',
  'simply', 'merely', 'quite', 'very', 'really',
]);

const RULES = Object.freeze({
  'SLOP-DEAD': 'dead word — carries no information',
  'SLOP-OPENER': 'throat-clearing — the sentence starts after this',
  'SLOP-WEASEL': 'claim with no source — name who, or drop it',
  'SLOP-BRAG': 'achievement language — say what changed and what did not',
  'SLOP-ADVERB': 'adverb that survives deletion',
  'SLOP-EMOJI-HEAD': 'decorative emoji in a heading',
  'SLOP-PASSIVE-BRAG': 'passive + achievement — name who did it',
  'SLOP-HEDGE': 'hedge with no evidence behind it — cite it or drop it',
});

/** Rules NOT run unless asked for. See parseDenyList for why SLOP-HEDGE is here. */
const OPT_IN_RULES = Object.freeze(['SLOP-HEDGE']);

/** Which rule each `RULE-NN` section of prose-deny.txt feeds. */
const DENY_SECTIONS = Object.freeze({
  'RULE-04': 'SLOP-OPENER',
  'RULE-05': 'SLOP-DEAD',
  'RULE-H': 'SLOP-HEDGE',
});

const DENY_FIX = Object.freeze({
  'SLOP-OPENER': 'cut it — the sentence starts after this',
  'SLOP-DEAD': 'say the mechanism or the number instead',
  'SLOP-HEDGE': 'add the evidence (file:line, metric, CVE) or drop the claim',
});

/**
 * Parse `agents/_shared/prose-deny.txt` into {ruleId: [phrase, …]}.
 *
 * The deny list and this module used to be two lists of banned phrases that
 * nobody diffed — one documented as "reference-only" (a word list, never a
 * checker) and one that ran. They were free to drift because only one of them
 * could ever be wrong out loud. Now the file is the source and this is the
 * checker, so a phrase added there starts being enforced with no code change.
 *
 * SLOP-HEDGE is opt-in rather than default: "appears to" and "might be" are
 * correct in a prompt that *describes* hedging (every reviewer prompt does), so
 * running it over agents/ reports the rule's own subject matter. It belongs on
 * findings and reports — `--rule SLOP-HEDGE` — not on everything.
 */
export function parseDenyList(text) {
  const out = {};
  let bucket = null;
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const m = line.match(/\b(RULE-[\w]+)\b/);
      if (m && DENY_SECTIONS[m[1]]) bucket = DENY_SECTIONS[m[1]];
      continue;                                    // header comments only
    }
    if (!bucket) continue;                         // phrases before any section: ignored
    (out[bucket] ||= []).push(line.toLowerCase());
  }
  return out;
}

/** Default deny-list location, resolved from this file so cwd does not matter. */
export function defaultDenyPath() {
  return new URL('../../agents/_shared/prose-deny.txt', import.meta.url);
}

/** Read + parse the deny list; {} when it is absent (the lib must still work). */
export async function loadDenyList(path = defaultDenyPath()) {
  try {
    const { readFileSync } = await import('node:fs');
    return parseDenyList(readFileSync(path, 'utf8'));
  } catch { return {}; }
}

/**
 * Blank out every span where a word is code, not prose, preserving offsets so
 * line/column reporting stays honest. Order matters: fenced blocks first, or a
 * ``` inside an inline span splits the file wrong.
 */
export function maskCode(text) {
  let out = String(text);
  const blank = (m) => m.replace(/[^\n]/g, ' ');           // keep newlines, kill content
  out = out.replace(/```[\s\S]*?```/g, blank);             // fenced blocks
  out = out.replace(/~~~[\s\S]*?~~~/g, blank);             // fenced, tilde form
  // Indented code blocks — but NOT a nested list item. In markdown a bullet
  // indented under its parent is prose, and blanking it made the linter silently
  // skip every nested bullet in the corpus: the same phrase was flagged at the
  // top level and invisible one level in. A line whose first non-space character
  // starts a list item is prose however deep it sits.
  out = out.replace(/^(?: {4}|\t)(.*)$/gm, (m, body) =>
    /^\s*(?:[-*+]\s|\d+[.)]\s)/.test(body) ? m : blank(m));
  out = out.replace(/`[^`\n]*`/g, blank);                  // inline code
  out = out.replace(/<!--[\s\S]*?-->/g, blank);            // html comments
  out = out.replace(/\]\([^)\s]+\)/g, blank);              // link targets, not link text
  out = out.replace(/\bhttps?:\/\/\S+/g, blank);           // bare URLs
  out = out.replace(/(^|\s)[~./][\w./-]*\/[\w./-]*/g, blank); // paths
  out = out.replace(/^\s*>.*$/gm, blank);                  // block quotes — someone else's words
  return out;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @returns {Array<{rule:string, line:number, column:number, quote:string, fix:string}>}
 */
export function detectSlop(text, { rules = null, deny = null } = {}) {
  const raw = String(text ?? '');
  const masked = maskCode(raw);
  const rawLines = raw.split('\n');
  const findings = [];
  const wanted = (id) => (rules ? rules.includes(id) : !OPT_IN_RULES.includes(id));

  const at = (index) => {
    const before = masked.slice(0, index);
    const line = before.split('\n').length;
    return { line, column: index - before.lastIndexOf('\n') };
  };
  // `<!-- slop-ok -->` or `<!-- slop-ok: why -->` — a silenced line should be
  // able to say why, or the next reader deletes the marker as unexplained.
  const optedOut = (line) => /<!--\s*slop-ok\b[^>]*-->/.test(rawLines[line - 1] || '');

  const scan = (id, phrases, fixFor) => {
    if (!wanted(id)) return;
    for (const phrase of phrases) {
      // \b fails on phrases ending in punctuation ("perfect!"), so bound by hand
      const rx = new RegExp(`(^|[^\\w-])(${escape(phrase)})(?![\\w-])`, 'gi');
      for (const m of masked.matchAll(rx)) {
        const idx = m.index + m[1].length;
        const pos = at(idx);
        if (optedOut(pos.line)) continue;
        findings.push({ rule: id, ...pos, quote: m[2], fix: fixFor(phrase) });
      }
    }
  };

  // Built-ins carry a per-phrase replacement, so they win where both lists hold
  // the same phrase; the deny file contributes everything it adds beyond them.
  const merge = (id, builtins) => {
    const extra = (deny?.[id] || []).filter((p) => !builtins.includes(p));
    return [...builtins, ...extra];
  };
  const fixFor = (id, builtinFix) => (p) => builtinFix(p) ?? DENY_FIX[id];

  scan('SLOP-DEAD', merge('SLOP-DEAD', Object.keys(DEAD_WORDS)),
    fixFor('SLOP-DEAD', (p) => DEAD_WORDS[p]));
  scan('SLOP-OPENER', merge('SLOP-OPENER', THROAT_CLEARING),
    () => DENY_FIX['SLOP-OPENER']);
  scan('SLOP-HEDGE', deny?.['SLOP-HEDGE'] || [], () => DENY_FIX['SLOP-HEDGE']);
  scan('SLOP-WEASEL', WEASEL_ATTRIBUTION, () => 'name the source, or drop the claim');
  scan('SLOP-BRAG', ACHIEVEMENT, () => 'say what changed, and what still fails');
  scan('SLOP-ADVERB', EMPTY_ADVERBS, () => 'delete it and read the sentence again');

  // Emoji used as decoration in a heading. Status markers inside a table or a
  // sentence are how we report pass/fail — those stay.
  if (wanted('SLOP-EMOJI-HEAD')) {
    // \p{Extended_Pictographic} rather than a surrogate-pair class: under the
    // `u` flag a hand-rolled \uD83D[...] range matches nothing, silently.
    const rx = /^#{1,6} .*?(\p{Extended_Pictographic})/gmu;
    for (const m of masked.matchAll(rx)) {
      const pos = at(m.index);
      if (optedOut(pos.line)) continue;
      findings.push({
        rule: 'SLOP-EMOJI-HEAD', ...pos, quote: m[1],
        fix: 'let the words carry the heading',
      });
    }
  }

  // "X has been implemented" — the passive that hides who did it, in the one
  // construction where it is always avoidable.
  if (wanted('SLOP-PASSIVE-BRAG')) {
    const rx = /\b(?:has|have|had)\s+been\s+(implemented|added|created|introduced|established|completed)\b/gi;
    for (const m of masked.matchAll(rx)) {
      const pos = at(m.index);
      if (optedOut(pos.line)) continue;
      findings.push({
        rule: 'SLOP-PASSIVE-BRAG', ...pos, quote: m[0],
        fix: `name who: "we ${m[1] === 'implemented' ? 'implemented' : m[1]} …"`,
      });
    }
  }

  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

export { RULES, DEAD_WORDS, THROAT_CLEARING, WEASEL_ATTRIBUTION, ACHIEVEMENT, EMPTY_ADVERBS };

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main(argv) {
  const { readFileSync } = await import('node:fs');
  const flagIdx = (name) => argv.indexOf(name);
  const flagVal = (name) => (flagIdx(name) >= 0 ? argv[flagIdx(name) + 1] : null);
  // Consume by POSITION, not by value. A Set of values removed every argument
  // equal to a flag's operand, so `--deny rules.md rules.md` — linting the deny
  // list itself — dropped the file and the run silently checked nothing.
  const consumed = new Set();
  for (const f of ['--deny', '--rule']) {
    const i = flagIdx(f);
    if (i >= 0) { consumed.add(i); consumed.add(i + 1); }
  }
  const files = argv.filter((a, i) => !a.startsWith('--') && !consumed.has(i));
  const rules = flagVal('--rule') ? flagVal('--rule').split(',') : null;
  const deny = argv.includes('--no-deny') ? null : await loadDenyList(flagVal('--deny') || undefined);
  const json = argv.includes('--json');
  const quiet = argv.includes('--quiet');
  const strict = argv.includes('--strict');

  if (!files.length) {
    console.error('usage: prose-slop.mjs <file>... [--json] [--quiet] [--strict]');
    console.error('                       [--rule ID,ID] [--deny <path>] [--no-deny]');
    console.error(`phrases come from ${defaultDenyPath().pathname.split('/').slice(-3).join('/')} plus built-ins`);
    console.error('rules:');
    for (const [id, desc] of Object.entries(RULES)) console.error(`  ${id.padEnd(18)} ${desc}`);
    return 2;
  }

  const all = [];
  for (const f of files) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    for (const hit of detectSlop(text, { rules, deny })) all.push({ file: f, ...hit });
  }

  if (json) { console.log(JSON.stringify(all, null, 2)); return strict && all.length ? 1 : 0; }

  if (!all.length) {
    if (!quiet) console.log(`prose-slop: clean (${files.length} file(s))`);
    return 0;
  }
  for (const h of all) {
    console.log(`${h.file}:${h.line}:${h.column}  ${h.rule}  "${h.quote}"`);
    console.log(`    → ${h.fix}`);
  }
  console.log(`\nprose-slop: ${all.length} finding(s) in ${new Set(all.map(h => h.file)).size} file(s) — advisory`);
  return strict ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
