#!/usr/bin/env node
/**
 * second-opinion — two judges, one graph, and only the disagreement is a signal.
 *
 * Why this exists
 * ---------------
 * `mcp__great_cto_llm_router__ask_kimi` has been in the `tools:` list of
 * nineteen agents and invoked by none of them. The capability was declared and
 * never exercised — the same shape as the deny list that ran on every write and
 * protected nothing.
 *
 * The obvious use, a second model reviewing the first one's report, is the wrong
 * one. A reviewer reading a report judges whether it reads plausibly, and a
 * confident wrong finding is exactly what passes that test. Worse, two models
 * agreeing is weak evidence: they are trained on overlapping data and fail in
 * correlated ways. "Both said yes" is close to no information.
 *
 * What carries information is where they DIVERGE. So this does not ask two
 * models to grade prose. It walks both through the same DAG of closed questions
 * (scripts/lib/dag-metric.mjs) and reports the nodes where their answers differ.
 * A divergence names a specific question — "does this finding cite a file:line?"
 * — which is something a human can settle in seconds, unlike "is this report
 * good?".
 *
 * The reporting rule is deliberate and the opposite of the usual one:
 *
 *   - agreement is NOT reported as confidence. It is reported as "nothing to
 *     look at here", which is a weaker claim and the honest one.
 *   - divergence IS the output. It is where to dig.
 *   - one judge abstaining is neither. An unparseable answer is a third state,
 *     not a vote, and calling it agreement would let a broken judge confirm
 *     anything.
 */

import { pendingQuestion, evaluateDag, parseAnswer } from './dag-metric.mjs';

export const DIVERGENCE = Object.freeze({
  AGREE: 'agree',
  DIVERGE: 'diverge',
  ABSTAINED: 'abstained',
});

/**
 * Walk one judge through the graph, collecting its answer at every node it
 * reaches. Unlike judgeWithDag this does not stop at the first unusable reply —
 * an abstention on one node still leaves the others worth comparing.
 *
 * @param {object} dag
 * @param {(q:string, allowed:string[], ctx:object)=>Promise<string>} ask
 * @returns {Promise<{answers: object, asked: Array, result: object}>}
 */
export async function walk(dag, ask, context = {}) {
  const answers = {};
  const asked = [];
  const limit = Object.keys(dag.nodes || {}).length + 1;
  for (let i = 0; i <= limit; i++) {
    const q = pendingQuestion(dag, answers);
    if (!q) break;
    const reply = await ask(q.question, q.answers, context);
    const answer = parseAnswer(reply, q.answers);
    asked.push({ id: q.id, question: q.question, reply, answer });
    // A node nobody could answer ends this judge's walk — the graph cannot
    // continue without it — but what was already answered still compares.
    if (answer === null) break;
    answers[q.id] = answer;
  }
  return { answers, asked, result: evaluateDag(dag, answers) };
}

/**
 * Compare two walks.
 *
 * @returns {{
 *   diverged: Array<{id, question, a, b}>,
 *   abstained: Array<{id, question, by: 'a'|'b'|'both'}>,
 *   agreed: string[],
 *   scores: {a: number|null, b: number|null},
 *   verdict: 'agree'|'diverge'|'abstained',
 *   summary: string,
 * }}
 */
export function compare(walkA, walkB) {
  const byId = (w) => new Map(w.asked.map((s) => [s.id, s]));
  const A = byId(walkA);
  const B = byId(walkB);

  const diverged = [];
  const abstained = [];
  const agreed = [];

  for (const id of new Set([...A.keys(), ...B.keys()])) {
    const a = A.get(id);
    const b = B.get(id);
    // A node only one judge reached is not a disagreement — the walks parted
    // earlier, and the node that parted them is already recorded.
    if (!a || !b) continue;
    if (a.answer === null || b.answer === null) {
      abstained.push({
        id, question: a.question,
        by: a.answer === null && b.answer === null ? 'both' : (a.answer === null ? 'a' : 'b'),
      });
      continue;
    }
    if (a.answer !== b.answer) diverged.push({ id, question: a.question, a: a.answer, b: b.answer });
    else agreed.push(id);
  }

  const scores = { a: walkA.result?.score ?? null, b: walkB.result?.score ?? null };

  let verdict = DIVERGENCE.AGREE;
  if (diverged.length) verdict = DIVERGENCE.DIVERGE;
  else if (abstained.length) verdict = DIVERGENCE.ABSTAINED;

  // The wording matters. Agreement is not evidence of correctness — two models
  // trained on overlapping data fail together — so it is reported as an absence
  // of signal, never as confidence.
  const summary = diverged.length
    ? `${diverged.length} question(s) answered differently — that is where to look`
    : abstained.length
      ? `${abstained.length} question(s) one judge could not answer — no comparison possible there`
      : `no divergence across ${agreed.length} question(s); this is weak evidence, not confirmation`;

  return { diverged, abstained, agreed, scores, verdict, summary };
}

/**
 * Run both judges over the same graph and compare.
 *
 * The two `ask` functions must be independent — a second opinion that saw the
 * first one's answer is not a second opinion.
 */
export async function secondOpinion(dag, askA, askB, context = {}) {
  const [a, b] = await Promise.all([walk(dag, askA, context), walk(dag, askB, context)]);
  return { ...compare(a, b), walks: { a, b } };
}

/** Human-readable report. Divergence first — it is the only actionable part. */
export function explainComparison(cmp) {
  const lines = [cmp.summary];
  for (const d of cmp.diverged) {
    lines.push('', `  ${d.question}`, `    judge A: ${d.a}`, `    judge B: ${d.b}`);
  }
  for (const s of cmp.abstained) {
    lines.push('', `  ${s.question}`, `    unanswered by: ${s.by}`);
  }
  if (cmp.scores.a !== cmp.scores.b) {
    lines.push('', `  scores differ: ${cmp.scores.a} vs ${cmp.scores.b}`);
  }
  return lines.join('\n');
}

// ── the second judge ────────────────────────────────────────────────────────

/**
 * An `ask` backed by the llm-router MCP server (Kimi by default).
 *
 * Spawned per question on purpose: the server is stdio JSON-RPC and a fresh
 * process per question guarantees the second judge cannot see its own earlier
 * answers accumulate into a context that biases the next one. It is slower and
 * that is the correct trade for an independence claim.
 */
export function routerAsk(serverPath, { timeoutMs = 60_000, model = null } = {}) {
  return async (question, allowed) => {
    const { spawn } = await import('node:child_process');
    return new Promise((resolve) => {
      // The model is passed through the spawned server's environment, which is
      // where it reads it from. Without this every "second opinion" was the same
      // model answering twice — three samples of one judge are correlated, and
      // calling that a second opinion is the confidence-by-repetition this
      // module was written to avoid.
      const env = model ? { ...process.env, GREAT_CTO_ROUTER_MODEL: model } : process.env;
      const p = spawn('python3', [serverPath], { stdio: ['pipe', 'pipe', 'ignore'], env });
      let out = '';
      const done = (v) => { try { p.kill(); } catch {} resolve(v); };
      const timer = setTimeout(() => done(''), timeoutMs);
      p.stdout.on('data', (d) => { out += d; });
      p.on('error', () => { clearTimeout(timer); done(''); });
      p.on('close', () => {
        clearTimeout(timer);
        for (const line of out.split('\n')) {
          if (!line.trim().startsWith('{')) continue;
          try {
            const d = JSON.parse(line);
            if (d.id === 2 && d.result && d.result.content) return done(d.result.content[0].text);
          } catch { /* not our line */ }
        }
        done('');
      });
      const task = `${question}\nAnswer with exactly one word from: ${allowed.join(', ')}. No explanation.`;
      p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
      p.stdin.write(JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'ask_kimi', arguments: { task } },
      }) + '\n');
      p.stdin.end();
    });
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
//
//   node scripts/lib/second-opinion.mjs <dag.json> --answers '{"node-id":"yes"}'
//
// You supply YOUR answers; the router answers the same questions independently
// and the divergence is printed. Exit 1 when the judges diverge — not because
// divergence is a failure, but because it is the case a human should see.

async function main(argv) {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const file = argv.find((a) => !a.startsWith('--'));
  const i = argv.indexOf('--answers');
  if (!file || i === -1) {
    console.error('usage: second-opinion.mjs <dag.json> --answers \'{"node-id":"yes"}\' [--server <path>] [--json]');
    return 2;
  }

  let dag, mine;
  try { dag = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { console.error(`cannot read ${file}: ${e.message}`); return 2; }
  try { mine = JSON.parse(argv[i + 1]); }
  catch { console.error('--answers must be JSON'); return 2; }

  const si = argv.indexOf('--server');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const server = si >= 0 ? argv[si + 1] : join(root, 'mcp-servers', 'llm-router', 'server.py');
  if (!existsSync(server)) { console.error(`router not found at ${server}`); return 2; }

  const cmp = await secondOpinion(dag, async (q, allowed) => {
    const id = Object.keys(dag.nodes).find((k) => dag.nodes[k].question === q);
    // An answer you did not give is an abstention, not a default. Filling it in
    // would manufacture the agreement this tool exists to avoid claiming.
    return id in mine ? String(mine[id]) : '';
  }, routerAsk(server));

  if (argv.includes('--json')) console.log(JSON.stringify(cmp, null, 2));
  else console.log(explainComparison(cmp));
  return cmp.diverged.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
