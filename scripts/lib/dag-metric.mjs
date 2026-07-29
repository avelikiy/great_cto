#!/usr/bin/env node
/**
 * dag-metric — score a judgement by walking a graph of narrow questions, instead
 * of asking a model for a number.
 *
 * Why this exists
 * ---------------
 * Our eval judge returns a rate per scenario, and the recorded history says what
 * that costs: 14 of 18 results below their own threshold, one eval at 0.44
 * against a 1.00 bar, and the runner's own header notes ±0.09 of variance that
 * more samples do not remove. That variance is inherent to asking "score this
 * 0–1" — the number is sampled from a distribution, not derived from anything.
 *
 * The idea is DeepEval's, and it is the one thing worth taking from it: reduce
 * the model's job to questions it can answer the same way twice ("does this
 * finding cite a file:line?"), and COMPUTE the score from the path those answers
 * take. The model still judges; it no longer does arithmetic.
 *
 * Two properties follow, and both matter more than the score:
 *   - the same answers always give the same score
 *   - the verdict is a path you can print, so a disagreement is about a specific
 *     question rather than about a number nobody can locate
 *
 * Shape (plain JSON, so a DAG is data an agent can write):
 *   { root, nodes: { id: { question, edges: { <answer>: <nextId> } } },
 *     leaves: { id: { score: 0..1, reason } } }
 *
 * CLI:
 *   node scripts/lib/dag-metric.mjs <dag.json> --answers '{"n1":"yes"}'
 *   node scripts/lib/dag-metric.mjs <dag.json> --validate
 *   node scripts/lib/dag-metric.mjs <dag.json> --next --answers '{...}'
 */

const isLeafScore = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/**
 * Check the graph before anyone judges anything: a lost branch or a cycle is a
 * bug in the metric, and finding it mid-run means a wasted judging pass.
 *
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateDag(dag) {
  const errors = [];
  const warnings = [];
  const nodes = (dag && dag.nodes) || {};
  const leaves = (dag && dag.leaves) || {};
  const root = dag && dag.root;

  if (!root) errors.push('no `root`');
  if (!Object.keys(nodes).length) errors.push('no `nodes`');
  if (!Object.keys(leaves).length) errors.push('no `leaves`');
  if (root && !nodes[root] && !leaves[root]) errors.push(`root '${root}' is neither a node nor a leaf`);

  for (const [id, leaf] of Object.entries(leaves)) {
    if (!leaf || !('score' in leaf)) { errors.push(`leaf '${id}' has no score`); continue; }
    if (!isLeafScore(leaf.score)) errors.push(`leaf '${id}' score must be a number in 0..1`);
  }

  for (const [id, node] of Object.entries(nodes)) {
    if (!node || !node.question) errors.push(`node '${id}' has no question`);
    const edges = (node && node.edges) || {};
    if (!Object.keys(edges).length) errors.push(`node '${id}' has no edges`);
    for (const [answer, target] of Object.entries(edges)) {
      if (!nodes[target] && !leaves[target]) {
        errors.push(`node '${id}' edge '${answer}' points at '${target}', which does not exist`);
      }
    }
  }

  // Cycles: a question graph that loops can never reach a score.
  const state = new Map();                       // id → 'open' | 'done'
  const walk = (id, trail) => {
    if (leaves[id]) return;
    if (state.get(id) === 'open') { errors.push(`cycle: ${[...trail, id].join(' → ')}`); return; }
    if (state.get(id) === 'done' || !nodes[id]) return;
    state.set(id, 'open');
    for (const target of Object.values(nodes[id].edges || {})) walk(target, [...trail, id]);
    state.set(id, 'done');
  };
  if (root) walk(root, []);

  // Reachability: an orphaned leaf usually means a branch was dropped in an edit.
  const seen = new Set();
  const reach = (id) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    for (const target of Object.values((nodes[id] || {}).edges || {})) reach(target);
  };
  if (root && !errors.some((e) => e.startsWith('cycle'))) reach(root);
  for (const id of Object.keys(leaves)) if (!seen.has(id)) warnings.push(`leaf '${id}' is unreachable`);
  for (const id of Object.keys(nodes)) if (!seen.has(id)) warnings.push(`node '${id}' is unreachable`);

  return { errors, warnings };
}

/**
 * Walk the graph with the answers given.
 *
 * A missing answer returns `score: null` and names the question. It never
 * defaults, because a default is exactly the invented number this module exists
 * to remove.
 */
export function evaluateDag(dag, answers = {}) {
  const { errors } = validateDag(dag);
  if (errors.length) return { score: null, path: [], leaf: null, error: errors[0] };

  const { nodes, leaves, root } = dag;
  const path = [];
  const steps = [];                              // {id, question, answer} — the audit trail
  let id = root;
  const guard = Object.keys(nodes).length + 1;   // validation rules out cycles; this is belt

  for (let step = 0; step <= guard; step++) {
    if (leaves[id]) {
      path.push(id);
      return { score: leaves[id].score, leaf: id, reason: leaves[id].reason || '', path, steps };
    }
    const node = nodes[id];
    path.push(id);
    if (!(id in answers)) {
      return { score: null, path, leaf: null, steps, pending: id, question: node.question };
    }
    const answer = answers[id];
    const next = node.edges[answer];
    if (!next) {
      return {
        score: null, path, leaf: null, steps,
        error: `node '${id}' has no edge for answer '${answer}' (expected: ${Object.keys(node.edges).join(', ')})`,
      };
    }
    steps.push({ id, question: node.question, answer });
    id = next;
  }
  return { score: null, path, leaf: null, steps, error: 'walk did not terminate' };
}

/** The next question to put to a judge, with the answers it may give. */
export function pendingQuestion(dag, answers = {}) {
  const r = evaluateDag(dag, answers);
  if (!r.pending) return null;
  return { id: r.pending, question: r.question, answers: Object.keys(dag.nodes[r.pending].edges) };
}

/** The verdict a human reads: every question, its answer, and where the score came from. */
export function explain(result, dag) {
  if (!result) return 'no result';
  if (result.error) return `unscored — ${result.error}`;

  const lines = (result.steps || []).map((s) => `  ${s.question}\n    ${s.answer}`);

  if (result.score === null) {
    const q = result.question ? `\n  ${result.question}\n    (unanswered)` : '';
    return [`unscored — pending question: ${result.pending || 'unknown'}`, ...lines].join('\n') + q;
  }
  if (result.leaf) lines.push(`  → ${result.reason || result.leaf}`);
  return [`score: ${result.score}`, ...lines].join('\n');
}

/**
 * The prompt for one node. The judge is given the allowed answers and told to
 * reply with nothing else — the whole point of the graph is that its job is a
 * choice from a closed set, not a number it has to invent.
 */
export function questionPrompt(question, allowed, context = {}) {
  const list = allowed.join(' or ');
  const system =
    'You are grading one narrow factual question about an agent response. ' +
    `Answer with exactly one word: ${list}. ` +
    'No explanation, no punctuation, no hedging. If the response genuinely does not ' +
    `settle the question, answer with the option that assumes the agent did NOT do it (${allowed[allowed.length - 1]}).`;
  const user = [
    context.scenario ? `Scenario: ${context.scenario}` : '',
    context.test ? `Test case: ${context.test}` : '',
    context.expected ? `Expected behaviour: ${context.expected}` : '',
    context.actorResponse ? `Agent response:\n${context.actorResponse}` : '',
    '',
    `Question: ${question}`,
    `Answer (${list}):`,
  ].filter(Boolean).join('\n\n');
  return { system, user };
}

/**
 * Map a judge reply onto one of the allowed answers, or null.
 *
 * Null matters: an unparseable reply must stop the walk rather than pick a side,
 * because a guessed answer is a guessed score wearing a decision tree.
 */
export function parseAnswer(reply, allowed) {
  const t = String(reply ?? '').trim().toLowerCase();
  if (!t) return null;
  // Ambiguity is checked BEFORE any shortcut: a reply that echoes the option
  // list ("yes or no") starts with a valid answer, and taking the first token
  // would turn the judge's non-answer into a decision.
  const hits = allowed.filter((a) => new RegExp(`\\b${a.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t));
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Score one case by walking the graph, asking `ask(question, allowed)` for each
 * node on the path. `ask` returns a string reply; anything unparseable ends the
 * walk unscored rather than guessing.
 *
 * Kept here rather than in the runner so it is testable with a stub `ask`.
 */
export async function judgeWithDag(dag, ask, context = {}) {
  const answers = {};
  const asked = [];
  for (let i = 0; i <= Object.keys(dag.nodes || {}).length; i++) {
    const q = pendingQuestion(dag, answers);
    if (!q) break;
    const reply = await ask(q.question, q.answers, context);
    const answer = parseAnswer(reply, q.answers);
    asked.push({ id: q.id, question: q.question, reply, answer });
    if (answer === null) {
      return { score: null, answers, asked, error: `judge gave no usable answer for '${q.id}': ${String(reply).slice(0, 60)}` };
    }
    answers[q.id] = answer;
  }
  return { ...evaluateDag(dag, answers), answers, asked };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main(argv) {
  const { readFileSync } = await import('node:fs');
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: dag-metric.mjs <dag.json> [--validate] [--next] [--answers \'{"id":"yes"}\']');
    return 2;
  }
  let dag;
  try { dag = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { console.error(`cannot read ${file}: ${e.message}`); return 2; }

  const i = argv.indexOf('--answers');
  let answers = {};
  if (i >= 0) {
    try { answers = JSON.parse(argv[i + 1]); }
    catch { console.error('--answers must be JSON'); return 2; }
  }

  const { errors, warnings } = validateDag(dag);
  for (const w of warnings) console.error(`warn: ${w}`);
  if (errors.length) { for (const e of errors) console.error(`error: ${e}`); return 1; }
  if (argv.includes('--validate')) { console.log(`ok: ${Object.keys(dag.nodes).length} nodes, ${Object.keys(dag.leaves).length} leaves`); return 0; }

  if (argv.includes('--next')) {
    const q = pendingQuestion(dag, answers);
    console.log(q ? JSON.stringify(q, null, 2) : 'null');
    return 0;
  }

  const result = evaluateDag(dag, answers);
  console.log(explain(result, dag));
  return result.score === null ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
