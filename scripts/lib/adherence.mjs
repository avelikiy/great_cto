#!/usr/bin/env node
/**
 * adherence — does the instruction under test appear in the answer at all?
 *
 * Why this exists
 * ---------------
 * On 2026-08-06 a devops instruction was rewritten four times. The holdout went
 * 5/20 → 11 → 12 → 11 → 10: flat, across four different phrasings, for about $41.
 *
 * The wording was never the variable. Once the actor's answers were stored, one
 * grep settled it: the instruction appeared in **4 of 22** answers. Where it
 * appeared it passed 4/4; where it did not, 3/10. It fired only when the agent
 * independently recognised the case, and "logs go to stdout" or "the runbook
 * says restart" read as architecture rather than as claims. Deleting the
 * recognition step took emission to 92% and the holdout to 16/20.
 *
 * So this is the question to ask before rewording anything, and asking it costs
 * nothing: the answers are already on the record.
 *
 *   emission low   → the instruction is not reaching the response. Rewording is
 *                    guessing. Remove whatever gates it — a condition the agent
 *                    has to notice, a pointer it has to follow.
 *   emission high, → the instruction fires and produces the wrong answer. NOW a
 *   score low        content change is the right move.
 *
 * The eval file names the marker, because the eval author knows which
 * instruction is under test and no heuristic does:
 *
 *     > Adherence: CLAIMS BEFORE|CHECKED:|ASKING:
 */

/** The `> Adherence:` marker from an EVAL file, as a RegExp, or null. */
export function parseAdherenceMarker(evalText) {
  const m = String(evalText || '').match(/^\s*>\s*Adherence:\s*(.+)$/im);
  if (!m) return null;
  const raw = m[1].trim();
  if (!raw) return null;
  try { return new RegExp(raw, 'im'); } catch { return null; }
}

/**
 * @param {Array} caseResults  each {verdict, answer}
 * @param {RegExp} marker
 * @returns {{total, emitted, rate, withPass, withTotal, withoutPass, withoutTotal,
 *            verdict:'not-firing'|'firing'|'unknown', why:string}|null}
 */
export function adherence(caseResults, marker) {
  if (!marker) return null;
  const rows = (caseResults || []).filter((c) => typeof c.answer === 'string' && c.answer);
  if (!rows.length) {
    return {
      total: 0, emitted: 0, rate: null, withPass: 0, withTotal: 0, withoutPass: 0, withoutTotal: 0,
      verdict: 'unknown',
      why: 'no answers were stored — this run cannot say whether the instruction fired',
    };
  }

  const hit = rows.filter((c) => marker.test(c.answer));
  const miss = rows.filter((c) => !marker.test(c.answer));
  const passes = (a) => a.filter((c) => c.verdict === 'PASS').length;
  const rate = hit.length / rows.length;

  // Half is a stated line, not a tuned one: below it the instruction is absent
  // from most answers, and no wording changes what is absent.
  const verdict = rate < 0.5 ? 'not-firing' : 'firing';
  const why = verdict === 'not-firing'
    ? `the instruction appears in ${hit.length} of ${rows.length} answers — rewording it is guessing. `
      + 'Remove whatever gates it: a condition the agent has to notice, or a pointer it has to follow.'
    : `the instruction appears in ${hit.length} of ${rows.length} answers, so it fires. `
      + 'A remaining failure is about what it produces, not about whether it arrives.';

  return {
    total: rows.length,
    emitted: hit.length,
    rate,
    withPass: passes(hit), withTotal: hit.length,
    withoutPass: passes(miss), withoutTotal: miss.length,
    verdict,
    why,
  };
}

/** One block for the runner's summary, or null when there is no marker. */
export function explainAdherence(name, a) {
  if (!a) return null;
  if (a.verdict === 'unknown') return `${name}: adherence unknown — ${a.why}`;
  const pct = (n, d) => (d ? `${n}/${d}` : '—');
  return [
    `${name}: instruction present in ${a.emitted}/${a.total} answers (${Math.round(a.rate * 100)}%)`,
    `   with it: ${pct(a.withPass, a.withTotal)}   without it: ${pct(a.withoutPass, a.withoutTotal)}`,
    `   ${a.why}`,
  ].join('\n');
}
