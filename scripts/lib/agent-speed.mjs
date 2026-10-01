#!/usr/bin/env node
/**
 * agent-speed — how long each agent's runs take, and where the time goes, from
 * Claude Code's own subagent transcripts (`~/.claude/projects/<p>/<s>/subagents/`).
 *
 * The measurement behind PLAN-2026-09-23-agent-speed, kept as a tool so a speed
 * change can be shown to have helped: run it for a window before and after.
 *
 * Per agent type:
 *   minutes     median and p90 of first→last timestamp of a run
 *   toolCalls   median tool calls per run
 *   batched     share of model messages that carried 2+ tool calls. Counted per
 *               message id: the transcript writes each content block as its own
 *               line, and counting lines reads every turn as a single call (the
 *               first pass of this measurement made exactly that mistake).
 *   modelShare  time from a tool result to the next model message, over the run
 *
 * Read-only on the transcripts. Usage:
 *   node scripts/lib/agent-speed.mjs [--since 2026-09-23] [--until …] [--agent senior-dev] [--json]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const DEFAULT_ROOT = join(homedir(), '.claude', 'projects');
const ts = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : null; };
const agentName = (t) => String(t || '').replace(/^.*:/, '').replace(/^great_cto-/, '');

function subagentFiles(root) {
  const out = [];
  let projects = [];
  try { projects = readdirSync(root); } catch { return out; }
  for (const p of projects) {
    let sessions = [];
    try { sessions = readdirSync(join(root, p)); } catch { continue; }
    for (const s of sessions) {
      const dir = join(root, p, s, 'subagents');
      let files = [];
      try { files = readdirSync(dir); } catch { continue; }
      for (const f of files) if (f.endsWith('.jsonl')) out.push(join(dir, f));
    }
  }
  return out;
}

/** One transcript → a run record, or null. */
export function measureRun(jsonl) {
  let first = null; let last = null; let toolTime = 0; let modelTime = 0;
  const perMsg = new Map(); const pending = new Map(); let lastResult = null;
  for (const line of String(jsonl).split('\n')) {
    if (!line.trim()) continue;
    let d; try { d = JSON.parse(line); } catch { continue; }
    const t = d.timestamp ? ts(d.timestamp) : null;
    if (t) { if (first === null) first = t; last = t; }
    const c = d.message?.content;
    if (d.type === 'assistant' && Array.isArray(c)) {
      const uses = c.filter((x) => x && x.type === 'tool_use');
      if (!uses.length) continue;
      const id = d.message.id || `line-${perMsg.size}`;
      if (!perMsg.has(id) && t && lastResult) modelTime += Math.max(0, t - lastResult);
      perMsg.set(id, (perMsg.get(id) || 0) + uses.length);
      for (const u of uses) pending.set(u.id, t);
    } else if (d.type === 'user' && Array.isArray(c)) {
      for (const x of c) {
        if (x && x.type === 'tool_result' && pending.has(x.tool_use_id)) {
          const t0 = pending.get(x.tool_use_id); pending.delete(x.tool_use_id);
          if (t && t0) toolTime += Math.max(0, t - t0);
        }
      }
      if (t) lastResult = t;
    }
  }
  if (first === null || last === null || last <= first) return null;
  const msgs = [...perMsg.values()];
  return {
    start: first, minutes: (last - first) / 60000,
    toolCalls: msgs.reduce((a, b) => a + b, 0), messages: msgs.length,
    batchedMessages: msgs.filter((n) => n >= 2).length,
    modelMs: modelTime, toolMs: toolTime,
  };
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const p90 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.max(0, Math.ceil(s.length * 0.9) - 1)] : null; };

/** Aggregate runs per agent type. */
export function agentSpeed({ root = DEFAULT_ROOT, since = null, until = null, agent = null, files = null } = {}) {
  const lo = since ? ts(since) : null; const hi = until ? ts(until) : null;
  const byAgent = new Map();
  for (const f of files || subagentFiles(root)) {
    let meta = {};
    try { meta = JSON.parse(readFileSync(f.replace(/\.jsonl$/, '.meta.json'), 'utf8')); } catch { continue; }
    const a = agentName(meta.agentType);
    if (!a || (agent && a !== agent)) continue;
    let run; try { run = measureRun(readFileSync(f, 'utf8')); } catch { continue; }
    if (!run || (lo && run.start < lo) || (hi && run.start >= hi)) continue;
    if (!byAgent.has(a)) byAgent.set(a, []);
    byAgent.get(a).push(run);
  }
  const out = {};
  for (const [a, runs] of byAgent) {
    const msgs = runs.reduce((s, r) => s + r.messages, 0);
    const model = runs.reduce((s, r) => s + r.modelMs, 0); const tool = runs.reduce((s, r) => s + r.toolMs, 0);
    out[a] = {
      runs: runs.length,
      medianMinutes: median(runs.map((r) => r.minutes)), p90Minutes: p90(runs.map((r) => r.minutes)),
      medianToolCalls: median(runs.map((r) => r.toolCalls)),
      batched: msgs ? runs.reduce((s, r) => s + r.batchedMessages, 0) / msgs : null,
      modelShare: model + tool ? model / (model + tool) : null,
    };
  }
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const a = process.argv.slice(2);
  const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const r = agentSpeed({ since: opt('--since'), until: opt('--until'), agent: opt('--agent') });
  if (a.includes('--json')) { process.stdout.write(`${JSON.stringify(r, null, 2)}\n`); process.exit(0); }
  const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
  process.stdout.write(`${'agent'.padEnd(24)}${'runs'.padStart(5)}${'median'.padStart(8)}${'p90'.padStart(7)}${'calls'.padStart(7)}${'batched'.padStart(9)}${'model'.padStart(7)}\n`);
  for (const [k, v] of Object.entries(r).sort((x, y) => y[1].runs * y[1].medianMinutes - x[1].runs * x[1].medianMinutes)) {
    process.stdout.write(`${k.slice(0, 24).padEnd(24)}${String(v.runs).padStart(5)}${v.medianMinutes.toFixed(1).padStart(8)}${v.p90Minutes.toFixed(1).padStart(7)}${String(Math.round(v.medianToolCalls)).padStart(7)}${pct(v.batched).padStart(9)}${pct(v.modelShare).padStart(7)}\n`);
  }
  if (!existsSync(DEFAULT_ROOT)) process.stdout.write('agent-speed: no Claude Code session logs on this machine\n');
}
