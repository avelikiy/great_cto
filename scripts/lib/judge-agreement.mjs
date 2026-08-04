#!/usr/bin/env node
/**
 * judge-agreement — how often the eval judge agrees with a hand label.
 *
 * Why this exists
 * ---------------
 * Every number this repo reports about an agent comes from one model grading
 * another, and that grader had never been checked against a human. On
 * 2026-08-03 it produced twenty verdicts of one shape: it stated the response
 * was correct and marked it FAIL, because the wording did not match the
 * criterion's wording.
 *
 * That is not a calibration detail. It points the repair loop the wrong way —
 * the natural response to a failing eval is to soften the criterion until it
 * passes, and a gold set edited after reading the outputs measures memory of
 * those outputs. It happened three times in one session before it was named.
 *
 * Agreement is measured on DISPUTED cases only. Two graders agreeing that an
 * obviously-good answer is good says nothing about either of them; the
 * information is entirely in the cases where they differ.
 *
 * CLI:
 *   node scripts/lib/judge-agreement.mjs tests/eval/judge-alignment/disputed.jsonl
 */

/** Cohen's kappa for two binary raters. Chance agreement is the point. */
export function kappa(pairs) {
  const n = pairs.length;
  if (!n) return null;
  const agree = pairs.filter((p) => p.judge === p.human).length / n;
  const jYes = pairs.filter((p) => p.judge === 'PASS').length / n;
  const hYes = pairs.filter((p) => p.human === 'PASS').length / n;
  const chance = jYes * hYes + (1 - jYes) * (1 - hYes);
  if (chance === 1) return null;      // no variance — kappa is undefined, not 1
  return (agree - chance) / (1 - chance);
}

/**
 * @returns {{n, labelled, agreed, agreement, kappa, falseFail, falsePass}}
 *   falseFail — the judge failed something a human passed. This is the one that
 *   corrupts the loop, because the repair is to weaken the criterion.
 */
export function summarise(rows) {
  const labelled = rows.filter((r) => r.human_verdict);
  const pairs = labelled.map((r) => ({ judge: r.judge_verdict, human: r.human_verdict }));
  const agreed = pairs.filter((p) => p.judge === p.human).length;
  return {
    n: rows.length,
    labelled: labelled.length,
    agreed,
    agreement: labelled.length ? agreed / labelled.length : null,
    kappa: kappa(pairs),
    falseFail: pairs.filter((p) => p.judge === 'FAIL' && p.human === 'PASS').length,
    falsePass: pairs.filter((p) => p.judge === 'PASS' && p.human === 'FAIL').length,
  };
}

export function explain(s) {
  if (!s.labelled) {
    return `${s.n} disputed case(s), none hand-labelled yet — nothing measured.\n` +
           'Add `"human_verdict": "PASS"|"FAIL"` and a `human_reason` to each row.';
  }
  const lines = [
    `${s.labelled}/${s.n} labelled · agreement ${(s.agreement * 100).toFixed(0)}%` +
    (s.kappa === null ? ' · kappa undefined (no variance)' : ` · kappa ${s.kappa.toFixed(2)}`),
  ];
  if (s.falseFail) {
    lines.push(`  ${s.falseFail} case(s) the judge failed and a human passed —`);
    lines.push('  these are the ones that corrupt the loop: the natural repair is to');
    lines.push('  weaken the criterion, which makes the eval measure less.');
  }
  if (s.falsePass) lines.push(`  ${s.falsePass} case(s) the judge passed and a human failed`);
  if (!s.falseFail && !s.falsePass) lines.push('  no disagreement among the labelled cases');
  return lines.join('\n');
}

async function main(argv) {
  const { readFileSync } = await import('node:fs');
  const file = argv.find((a) => !a.startsWith('--'))
    ?? 'tests/eval/judge-alignment/disputed.jsonl';
  let rows;
  try {
    rows = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch (e) { console.error(`cannot read ${file}: ${e.message}`); return 2; }

  const s = summarise(rows);
  if (argv.includes('--json')) console.log(JSON.stringify(s, null, 2));
  else console.log(explain(s));
  // Unlabelled is not a pass. Nothing was measured.
  return argv.includes('--strict') && (!s.labelled || s.falseFail) ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
