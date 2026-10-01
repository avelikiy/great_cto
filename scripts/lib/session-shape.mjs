#!/usr/bin/env node
/**
 * session-shape — how the operator's OWN sessions spend, not only the agents.
 *
 * usage-from-transcript / subagent-cost / agent-speed measure one agent run at a
 * time. What they cannot see is the shape of the conversation that dispatched
 * them: a main thread kept open for nine hours re-reads its whole context on
 * every turn, a pause longer than the cache lifetime rebuilds it at 1.25× the
 * input price, and a main thread on the dearest model that only hands work to
 * subagents pays top rate for routing. Those are habits, and they are priced here.
 *
 * Per session (main transcript <p>/<s>.jsonl plus <p>/<s>/subagents/**.jsonl):
 *   turns        assistant MESSAGES, deduplicated by message.id — the transcript
 *                writes one line per content block and repeats `usage` on each,
 *                so counting lines inflates turns and cost 2–3×
 *   duration     wall (first→last timestamp) and active (sum of gaps < 30 min)
 *   tokens/cost  input, output, cache read, cache write; priced by cost-meter
 *   rebuilds     main-thread turns after the 5th writing ≥ 20k cache tokens
 *   read:create  cache read ÷ cache write on the main thread
 *   models       the main thread's model vs the models its subagents ran on
 *   subagents    count of subagent transcripts and their share of the cost
 *   peak context the largest input+cache context one main turn carried
 *
 * Positions ("after turn 300", "after 4 h active") count from the session's
 * start; sums count only turns inside the window.
 *
 * Privacy: local and read-only. Message text is never read into the report —
 * only ids, timestamps, models and usage. Projects print as p1, p2… (stable
 * within one run, ordered by spend) unless --show-projects is given. Nothing is
 * sent anywhere; this is not telemetry.
 *
 * Ideas (session = main + fan-out, message.id dedup, the late-cache-write rule,
 * marathon/zombie bands) adapted from TechWolf's token-doctor skill, MIT License,
 * Copyright (c) 2026 TechWolf. This is an independent Node implementation.
 *
 * Usage:
 *   node scripts/lib/session-shape.mjs [--since 2026-09-01] [--until 2026-09-27]
 *        [--top 10] [--json] [--show-projects] [--root <projects dir>]
 */
import { createReadStream, readdirSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { priceUsage, resolvePrice, effectivePrices, cacheWriteUsd } from './cost-meter.mjs';
// Sessions started in a temp directory are scripted (benchmarks, eval sandboxes,
// `claude -p` probes) — the same exclusion request-quality applies.
import { SCRIPTED } from './request-quality.mjs';

export const DEFAULT_ROOT = join(homedir(), '.claude', 'projects');

export const THRESHOLDS = Object.freeze({
  marathonTurns: 300,        // main-thread turns
  longActiveMin: 240,        // active minutes
  idleGapMin: 30,            // a gap this long is a break, not work
  rebuildAfterTurn: 5,       // turns 1–5 write the cache by design
  rebuildTokens: 20_000,     // a cache write this large after that is a rebuild
  shareAmber: 0.2, shareRed: 0.5,           // share of spend (marathon, long-active)
  rebuildsAmber: 2, rebuildsRed: 5,         // rebuilds per session
  readCreateAmber: 20, readCreateRed: 10,   // cache read ÷ write (lower is worse)
  dispatcherAmber: 0.1, dispatcherRed: 0.3, // share of spend
  topShareAmber: 0.5, topShareRed: 0.75,    // share of spend in the top 10% sessions
});

/** The model a main thread that only dispatches is priced against. */
export const DISPATCH_MODEL = 'claude-sonnet-5';

const MTOK = 1_000_000;
const TS_RE = /"uuid":"[^"]*","timestamp":"([^"]+)"/;
const ASSISTANT = '"type":"assistant"';

const inputPrice = (model) => resolvePrice(model).price?.input || 0;

function pickUsage(u) {
  const x = u || {};
  return {
    input_tokens: x.input_tokens || 0, output_tokens: x.output_tokens || 0,
    cache_read_input_tokens: x.cache_read_input_tokens || 0,
    cache_creation_input_tokens: x.cache_creation_input_tokens || 0,
    // The TTL split: a 1-hour write bills 2×, a 5-minute one 1.25× (cost-meter.cacheWriteUsd).
    ...(x.cache_creation ? { cache_creation: {
      ephemeral_1h_input_tokens: x.cache_creation.ephemeral_1h_input_tokens || 0,
      ephemeral_5m_input_tokens: x.cache_creation.ephemeral_5m_input_tokens || 0,
    } } : {}),
  };
}

/** Top-level usage, or the sum of `iterations` when the top level is all zero. */
function effectiveUsage(u) {
  const top = pickUsage(u);
  const sum = top.input_tokens + top.output_tokens + top.cache_read_input_tokens + top.cache_creation_input_tokens;
  if (sum === 0 && Array.isArray(u?.iterations) && u.iterations.length) {
    return u.iterations.reduce((a, it) => {
      const p = pickUsage(it);
      for (const k of Object.keys(a)) a[k] += p[k];
      return a;
    }, pickUsage(null));
  }
  return top;
}

/**
 * Stream one transcript. Only assistant lines are parsed in full; other lines
 * give up a timestamp. Returns turns deduplicated by message.id, in order.
 */
async function readTranscript(path) {
  const turns = new Map(); const stamps = []; let anon = 0;
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line || line[0] !== '{') continue;
    if (!line.includes(ASSISTANT)) {
      const m = TS_RE.exec(line);
      let t = m ? Date.parse(m[1]) : NaN;
      if (!m && line.length < 1_000_000) { try { t = Date.parse(JSON.parse(line).timestamp); } catch { /* not JSON */ } }
      if (Number.isFinite(t)) stamps.push(t);
      continue;
    }
    let d; try { d = JSON.parse(line); } catch { continue; }
    const t = Date.parse(d.timestamp);
    if (Number.isFinite(t)) stamps.push(t);
    const msg = d.message;
    if (d.type !== 'assistant' || !msg?.usage) continue;
    const model = msg.model || 'unknown';
    if (model === '<synthetic>') continue;
    const id = msg.id || `anon-${anon++}`;
    const usage = effectiveUsage(msg.usage);
    const prev = turns.get(id);
    if (prev) { if (usage.output_tokens >= prev.u.output_tokens) prev.u = usage; continue; }
    turns.set(id, { id, t: Number.isFinite(t) ? t : null, model, u: usage, side: d.isSidechain === true });
  }
  return { turns: [...turns.values()], stamps };
}

/** Sum of gaps shorter than the idle threshold, over sorted stamps. */
function activeMs(sorted) {
  let ms = 0;
  for (let i = 1; i < sorted.length; i++) {
    const g = sorted[i] - sorted[i - 1];
    if (g > 0 && g < THRESHOLDS.idleGapMin * 60_000) ms += g;
  }
  return ms;
}

function walkJsonl(dir, out) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkJsonl(p, out);
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

const mtime = (p) => { try { return statSync(p).mtimeMs; } catch { return 0; } };

/** Main sessions (with their subagent files) under a projects root. */
export function listSessions(root = DEFAULT_ROOT, { lo = null } = {}) {
  const out = []; let orphanSubagentFiles = 0;
  let projects = [];
  try { projects = readdirSync(root); } catch { return { sessions: out, orphanSubagentFiles }; }
  for (const project of projects) {
    if (SCRIPTED.test(project)) continue;
    let names = [];
    try { names = readdirSync(join(root, project)); } catch { continue; }
    const mains = new Set(names.filter((n) => n.endsWith('.jsonl')).map((n) => n.slice(0, -6)));
    for (const n of names) {
      const sid = n.endsWith('.jsonl') ? n.slice(0, -6) : n;
      if (!n.endsWith('.jsonl')) {
        if (!mains.has(n)) {
          const orphans = walkJsonl(join(root, project, n, 'subagents'), []);
          orphanSubagentFiles += orphans.filter((f) => !lo || mtime(f) >= lo).length;
        }
        continue;
      }
      const mainPath = join(root, project, n);
      const subPaths = walkJsonl(join(root, project, sid, 'subagents'), []);
      if (lo && mtime(mainPath) < lo && subPaths.every((f) => mtime(f) < lo)) continue;
      out.push({ id: sid, project, mainPath, subPaths });
    }
  }
  return { sessions: out, orphanSubagentFiles };
}

/** One session → its shape, or null when nothing of it falls in the window. */
export async function scanSession({ id, project, mainPath, subPaths = [] }, { lo = null, hi = null } = {}) {
  const inWin = (t) => t != null && (lo == null || t >= lo) && (hi == null || t < hi);
  const main = await readTranscript(mainPath);

  // Session-wide active clock, to place each turn ("after 4 h active").
  const all = [...main.stamps].sort((a, b) => a - b);
  const cum = new Array(all.length).fill(0);
  for (let i = 1; i < all.length; i++) {
    const g = all[i] - all[i - 1];
    cum[i] = cum[i - 1] + (g > 0 && g < THRESHOLDS.idleGapMin * 60_000 ? g : 0);
  }
  const activeAt = (t) => {
    let lo2 = 0; let hi2 = all.length - 1; let k = -1;
    while (lo2 <= hi2) { const m = (lo2 + hi2) >> 1; if (all[m] <= t) { k = m; lo2 = m + 1; } else hi2 = m - 1; }
    return k < 0 ? 0 : cum[k];
  };

  const s = {
    id, project, usd: 0, unpricedTurns: 0, unpricedModels: [],
    main: { turns: 0, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, usd: 0, cacheCreateUsd: 0, byModel: {} },
    sub: { files: 0, turns: 0, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, usd: 0, byModel: {} },
    mainModel: null, rebuilds: { count: 0, tokens: 0, usd: 0, avoidableUsd: 0 }, peakContext: 0,
    carried: { afterTurnsUsd: 0, afterActiveUsd: 0 },
    start: null, end: null, wallMin: 0, activeMin: 0,
  };
  const price = (model, u) => {
    const p = priceUsage({ model, usage: u });
    if (!p.priced) { s.unpricedTurns++; if (!s.unpricedModels.includes(model)) s.unpricedModels.push(model); }
    return p.usd;
  };
  const add = (bucket, x, usd) => {
    bucket.turns++; bucket.usd += usd;
    bucket.input += x.u.input_tokens; bucket.output += x.u.output_tokens;
    bucket.cacheRead += x.u.cache_read_input_tokens; bucket.cacheCreate += x.u.cache_creation_input_tokens;
    const bm = bucket.byModel[x.model] || (bucket.byModel[x.model] = { turns: 0, usd: 0 });
    bm.turns++; bm.usd += usd;
  };

  // Main thread.
  const mainTurns = main.turns.filter((x) => !x.side);
  const ctxOf = (x) => x.u.input_tokens + x.u.cache_read_input_tokens + x.u.cache_creation_input_tokens;
  const base = ctxOf(mainTurns.find((x) => ctxOf(x) > 0) || { u: pickUsage(null) });
  let ctxAtTurns = null; let ctxAtActive = null;
  mainTurns.forEach((x, i) => {
    const ctx = ctxOf(x);
    if (i === THRESHOLDS.marathonTurns) ctxAtTurns = ctx;
    const late = x.t != null && activeAt(x.t) >= THRESHOLDS.longActiveMin * 60_000;
    if (late && ctxAtActive === null) ctxAtActive = ctx;
    if (!inWin(x.t)) return;
    const usd = price(x.model, x.u);
    add(s.main, x, usd);
    const pin = inputPrice(x.model) / MTOK;
    const cc = x.u.cache_creation_input_tokens; const cr = x.u.cache_read_input_tokens;
    const ccUsd = cacheWriteUsd(x.u, pin);
    s.main.cacheCreateUsd += ccUsd;
    s.peakContext = Math.max(s.peakContext, ctx);
    if (i >= THRESHOLDS.rebuildAfterTurn && cc >= THRESHOLDS.rebuildTokens) {
      s.rebuilds.count++; s.rebuilds.tokens += cc;
      s.rebuilds.usd += ccUsd;
      s.rebuilds.avoidableUsd += ccUsd - cc * pin * 0.1; // the same tokens read from a warm cache
    }
    // Context carried over the line, re-read on every later turn. A fresh session
    // with a brief would not carry it; its own new growth is not counted.
    if (ctxAtTurns !== null) s.carried.afterTurnsUsd += Math.max(0, Math.min(cr, ctxAtTurns) - base) * pin * 0.1;
    if (late) s.carried.afterActiveUsd += Math.max(0, Math.min(cr, ctxAtActive) - base) * pin * 0.1;
  });

  // Subagents: their own transcripts, plus sidechain lines an older transcript kept
  // in the main file — the same message id is counted once.
  const seen = new Set();
  for (const f of subPaths) {
    let r; try { r = await readTranscript(f); } catch { continue; }
    let counted = 0;
    for (const x of r.turns) {
      if (seen.has(x.id) || !inWin(x.t)) continue;
      seen.add(x.id); counted++;
      add(s.sub, x, price(x.model, x.u));
    }
    if (counted) s.sub.files++;
  }
  for (const x of main.turns) {
    if (!x.side || seen.has(x.id) || !inWin(x.t)) continue;
    seen.add(x.id);
    add(s.sub, x, price(x.model, x.u));
  }

  if (!s.main.turns && !s.sub.turns) return null;
  s.usd = s.main.usd + s.sub.usd;
  const top = Object.entries(s.main.byModel).sort((a, b) => b[1].usd - a[1].usd || b[1].turns - a[1].turns)[0];
  s.mainModel = top ? top[0] : null;
  const win = all.filter(inWin);
  if (win.length) {
    s.start = new Date(win[0]).toISOString(); s.end = new Date(win[win.length - 1]).toISOString();
    s.wallMin = (win[win.length - 1] - win[0]) / 60_000;
    s.activeMin = activeMs(win) / 60_000;
  }
  s.readCreate = s.main.cacheCreate ? s.main.cacheRead / s.main.cacheCreate : null;
  return s;
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/** Every session in the window. `since`/`until` are anything Date.parse reads. */
export async function sessionShape({ root = DEFAULT_ROOT, since = null, until = null } = {}) {
  const lo = since ? Date.parse(since) : null;
  const hi = until ? Date.parse(until) : null;
  const { sessions: list, orphanSubagentFiles } = listSessions(root, { lo });
  const scanned = await pool(list, 4, (x) => scanSession(x, { lo, hi }).catch(() => null));
  return { since, until, root, sessions: scanned.filter(Boolean), orphanSubagentFiles };
}

// ── Analysis ───────────────────────────────────────────────────────────────

const worseAbove = (v, amber, red) => (v >= red ? 'red' : v >= amber ? 'amber' : 'green');
const worseBelow = (v, amber, red) => (v == null ? 'green' : v < red ? 'red' : v < amber ? 'amber' : 'green');
const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
const pctTxt = (x) => `${Math.round(x * 100)}%`;
const T = THRESHOLDS;

export const HABITS = Object.freeze({
  marathon: 'Start a new session when a task is finished instead of continuing the same one: carry a short brief (/save, then /resume) rather than the whole history, and hand long read-heavy analysis to a subagent so its context ends with it.',
  longActive: 'Close the session at the end of a work block. A session kept open across breaks re-reads, and after an idle gap rebuilds, its whole context when you come back.',
  rebuilds: 'Do not return to a large context after a pause longer than the cache lifetime: /compact before stepping away, or start fresh with a brief. Do not switch model or MCP servers mid-session; that changes the cached prefix.',
  readCreate: 'Keep the cached prefix stable and use it: batch related asks into one session rather than many short ones over the same large prefix, and do not edit CLAUDE.md or toggle tools mid-session.',
  dispatcher: `Run the main thread on a cheaper model (/model sonnet, priced here as ${DISPATCH_MODEL}) when it only dispatches; keep the expensive model for the subagents doing the reasoning.`,
});

/** Sessions → totals, traffic-light signals, change-first list, top sessions. */
export function analyse(sessions, { top = 10 } = {}) {
  const total = sum(sessions, (s) => s.usd);
  const share = (x) => (total ? x / total : 0);

  // Projects → p1, p2… by spend, stable within this run.
  const byProject = new Map();
  for (const s of sessions) byProject.set(s.project, (byProject.get(s.project) || 0) + s.usd);
  const projectLabels = Object.fromEntries([...byProject.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([p], i) => [p, `p${i + 1}`]));

  const mainCr = sum(sessions, (s) => s.main.cacheRead);
  const mainCc = sum(sessions, (s) => s.main.cacheCreate);
  const unpricedModels = [...new Set(sessions.flatMap((s) => s.unpricedModels))];
  const totals = {
    sessions: sessions.length, projects: byProject.size, usd: total,
    mainUsd: sum(sessions, (s) => s.main.usd), subUsd: sum(sessions, (s) => s.sub.usd),
    subFiles: sum(sessions, (s) => s.sub.files), mainTurns: sum(sessions, (s) => s.main.turns),
    subTurns: sum(sessions, (s) => s.sub.turns),
    input: sum(sessions, (s) => s.main.input + s.sub.input), output: sum(sessions, (s) => s.main.output + s.sub.output),
    cacheRead: sum(sessions, (s) => s.main.cacheRead + s.sub.cacheRead),
    cacheCreate: sum(sessions, (s) => s.main.cacheCreate + s.sub.cacheCreate),
    mainReadCreate: mainCc ? mainCr / mainCc : null,
    activeHours: sum(sessions, (s) => s.activeMin) / 60, wallHours: sum(sessions, (s) => s.wallMin) / 60,
    peakContext: Math.max(0, ...sessions.map((s) => s.peakContext)),
    unpricedTurns: sum(sessions, (s) => s.unpricedTurns), unpricedModels,
  };
  totals.subShare = share(totals.subUsd);

  const signals = [];
  {
    const hit = sessions.filter((s) => s.main.turns > T.marathonTurns);
    const sh = share(sum(hit, (s) => s.usd));
    signals.push({ key: 'marathon', name: `marathon sessions (>${T.marathonTurns} turns)`, sessions: hit.length,
      value: `${hit.length} sess · ${pctTxt(sh)} of spend`, light: worseAbove(sh, T.shareAmber, T.shareRed),
      threshold: `green <${pctTxt(T.shareAmber)} of spend · red ≥${pctTxt(T.shareRed)}`,
      estUsd: sum(sessions, (s) => s.carried.afterTurnsUsd),
      estBasis: `context carried past turn ${T.marathonTurns}, re-read on every later turn`, habit: HABITS.marathon });
  }
  {
    const hit = sessions.filter((s) => s.activeMin > T.longActiveMin);
    const sh = share(sum(hit, (s) => s.usd));
    signals.push({ key: 'longActive', name: `long sessions (>${T.longActiveMin / 60} h active)`, sessions: hit.length,
      value: `${hit.length} sess · ${pctTxt(sh)} of spend`, light: worseAbove(sh, T.shareAmber, T.shareRed),
      threshold: `green <${pctTxt(T.shareAmber)} of spend · red ≥${pctTxt(T.shareRed)}`,
      estUsd: sum(sessions, (s) => s.carried.afterActiveUsd),
      estBasis: `context carried past ${T.longActiveMin / 60} h active, re-read on every later turn`, habit: HABITS.longActive });
  }
  {
    const eligible = sessions.filter((s) => s.main.turns > T.rebuildAfterTurn);
    const count = sum(sessions, (s) => s.rebuilds.count);
    const per = eligible.length ? count / eligible.length : 0;
    signals.push({ key: 'rebuilds', name: `cache rebuilds (≥${T.rebuildTokens / 1000}k write after turn ${T.rebuildAfterTurn})`,
      sessions: sessions.filter((s) => s.rebuilds.count).length,
      value: `${per.toFixed(1)}/sess · ${count} events · $${fmtUsd(sum(sessions, (s) => s.rebuilds.usd))}`,
      light: worseAbove(per, T.rebuildsAmber, T.rebuildsRed),
      threshold: `green <${T.rebuildsAmber}/session · red ≥${T.rebuildsRed}`,
      estUsd: sum(sessions, (s) => s.rebuilds.avoidableUsd),
      estBasis: 'rebuild writes priced as warm-cache reads instead', habit: HABITS.rebuilds });
  }
  {
    const r = totals.mainReadCreate;
    const ccUsd = sum(sessions, (s) => s.main.cacheCreateUsd);
    const est = r != null && r < T.readCreateRed ? ccUsd * (1 - r / T.readCreateRed) * (1.15 / 1.25) : 0;
    signals.push({ key: 'readCreate', name: 'cache read:create (main thread)', sessions: null,
      value: r == null ? 'no cache use' : `${r.toFixed(1)}×`, light: worseBelow(r, T.readCreateAmber, T.readCreateRed),
      threshold: `green ≥${T.readCreateAmber} · red <${T.readCreateRed}`, estUsd: est,
      estBasis: `cache writes beyond 1 per ${T.readCreateRed} reads, priced as reads`, habit: HABITS.readCreate });
  }
  {
    const cheap = inputPrice(DISPATCH_MODEL) || (effectivePrices()[DISPATCH_MODEL]?.input ?? 0);
    const hit = sessions.filter((s) => {
      if (!s.sub.turns || !s.mainModel || s.sub.output < s.main.output) return false;
      const pMain = inputPrice(s.mainModel);
      const pSubMax = Math.max(0, ...Object.keys(s.sub.byModel).map(inputPrice));
      return cheap > 0 && pMain > cheap && pMain >= pSubMax;
    });
    const sh = share(sum(hit, (s) => s.main.usd));
    signals.push({ key: 'dispatcher', name: 'main thread on the top model while subagents work', sessions: hit.length,
      value: `${hit.length} sess · main thread ${pctTxt(sh)} of spend`, light: worseAbove(sh, T.dispatcherAmber, T.dispatcherRed),
      threshold: `green <${pctTxt(T.dispatcherAmber)} of spend · red ≥${pctTxt(T.dispatcherRed)}`,
      estUsd: sum(hit, (s) => s.main.usd * (1 - cheap / inputPrice(s.mainModel))),
      estBasis: `those main threads priced at ${DISPATCH_MODEL}`, habit: HABITS.dispatcher });
  }
  {
    const sorted = [...sessions].sort((a, b) => b.usd - a.usd);
    const k = Math.ceil(sorted.length * 0.1);
    const sh = share(sum(sorted.slice(0, k), (s) => s.usd));
    signals.push({ key: 'concentration', name: 'spend in the top 10% of sessions', sessions: k,
      value: `${k} sess · ${pctTxt(sh)} of spend`, light: worseAbove(sh, T.topShareAmber, T.topShareRed),
      threshold: `green <${pctTxt(T.topShareAmber)} · red ≥${pctTxt(T.topShareRed)}`, estUsd: 0,
      estBasis: 'informational: where to look, not a saving', habit: null });
  }

  const changeFirst = signals.filter((x) => x.habit && x.estUsd >= 0.01)
    .sort((a, b) => b.estUsd - a.estUsd).slice(0, 3)
    .map(({ key, name, light, estUsd, estBasis, habit }) => ({ key, name, light, estUsd, estBasis, habit }));

  const topSessions = [...sessions].sort((a, b) => b.usd - a.usd).slice(0, top);
  return { totals, signals, changeFirst, topSessions, projectLabels, thresholds: T };
}

// ── Output ─────────────────────────────────────────────────────────────────

export function fmtUsd(x) {
  return x >= 100 ? Math.round(x).toLocaleString('en-US') : x.toFixed(2);
}
const fmtTok = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
const shortModel = (m) => String(m || '—').replace(/^claude-/, '');

/** A project's directory name without the home prefix — only with --show-projects. */
const projectName = (raw) => String(raw).replace(/^-(Users|home)-[^-]+-/, '~-');

function labeller(report, showProjects) {
  return (raw) => (showProjects ? projectName(raw) : report.projectLabels[raw] || '?');
}

/** The JSON form: same content as the text, projects anonymised unless asked. */
export function toJson(report, { since = null, until = null, showProjects = false, orphanSubagentFiles = 0 } = {}) {
  const label = labeller(report, showProjects);
  return {
    window: { since, until }, thresholds: report.thresholds, totals: report.totals,
    signals: report.signals, changeFirst: report.changeFirst, orphanSubagentFiles,
    topSessions: report.topSessions.map((s) => ({
      session: s.id, project: label(s.project), usd: s.usd, mainUsd: s.main.usd, subUsd: s.sub.usd,
      subagents: s.sub.files, turns: s.main.turns, subTurns: s.sub.turns,
      activeMin: s.activeMin, wallMin: s.wallMin, rebuilds: s.rebuilds.count, readCreate: s.readCreate,
      peakContext: s.peakContext, mainModel: s.mainModel, subModels: Object.keys(s.sub.byModel),
    })),
  };
}

export function formatReport(report, { since = null, until = null, showProjects = false, orphanSubagentFiles = 0 } = {}) {
  const t = report.totals; const label = labeller(report, showProjects);
  const L = [];
  L.push(`session-shape · ${since || 'all'} → ${until || 'now'} · ${t.sessions} sessions in ${t.projects} projects (scripted temp-dir projects excluded)`);
  L.push(`Spend   $${fmtUsd(t.usd)} · main threads $${fmtUsd(t.mainUsd)} · subagents $${fmtUsd(t.subUsd)} (${pctTxt(t.subShare)}) across ${t.subFiles} subagent runs`);
  L.push(`Turns   ${t.mainTurns} main + ${t.subTurns} subagent (deduplicated by message.id) · active ${t.activeHours.toFixed(1)} h · wall ${t.wallHours.toFixed(1)} h`);
  L.push(`Tokens  in ${fmtTok(t.input)} · out ${fmtTok(t.output)} · cache read ${fmtTok(t.cacheRead)} · cache write ${fmtTok(t.cacheCreate)} · peak context ${fmtTok(t.peakContext)}`);
  if (t.unpricedTurns) L.push(`        ${t.unpricedTurns} turns NOT priced (${t.unpricedModels.join(', ')}); the total excludes them.`);
  if (orphanSubagentFiles) L.push(`        ${orphanSubagentFiles} subagent transcripts have no main session on disk; not counted.`);
  L.push('');
  L.push('Signals (threshold stated per row; signals overlap, so do not add the estimates)');
  const rows = report.signals.map((s) => [s.light, s.name, s.value, s.threshold, s.estUsd ? `~$${fmtUsd(s.estUsd)}` : '—']);
  const head = ['light', 'signal', 'value', 'threshold', 'est. avoidable'];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r) => r.map((c, i) => (i === r.length - 1 ? c.padStart(w[i]) : c.padEnd(w[i]))).join('  ');
  L.push(line(head));
  for (const r of rows) L.push(line(r));
  L.push('');
  L.push('Change first');
  if (!report.changeFirst.length) L.push('  Nothing with a measurable saving in this window.');
  report.changeFirst.forEach((c, i) => {
    L.push(`  ${i + 1}. ${c.name}: ~$${fmtUsd(c.estUsd)} (${c.estBasis})`);
    L.push(`     ${c.habit}`);
  });
  if (report.topSessions.length) {
    L.push('');
    L.push(`Top ${report.topSessions.length} sessions by cost`);
    const th = ['session', 'project', 'cost', 'sub%', 'subs', 'turns', 'active', 'rebuilds', 'r:c', 'peak ctx', 'main → subagent models'];
    const tr = report.topSessions.map((s) => [
      s.id.slice(0, 8), label(s.project), `$${fmtUsd(s.usd)}`, s.usd ? pctTxt(s.sub.usd / s.usd) : '—', String(s.sub.files),
      String(s.main.turns), `${(s.activeMin / 60).toFixed(1)}h`, String(s.rebuilds.count),
      s.readCreate == null ? '—' : s.readCreate.toFixed(0), fmtTok(s.peakContext),
      `${shortModel(s.mainModel)} → ${Object.keys(s.sub.byModel).map(shortModel).join(',') || '—'}`,
    ]);
    const tw = th.map((h, i) => Math.max(h.length, ...tr.map((r) => r[i].length)));
    L.push(th.map((c, i) => c.padEnd(tw[i])).join('  '));
    for (const r of tr) L.push(r.map((c, i) => c.padEnd(tw[i])).join('  ').trimEnd());
  }
  L.push('');
  L.push('Estimates are list-price, from local transcripts; message text is never read into this report.');
  return L.join('\n');
}

// ── CLI ────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const a = process.argv.slice(2);
  const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  if (a.includes('--help') || a.includes('-h')) {
    process.stdout.write('usage: session-shape.mjs [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--top N] [--json] [--show-projects] [--root DIR]\n');
    process.exit(0);
  }
  const since = opt('--since') || new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const until = opt('--until');
  const top = Math.max(0, parseInt(opt('--top') || '10', 10) || 0);
  const showProjects = a.includes('--show-projects');
  const root = opt('--root') || DEFAULT_ROOT;
  const shape = await sessionShape({ root, since, until });
  const report = analyse(shape.sessions, { top });
  const ctx = { since, until, showProjects, orphanSubagentFiles: shape.orphanSubagentFiles };
  if (a.includes('--json')) process.stdout.write(`${JSON.stringify(toJson(report, ctx), null, 2)}\n`);
  else process.stdout.write(`${shape.sessions.length ? formatReport(report, ctx) : 'session-shape: no Claude Code sessions in this window'}\n`);
}
