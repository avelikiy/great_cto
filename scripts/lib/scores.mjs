/**
 * scores — how well a run went, kept apart from what the run did.
 *
 * The verdict line answers one question: what happened. `senior-dev | APPROVED |
 * feature=x | cost=$0.42`. Everything about QUALITY has had to squeeze into that
 * same line as ad-hoc meta keys — `tests=46-pass`, `coverage=100`,
 * `findings=3-medium` — which means an assessment cannot be added after the fact,
 * cannot be revised, cannot say who made it, and cannot disagree with an earlier
 * one. `independent-verify` produces exactly such an assessment and, until this
 * module, wrote it nowhere at all: it printed a conclusion and returned an exit
 * code, and the reasoning was gone when the terminal scrolled.
 *
 * A score is a separate record pointing AT a run. Borrowed from Langfuse, where
 * scores are first-class objects attached to traces rather than fields inside
 * them, and the separation buys four things this project needs:
 *
 *   many per run    a mechanical check and a model's judgement are different
 *                   evidence and must not overwrite each other
 *   later than run  a verification that takes 30s does not have to block the
 *                   verdict that records the run
 *   revisable       a re-score appends; nothing is rewritten
 *   attributable    every score names its scorer, so "a script said so" and
 *                   "a model said so" never read alike
 *
 * Append-only, on purpose. A judge changing its mind between runs is information
 * — it was measured here that the same question got different answers — and an
 * updating store would erase exactly that.
 *
 * NUMERIC VALUE AND THE THIRD STATE
 * ---------------------------------
 * `value` exists so scores can be averaged and trended. It is deliberately NULL
 * for `unverifiable`, not 0. Zero would mean "scored, and scored badly"; the
 * whole point of the third state is that nothing was assessed. An average that
 * silently counts unassessed runs as failures is the same defect one level up
 * from the one this project keeps closing.
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export const SCORES_FILE = 'scores.jsonl';
export const SCORE_FORMAT_VERSION = 1;

/**
 * Categorical states a score may carry, and the numeric value each maps to.
 * `null` means "not assessed" and must never be coerced to a number.
 */
export const SCORE_VALUES = Object.freeze({
  verified: 1,
  rework: 0,
  unverifiable: null,
});

export const scoresPath = (cwd = process.cwd()) => path.join(cwd, '.great_cto', SCORES_FILE);

/**
 * Build a score record. Throws on a shape that could not be read back, rather
 * than writing a line that parses and means nothing.
 *
 * @param {object} o
 * @param {string} o.agent   the run being scored
 * @param {string} [o.runTs] that run's verdict timestamp — the join key
 * @param {string} o.name    what was assessed, e.g. 'independent-verify'
 * @param {string} o.state   one of SCORE_VALUES
 * @param {string} o.scorer  who assessed it, e.g. 'mechanical' | 'kimi-k3'
 */
export function makeScore({ ts, agent, runTs = null, name, state, scorer, findings = [], comment = '', meta = {} } = {}) {
  const errors = [];
  if (!agent) errors.push('agent is required — a score with no run to point at is not a score');
  if (!name) errors.push('name is required');
  if (!scorer) errors.push('scorer is required — an unattributed assessment cannot be weighed');
  if (!Object.prototype.hasOwnProperty.call(SCORE_VALUES, state)) {
    errors.push(`state must be one of ${Object.keys(SCORE_VALUES).join(' | ')}, got ${JSON.stringify(state)}`);
  }
  const stamp = ts || new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(stamp)) errors.push('ts must be ISO-8601');
  if (errors.length) throw new Error(`invalid score: ${errors.join('; ')}`);

  return {
    v: SCORE_FORMAT_VERSION,
    ts: stamp,
    agent,
    ...(runTs ? { run_ts: runTs } : {}),
    name,
    state,
    value: SCORE_VALUES[state],
    scorer,
    ...(findings.length ? { findings } : {}),
    ...(comment ? { comment } : {}),
    ...(Object.keys(meta).length ? { meta } : {}),
  };
}

/** Append one score. Creates `.great_cto/` if the project has none yet. */
export function writeScore(cwd, score) {
  const rec = score.v === SCORE_FORMAT_VERSION ? score : makeScore(score);
  const dir = path.join(cwd, '.great_cto');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(scoresPath(cwd), JSON.stringify(rec) + '\n');
  return rec;
}

/**
 * @returns {{scores: object[], rejected: number}} — a line that cannot be parsed
 *   is counted, not dropped silently. A store that quietly discards half its
 *   contents reads exactly like a store that is empty.
 */
export function readScores(cwd = process.cwd(), { agent = null, name = null } = {}) {
  const file = scoresPath(cwd);
  if (!existsSync(file)) return { scores: [], rejected: 0 };
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { return { scores: [], rejected: 0 }; }

  const scores = [];
  let rejected = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { rejected += 1; continue; }
    if (!o || !o.agent || !o.name || !Object.prototype.hasOwnProperty.call(SCORE_VALUES, o.state)) {
      rejected += 1; continue;
    }
    if (agent && o.agent !== agent) continue;
    if (name && o.name !== name) continue;
    scores.push(o);
  }
  return { scores, rejected };
}

/**
 * The current assessment for one run: the newest score of that name.
 *
 * Newest by `ts`, not by file order — a score can be written later than the run
 * it points at, and two scorers can finish out of order.
 */
export function latestScore(cwd, { agent, runTs = null, name }) {
  const { scores } = readScores(cwd, { agent, name });
  const candidates = runTs ? scores.filter((s) => s.run_ts === runTs) : scores;
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (String(b.ts) > String(a.ts) ? b : a));
}

/**
 * Aggregate one score name across runs.
 *
 * `assessed` counts only scores with a numeric value, and `rate` divides by that
 * — never by the total. An agent with nine unverifiable runs and one verified
 * one scores 100% here, and says `assessed: 1` beside it. Reporting 10% instead
 * would be a made-up number about work nobody looked at.
 */
export function summarizeScores(cwd, { name, agent = null } = {}) {
  const { scores, rejected } = readScores(cwd, { agent, name });
  const numeric = scores.filter((s) => typeof s.value === 'number');
  const unassessed = scores.length - numeric.length;
  const sum = numeric.reduce((a, s) => a + s.value, 0);
  return {
    total: scores.length,
    assessed: numeric.length,
    unassessed,
    rate: numeric.length ? Math.round((sum / numeric.length) * 100) : null,
    byState: scores.reduce((acc, s) => { acc[s.state] = (acc[s.state] || 0) + 1; return acc; }, {}),
    rejected,
  };
}
