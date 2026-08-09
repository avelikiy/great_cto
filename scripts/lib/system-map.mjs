#!/usr/bin/env node
/**
 * system-map — what this project is made of, derived from the source.
 *
 * Why this exists
 * ---------------
 * `docs/ARCHITECTURE.md` is a hand-drawn ASCII diagram. It was last touched
 * three months ago and says "34 agents"; there are sixty-nine. Around it sit
 * twenty architecture documents, ten ADRs and thirty-one plans, each about one
 * feature — you can read all of them and still not know how the pieces fit.
 *
 * A drawn diagram is stale the week after it is drawn, and nothing tells you.
 * This one is computed when you look at it, so the only way it can be wrong is
 * if the code is.
 *
 * What it does NOT try to be
 * --------------------------
 * Not a file-level import graph. Several hundred modules drawn as a hairball is
 * a picture nobody reads and nobody checks. The useful altitude is the group —
 * agents, hooks, libraries, the board, the CLI, the contracts — and the edges
 * between groups, which is roughly C4's container level.
 *
 * Not prose. It reports what is there and how it connects; what any of it is
 * FOR belongs in a document a human wrote.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * The groups a great_cto project is built from, and what each one is.
 *
 * Ordered so the map reads top-down the way the system runs: contracts describe
 * it, hooks fire during it, agents do the work, libraries are what they share,
 * and the board and CLI are how a human reaches any of it.
 */
export const GROUPS = Object.freeze([
  { key: 'contracts', label: 'Contracts', dirs: ['shared'], ext: ['.toml'], what: 'the pipeline map, orchestrator rules' },
  { key: 'agents', label: 'Agents', dirs: ['agents'], ext: ['.md'], what: 'the specialists the pipeline dispatches' },
  { key: 'commands', label: 'Commands', dirs: ['commands'], ext: ['.md'], what: 'what a human can invoke directly' },
  { key: 'skills', label: 'Skills', dirs: ['skills'], ext: ['.md'], what: 'knowledge agents load on demand' },
  { key: 'hooks', label: 'Hooks', dirs: ['scripts/hooks'], ext: ['.mjs', '.sh', '.py'], what: 'what fires on session, tool and stop events' },
  { key: 'libs', label: 'Libraries', dirs: ['scripts/lib'], ext: ['.mjs'], what: 'the logic hooks and commands share' },
  { key: 'board', label: 'Board', dirs: ['packages/board'], ext: ['.mjs', '.html'], what: 'the admin view, zero runtime dependencies' },
  { key: 'cli', label: 'CLI', dirs: ['packages/cli/src'], ext: ['.ts', '.mjs'], what: 'the published npm package' },
  { key: 'evals', label: 'Evals', dirs: ['tests/eval'], ext: ['.md'], what: 'what each agent is measured against' },
]);

const SKIP = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', 'vendor', '_shared']);

function filesIn(root, dir, ext, depth = 0, out = []) {
  if (depth > 3) return out;
  let entries;
  try { entries = readdirSync(join(root, dir), { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const rel = join(dir, e.name);
    if (e.isDirectory()) { filesIn(root, rel, ext, depth + 1, out); continue; }
    if (ext.some((x) => e.name.endsWith(x))) out.push(rel);
  }
  return out;
}

/** Which group a repo-relative path belongs to, or null. */
export function groupOf(rel) {
  const p = String(rel).split(sep).join('/');
  for (const g of GROUPS) {
    if (g.dirs.some((d) => p === d || p.startsWith(`${d}/`))) return g.key;
  }
  return null;
}

/**
 * Edges between groups, counted from real `import ... from '...'` statements.
 *
 * Only relative imports: a dependency on `node:fs` says nothing about how this
 * project is arranged, and a dependency on `scripts/lib/gate-state.mjs` says
 * everything.
 */
export function importEdges(root, files) {
  const counts = new Map();
  for (const rel of files) {
    const from = groupOf(rel);
    if (!from) continue;
    let src;
    try { src = readFileSync(join(root, rel), 'utf8'); } catch { continue; }
    for (const m of src.matchAll(/(?:^|\n)\s*import\s[^'"]*from\s+['"](\.[^'"]+)['"]/g)) {
      const target = join(rel, '..', m[1]);
      const to = groupOf(relative(root, join(root, target)));
      if (!to || to === from) continue;
      const key = `${from}→${to}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([k, count]) => ({ from: k.split('→')[0], to: k.split('→')[1], count }))
    .sort((a, b) => b.count - a.count);
}

/** The whole map: what exists, and how the parts reach each other. */
export function systemMap(root = process.cwd()) {
  const nodes = [];
  const allFiles = [];
  for (const g of GROUPS) {
    const files = g.dirs.flatMap((d) => filesIn(root, d, g.ext));
    allFiles.push(...files);
    if (files.length) nodes.push({ key: g.key, label: g.label, what: g.what, count: files.length });
  }
  return {
    root,
    generatedAt: new Date().toISOString(),
    nodes,
    edges: importEdges(root, allFiles.filter((f) => /\.(mjs|ts)$/.test(f))),
  };
}

/**
 * The map as Mermaid.
 *
 * Every count is in the label, so a stale screenshot of this diagram is
 * self-evidently stale — the number is the part that dates it. `ARCHITECTURE.md`
 * said 34 agents for three months because nothing in the picture disagreed with
 * itself.
 */
export function toMermaid(map) {
  const lines = ['flowchart TD'];
  for (const n of map.nodes) {
    lines.push(`  ${n.key}["${n.label}<br/><small>${n.count} files</small>"]`);
  }
  for (const e of map.edges) {
    lines.push(`  ${e.from} -->|${e.count}| ${e.to}`);
  }
  return lines.join('\n');
}

/**
 * The pipeline as a diagram — the picture the twenty architecture documents do
 * not add up to.
 *
 * The import graph above says how the code is arranged; this says how the system
 * RUNS, which is the question someone opening the board actually has. It is
 * drawn from `shared/pipeline.toml`, the same file the dispatcher acts on, so a
 * diagram that disagrees with the pipeline is impossible rather than merely
 * unlikely.
 *
 * Gates are drawn because they are where a human stands in the flow, and a map
 * of an automated pipeline that hides its stopping points describes something
 * other than what runs.
 */
export function pipelineMermaid(tomlText) {
  const transitions = {};
  let cur = null;
  for (const raw of String(tomlText || '').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#') || !line) continue;
    const sec = line.match(/^\[transitions\.([\w-]+)\]$/);
    if (sec) { cur = transitions[sec[1]] = {}; continue; }
    if (line.startsWith('[')) { cur = null; continue; }
    if (!cur) continue;
    const kv = line.match(/^([\w-]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const [, k, v] = kv;
    cur[k] = v.startsWith('[')
      ? v.replace(/^\[|\]$/g, '').split(',').map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean)
      : v.trim().replace(/^"|"$/g, '');
  }

  const id = (a) => a.replace(/[^\w]/g, '_');
  const lines = ['flowchart TD'];
  const seen = new Set();
  for (const [agent, rule] of Object.entries(transitions)) {
    if (!seen.has(agent)) { lines.push(`  ${id(agent)}["${agent}"]`); seen.add(agent); }
    for (const next of rule.next || []) {
      if (!seen.has(next)) { lines.push(`  ${id(next)}["${next}"]`); seen.add(next); }
      const gates = Array.isArray(rule.gate) ? rule.gate : rule.gate ? [rule.gate] : [];
      lines.push(gates.length
        ? `  ${id(agent)} -->|${gates.join(' + ')}| ${id(next)}`
        : `  ${id(agent)} --> ${id(next)}`);
    }
    for (const j of rule.join || []) {
      if (!seen.has(j)) { lines.push(`  ${id(j)}["${j}"]`); seen.add(j); }
      lines.push(`  ${id(j)} -.->|join| ${id(agent)}`);
    }
  }
  return lines.join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const map = systemMap(process.cwd());
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(map, null, 2));
  } else if (process.argv.includes('--pipeline')) {
    console.log(pipelineMermaid(readFileSync(join(process.cwd(), 'shared', 'pipeline.toml'), 'utf8')));
  } else if (process.argv.includes('--mermaid')) {
    console.log(toMermaid(map));
  } else {
    console.log(`${map.nodes.length} groups, ${map.edges.length} edges — generated ${map.generatedAt}\n`);
    for (const n of map.nodes) console.log(`  ${n.label.padEnd(12)} ${String(n.count).padStart(4)}  ${n.what}`);
    console.log('');
    for (const e of map.edges.slice(0, 12)) console.log(`  ${e.from} → ${e.to}  (${e.count})`);
  }
}
