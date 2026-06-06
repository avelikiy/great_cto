// scripts/lib/trace.mjs — requirement → use-case → task → test traceability (governance Phase 4).
//
// NaCl's graph value (impact analysis + coverage gaps) without Neo4j: the chain is modelled
// as beads relationships. Each node is a bd task classified by label into a layer:
//
//     req  ──(depended-upon-by)──▶  uc  ──▶  task  ──▶  test
//   (rank 0)                      (rank 1) (rank 2)   (rank 3)
//
// Edge semantics match `bd dep`: a downstream node DEPENDS ON its upstream rationale
// (`bd dep add <uc> <req>` ⇒ uc depends on req). So:
//   - deps(node)       = what it depends on   = rationale, walk toward req  (bd --direction down)
//   - dependents(node) = what depends on it   = impact,    walk toward test (bd --direction up)
//
// Pure functions operate on an in-memory graph (unit-testable without bd). The CLI loads the
// graph from `bd list --json` + `bd dep list --json` and prints a trace or a coverage audit.
//
// CLI:
//   node scripts/lib/trace.mjs <bd-id>              → rationale + impact + this node's gap
//   node scripts/lib/trace.mjs feature <slug>       → coverage audit across feature-<slug>
//   node scripts/lib/trace.mjs <bd-id> --json       → machine-readable

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const LAYER_RANK = { req: 0, uc: 1, task: 2, test: 3, other: 9 };

/** Classify a node into a traceability layer from its labels. */
export function classify(node) {
  const labels = (node.labels || []).map((l) => String(l).toLowerCase());
  if (labels.includes('req') || labels.includes('requirement')) return 'req';
  if (labels.includes('uc') || labels.includes('use-case') || labels.includes('usc')) return 'uc';
  if (labels.includes('test')) return 'test';
  return 'task';
}

/**
 * Build a graph from nodes + edges.
 * @param {{nodes: Array<{id,title,labels,status}>, edges: Array<{from,to}>}} input
 *   edge {from, to} means "from depends on to" (from is downstream, to is upstream rationale).
 * @returns graph with byId, deps (id→Set upstream), dependents (id→Set downstream), layerOf.
 */
export function buildGraph({ nodes = [], edges = [] } = {}) {
  const byId = new Map();
  const deps = new Map();
  const dependents = new Map();
  for (const n of nodes) {
    byId.set(n.id, { ...n, layer: classify(n) });
    if (!deps.has(n.id)) deps.set(n.id, new Set());
    if (!dependents.has(n.id)) dependents.set(n.id, new Set());
  }
  for (const { from, to } of edges) {
    if (from === to) continue;
    if (!deps.has(from)) deps.set(from, new Set());
    if (!dependents.has(to)) dependents.set(to, new Set());
    deps.get(from).add(to);
    dependents.get(to).add(from);
  }
  return {
    byId, deps, dependents,
    layerOf: (id) => (byId.get(id) ? byId.get(id).layer : 'other'),
  };
}

/** BFS over an adjacency map from a start id, returning [{id, depth}] excluding the start. */
function walk(adj, startId) {
  const seen = new Set([startId]);
  const out = [];
  let frontier = [[startId, 0]];
  while (frontier.length) {
    const next = [];
    for (const [id, depth] of frontier) {
      for (const nb of adj.get(id) || []) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        out.push({ id: nb, depth: depth + 1 });
        next.push([nb, depth + 1]);
      }
    }
    frontier = next;
  }
  return out;
}

/** Rationale: everything `id` (transitively) depends on, walking toward req. */
export function traceUp(graph, id) {
  return walk(graph.deps, id).map((n) => ({ ...n, layer: graph.layerOf(n.id) }));
}

/** Impact: everything that (transitively) depends on `id`, walking toward test. */
export function traceDown(graph, id) {
  return walk(graph.dependents, id).map((n) => ({ ...n, layer: graph.layerOf(n.id) }));
}

/**
 * Coverage gaps over a set of ids (default: the whole graph). A well-formed chain has every
 * req reaching a uc, every uc a task, every task a test — and every req reaching a test
 * end-to-end. Returns [{id, layer, gap}] sorted by layer rank.
 */
export function coverageGaps(graph, ids) {
  const universe = ids ? ids.filter((id) => graph.byId.has(id)) : [...graph.byId.keys()];
  const gaps = [];
  for (const id of universe) {
    const layer = graph.layerOf(id);
    if (!['req', 'uc', 'task'].includes(layer)) continue;
    const down = traceDown(graph, id);
    const layersBelow = new Set(down.map((n) => n.layer));
    if (layer === 'req') {
      if (!layersBelow.has('uc')) gaps.push({ id, layer, gap: 'REQ has no use-case' });
      if (!layersBelow.has('test')) gaps.push({ id, layer, gap: 'REQ not traced to any test (untested requirement)' });
    } else if (layer === 'uc') {
      if (!layersBelow.has('task')) gaps.push({ id, layer, gap: 'use-case has no implementation task' });
    } else if (layer === 'task') {
      if (!layersBelow.has('test')) gaps.push({ id, layer, gap: 'task has no test' });
    }
  }
  return gaps.sort((a, b) => LAYER_RANK[a.layer] - LAYER_RANK[b.layer] || a.id.localeCompare(b.id));
}

// ── formatting ────────────────────────────────────────────────────────────────
const ICON = { req: '◆', uc: '◇', task: '○', test: '▷', other: '·' };
function line(graph, id, depth = 0) {
  const n = graph.byId.get(id) || { title: '(unknown)', layer: 'other', status: '' };
  const pad = '  '.repeat(depth);
  const st = n.status && n.status !== 'open' ? ` [${n.status}]` : '';
  return `${pad}${ICON[n.layer] || '·'} ${id} · ${n.layer.toUpperCase()} · ${n.title || ''}${st}`;
}

export function formatTrace(graph, id) {
  if (!graph.byId.has(id)) return `Task ${id} not found in graph.`;
  const up = traceUp(graph, id).sort((a, b) => LAYER_RANK[a.layer] - LAYER_RANK[b.layer]);
  const down = traceDown(graph, id).sort((a, b) => LAYER_RANK[a.layer] - LAYER_RANK[b.layer]);
  const out = [`=== Trace: ${id} ===`, line(graph, id)];
  out.push('', '--- Rationale (what this depends on — why it exists) ---');
  out.push(up.length ? up.map((n) => line(graph, n.id, 1)).join('\n') : '  (none — root rationale or missing upstream)');
  out.push('', '--- Impact (what depends on this — re-verify if it changes) ---');
  out.push(down.length ? down.map((n) => line(graph, n.id, 1)).join('\n') : '  (none — leaf; nothing downstream)');
  const myGaps = coverageGaps(graph, [id]);
  if (myGaps.length) {
    out.push('', '--- Coverage gaps ---');
    for (const g of myGaps) out.push(`  ⚠ ${g.gap}`);
  }
  return out.join('\n');
}

export function formatCoverage(graph, ids, label) {
  const universe = ids || [...graph.byId.keys()];
  const counts = { req: 0, uc: 0, task: 0, test: 0, other: 0 };
  for (const id of universe) counts[graph.layerOf(id)] = (counts[graph.layerOf(id)] || 0) + 1;
  const gaps = coverageGaps(graph, universe);
  const out = [`=== Traceability coverage${label ? `: ${label}` : ''} ===`];
  if (!universe.length) {
    out.push(`No nodes found${label ? ` for ${label}` : ''}. Architect mirrors REQs (--label req),`);
    out.push('use-cases (--label uc), and tests (--label test) into bd with feature-<slug>.');
    return out.join('\n');
  }
  out.push(`Nodes: ${counts.req} req · ${counts.uc} uc · ${counts.task} task · ${counts.test} test`);
  out.push('');
  if (!gaps.length) {
    out.push('✓ chain complete — every req → uc → task → test is connected.');
  } else {
    out.push(`✗ ${gaps.length} coverage gap(s):`);
    for (const g of gaps) out.push(`  ⚠ ${g.id} (${g.layer.toUpperCase()}): ${g.gap}`);
  }
  return out.join('\n');
}

// ── bd loaders (CLI side) ───────────────────────────────────────────────────────
function bdJson(args) {
  try {
    const out = execFileSync('bd', [...args, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

/** Load nodes (optionally filtered by feature label) + their down-edges from bd. */
export function loadGraphFromBd({ featureLabel } = {}) {
  const listArgs = ['list', '--all']; // include closed — impl/test tasks are usually closed
  if (featureLabel) listArgs.push('--label', featureLabel);
  const raw = bdJson(listArgs);
  const items = Array.isArray(raw) ? raw : (raw && (raw.issues || raw.items)) || [];
  const nodes = items.map((t) => ({ id: t.id, title: t.title || '', labels: t.labels || [], status: t.status || '' }));
  const known = new Set(nodes.map((n) => n.id));
  const edges = [];
  // dependency_count in `bd list` is unreliable (omits blocked-by/parent), so query every
  // node. Exclude `parent` / `parent-child` edges — epic membership is structural, not a
  // rationale link; including it would graft the epic into every trace.
  for (const n of nodes) {
    const deps = bdJson(['dep', 'list', n.id, '--direction', 'down']) || [];
    for (const d of Array.isArray(deps) ? deps : []) {
      const type = String(d.dependency_type || '').toLowerCase();
      if (type === 'parent' || type === 'parent-child') continue;
      if (d && d.id) edges.push({ from: n.id, to: d.id });
    }
  }
  // Keep only edges whose endpoints are in the loaded set (feature-scoped runs).
  return buildGraph({ nodes, edges: edges.filter((e) => known.has(e.from) && known.has(e.to)) });
}

function featureLabelOf(id) {
  const node = bdJson(['show', id]) || bdJson(['list']);
  const item = Array.isArray(node) ? node.find((n) => n.id === id) : node;
  const labels = (item && item.labels) || [];
  return labels.find((l) => String(l).startsWith('feature-')) || null;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function main(argv) {
  const json = argv.includes('--json');
  const args = argv.filter((a) => a !== '--json');
  if (!args.length) {
    console.error('usage: trace.mjs <bd-id>            # rationale + impact for one node');
    console.error('       trace.mjs feature <slug>     # coverage audit for feature-<slug>');
    process.exit(2);
  }

  if (args[0] === 'feature') {
    const slug = args[1];
    if (!slug) { console.error('usage: trace.mjs feature <slug>'); process.exit(2); }
    const label = slug.startsWith('feature-') ? slug : `feature-${slug}`;
    const graph = loadGraphFromBd({ featureLabel: label });
    const ids = [...graph.byId.keys()];
    if (json) { console.log(JSON.stringify({ label, gaps: coverageGaps(graph, ids) }, null, 2)); process.exit(0); }
    console.log(formatCoverage(graph, ids, label));
    process.exit(coverageGaps(graph, ids).length ? 1 : 0);
  }

  const id = args[0];
  const featureLabel = featureLabelOf(id);
  const graph = loadGraphFromBd(featureLabel ? { featureLabel } : {});
  if (!graph.byId.has(id)) { console.error(`Task ${id} not found in bd.`); process.exit(1); }
  if (json) {
    console.log(JSON.stringify({ id, rationale: traceUp(graph, id), impact: traceDown(graph, id), gaps: coverageGaps(graph, [id]) }, null, 2));
    process.exit(0);
  }
  console.log(formatTrace(graph, id));
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
