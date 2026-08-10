// Some provider failures mean "try again". Others mean "every remaining call
// will fail exactly like this one".
//
// What happened
// -------------
// A 75-file eval run spent $13.99, ran out of OpenRouter credits partway, and
// then made 147 more calls that could not possibly succeed — one per remaining
// case, each returning the same 402. The dropout gate did its job at the end and
// reported thirteen files as NOT MEASURED rather than as scores.
//
// But the run had already written those thirteen files into
// `results-history.jsonl` with `rate: 0`, and the drift detector reads `rate`.
// So the loop's next comparison would have read thirteen evals as having
// collapsed from ~0.85 to 0.00 overnight, and alarmed on a regression that is
// really an empty wallet.
//
// A run that did not happen recorded as a score of zero. Same defect this
// repository keeps finding, this time between two of its own components.
//
// So: recognise the terminal states, stop the run at the first one, and keep the
// unrunnable files out of the history entirely.

/**
 * What kind of failure this is, from the error a provider call threw.
 *
 * The distinction that matters is not the status code but whether waiting or
 * retrying could change the answer. 429 is the provider saying "slow down" —
 * that resolves. 402 is the provider saying "you have no money" — that resolves
 * only by someone topping up, which will not happen inside this run.
 *
 * @param {Error|string} err
 * @returns {{terminal:boolean, kind:'credits'|'auth'|'rate-limit'|'transient', why:string}}
 */
export function classifyProviderError(err) {
  const msg = String(err?.message ?? err ?? '');

  // Match the status as a distinct token so a `402` inside a response body — an
  // id, a byte count — does not read as the status of the call itself.
  const status = msg.match(/\bAPI\s+(\d{3})\b/)?.[1] ?? msg.match(/\b(4\d{2}|5\d{2})\b/)?.[1] ?? null;
  const body = msg.toLowerCase();

  if (status === '402' || /insufficient (credit|balance|fund)|no credits|out of credits|payment required/.test(body)) {
    return { terminal: true, kind: 'credits', why: 'the provider account is out of credits — every remaining call fails identically until someone tops it up' };
  }
  if (status === '401' || status === '403' || /invalid api key|unauthorized|forbidden/.test(body)) {
    return { terminal: true, kind: 'auth', why: 'the provider rejected the key — no retry inside this run can fix that' };
  }
  if (status === '429' || /rate.?limit|too many requests/.test(body)) {
    return { terminal: false, kind: 'rate-limit', why: 'rate limited — this resolves on its own' };
  }
  return { terminal: false, kind: 'transient', why: msg.slice(0, 160) || 'unclassified provider error' };
}

/**
 * What to print when a run gives up.
 *
 * Names the money spent, because the next question anybody asks is "did I pay
 * for that", and says plainly that the remaining files were not measured rather
 * than letting a reader infer a result from a truncated table.
 */
export function exhaustionReport({ kind, why, completed, total, costUsd }) {
  const spent = typeof costUsd === 'number' ? `$${costUsd.toFixed(2)}` : 'an unrecorded amount';
  return [
    `RUN STOPPED — ${kind}: ${why}`,
    `  ${completed} of ${total} eval file(s) completed; ${spent} spent.`,
    `  The rest were NOT MEASURED. They are not zeros, and they are not written to`,
    `  history — a run that did not happen must not become a data point.`,
    `  Re-run once the account is funded.`,
  ].join('\n');
}

/**
 * Should this result be allowed into the trend history?
 *
 * A file whose cases never reached the provider has a rate computed over the
 * prefix that did run, which is not a draw from the case list. `eval-power`
 * already refuses to compare it against a threshold; this refuses to let it
 * become tomorrow's baseline.
 */
export function admissibleToHistory(result) {
  if (!result) return { ok: false, why: 'no result' };
  if (result.dropout?.severe) {
    return { ok: false, why: `dropout: ${result.dropout.why ?? 'the run stopped partway through this file'}` };
  }
  if (!result.judged) return { ok: false, why: 'no case was judged' };
  return { ok: true };
}
