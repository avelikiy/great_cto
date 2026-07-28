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
 * Opt out of a single line with a trailing `<!-- slop-ok -->`.
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
});

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
  out = out.replace(/^(?: {4}|\t).*$/gm, blank);           // indented code blocks
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
export function detectSlop(text, { rules = null } = {}) {
  const raw = String(text ?? '');
  const masked = maskCode(raw);
  const rawLines = raw.split('\n');
  const findings = [];
  const wanted = (id) => !rules || rules.includes(id);

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

  scan('SLOP-DEAD', Object.keys(DEAD_WORDS), (p) => DEAD_WORDS[p]);
  scan('SLOP-OPENER', THROAT_CLEARING, () => 'cut it — the sentence starts after this');
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
  const files = argv.filter((a) => !a.startsWith('--'));
  const json = argv.includes('--json');
  const quiet = argv.includes('--quiet');
  const strict = argv.includes('--strict');

  if (!files.length) {
    console.error('usage: prose-slop.mjs <file>... [--json] [--quiet] [--strict]');
    console.error('rules:');
    for (const [id, desc] of Object.entries(RULES)) console.error(`  ${id.padEnd(18)} ${desc}`);
    return 2;
  }

  const all = [];
  for (const f of files) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    for (const hit of detectSlop(text)) all.push({ file: f, ...hit });
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
