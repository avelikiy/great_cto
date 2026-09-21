/**
 * agent-usage — how often each great_cto agent is really dispatched, read from
 * Claude Code's own session logs (`~/.claude/projects/**\/*.jsonl`).
 *
 * The board's Fleet screen said "never observed" when no verdict line named an
 * agent. A verdict line is written at the end of a run, so a run that wrote none
 * was invisible, and nothing said how often an agent is dispatched at all. On
 * 2026-09-21 the logs of one machine showed 26 of 70 agents dispatched at least
 * once in the retained window, and 44 never. Idea from migsilva89/loadout (MIT),
 * which reads assistant session logs for the same reason.
 *
 * Rules:
 *  - Read-only on the logs. They belong to Claude Code; the index this keeps lives
 *    in ~/.great_cto, never next to them.
 *  - `unavailable` when the logs directory cannot be read — never a zero, which
 *    would read as disuse. A zero is reported only for an agent the logs were read
 *    for and did not name.
 *  - Paths never leave this module. Projects are counted as distinct `cwd` values,
 *    kept in the index only as short hashes.
 *  - The logs are gigabytes; an unchanged file (same size and mtime) is taken from
 *    the index, and only lines that mention `subagent_type` are parsed.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { createHash } from 'node:crypto';

const INDEX_VERSION = 1;

export const DEFAULT_LOGS_DIR = path.join(os.homedir(), '.claude', 'projects');
export const DEFAULT_CACHE_FILE = path.join(os.homedir(), '.great_cto', 'usage-index.json');

const short = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 12);

function listTranscripts(dir) {
  const out = [];
  const walk = (d, depth) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 5) walk(p, depth + 1); }
      else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
    }
  };
  walk(dir, 0);
  return out;
}

/** Dispatches in one transcript: { [rawName]: { n, last, cwds:[hash] } } plus its time span. */
async function readTranscript(file) {
  const perName = {};
  let from = null;
  let to = null;
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.includes('"subagent_type"')) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const content = d?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c?.type !== 'tool_use' || (c?.name !== 'Agent' && c?.name !== 'Task')) continue;
      const raw = c?.input?.subagent_type;
      if (typeof raw !== 'string' || !raw) continue;
      const ts = typeof d.timestamp === 'string' ? d.timestamp : null;
      const slot = perName[raw] || (perName[raw] = { n: 0, last: null, cwds: [] });
      slot.n++;
      if (ts && (!slot.last || ts > slot.last)) slot.last = ts;
      const h = d.cwd ? short(d.cwd) : null;
      if (h && !slot.cwds.includes(h)) slot.cwds.push(h);
      if (ts) { if (!from || ts < from) from = ts; if (!to || ts > to) to = ts; }
    }
  }
  return { perName, from, to };
}

function loadIndex(cacheFile) {
  try {
    const x = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (x && x.version === INDEX_VERSION && x.files && typeof x.files === 'object') return x;
  } catch { /* missing or corrupt: rebuilt below, never trusted */ }
  return { version: INDEX_VERSION, files: {} };
}

function saveIndex(cacheFile, index) {
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    const tmp = `${cacheFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(index));
    fs.renameSync(tmp, cacheFile);
  } catch { /* an index that cannot be saved costs a re-read next time, nothing else */ }
}

/** `great-cto:senior-dev` and `senior-dev` are the same agent. */
const agentOf = (raw, known) => {
  const name = raw.includes(':') ? raw.slice(raw.lastIndexOf(':') + 1) : raw;
  return known.has(name) ? name : null;
};

/**
 * @param {{logsDir?:string, cacheFile?:string, agents:string[]}} opts
 * @returns {Promise<{state:'counted'|'unavailable', why?:string, transcripts:number, read:number,
 *   window:{from:string|null,to:string|null}, agents:Record<string,{dispatches:number,lastRun:string|null,projects:number}>}>}
 */
export async function agentUsage({ logsDir = DEFAULT_LOGS_DIR, cacheFile = DEFAULT_CACHE_FILE, agents = [] } = {}) {
  let isDir = false;
  try { isDir = fs.statSync(logsDir).isDirectory(); } catch { /* absent */ }
  if (!isDir) {
    return { state: 'unavailable', why: 'no Claude Code session logs on this machine', transcripts: 0, read: 0, window: { from: null, to: null }, agents: {} };
  }

  const known = new Set(agents);
  const index = loadIndex(cacheFile);
  const next = { version: INDEX_VERSION, files: {} };
  let read = 0;

  for (const file of listTranscripts(logsDir)) {
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    const key = short(file);
    const prev = index.files[key];
    if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs) { next.files[key] = prev; continue; }
    try {
      const r = await readTranscript(file);
      next.files[key] = { size: st.size, mtimeMs: st.mtimeMs, ...r };
      read++;
    } catch { /* an unreadable transcript is skipped, not counted as empty */ }
  }
  saveIndex(cacheFile, next);

  const out = {};
  for (const a of agents) out[a] = { dispatches: 0, lastRun: null, projects: 0 };
  const cwds = {};
  let from = null;
  let to = null;
  for (const f of Object.values(next.files)) {
    if (f.from && (!from || f.from < from)) from = f.from;
    if (f.to && (!to || f.to > to)) to = f.to;
    for (const [raw, slot] of Object.entries(f.perName || {})) {
      const a = agentOf(raw, known);
      if (!a) continue;
      out[a].dispatches += slot.n;
      if (slot.last && (!out[a].lastRun || slot.last > out[a].lastRun)) out[a].lastRun = slot.last;
      const seen = cwds[a] || (cwds[a] = new Set());
      for (const h of slot.cwds) seen.add(h);
    }
  }
  for (const [a, s] of Object.entries(cwds)) out[a].projects = s.size;

  return { state: 'counted', transcripts: Object.keys(next.files).length, read, window: { from, to }, agents: out };
}

// CLI: node scripts/lib/agent-usage.mjs [--json]
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const agents = fs.readdirSync(path.join(root, 'agents')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
  const u = await agentUsage({ agents });
  if (process.argv.includes('--json')) { console.log(JSON.stringify(u, null, 2)); process.exit(0); }
  if (u.state !== 'counted') { console.log(`agent-usage: ${u.why}`); process.exit(0); }
  const rows = Object.entries(u.agents).sort((x, y) => y[1].dispatches - x[1].dispatches);
  const used = rows.filter(([, v]) => v.dispatches > 0).length;
  console.log(`agent-usage: ${used} of ${rows.length} agents dispatched · ${u.transcripts} transcripts · window ${u.window.from?.slice(0, 10) ?? '?'} → ${u.window.to?.slice(0, 10) ?? '?'}`);
  for (const [a, v] of rows) console.log(`  ${String(v.dispatches).padStart(5)}  ${a.padEnd(30)} ${v.lastRun ? v.lastRun.slice(0, 10) : 'never'}  projects=${v.projects}`);
}

/**
 * A request-safe view of agentUsage: `get()` answers at once — `computing` before
 * the first pass finishes, then the last result — and starts at most one refresh
 * in the background when the result is older than `ttlMs`. The first pass over
 * real logs took 47 s; a board request cannot wait for that.
 */
export function usageSnapshot({ compute, ttlMs = 10 * 60 * 1000, now = () => Date.now() }) {
  let last = null;
  let at = 0;
  let running = null;
  const start = () => {
    if (running) return;
    let pass;
    try { pass = Promise.resolve(compute()); } catch (e) { pass = Promise.reject(e); }
    running = pass
      .then((r) => { last = r; }, (e) => { last = { state: 'unavailable', why: `usage could not be read: ${e?.message || e}` }; })
      .finally(() => { at = now(); running = null; });
  };
  return {
    get() {
      if (!last) { start(); return { state: 'computing', why: 'counting agent dispatches in the session logs — the first pass over a large history takes a minute' }; }
      if (now() - at > ttlMs) { start(); return { ...last, refreshing: true }; }
      return last;
    },
  };
}
