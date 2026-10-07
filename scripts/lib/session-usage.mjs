/**
 * session-usage — what Claude Code and Codex actually consumed on this machine,
 * read from their own session logs.
 *
 *   Claude Code  ~/.claude/projects/<slug>/<session>.jsonl
 *                ~/.claude/projects/<slug>/<session>/subagents/agent-*.jsonl
 *   Codex        ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 *                ~/.codex/archived_sessions/rollout-*.jsonl
 *
 * Both hosts already write per-response token usage, the model, every tool call
 * and — Codex only — the plan's rate-limit window. Nothing on the board read it:
 * the Ledger priced verdicts, which is what great_cto's agents reported, not
 * what the hosts spent. This module is the missing reader.
 *
 * Rules, each from a way this goes wrong:
 *
 *  - One assistant response is written as SEVERAL Claude Code lines, one per
 *    content block, and every one of them repeats the same `usage`. Summing lines
 *    counts a response two to three times (58 lines, 26 responses in the session
 *    this was found in). Usage is taken once per `message.id`; tool calls are
 *    taken per line, because each line carries a different block.
 *  - Codex reports `input_tokens` INCLUDING the cached part. It is split here
 *    into fresh input and cache reads so both hosts share one shape.
 *  - Dollars are not stored. Tokens are stored per day per model and priced when
 *    read, so a price override applies to history, and a model nobody priced is
 *    reported as unpriced, never as free.
 *  - A 429 is not a plan limit. Claude Code writes "not your usage limit" on a
 *    server-side throttle; the two are counted apart.
 *  - Read-only on the logs. The index lives in ~/.great_cto. A file that
 *    disappears (Claude Code prunes old transcripts) keeps its counted days: the
 *    history is ours once read, and losing it would read as a quiet month.
 *  - Append-only files are read from the last complete line, so a refresh costs
 *    the new bytes, not the gigabytes.
 *  - Nothing here leaves the machine. Titles and project names are private; the
 *    board serves them on its own host only.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { priceUsage, effectivePrices } from './cost-meter.mjs';

const INDEX_VERSION = 3;          // 2: hourly buckets, limit kinds, Codex limit series · 3: hook blocks, errors, timeouts
const RING = 256;                 // recent response ids remembered across reads
const KEEP_GONE_DAYS = 400;       // how long a vanished file's days are kept
const SERIES_MAX = 4000;          // Codex limit readings kept per file
const CHUNK = 1 << 20;

const home = () => os.homedir();
export const DEFAULT_CLAUDE_DIR = () => path.join(home(), '.claude', 'projects');
export const DEFAULT_CODEX_DIRS = () => [path.join(home(), '.codex', 'sessions'), path.join(home(), '.codex', 'archived_sessions')];
export const DEFAULT_CODEX_TITLES = () => path.join(home(), '.codex', 'session_index.jsonl');
// The version is in the name: a board started on an older release keeps running
// until restarted, and two versions sharing one file would rebuild it from
// scratch on every pass, each throwing the other's away.
export const DEFAULT_CACHE_FILE = () => path.join(home(), '.great_cto', `session-usage-index.v${INDEX_VERSION}.json`);

const short = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 16);

/** Local hour (00–23) of an ISO timestamp. */
export function hourOf(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : String(d.getHours()).padStart(2, '0');
}

/** Local calendar day of an ISO timestamp — the operator's day, not UTC's. */
export function dayOf(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * A working directory → the project a person would name.
 * Agent worktrees are folded into the repository they belong to: forty
 * `wt-1788…` rows would hide which project the work was for.
 */
export function projectName(cwd, homeDir = home()) {
  if (!cwd || typeof cwd !== 'string') return null;
  const cw = cwd.match(/^(.*)\/\.claude\/worktrees\/[^/]+/);
  if (cw) return path.basename(cw[1]);
  const cx = cwd.match(/\/\.codex\/worktrees\/[^/]+\/([^/]+)/);
  if (cx) return cx[1];
  if (path.resolve(cwd) === path.resolve(homeDir)) return '~';
  return path.basename(cwd) || null;
}

// ── file discovery ────────────────────────────────────────────────────────────

function walk(dir, maxDepth, out) {
  const go = (d, depth) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < maxDepth) go(p, depth + 1); }
      else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
    }
  };
  go(dir, 0);
  return out;
}

export function listLogFiles({ claudeDir = DEFAULT_CLAUDE_DIR(), codexDirs = DEFAULT_CODEX_DIRS() } = {}) {
  const files = [];
  const seen = { claude: false, codex: false };
  if (isDir(claudeDir)) { seen.claude = true; for (const f of walk(claudeDir, 4, [])) files.push({ host: 'claude', file: f }); }
  for (const d of codexDirs) {
    if (isDir(d)) { seen.codex = true; for (const f of walk(d, 4, [])) files.push({ host: 'codex', file: f }); }
  }
  return { files, seen };
}

function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }

// ── shared accumulation ───────────────────────────────────────────────────────

function emptyDay() {
  // g: a guard hook refused a tool call · sb: a Stop hook sent the turn back ·
  // he: a hook failed · ht: a hook timed out. Keyed by the guard's name or the
  // hook's status message — the only name a transcript gives a hook.
  return { in: 0, out: 0, cr: 0, cw: 0, cwh: 0, rs: 0, msgs: 0, models: {}, tools: {}, skills: {}, agents: {}, mcp: {}, lim: {}, h: {}, g: {}, sb: {}, he: {}, ht: {} };
}

/** The hour inside a day: tokens per model as [in, out, cacheRead, cacheWrite5m, cacheWrite1h], and limit refusals. */
function hourBucket(b, ts) {
  const hh = hourOf(ts);
  if (!hh) return null;
  return b.h[hh] || (b.h[hh] = { m: {}, lim: {} });
}

function addUsage(entry, ts, model, t) {
  const b = dayBucket(entry, ts);
  if (!b) return null;
  addTokens(b, model, t);
  const hb = hourBucket(b, ts);
  if (hb) {
    const v = hb.m[model] || (hb.m[model] = [0, 0, 0, 0, 0]);
    v[0] += t.in; v[1] += t.out; v[2] += t.cr; v[3] += t.cw; v[4] += t.cwh;
  }
  return b;
}

function dayBucket(entry, ts) {
  const day = dayOf(ts);
  if (!day) return null;
  return entry.days[day] || (entry.days[day] = emptyDay());
}

const bump = (map, key, n = 1) => { if (key) map[key] = (map[key] || 0) + n; };

function addTokens(b, model, t) {
  b.in += t.in; b.out += t.out; b.cr += t.cr; b.cw += t.cw; b.cwh += t.cwh; b.rs += t.rs; b.msgs += 1;
  const m = b.models[model] || (b.models[model] = { in: 0, out: 0, cr: 0, cw: 0, cwh: 0, msgs: 0 });
  m.in += t.in; m.out += t.out; m.cr += t.cr; m.cw += t.cw; m.cwh += t.cwh; m.msgs += 1;
}

function countTool(b, name) {
  if (!name) return;
  if (name.startsWith('mcp__')) {
    const server = name.split('__')[1] || name;
    bump(b.mcp, server);
  }
  bump(b.tools, name);
}

function remember(ring, id) {
  ring.push(id);
  if (ring.length > RING) ring.splice(0, ring.length - RING);
}

function touchSpan(meta, ts) {
  if (!ts) return;
  if (!meta.first || ts < meta.first) meta.first = ts;
  if (!meta.last || ts > meta.last) meta.last = ts;
}

// ── Claude Code ───────────────────────────────────────────────────────────────

/** Session id, parent and function of a Claude Code transcript, from its path. */
function claudeFileMeta(file) {
  const base = path.basename(file, '.jsonl');
  const dir = path.dirname(file);
  if (path.basename(dir) === 'subagents') {
    const parent = path.basename(path.dirname(dir));
    let agentType = null;
    try { agentType = JSON.parse(fs.readFileSync(path.join(dir, `${base}.meta.json`), 'utf8')).agentType || null; } catch { /* older layout: no meta */ }
    return { session: base, parent, fn: 'subagent', agentType };
  }
  return { session: base, parent: null, fn: null, agentType: null };
}

/**
 * Which limit refused a request, from the words Claude Code shows. Seen on this
 * machine: "session limit" (the 5-hour window), "weekly limit", "monthly spend
 * limit", "reached your <model> limit", "out of usage credits", and the server's
 * own throttle, which says outright that it is "not your usage limit".
 */
export function limitKind(text) {
  const t = String(text || '');
  if (/not your usage limit/i.test(t)) return 'server';
  if (/monthly spend limit/i.test(t)) return 'spend';
  if (/out of usage credits/i.test(t)) return 'credits';
  if (/session limit/i.test(t)) return 'session';
  if (/weekly limit/i.test(t)) return 'weekly';
  if (/reached your .{1,40} limit/i.test(t)) return 'model';
  return 'other';
}

/** `great-cto:senior-dev` and `senior-dev` are one agent; `feature-dev:code-reviewer` is not ours. */
export function agentName(raw) {
  if (typeof raw !== 'string' || !raw) return 'general-purpose';
  return raw.replace(/^great[-_]cto:/, '');
}

/**
 * A hook that refused a tool call, from the tool result Claude Code wrote:
 *   "PreToolUse:Bash hook error: [<cmd>]: great_cto shared-tree guard blocked …"
 * Named by the guard when the hook names itself, else by the event and tool.
 */
export function guardOf(text) {
  const m = String(text || '').trimStart().match(/^(PreToolUse|PostToolUse|PermissionRequest|UserPromptSubmit):?([^\s]*) hook (?:error|blocking error)/);
  if (!m) return null;
  const g = text.match(/great_cto ([a-z0-9-]+(?: [a-z0-9-]+)?) guard\b/);
  if (g) return { name: g[1], ours: true };
  return { name: `${m[1]}${m[2] ? `:${m[2]}` : ''}`, ours: /\bgreat_cto\b/.test(text) };
}

/** A Stop-hook continuation: "PIPELINE-NEXT: senior-dev succeeded …" → PIPELINE-NEXT. */
export function stopBlockName(event, text) {
  const m = String(text || '').match(/^\s*([A-Z][A-Z0-9_-]{2,40}):/);
  return m ? `${event}: ${m[1]}` : event || 'hook';
}

/**
 * A short name for a hook. Claude Code records a hook by its status message
 * ("Safety check...") or, when it has none, by its whole shell command — a
 * 200-character `PLUGIN_DIR=$(ls -d …)` line. The script it runs is the name.
 */
export function hookLabel(command) {
  const c = String(command || '').trim();
  const m = c.match(/scripts\/hooks\/([A-Za-z0-9_.-]+?)(?:\.(?:mjs|js|py|sh))?(?=["'\s]|$)/);
  if (m) return m[1];
  return c.length > 60 ? `${c.slice(0, 57)}…` : c || 'hook';
}

function hookRecord(entry, r) {
  const a = r.attachment || {};
  const ts = typeof r.timestamp === 'string' ? r.timestamp : null;
  if (!ts) return;
  const b = dayBucket(entry, ts);
  if (!b) return;
  for (const k of ['g', 'sb', 'he', 'ht']) if (!b[k]) b[k] = {};
  if (a.type === 'hook_blocking_error') {
    const text = a.blockingError?.blockingError ?? a.blockingError ?? '';
    bump(b.sb, stopBlockName(a.hookEvent || a.hookName, typeof text === 'string' ? text : ''));
  } else if (a.type === 'hook_non_blocking_error') {
    bump(b.he, `${a.hookEvent || a.hookName}: ${hookLabel(a.command || a.hookName)}`);
  } else if (a.type === 'hook_cancelled' && a.timedOut) {
    bump(b.ht, `${a.hookEvent || a.hookName}: ${hookLabel(a.command || a.hookName)}`);
  }
}

export function claudeLine(entry, line) {
  // Most bytes in a transcript are tool RESULTS in user lines. They carry no
  // usage, so they are not parsed — except to name a session that has no title,
  // and when a hook refused the call the result answers.
  const isAssistant = line.includes('"type":"assistant"');
  const isTitle = line.includes('"custom-title"');
  const wantsPrompt = !entry.meta.prompt && !entry.meta.title && line.includes('"type":"user"');
  const isHookResult = line.includes(' hook error') && line.includes('"tool_result"');
  const isHookRecord = line.includes('"hook_blocking_error"') || line.includes('"hook_non_blocking_error"') || line.includes('"hook_cancelled"');
  if (!isAssistant && !isTitle && !wantsPrompt && !isHookResult && !isHookRecord) return;
  let r;
  try { r = JSON.parse(line); } catch { return; }
  const meta = entry.meta;

  if (r.type === 'attachment') { if (isHookRecord) hookRecord(entry, r); return; }
  if (r.type === 'user' && isHookResult) {
    const ts = typeof r.timestamp === 'string' ? r.timestamp : null;
    const b = ts && dayBucket(entry, ts);
    for (const block of Array.isArray(r.message?.content) ? r.message.content : []) {
      // Only a result Claude Code marked as an error: a command whose OUTPUT
      // quotes a refusal (a grep over these logs, say) is not one.
      if (block?.type !== 'tool_result' || block.is_error !== true) continue;
      const c = block.content;
      const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x?.text || '').join(' ') : '';
      const g = guardOf(text);
      if (g && b) {
        if (!b.g) b.g = {};
        bump(b.g, g.ours ? g.name : `other: ${g.name}`);
      }
    }
    if (!wantsPrompt) return;
  }

  if (r.type === 'custom-title' && r.customTitle) { meta.title = String(r.customTitle).slice(0, 160); return; }
  if (r.type === 'user') {
    if (r.isCompactSummary || r.isMeta) return;
    const c = r.message?.content;
    const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b?.type === 'text').map((b) => b.text || '').join(' ') : '';
    const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean && !clean.startsWith('Caveat:')) meta.prompt = clean.slice(0, 120);
    return;
  }
  if (r.type !== 'assistant') return;

  const ts = typeof r.timestamp === 'string' ? r.timestamp : null;
  if (!ts) return;
  touchSpan(meta, ts);
  if (!meta.cwd && r.cwd) meta.cwd = r.cwd;
  if (!meta.entry && r.entrypoint) meta.entry = r.entrypoint;
  if (!meta.fn && !r.isSidechain) meta.fn = /^sdk/.test(r.entrypoint || '') ? 'headless' : 'chat';
  const b = dayBucket(entry, ts);
  if (!b) return;

  if (r.isApiErrorMessage && r.error === 'rate_limit') {
    const c = r.message?.content;
    const text = Array.isArray(c) ? c.map((x) => x?.text || '').join(' ') : String(c || '');
    const kind = limitKind(text);
    bump(b.lim, kind);
    const hb = hourBucket(b, ts);
    if (hb) bump(hb.lim, kind);
    // The words carry the reset time ("resets Sep 12 at 3pm"); the latest is kept to show.
    if (!meta.lastHit || ts > meta.lastHit.at) meta.lastHit = { at: ts, kind, text: text.replace(/\s+/g, ' ').trim().slice(0, 200) };
    return;
  }

  const msg = r.message || {};
  for (const block of Array.isArray(msg.content) ? msg.content : []) {
    if (block?.type !== 'tool_use') continue;
    countTool(b, block.name);
    if (block.name === 'Skill') bump(b.skills, typeof block.input?.skill === 'string' ? block.input.skill : null);
    if (block.name === 'Agent' || block.name === 'Task') bump(b.agents, agentName(block.input?.subagent_type));
  }

  const u = msg.usage;
  const model = msg.model;
  if (!u || !model || model === '<synthetic>') return;
  const id = msg.id || r.requestId || r.uuid;
  if (id && entry.state.ids.includes(id)) return;
  if (id) remember(entry.state.ids, id);
  const cwh = u.cache_creation?.ephemeral_1h_input_tokens || 0;
  const t = {
    in: u.input_tokens || 0,
    out: u.output_tokens || 0,
    cr: u.cache_read_input_tokens || 0,
    cw: Math.max(0, (u.cache_creation_input_tokens || 0) - cwh),
    cwh,
    rs: u.output_tokens_details?.thinking_tokens || 0,
  };
  addUsage(entry, ts, u.speed === 'fast' ? `${model}@fast` : model, t);
  // Older Claude Code wrote subagent turns into the parent's own file.
  if (r.isSidechain && meta.fn !== 'subagent') b.side = (b.side || 0) + t.in + t.out + t.cr + t.cw + t.cwh;
}

// ── Codex ─────────────────────────────────────────────────────────────────────

const SKILL_PATH = /skills\/(?:\.system\/)?([A-Za-z0-9_.-]+)\/SKILL\.md/g;
const TOOL_CALL = /\btools\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

function codexUsage(u) {
  const input = u.input_tokens || 0;
  const cached = Math.min(u.cached_input_tokens || 0, input);
  return { in: input - cached, out: u.output_tokens || 0, cr: cached, cw: u.cache_write_input_tokens || 0, cwh: 0, rs: u.reasoning_output_tokens || 0 };
}

export function codexLine(entry, line) {
  const hit = line.includes('"token_usage_record"') || line.includes('"token_count"')
    || line.includes('"turn_context"') || line.includes('"session_meta"')
    || line.includes('"custom_tool_call"') || line.includes('"function_call"');
  if (!hit) return;
  let r;
  try { r = JSON.parse(line); } catch { return; }
  const p = r.payload || {};
  const ts = typeof r.timestamp === 'string' ? r.timestamp : null;
  const meta = entry.meta;
  const st = entry.state;

  if (r.type === 'session_meta') {
    meta.session = p.id || p.session_id || meta.session;
    if (p.cwd) meta.cwd = p.cwd;
    meta.entry = p.originator || null;
    const sub = p.source && typeof p.source === 'object' ? p.source.subagent?.thread_spawn : null;
    if (sub) {
      meta.fn = 'subagent';
      meta.parent = sub.parent_thread_id || null;
      meta.agentType = sub.agent_role || p.agent_role || null;
      const b = ts && dayBucket(entry, ts);
      if (b) bump(b.agents, meta.agentType || 'subagent');
    } else if (p.thread_source === 'automation') meta.fn = 'automation';
    else if (p.originator === 'codex_exec' || p.source === 'exec') meta.fn = 'headless';
    else meta.fn = 'chat';
    return;
  }
  if (r.type === 'turn_context') { if (p.model) st.model = p.model; return; }
  if (!ts) return;

  if (r.type === 'response_item' && (p.type === 'custom_tool_call' || p.type === 'function_call')) {
    const b = dayBucket(entry, ts);
    if (!b) return;
    touchSpan(meta, ts);
    const input = String(p.input ?? p.arguments ?? '');
    // `exec` is Codex's code-mode wrapper: the tools are called inside it.
    const inner = p.name === 'exec' ? [...input.matchAll(TOOL_CALL)].map((m) => m[1]) : [];
    if (inner.length) for (const n of inner) countTool(b, n); else countTool(b, p.name);
    for (const m of input.matchAll(SKILL_PATH)) bump(b.skills, m[1]);
    return;
  }

  if (r.type === 'token_usage_record' && p.usage) {
    const id = p.response_id;
    if (id && st.ids.includes(id)) return;
    if (id) remember(st.ids, id);
    st.records = true;
    if (!addUsage(entry, ts, st.model || 'unknown', codexUsage(p.usage))) return;
    touchSpan(meta, ts);
    return;
  }

  if (r.type === 'event_msg' && p.type === 'token_count') {
    const rl = p.rate_limits;
    if (rl && (rl.primary || rl.secondary)) {
      meta.limits = {
        at: ts, plan: rl.plan_type || meta.limits?.plan || null, reached: rl.rate_limit_reached_type || null,
        primary: rl.primary ? { used: rl.primary.used_percent, minutes: rl.primary.window_minutes, resets: rl.primary.resets_at } : null,
        secondary: rl.secondary ? { used: rl.secondary.used_percent, minutes: rl.secondary.window_minutes, resets: rl.secondary.resets_at } : null,
        credits: rl.credits ? { has: !!rl.credits.has_credits, unlimited: !!rl.credits.unlimited, balance: rl.credits.balance ?? null } : null,
      };
      // The window's history: one point per change, not per event — Codex
      // repeats the same reading after every response.
      const L = meta.limits;
      const pt = [Date.parse(ts), L.primary?.used ?? null, L.primary?.minutes ?? null, L.primary?.resets ?? null,
        L.secondary?.used ?? null, L.secondary?.minutes ?? null, L.secondary?.resets ?? null, L.reached ? 1 : 0];
      const series = meta.series || (meta.series = []);
      const last = series[series.length - 1];
      if (Number.isFinite(pt[0]) && (!last || [1, 3, 4, 6, 7].some((i) => last[i] !== pt[i]))) {
        series.push(pt);
        if (series.length > SERIES_MAX) series.splice(0, series.length - SERIES_MAX);
      }
    }
    // Older sessions have no token_usage_record. Their usage is the growth of
    // the cumulative total — token_count is emitted more than once per response,
    // so `last_token_usage` would count a response twice.
    const tot = p.info?.total_token_usage;
    if (!st.records && tot && typeof tot.total_tokens === 'number') {
      const prev = st.prev;
      st.prev = tot;
      if (prev && tot.total_tokens <= prev.total_tokens) return;
      const delta = {};
      for (const k of ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens']) {
        delta[k] = Math.max(0, (tot[k] || 0) - ((prev && prev[k]) || 0));
      }
      // A thread forked from another opens with a total and no breakdown — the
      // context it inherited, not a response. It is the base, never usage.
      if (!delta.input_tokens && !delta.output_tokens && !delta.cached_input_tokens) return;
      if (!addUsage(entry, ts, st.model || 'unknown', codexUsage(delta))) return;
      touchSpan(meta, ts);
    }
  }
}

// ── incremental reading ───────────────────────────────────────────────────────

/** Feed every COMPLETE line in [start, size) to onLine; return where the next read starts. */
async function readFrom(file, start, onLine) {
  const fh = await fs.promises.open(file, 'r');
  try {
    const buf = Buffer.allocUnsafe(CHUNK);
    let pos = start;
    let carry = null;
    let committed = start;
    for (;;) {
      const { bytesRead } = await fh.read(buf, 0, CHUNK, pos);
      if (bytesRead === 0) break;
      pos += bytesRead;
      let data = buf.subarray(0, bytesRead);
      if (carry) { data = Buffer.concat([carry, data]); carry = null; }
      let from = 0;
      for (;;) {
        const nl = data.indexOf(10, from);
        if (nl === -1) break;
        if (nl > from) onLine(data.toString('utf8', from, nl));
        committed += nl + 1 - from;
        from = nl + 1;
      }
      // A line still being written stays unread until it has its newline.
      if (from < data.length) carry = Buffer.from(data.subarray(from));
    }
    return committed;
  } finally {
    await fh.close();
  }
}

function freshEntry(host, file) {
  const meta = host === 'claude' ? claudeFileMeta(file) : { session: null, parent: null, fn: null, agentType: null };
  return { host, size: 0, mtimeMs: 0, offset: 0, meta: { ...meta, title: null, prompt: null, cwd: null, entry: null, first: null, last: null }, state: { ids: [], model: null, prev: null, records: false }, days: {} };
}

function loadIndex(cacheFile) {
  try {
    const x = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (x && x.version === INDEX_VERSION && x.files && typeof x.files === 'object') return x;
  } catch { /* missing or corrupt: rebuilt, never trusted */ }
  return { version: INDEX_VERSION, files: {} };
}

function saveIndex(cacheFile, index) {
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    const tmp = `${cacheFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(index));
    fs.renameSync(tmp, cacheFile);
  } catch { /* unsaved: the next pass re-reads, nothing else is lost */ }
  removeOlderIndexes(cacheFile);
}

/**
 * An index of an older format is a copy nothing current reads — megabytes each.
 * Only names this module writes, only versions below the current one, and only
 * next to the default file: a caller's own cache path is the caller's business.
 */
export function removeOlderIndexes(cacheFile, version = INDEX_VERSION) {
  if (path.basename(cacheFile) !== `session-usage-index.v${version}.json`) return [];
  const dir = path.dirname(cacheFile);
  const removed = [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return removed; }
  for (const name of names) {
    const m = name.match(/^session-usage-index(?:\.v(\d+))?\.json$/);
    if (!m) continue;
    const v = m[1] ? Number(m[1]) : 1;
    if (v >= version) continue;
    try { fs.rmSync(path.join(dir, name)); removed.push(name); } catch { /* in use or gone: next save tries again */ }
  }
  return removed;
}

/**
 * Bring the index up to date with the logs on disk.
 * @returns {Promise<{index:object, seen:{claude:boolean,codex:boolean}, read:number, files:number}>}
 */
export async function scanUsage({ claudeDir = DEFAULT_CLAUDE_DIR(), codexDirs = DEFAULT_CODEX_DIRS(), cacheFile = DEFAULT_CACHE_FILE(), now = Date.now() } = {}) {
  const index = loadIndex(cacheFile);
  const { files, seen } = listLogFiles({ claudeDir, codexDirs });
  const live = new Set();
  let read = 0;
  for (const { host, file } of files) {
    const key = short(file);
    live.add(key);
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    let e = index.files[key];
    if (e && e.size === st.size && e.mtimeMs === st.mtimeMs) continue;
    // Smaller than what was read means rewritten, not appended: start over.
    if (!e || e.host !== host || st.size < e.offset) e = freshEntry(host, file);
    try {
      const onLine = host === 'claude' ? (l) => claudeLine(e, l) : (l) => codexLine(e, l);
      e.offset = await readFrom(file, e.offset, onLine);
      e.size = st.size;
      e.mtimeMs = st.mtimeMs;
      index.files[key] = e;
      read++;
    } catch { /* unreadable now: tried again next pass, never counted as empty */ }
  }
  // A file that is gone keeps its days until they are too old to matter.
  const cutoff = dayOf(now - KEEP_GONE_DAYS * 86400000);
  for (const [key, e] of Object.entries(index.files)) {
    if (live.has(key)) continue;
    e.gone = true;
    if (!e.meta?.last || dayOf(e.meta.last) < cutoff) delete index.files[key];
  }
  saveIndex(cacheFile, index);
  return { index, seen, read, files: files.length };
}

// ── the summary the board draws ───────────────────────────────────────────────

/** Codex thread names, last write wins. */
export function readCodexTitles(file = DEFAULT_CODEX_TITLES()) {
  const out = {};
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return out; }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r.id && r.thread_name) out[r.id] = String(r.thread_name).slice(0, 160); } catch { /* partial */ }
  }
  return out;
}

const FAST = '@fast';

/** Dollars for one model bucket, or null when nobody priced the model. */
function priceBucket(model, m, prices) {
  const fast = model.endsWith(FAST);
  const base = fast ? model.slice(0, -FAST.length) : model;
  const p = priceUsage({
    model: base,
    prices,
    usage: {
      input_tokens: m.in, output_tokens: m.out, cache_read_input_tokens: m.cr,
      cache_creation_input_tokens: m.cw + m.cwh,
      cache_creation: { ephemeral_1h_input_tokens: m.cwh, ephemeral_5m_input_tokens: m.cw },
    },
  });
  if (!p.priced) return { usd: null, assumed: false };
  // Fast mode bills at twice the standard rate (Opus 5: $10/$50 against $5/$25).
  return { usd: fast ? p.usd * 2 : p.usd, assumed: p.assumed };
}

const tokensOf = (t) => t.in + t.out + t.cr + t.cw + t.cwh;

function rank(map, limit, label = (n) => n) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, n]) => ({ name: label(name), n }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** claude.ai connectors reach the transcript as a bare UUID; say what it is rather than print it. */
export function mcpLabel(server) {
  return UUID.test(server) ? `claude.ai connector ${server.slice(0, 8)}` : server;
}

const HOUR = 3600000;

/** Start of the local hour for a local day + hour key. */
function hourStart(day, hh) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, Number(hh)).getTime();
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Claude Code's limits as far as its logs can say. The logs carry no plan
 * percentage — only what was spent and when a request was refused, and by which
 * limit. So this reports spend in the last 5 hours and 7 days, and, for every
 * refusal, what had been spent in that window when it came: the ceiling as
 * observed, an estimate with its count, never a stated limit.
 */
function claudeLimits(hourly, { fromMs, now, lastHit }) {
  const nowH = Math.floor(now / HOUR) * HOUR;
  const startH = Math.floor(fromMs / HOUR) * HOUR;
  const at = (t) => hourly.get(t) || { usd: 0, tokens: 0, lim: {} };
  const roll = (t, n) => {
    let usd = 0; let tokens = 0;
    for (let i = 0; i < n; i++) { const x = at(t - i * HOUR); usd += x.usd; tokens += x.tokens; }
    return { usd, tokens };
  };
  const series = [];
  const hits = [];
  const ceilings = { session: [], weekly: [] };
  for (let t = startH; t <= nowH; t += HOUR) {
    series.push(Number(roll(t, 5).usd.toFixed(4)));
    const lim = at(t).lim;
    for (const [kind, n] of Object.entries(lim)) {
      hits.push({ t, kind, n });
      // One reading per refused hour: ten retries against the same wall are one wall.
      if (kind === 'session') ceilings.session.push(roll(t, 5).usd);
      if (kind === 'weekly') ceilings.weekly.push(roll(t, 168).usd);
    }
  }
  const est = (xs) => (xs.length ? { median: median(xs), min: Math.min(...xs), max: Math.max(...xs), n: xs.length } : null);
  return {
    fiveHour: roll(nowH, 5),
    sevenDay: roll(nowH, 168),
    series: { from: startH, stepMs: HOUR, usd5h: series },
    hits,
    ceilings: { session: est(ceilings.session), weekly: est(ceilings.weekly) },
    lastHit: lastHit || null,
  };
}

/** A Codex window by its length — the field that carries it moved from `secondary` to `primary` between plans. */
export function laneName(minutes) {
  if (minutes === 10080) return 'weekly';
  if (minutes === 300) return 'fiveHour';
  return `${minutes}m`;
}

/**
 * Codex's plan windows from its own readings: every window the period touched
 * with its peak and when it filled, the readings to draw, and — for the window
 * still open — where the current pace ends up by the reset.
 *
 * Windows are keyed by their length, not by `primary`/`secondary`: on one plan
 * the 5-hour window was primary and the week secondary, on the next the week was
 * primary. And `resets_at` drifts by seconds between readings of one window, so
 * it is grouped to ten minutes — unrounded, one week read as forty windows.
 */
function codexLimitDetail(points, { fromMs, now }) {
  const samples = [];
  for (const p of points) {
    for (const [iu, im, ir] of [[1, 2, 3], [4, 5, 6]]) {
      if (p[iu] == null || !p[im] || !p[ir]) continue;
      samples.push({ t: p[0], lane: laneName(p[im]), minutes: p[im], used: p[iu], resets: p[ir] });
    }
  }
  return laneDetail(samples, { fromMs, now });
}

/** Window lengths of the plan windows Claude Code reports, by the name it gives them. */
const CLAUDE_WINDOWS = { five_hour: 300 };
export function claudeWindowMinutes(name) {
  return CLAUDE_WINDOWS[name] ?? (/^seven_day/.test(name) ? 10080 : null);
}

/**
 * Claude's plan windows, from the readings the great_cto status line recorded
 * (~/.great_cto/claude-limits.jsonl — Claude Code hands plan use to the status
 * line and to nothing else). Same shape as Codex's.
 */
export function claudePlanDetail(readings, { fromMs, now }) {
  const samples = [];
  for (const r of readings) {
    const t = Date.parse(r?.ts);
    if (!Number.isFinite(t)) continue;
    for (const [name, w] of Object.entries(r.windows || {})) {
      const minutes = claudeWindowMinutes(name);
      if (!minutes || !Number.isFinite(w?.used) || !w?.resets) continue;
      samples.push({ t, lane: name === 'five_hour' ? 'fiveHour' : name === 'seven_day' ? 'weekly' : name, minutes, used: w.used, resets: w.resets });
    }
  }
  return laneDetail(samples, { fromMs, now });
}

/** The readings file, oldest first; [] when the status line was never installed. */
export function readClaudeLimits(file = path.join(home(), '.great_cto', 'claude-limits.jsonl')) {
  const out = [];
  for (const f of [`${file}.1`, file]) {
    let text = '';
    try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch { /* partial line */ }
    }
  }
  return out;
}

/**
 * Is the plan-use recorder on? `great-cto statusline install` points Claude Code's
 * statusLine at ~/.great_cto/statusline.mjs. On with no reading yet is not the
 * same as never installed: only a status line Claude Code DRAWS gets the plan
 * percentage — the terminal `claude` draws one, the desktop app's Code tab does
 * not — so the board must say which of the two the operator is in.
 */
export function claudeRecorder(homeDir = home()) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(homeDir, '.claude', 'settings.json'), 'utf8'));
    const cmd = s && s.statusLine && s.statusLine.command;
    return typeof cmd === 'string' && /\.great_cto[\\/]statusline\.mjs/.test(cmd) ? 'on' : 'off';
  } catch { return 'off'; }
}

/**
 * Plan windows from readings [{t, lane, minutes, used, resets}]: every window the
 * period touched with its peak and when it filled, the readings to draw, and —
 * for the window still open — where the current pace ends up by the reset.
 *
 * `resets` drifts by seconds between readings of one window, so it is grouped to
 * ten minutes — unrounded, one week read as forty windows.
 */
function laneDetail(samples, { fromMs, now }) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  const lanes = {};
  for (const s of sorted) {
    const { t, minutes, used, resets } = s;
    const resetMs = resets * 1000;
    if (resetMs < fromMs) continue;
    const lane = lanes[s.lane] || (lanes[s.lane] = { minutes, windows: new Map(), series: [] });
    if (t >= fromMs) {
      const prev = lane.series[lane.series.length - 1];
      if (!prev || prev[1] !== used) lane.series.push([t, used]);
    }
    const key = Math.round(resets / 600);
    const w = lane.windows.get(key) || { start: resetMs - minutes * 60000, resets: resetMs, peak: 0, fullAt: null, last: null };
    w.resets = Math.max(w.resets, resetMs);
    w.peak = Math.max(w.peak, used);
    if (used >= 100 && !w.fullAt) w.fullAt = t;
    if (!w.last || t >= w.last[0]) w.last = [t, used];
    lane.windows.set(key, w);
  }
  const out = {};
  for (const [name, lane] of Object.entries(lanes)) {
    const list = [...lane.windows.values()].sort((a, b) => a.start - b.start);
    // The open window is the one the LATEST reading belongs to. Codex has reset a
    // week early more than once, so an older window can still look "open" on paper.
    const latest = list.reduce((a, w) => (!a || (w.last && w.last[0] > a.last[0]) ? w : a), null);
    const cur = latest && latest.resets > now ? latest : null;
    let projection = null;
    if (cur && cur.last) {
      const [t, used] = cur.last;
      if (used >= 100) projection = { state: 'full', resets: cur.resets, readAt: t };
      else if (used > 0 && t > cur.start) {
        const fullBy = cur.start + ((t - cur.start) * 100) / used;
        projection = fullBy < cur.resets
          ? { state: 'will-fill', fullBy, resets: cur.resets, readAt: t, used }
          : { state: 'fits', atReset: (used * (cur.resets - cur.start)) / (t - cur.start), resets: cur.resets, readAt: t, used };
      }
    }
    out[name] = {
      minutes: lane.minutes,
      windows: list.map((w) => ({ start: w.start, resets: w.resets, peak: w.peak, fullAt: w.fullAt })),
      filled: list.filter((w) => w.fullAt).length,
      series: lane.series,
      projection,
      current: latest ? { used: latest.last[1], readAt: latest.last[0], resets: latest.resets, open: latest.resets > now } : null,
    };
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The window the board shows.
 * @param {object} index  from scanUsage
 * @param {{days?:number, now?:number, codexTitles?:Record<string,string>, prices?:object, top?:number}} opts
 */
export function summarizeUsage(index, { days = 30, now = Date.now(), codexTitles = {}, prices = effectivePrices(), top = 10, claudeReadings = [], claudeRecorderState = 'off' } = {}) {
  const span = Math.max(1, Math.min(365, Math.floor(days) || 30));
  const dates = [];
  for (let i = span - 1; i >= 0; i--) dates.push(dayOf(now - i * 86400000));
  const inWindow = new Set(dates);
  const from = dates[0];

  const blank = () => ({ in: 0, out: 0, cr: 0, cw: 0, cwh: 0, rs: 0, msgs: 0, usd: 0, unpricedMsgs: 0, sessions: 0, byFn: {}, lim: {} });
  const hosts = { claude: blank(), codex: blank() };
  const daily = Object.fromEntries(dates.map((d) => [d, { claude: { tokens: 0, usd: 0, byFn: {} }, codex: { tokens: 0, usd: 0, byFn: {} } }]));
  const models = {};
  const lists = { claude: { tools: {}, skills: {}, agents: {}, mcp: {} }, codex: { tools: {}, skills: {}, agents: {}, mcp: {} } };
  const hooks = { blocks: {}, stopBlocks: {}, errors: {}, timeouts: {} };
  const hookDaily = Object.fromEntries(dates.map((d) => [d, { blocks: 0, stopBlocks: 0 }]));
  const sessions = {};
  const unpriced = new Set();
  let codexLimits = null;
  let codexPlan = null;
  const fromMs = hourStart(from, '00');
  // Hours from a week before the period: a 7-day window ending on its first day needs them.
  const hourlyFrom = dayOf(fromMs - 7 * 86400000);
  const hourly = { claude: new Map(), codex: new Map() };
  const codexPoints = [];
  let lastHit = null;

  for (const e of Object.values(index.files || {})) {
    const host = e.host;
    if (!hosts[host]) continue;
    const lim = host === 'codex' ? e.meta?.limits : null;
    if (lim && (!codexLimits || lim.at > codexLimits.at)) codexLimits = lim;
    if (lim?.plan && (!codexPlan || lim.at > codexPlan.at)) codexPlan = { at: lim.at, plan: lim.plan };
    if (host === 'codex' && Array.isArray(e.meta?.series)) for (const p of e.meta.series) codexPoints.push(p);
    if (host === 'claude' && e.meta?.lastHit && (!lastHit || e.meta.lastHit.at > lastHit.at)) lastHit = e.meta.lastHit;
    for (const [day, b] of Object.entries(e.days || {})) {
      if (day < hourlyFrom || !b.h) continue;
      for (const [hh, hb] of Object.entries(b.h)) {
        const t = hourStart(day, hh);
        const slot = hourly[host].get(t) || { usd: 0, tokens: 0, lim: {} };
        for (const [model, v] of Object.entries(hb.m || {})) {
          const { usd } = priceBucket(model, { in: v[0], out: v[1], cr: v[2], cw: v[3], cwh: v[4] }, prices);
          if (usd != null) slot.usd += usd;
          slot.tokens += v[0] + v[1] + v[2] + v[3] + v[4];
        }
        for (const [k, n] of Object.entries(hb.lim || {})) bump(slot.lim, k, n);
        hourly[host].set(t, slot);
      }
    }
    const fn = e.meta?.fn || 'chat';
    let touched = false;
    for (const [day, b] of Object.entries(e.days || {})) {
      if (!inWindow.has(day)) continue;
      touched = true;
      const h = hosts[host];
      for (const [k, n] of Object.entries(b.lim || {})) bump(h.lim, k, n);
      for (const kind of ['tools', 'skills', 'agents', 'mcp']) for (const [k, n] of Object.entries(b[kind] || {})) bump(lists[host][kind], k, n);
      for (const [field, key] of [['g', 'blocks'], ['sb', 'stopBlocks'], ['he', 'errors'], ['ht', 'timeouts']]) {
        for (const [k, n] of Object.entries(b[field] || {})) {
          bump(hooks[key], k, n);
          if (key === 'blocks' || key === 'stopBlocks') hookDaily[day][key] += n;
        }
      }
      let dayUsd = 0;
      let dayUnpriced = false;
      for (const [model, m] of Object.entries(b.models || {})) {
        const { usd } = priceBucket(model, m, prices);
        if (usd == null) dayUnpriced = true;
        const mk = `${host}|${model}`;
        const row = models[mk] || (models[mk] = { host, model, in: 0, out: 0, cr: 0, cw: 0, cwh: 0, msgs: 0, usd: 0, priced: usd != null });
        row.in += m.in; row.out += m.out; row.cr += m.cr; row.cw += m.cw; row.cwh += m.cwh; row.msgs += m.msgs;
        if (usd != null) { row.usd += usd; dayUsd += usd; } else { row.priced = false; h.unpricedMsgs += m.msgs; unpriced.add(model); }
      }
      const tk = tokensOf(b);
      const side = Math.min(b.side || 0, tk);
      h.in += b.in; h.out += b.out; h.cr += b.cr; h.cw += b.cw; h.cwh += b.cwh; h.rs += b.rs; h.msgs += b.msgs; h.usd += dayUsd;
      const dd = daily[day][host];
      dd.tokens += tk; dd.usd += dayUsd;
      for (const [f, n] of [[fn, tk - side], ['subagent', side]]) {
        if (!n) continue;
        h.byFn[f] = (h.byFn[f] || 0) + n;
        dd.byFn[f] = (dd.byFn[f] || 0) + n;
      }
      // A subagent's spend belongs to the conversation that dispatched it.
      const sid = `${host}|${e.meta?.parent || e.meta?.session || 'unknown'}`;
      const s = sessions[sid] || (sessions[sid] = { host, id: e.meta?.parent || e.meta?.session || null, tokens: 0, usd: 0, priced: true, msgs: 0, subagentTokens: 0, last: null, title: null, project: null, fn: null });
      s.tokens += tk; s.usd += dayUsd; s.msgs += b.msgs;
      s.subagentTokens += fn === 'subagent' ? tk : side;
      if (dayUnpriced) s.priced = false;
    }
    if (!touched) continue;
    const sid = `${host}|${e.meta?.parent || e.meta?.session || 'unknown'}`;
    const s = sessions[sid];
    if (e.meta?.last && (!s.last || e.meta.last > s.last)) s.last = e.meta.last;
    // The conversation's own file names it; a subagent's file only fills a gap.
    const own = !e.meta?.parent;
    if (own || !s.title) s.title = (host === 'codex' ? codexTitles[e.meta?.session] : null) || e.meta?.title || e.meta?.prompt || s.title;
    if (own || !s.project) s.project = projectName(e.meta?.cwd) || s.project;
    if (own || !s.fn) s.fn = fn;
  }

  const sess = Object.values(sessions);
  for (const host of ['claude', 'codex']) hosts[host].sessions = sess.filter((s) => s.host === host).length;
  const topFor = (host) => {
    const all = sess.filter((s) => s.host === host);
    const total = all.reduce((a, s) => a + s.tokens, 0) || 1;
    return all.sort((a, b) => b.tokens - a.tokens).slice(0, top).map((s) => ({
      title: s.title || '(untitled)', project: s.project, fn: s.fn, tokens: s.tokens,
      usd: s.priced ? s.usd : null, share: s.tokens / total, subagentTokens: s.subagentTokens, last: s.last,
    }));
  };

  const cache = (h) => {
    const read = h.cr; const all = h.in + h.cr + h.cw + h.cwh;
    return { hitRate: all ? read / all : null };
  };

  return {
    state: 'counted',
    window: { from, to: dates[dates.length - 1], days: span },
    hosts: Object.fromEntries(Object.entries(hosts).map(([k, h]) => [k, {
      tokens: tokensOf(h), input: h.in, output: h.out, cacheRead: h.cr, cacheWrite: h.cw + h.cwh, reasoning: h.rs,
      responses: h.msgs, sessions: h.sessions, usd: h.unpricedMsgs === h.msgs && h.msgs > 0 ? null : h.usd,
      unpricedResponses: h.unpricedMsgs, byFn: h.byFn, ...cache(h),
      // `plan` is every refusal by a limit of the account; `server` is the API's own throttle.
      limitHits: { ...h.lim, plan: Object.entries(h.lim).filter(([k]) => k !== 'server').reduce((a, [, n]) => a + n, 0), server: h.lim.server || 0 },
    }])),
    daily: dates.map((d) => ({ date: d, ...daily[d] })),
    models: Object.values(models).sort((a, b) => tokensOf(b) - tokensOf(a)).map((m) => ({
      host: m.host, model: m.model, responses: m.msgs, tokens: tokensOf(m), output: m.out, usd: m.priced ? m.usd : null,
    })),
    top: { claude: topFor('claude'), codex: topFor('codex') },
    lists: Object.fromEntries(Object.entries(lists).map(([host, l]) => [host, {
      tools: rank(l.tools, 15), skills: rank(l.skills, 15), agents: rank(l.agents, 15), mcp: rank(l.mcp, 15, mcpLabel),
    }])),
    limits: {
      codex: codexLimits ? { ...codexLimits, plan: codexLimits.plan || codexPlan?.plan || null, detail: codexLimitDetail(codexPoints, { fromMs, now }) } : null,
      claude: { ...claudeLimits(hourly.claude, { fromMs, now, lastHit }), plan: claudePlanDetail(claudeReadings, { fromMs, now }), recorder: claudeRecorderState },
    },
    unpricedModels: [...unpriced].sort(),
    // Claude Code only: Codex does not write hook outcomes to its session logs.
    hooks: {
      blocks: rank(hooks.blocks, 20), stopBlocks: rank(hooks.stopBlocks, 15),
      errors: rank(hooks.errors, 15), timeouts: rank(hooks.timeouts, 15),
      daily: dates.map((d) => ({ date: d, ...hookDaily[d] })),
    },
  };
}

/**
 * A request-safe view: `get()` answers at once and refreshes in the background.
 * The first pass over a real history reads gigabytes; a board request cannot
 * wait for it, and a second request must not start a second pass.
 */
export function usageIndexSnapshot({ scan = () => scanUsage(), ttlMs = 60 * 1000, now = () => Date.now() } = {}) {
  let last = null;
  let at = 0;
  let running = null;
  const start = () => {
    if (running) return;
    let pass;
    try { pass = Promise.resolve(scan()); } catch (e) { pass = Promise.reject(e); }
    running = pass
      .then((r) => { last = { state: 'ready', ...r }; }, (e) => { last = last?.state === 'ready' ? last : { state: 'unavailable', why: `session logs could not be read: ${e?.message || e}` }; })
      .finally(() => { at = now(); running = null; });
  };
  return {
    get() {
      if (!last) { start(); return { state: 'computing', why: 'reading the Claude Code and Codex session logs — the first pass over a large history takes a minute or two' }; }
      if (now() - at > ttlMs) start();
      return last;
    },
    /** For tests and the CLI: wait for the pass in flight. */
    async settle() { start(); while (running) await running; return last; },
  };
}

// CLI: node scripts/lib/session-usage.mjs [--days N] [--json]
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const i = process.argv.indexOf('--days');
  const days = i > -1 ? Number(process.argv[i + 1]) : 30;
  const t0 = Date.now();
  const r = await scanUsage();
  const s = summarizeUsage(r.index, { days, codexTitles: readCodexTitles() });
  if (process.argv.includes('--json')) { console.log(JSON.stringify(s, null, 2)); process.exit(0); }
  const fmt = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
  console.log(`session-usage: ${r.files} log files, ${r.read} read in ${((Date.now() - t0) / 1000).toFixed(1)}s · window ${s.window.from} → ${s.window.to}`);
  for (const [h, v] of Object.entries(s.hosts)) {
    console.log(`  ${h.padEnd(7)} ${fmt(v.tokens).padStart(8)} tokens · ${v.responses} responses · ${v.sessions} sessions · cache ${v.hitRate == null ? '—' : `${Math.round(v.hitRate * 100)}%`} · ${v.usd == null ? 'unpriced' : `$${v.usd.toFixed(2)} at list price`}`);
  }
  if (s.limits.codex?.primary) console.log(`  codex limit: ${s.limits.codex.primary.used}% of ${s.limits.codex.primary.minutes} min window (plan ${s.limits.codex.plan})`);
}
