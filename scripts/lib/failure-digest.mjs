// What actually failed, for the agent that has to fix it.
//
// `/prompt-evolve` asks `ai-prompt-architect` for a better prompt and hands it a
// LESSON — one sentence of prose, written by a human or by continuous-learner.
// Meanwhile the eval history holds, per case, the actor's full response and the
// judge's reason for failing it. The candidate generator was working from a
// summary while the evidence sat on disk.
//
// This is GEPA's "reflective dataset" at our scale, and nothing more: the
// failures, what the agent actually said, and why the judge rejected it. We are
// not adopting their optimizer — a search that needs hundreds of scored rollouts
// cannot be paid for or statistically resolved on five cases per agent — but the
// input to a revision is free, because it was already measured.
//
// Reading only. No LM calls, no cost, no decision: this hands a human or an
// agent the evidence and stops there.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HISTORY = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tests', 'eval', 'results-history.jsonl');

/**
 * History rows, newest last.
 *
 * `null` when the file exists and cannot be read — distinct from `[]`, which
 * means it was read and holds nothing. A digest built on "I could not look"
 * must not read as "nothing failed".
 */
export function readHistory(path = HISTORY) {
  if (!existsSync(path)) return [];
  let text;
  try { text = readFileSync(path, 'utf8'); }
  catch { return null; }
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* a torn row is not evidence */ }
  }
  return rows;
}

/**
 * The newest run per eval for one agent, at a given shape.
 *
 * Newest rather than worst: an agent is at its current behaviour, and picking
 * the run with the most failures would be selecting the evidence to suit the
 * conclusion — the same reason `gate-tier` takes the newest row.
 */
export function latestRuns(agent, rows, { split = null, samples = null } = {}) {
  const mine = (rows || []).filter((r) =>
    r?.agent === agent &&
    (split === null || r.split === split) &&
    (samples === null || Number(r.samples || 1) === samples) &&
    !r.dropout?.severe);
  const newest = new Map();
  for (const r of mine) {
    const prev = newest.get(r.eval);
    if (!prev || String(r.run_id || '') >= String(prev.run_id || '')) newest.set(r.eval, r);
  }
  return [...newest.values()];
}

/**
 * The failures for one agent: what it was asked, what it said, why that failed.
 *
 * @returns {{
 *   state: 'failures'|'clean'|'unmeasured'|'unreadable',
 *   why: string,
 *   agent: string,
 *   evals: number,
 *   failures: Array<{eval: string, case: string|number, reason: string, answer: string, judge: string|null}>,
 * }}
 */
export function failureDigest(agent, { rows = undefined, split = null, samples = null, maxAnswer = 1200 } = {}) {
  const history = rows === undefined ? readHistory() : rows;
  if (history === null) {
    return { state: 'unreadable', why: 'the eval history exists but could not be read — this is not "nothing failed"', agent, evals: 0, failures: [] };
  }

  const runs = latestRuns(agent, history, { split, samples });
  if (!runs.length) {
    // Four states, because "never measured" and "measured and clean" lead to
    // completely different next actions: one needs an eval written, the other
    // needs nothing.
    return { state: 'unmeasured', why: `no eval run recorded for ${agent}${split ? ` at split=${split}` : ''} — unmeasured, which is not the same as passing`, agent, evals: 0, failures: [] };
  }

  const failures = [];
  for (const r of runs) {
    for (const c of (r.caseResults || [])) {
      if (c?.verdict !== 'FAIL') continue;
      failures.push({
        eval: r.eval,
        case: c.num,
        reason: String(c.reason || '(the judge recorded no reason)'),
        // Bounded: the point is to show what the agent said, not to reproduce a
        // whole transcript into a prompt that then costs more than the fix.
        answer: String(c.answer || '').slice(0, maxAnswer),
        judge: c.judge || null,
      });
    }
  }

  if (!failures.length) {
    return { state: 'clean', why: `${runs.length} eval(s) measured for ${agent}, no failing case`, agent, evals: runs.length, failures: [] };
  }
  return { state: 'failures', why: `${failures.length} failing case(s) across ${runs.length} eval(s)`, agent, evals: runs.length, failures };
}

/**
 * The digest as text an agent can be handed directly.
 *
 * Deliberately not a prompt: it states the evidence and asks nothing. Whoever
 * calls this decides what to do with it, which keeps this module a reader.
 */
export function describeFailures(d, { maxAnswer = 600 } = {}) {
  if (!d) return '';
  if (d.state !== 'failures') return d.why;
  const out = [d.why];
  for (const f of d.failures) {
    out.push('');
    out.push(`── ${f.eval} · case ${f.case}`);
    out.push(`   judge said: ${f.reason}`);
    const ans = f.answer.slice(0, maxAnswer).replace(/\n+/g, '\n   ');
    out.push(`   agent said: ${ans}${f.answer.length > maxAnswer ? ' …' : ''}`);
  }
  return out.join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────
//
//   node scripts/lib/failure-digest.mjs <agent> [--split holdout] [--samples 3] [--json]
//
// "What is this agent getting wrong, in its own words" — the question
// /prompt-evolve should be answering before it asks for a new prompt.

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const agent = argv.find((a) => !a.startsWith('--'));
  if (!agent) {
    console.error('usage: failure-digest.mjs <agent> [--split holdout] [--samples 3] [--json]');
    process.exit(2);
  }
  const at = (flag) => { const i = argv.indexOf(flag); return i !== -1 ? argv[i + 1] : null; };
  const samplesRaw = at('--samples');

  const d = failureDigest(agent, {
    split: at('--split'),
    samples: samplesRaw === null ? null : Number(samplesRaw),
  });

  if (argv.includes('--json')) { console.log(JSON.stringify(d, null, 2)); process.exit(0); }
  console.log(`failure-digest: ${agent} — ${d.state}`);
  console.log(describeFailures(d));
  // Never non-zero on findings: failures are the expected output here, and an
  // exit code would make a reader into a gate. `unreadable` is the one case
  // where the caller genuinely learned nothing.
  process.exit(d.state === 'unreadable' ? 2 : 0);
}
