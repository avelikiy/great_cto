#!/usr/bin/env node
// How closely do real Claude Code sessions follow shared/pipeline.toml? (ADR-039)
//
// Reads every local transcript (~/.claude/projects/*/*.jsonl), takes the order
// of Agent/Task dispatches of pipeline stages, and classifies each consecutive
// pair. Off-graph is what is left after the paths the graph allows in other
// ways: a repeat, a new chain, a rework loop, a skip the graph declares, a
// parallel sibling. Prints counts and the top off-graph pairs; project names
// are never printed (the transcripts are the operator's, the output may not be).
//
//   node scripts/graph-adherence.mjs [--json]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePipelineToml } from './lib/pipeline-toml.mjs';
import { isMainModule } from './lib/is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = new Set(['product-owner', 'architect', 'project-auditor', 'l3-support']);
const IMPL = new Set(['senior-dev', 'mobile-app-builder']);

/** Merge `stage.VERDICT` branches into their stage's next set. */
export function graphOf(toml) {
  const raw = parsePipelineToml(toml); const g = {};
  for (const [k, v] of Object.entries(raw)) {
    const stage = k.split('.')[0];
    g[stage] = g[stage] || { next: new Set(), join: new Set() };
    for (const n of v.next || []) g[stage].next.add(n);
    for (const n of v.join || []) g[stage].join.add(n);
  }
  return g;
}

export function classify(g, a, b) {
  const next = (x) => g[x]?.next || new Set();
  if (a === b) return 'repeat';
  if (ENTRY.has(b) && !ENTRY.has(a)) return 'new-chain';
  if (next(a).has(b)) return 'on-graph';
  for (const n of next(a)) if (next(n).has(b)) return 'graph-skip';
  if (IMPL.has(b) && !IMPL.has(a)) return 'rework';
  if (g[a]?.join.has(b)) return 'parallel';
  for (const v of Object.values(g)) if (v.next.has(a) && v.next.has(b)) return 'parallel';
  if (!g[a]) return 'unmapped-source';
  return 'off-graph';
}

const stage = (s) => String(s || '').replace(/^great[-_]cto[:-]/, '');

function sequences(dir) {
  const out = [];
  let projects = [];
  try { projects = readdirSync(dir); } catch { return out; }
  for (const p of projects) {
    let files = [];
    try { files = readdirSync(join(dir, p)).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const seq = [];
      let text;
      try { text = readFileSync(join(dir, p, f), 'utf8'); } catch { continue; }
      for (const line of text.split('\n')) {
        if (!line.includes('"subagent_type"')) continue;
        let o; try { o = JSON.parse(line); } catch { continue; }
        if (o.type !== 'assistant' || !Array.isArray(o.message?.content)) continue;
        for (const c of o.message.content) {
          if (c.type === 'tool_use' && (c.name === 'Agent' || c.name === 'Task')) seq.push(stage(c.input?.subagent_type));
        }
      }
      if (seq.length) out.push({ project: p, seq });
    }
  }
  return out;
}

if (isMainModule(import.meta.url)) {
  const g = graphOf(readFileSync(join(ROOT, 'shared', 'pipeline.toml'), 'utf8'));
  const nodes = new Set([...Object.keys(g), ...Object.values(g).flatMap((v) => [...v.next])]);
  const counts = {}; const off = {}; let pairs = 0;
  for (const { seq } of sequences(join(homedir(), '.claude', 'projects'))) {
    const s = seq.filter((x) => nodes.has(x));
    for (let i = 1; i < s.length; i++) {
      const k = classify(g, s[i - 1], s[i]); counts[k] = (counts[k] || 0) + 1; pairs++;
      if (k === 'off-graph') { const key = `${s[i - 1]} → ${s[i]}`; off[key] = (off[key] || 0) + 1; }
    }
  }
  const top = Object.entries(off).sort((x, y) => y[1] - x[1]).slice(0, 10);
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ pairs, counts, top })); process.exit(0); }
  console.log(`consecutive pipeline dispatch pairs: ${pairs}`);
  for (const [k, n] of Object.entries(counts).sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(5)} ${(100 * n / pairs).toFixed(1).padStart(5)}%  ${k}`);
  if (top.length) { console.log('top off-graph pairs:'); for (const [k, n] of top) console.log(`  ${String(n).padStart(5)}  ${k}`); }
}
