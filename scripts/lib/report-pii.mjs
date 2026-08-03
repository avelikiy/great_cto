#!/usr/bin/env node
/**
 * report-pii — a reviewer must not reproduce the value it was reviewing.
 *
 * Why this exists
 * ---------------
 * Asked to review PII handling in a call transcript, voice-ai-reviewer wrote a
 * competent analysis and reproduced the caller's passport number several times
 * inside it, plus a full date of birth in an example. The finding was correct.
 * The report was now itself a copy of the data the report said to redact — and
 * reports land in `docs/`, in verdict logs, and on the board.
 *
 * `agents/_shared/privacy-guardrails.md` already forbids this, and it is scoped
 * to "knowledge/lesson writers": three agents. The agents that actually handle
 * raw sensitive material — reviewers reading transcripts, l3-support reading
 * logs, auditors reading configs — were never covered, which is exactly where it
 * happened.
 *
 * What a reviewer should write instead is the LOCATION and the SHAPE:
 *
 *   ✗  "the transcript contains passport C03 005 988 at 04:12"
 *   ✓  "the transcript contains an unredacted passport number at 04:12
 *       (transcripts/call-8821.json:142) — 9 chars, matches the MRZ pattern"
 *
 * The second is more useful: it locates the defect and can be re-checked without
 * carrying the value forward.
 *
 * Deliberately narrow. This flags shapes that are unambiguous — a national ID, a
 * card number that passes Luhn, a full DOB, a vendor token. Names, addresses and
 * free text are not detectable without false positives that would train people
 * to ignore the check, and a check people ignore is worse than none.
 *
 * CLI:
 *   node scripts/lib/report-pii.mjs <report.md>... [--strict] [--json]
 */

/**
 * Patterns that are worth blocking on their shape alone.
 *
 * `redact` describes what the writer should have said instead — the message is
 * half the point, since "PII found" without a replacement is an instruction to
 * delete the sentence rather than to fix it.
 */
export const PII_PATTERNS = Object.freeze([
  { name: 'US SSN', re: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
    redact: 'say "an unredacted SSN at <location>" and give the file:line' },
  { name: 'passport (MRZ-style)', re: /\b[A-Z]{1,2}\d{2}[ -]?\d{3}[ -]?\d{3}\b/g,
    redact: 'say "an unredacted passport number at <location>"' },
  { name: 'payment card', re: /\b(?:\d[ -]?){13,19}\b/g, luhn: true,
    redact: 'say "an unredacted PAN at <location>" and the last four only if needed' },
  { name: 'full date of birth', re: /\b(?:0?[1-9]|[12]\d|3[01])[ /-](?:0?[1-9]|1[0-2])[ /-](?:19|20)\d{2}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(?:19|20)\d{2}\b/gi,
    redact: 'say "a full date of birth" — the year alone is enough to make the point' },
  { name: 'IBAN', re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
    redact: 'say "an unredacted IBAN at <location>"' },
  { name: 'vendor token', re: /\b(?:sk-ant-[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}|ghp_[A-Za-z0-9]{36}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,})\b/g,
    redact: 'name the variable and where it is set — never the value' },
]);

/** Luhn check, so a 16-digit build number is not reported as a card. */
function luhnValid(digits) {
  const d = digits.replace(/\D/g, '');
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * Spans of a report where a value should not have been reproduced.
 *
 * Fenced blocks are NOT exempt. A transcript pasted into an evidence block is
 * the most likely place for this to happen, and exempting it would exempt the
 * case that occurs.
 *
 * @returns {Array<{pattern: string, line: number, redact: string}>}
 */
export function findReportPii(text) {
  const lines = String(text ?? '').split('\n');
  const hits = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    // A line that is already describing the shape rather than showing it.
    if (/\b(unredacted|redact(ed|ion)?|placeholder|example only|<[^>]+>)\b/i.test(lines[i])
        && !/\d{3}-\d{2}-\d{4}/.test(lines[i])) continue;

    for (const p of PII_PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(lines[i])) !== null) {
        if (p.luhn && !luhnValid(m[0])) continue;
        // One report of a value is enough; repeating it in the FINDING would
        // repeat the leak this check exists to stop.
        const key = `${p.name}:${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({ pattern: p.name, line: i + 1, redact: p.redact });
      }
    }
  }
  return hits;
}

/** The message a writer reads. It never echoes the value it found. */
export function explainPii(hits) {
  if (!hits.length) return 'no reproduced values found';
  const lines = [`${hits.length} value(s) reproduced that should have been described instead:`];
  for (const h of hits) lines.push(`  line ${h.line}  ${h.pattern} — ${h.redact}`);
  lines.push('');
  lines.push('  A report that quotes the data it says to redact is a second copy of that');
  lines.push('  data, and reports land in docs/, in verdict logs, and on the board.');
  return lines.join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main(argv) {
  const { readFileSync } = await import('node:fs');
  const files = argv.filter((a) => !a.startsWith('--'));
  if (!files.length) {
    console.error('usage: report-pii.mjs <report.md>... [--strict] [--json]');
    return 2;
  }
  let total = 0;
  const all = [];
  for (const f of files) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { console.error(`cannot read ${f}`); continue; }
    const hits = findReportPii(text);
    total += hits.length;
    all.push({ file: f, hits });
    if (hits.length && !argv.includes('--json')) {
      console.log(f);
      console.log(explainPii(hits).split('\n').map((l) => `  ${l}`).join('\n'));
    }
  }
  if (argv.includes('--json')) console.log(JSON.stringify(all, null, 2));
  else if (!total) console.log('no reproduced values found');
  return argv.includes('--strict') && total ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
