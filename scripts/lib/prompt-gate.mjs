// May a candidate prompt reach a human?
//
// The loop's steps 4–6:
//
//   4. Tuning improves → run HOLDOUT once. The improver sees the NUMBER, never
//      the failures.
//   5. Holdout improves conclusively → raise gate:prompt for a human.
//   6. Approved → the prompt lands, and the holdout ROTATES.
//
// This is step 5's decision, and it is deliberately hard to pass. `/crystallize
// approve` shipped ungated for months and activated patterns injected into every
// future run of every project; the shape being avoided is an agent editing what
// it will be judged by, unattended. So the gate is a human, always, and this
// only decides whether the human should be interrupted at all.
//
// Why "conclusively" is doing real work here
// ------------------------------------------
// A point estimate moving from 0.61 to 0.66 is not an improvement, it is a
// number that moved. On a twelve-case holdout that difference is under one case.
// Four devops iterations went 5 → 11 → 12 → 11 → 10 and every one of them looked
// like progress at the time; the interval is what eventually said the prompt was
// not the problem at all.
//
// So both bars are intervals: the candidate's interval must clear the baseline's
// point AND its own threshold. Anything less raises a gate a human then has to
// think about, which is a tax on the one resource the whole loop exists to
// conserve.

import { verdict as powerVerdict } from './eval-power.mjs';

/**
 * The evidence a candidate must carry, and what each part refuses.
 *
 * @param {object} o
 *   tuning    {passed, n, threshold} for the candidate on the TUNING split
 *   holdout   {passed, n, threshold} for the candidate on the HOLDOUT split
 *   baseline  {rate} the current prompt's holdout rate — a point, because that
 *             is all the improver is allowed to know about the holdout
 *   diagnosis the run-shape/adherence finding, if any: a fixture problem must
 *             never reach a prompt gate
 * @returns {{raise:boolean, why:string, detail:object}}
 */
export function promptGateDecision({ tuning, holdout, baseline, diagnosis = null } = {}) {
  const no = (why, detail = {}) => ({ raise: false, why, detail });

  // Step 2a, restated here because this is the last place it can be caught: a
  // harness failure dressed as an agent failure produces a prompt change that
  // fixes nothing and is then defended by its own eval.
  if (diagnosis?.kind === 'fixture') {
    return no('the diagnosis is a fixture problem — a prompt change cannot fix the harness, and shipping one would hide it', { diagnosis });
  }

  if (!tuning || !holdout) return no('needs both a tuning and a holdout measurement');

  const t = powerVerdict(tuning.passed, tuning.n, tuning.threshold);
  if (t.status !== 'passed') {
    return no(`tuning is ${t.status} — the candidate has not earned a holdout run, let alone a human`, { tuning: t });
  }

  const h = powerVerdict(holdout.passed, holdout.n, holdout.threshold);
  if (h.status !== 'passed') {
    return no(`holdout is ${h.status} — the interval, not the point`, { holdout: h });
  }

  // Better than what is already there, by the interval rather than the mean. A
  // candidate whose lower bound sits under the incumbent's rate has not shown it
  // is better; it has shown it might be.
  if (typeof baseline?.rate === 'number' && h.low <= baseline.rate) {
    return no(
      `holdout ${(h.low * 100).toFixed(0)}–${(h.high * 100).toFixed(0)}% does not clear the incumbent's ${(baseline.rate * 100).toFixed(0)}% — `
      + 'an interval that contains the current prompt is not an improvement over it',
      { holdout: h, baseline },
    );
  }

  return {
    raise: true,
    why: `tuning and holdout both conclusively pass, and holdout's lower bound ${(h.low * 100).toFixed(0)}% clears the incumbent's ${((baseline?.rate ?? 0) * 100).toFixed(0)}%`,
    detail: { tuning: t, holdout: h, baseline },
  };
}

/**
 * The gate a human sees.
 *
 * States the numbers and what approving DOES — including the rotation, which is
 * a cost of approving and belongs in front of the person paying it rather than
 * in a changelog afterwards.
 */
export function promptGateBrief({ agent, decision, evalName }) {
  const d = decision.detail || {};
  return [
    `gate:prompt — ${agent}: a candidate prompt is ready for your decision.`,
    '',
    `Eval:     ${evalName ?? '(unnamed)'}`,
    `Tuning:   ${fmt(d.tuning)}`,
    `Holdout:  ${fmt(d.holdout)}   (incumbent ${d.baseline?.rate != null ? `${(d.baseline.rate * 100).toFixed(0)}%` : 'unknown'})`,
    '',
    'Approving does two things:',
    '  1. the candidate prompt replaces the current one',
    '  2. the holdout ROTATES — a quarter of its cases exchange with tuning,',
    '     seeded by this prompt\'s own hash, because a holdout measured against',
    '     enough candidates stops being one even through the number alone.',
    '',
    'Rejecting costs nothing and leaves both the prompt and the split as they are.',
  ].join('\n');
}

function fmt(v) {
  if (!v) return 'unknown';
  return `${(v.point * 100).toFixed(0)}% of ${v.n} — [${(v.low * 100).toFixed(0)}%, ${(v.high * 100).toFixed(0)}%] (${v.status})`;
}
