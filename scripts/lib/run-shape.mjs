#!/usr/bin/env node
/**
 * run-shape — read the SHAPE of an eval run, not its score.
 *
 * Why this exists
 * ---------------
 * devops scored 3/20. Reading all twenty judge verdicts by hand showed the
 * cause in the phrasing rather than the number: eight of the seventeen failures
 * said a version of "blocked on the missing gate instead of answering", and the
 * three passes were exactly the cases where refusing WAS the answer. The agent
 * was not failing to know things. It was reaching the same terminal state
 * regardless of the question, because the eval fixture gave it no approved gate
 * and its contract says refuse without one.
 *
 * A score cannot show that. 3/20 looks like a weak agent; the shape shows a
 * fixture that never lets the agent reach the question. The same day produced
 * two more of these — a 600-token cap that truncated every answer into "setup
 * only", and a one-shot actor failing every case that required looking something
 * up — and each was mistaken for an agent gap first.
 *
 * So: before reading a low score as a verdict on the agent, ask whether the
 * failures are all the same failure.
 *
 * Borrowed from agenttrace, whose framing is that agents behave like build
 * systems — they retry, stall and short-circuit — and you only ever see the
 * final answer.
 *
 * CLI:
 *   node scripts/lib/run-shape.mjs <eval-name>        # newest run for that eval
 *   node scripts/lib/run-shape.mjs --all              # every eval's newest run
 */

/**
 * Terminal states an agent lands in that are ABOUT the harness rather than the
 * question. Each is legitimate behaviour — refusing without a gate is what the
 * contract says — which is precisely why a run full of them reads as a bad
 * agent instead of a bad fixture.
 */
export const SHORT_CIRCUITS = Object.freeze([
  { key: 'precondition-block', re: /block(s|ed|ing)?\b.*(gate|approval|precondition|missing (project|config))|refus(es|ed).*(gate|without an approved)/i,
    means: 'refused on a precondition the fixture never satisfied' },
  { key: 'setup-only', re: /(only |just )?(shows?|performs?|runs?) (the )?setup|setup (commands?|procedures?|steps?) (only|without)|never (completed|reached|got to)/i,
    means: 'spent the response on preamble and never reached the task' },
  { key: 'missing-context', re: /(no|missing|absent) (PROJECT\.md|context|codebase|repository|files?)\b|cannot (find|read|access)/i,
    means: 'could not find state the fixture did not provide' },
  { key: 'asked-instead', re: /asks? for (more )?(information|clarification|details) instead|defers? to|requests? the user/i,
    means: 'asked a question instead of answering one' },
]);

/**
 * @returns {{
 *   total, passed, failed,
 *   clusters: Array<{key, means, count, cases: string[]}>,
 *   dominant: {key, count, share}|null,
 *   verdict: 'agent'|'fixture'|'mixed',
 *   summary: string,
 * }}
 */
export function shapeOf(run) {
  const cases = run?.caseResults ?? [];
  const failed = cases.filter((c) => c.verdict === 'FAIL');
  const passed = cases.length - failed.length;

  const clusters = [];
  for (const sc of SHORT_CIRCUITS) {
    const hit = failed.filter((c) => sc.re.test(c.reason || ''));
    if (hit.length) clusters.push({ key: sc.key, means: sc.means, count: hit.length, cases: hit.map((c) => c.num) });
  }
  clusters.sort((a, b) => b.count - a.count);

  const dominant = clusters.length && failed.length
    ? { ...clusters[0], share: clusters[0].count / failed.length }
    : null;

  // A single terminal state behind most failures is a claim about the harness.
  // Scattered failures are a claim about the agent. The threshold is a judgement,
  // and it is stated rather than hidden: at 40% of failures one cause is worth
  // checking the fixture before rewriting a prompt.
  let verdict = 'agent';
  if (dominant && dominant.share >= 0.4) verdict = 'fixture';
  else if (dominant && dominant.share >= 0.2) verdict = 'mixed';

  const summary = !cases.length
    ? 'no cases — nothing to shape'
    : verdict === 'fixture'
      ? `${dominant.count} of ${failed.length} failures are the same terminal state (${dominant.key}) — check the fixture before the prompt`
      : verdict === 'mixed'
        ? `${dominant.count} of ${failed.length} failures share one terminal state (${dominant.key}); the rest are scattered`
        : `${failed.length} failure(s), no dominant terminal state — this reads as the agent`;

  return { total: cases.length, passed, failed: failed.length, clusters, dominant, verdict, summary };
}

export function explainShape(name, s) {
  const lines = [`${name}: ${s.passed}/${s.total} — ${s.summary}`];
  for (const c of s.clusters) {
    lines.push(`   ${String(c.count).padStart(3)}× ${c.key.padEnd(20)} ${c.means}`);
    lines.push(`        cases: ${c.cases.join(', ')}`);
  }
  if (s.verdict === 'fixture') {
    lines.push('');
    lines.push('   A score cannot show this. Ask what the fixture withholds before');
    lines.push('   reading the number as a verdict on the agent.');
  }
  return lines.join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main(argv) {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const hist = join(root, 'tests', 'eval', 'results-history.jsonl');

  let rows;
  try {
    rows = readFileSync(hist, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch (e) { console.error(`cannot read ${hist}: ${e.message}`); return 2; }

  const newest = new Map();
  for (const r of rows) if (r.eval && (r.caseResults ?? []).length) newest.set(r.eval, r);

  const wanted = argv.find((a) => !a.startsWith('--'));
  const targets = argv.includes('--all')
    ? [...newest.values()]
    : [...newest.values()].filter((r) => !wanted || r.eval.includes(wanted));

  if (!targets.length) { console.error(`no run with case results for '${wanted ?? '(any)'}'`); return 2; }

  const out = targets.map((r) => ({ eval: r.eval, ...shapeOf(r) }));
  if (argv.includes('--json')) { console.log(JSON.stringify(out, null, 2)); return 0; }

  for (const o of out) {
    if (argv.includes('--all') && o.verdict === 'agent') continue;   // only the interesting ones
    console.log(explainShape(o.eval.replace('EVAL-', ''), o));
    console.log('');
  }
  const fixtures = out.filter((o) => o.verdict === 'fixture');
  if (argv.includes('--all')) {
    console.log(`${fixtures.length} of ${out.length} runs look like a fixture problem rather than an agent one.`);
  }
  return argv.includes('--strict') && fixtures.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
