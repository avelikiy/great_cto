import fs from 'fs';
import path from 'path';
import { GREAT_CTO_DIR, PUBLIC, SHARE_ENDPOINT } from './config.mjs';
import { readProjectMd } from './projects.mjs';
import { getMetrics } from './metrics.mjs';
import { getTasks, getTasksAsync, getReadDegradation } from './beads.mjs';
import { readVerdicts } from './verdicts.mjs';
import { readDecisionsLog } from './fleet.mjs';

// ── Resume — what happened recently for this project ─────────────────────
// Returns a compact bundle for the "Resume" inbox card:
//   - last 3 verdicts (APPROVED / DONE / etc.)
//   - open gates (already in inbox, but cheap to include for one-shot fetch)
//   - 3 most-recent WIP tasks (in_progress, sorted by updated_at desc)
//   - last 5 decisions from the global log filtered to this project
function getResume(cwd = process.cwd()) {
  const tasks = getTasks(cwd);
  const verdicts = readVerdicts(cwd)
    .filter(v => ['APPROVED','DONE','PASS','BLOCKED','FAIL','REJECTED'].includes((v.verdict || '').toUpperCase()))
    .slice(-3)
    .reverse();
  const openGates = tasks
    .filter(t => t.is_gate && t.raw_status !== 'closed' && t.raw_status !== 'blocked')
    .slice(0, 5);
  const wip = tasks
    .filter(t => t.raw_status === 'in_progress' || t.status === 'in_progress')
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    .slice(0, 3);
  const slug = path.basename(cwd);
  const projectDecisions = readDecisionsLog(50)
    .filter(d => d.project === slug || d.project === path.basename(cwd))
    .slice(0, 5);
  return {
    recent_verdicts: verdicts,
    open_gates: openGates,
    wip_tasks: wip,
    decisions: projectDecisions,
  };
}

function shareStatePath(cwd = process.cwd()) {
  // Use slug from PROJECT.md if available, else basename of cwd
  const meta = readProjectMd(cwd);
  const slug = meta?.slug || path.basename(cwd);
  return path.join(GREAT_CTO_DIR, `share-${slug}.json`);
}
function getShareState(cwd = process.cwd()) {
  const file = shareStatePath(cwd);
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch {}
  return { enabled: false, url: null, hash: null, published_at: null };
}
function saveShareState(state, cwd = process.cwd()) {
  fs.mkdirSync(GREAT_CTO_DIR, { recursive: true });
  // 0600: the file holds the report's manage key. chmod too, because `mode` only
  // applies when the file is created.
  const file = shareStatePath(cwd);
  fs.writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* not ours to chmod */ }
}
/** The share state as the page may see it: everything but the manage key. */
function shareStateForPage(state) {
  if (!state || typeof state !== 'object') return state;
  const { manage_key, ...rest } = state;
  return rest;
}

// One request to the share relay. `key` is the report's manage key, returned when
// it was published; the relay needs it to pause, resume or replace a report.
// Rejects when the relay cannot be reached or answers with something that is not
// JSON; resolves { status, body } otherwise, so the caller decides what a 401 means.
async function shareRelay(pathname, payload, key) {
  const { default: https } = await import('https');
  const { default: http } = await import('http');
  const url = new URL(pathname, process.env.GREATCTO_SHARE_URL || SHARE_ENDPOINT);
  const body = JSON.stringify(payload);
  const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
  if (typeof key === 'string' && key) headers.Authorization = `Bearer ${key}`;
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'http:' ? http : https).request({
      hostname: url.hostname, port: url.port || undefined, path: url.pathname, method: 'POST', headers,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { reject(new Error('Invalid response: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function publishReport(html) {
  const r = await shareRelay('/r/', { html, ttl: 2592000, manage: true }); // 30 days; ask for a manage key
  if (r.status !== 200 || !r.body?.hash) throw new Error(`share relay refused the report (${r.status}): ${r.body?.error || 'no id returned'}`);
  return r.body;
}

async function toggleShare(enable, cwd = process.cwd(), force = false) {
  const state = getShareState(cwd);
  // (enable && !state.enabled) → first publish
  // (enable && state.enabled && force) → re-publish with fresh data
  if (enable && (!state.enabled || force)) {
    // Share report is a marketing artifact — show LIFETIME numbers, not a
    // rolling window. 365 days × 100 = effectively-lifetime cap for any project.
    try {
      const tasks = await getTasksAsync(cwd);
      if (getReadDegradation(cwd)) return { error: 'Task snapshot is unavailable; report not published' };
      const html = generateShareHTML(tasks, getMetrics(cwd, 36500, { tasks }), cwd);
      // A report this board holds the key for is replaced in place: the link stays
      // the same and no older copy is left public. Without a key (published before
      // keys existed, or the relay refused) a new report is published.
      if (state.hash && state.manage_key) {
        const r = await shareRelay(`/r/${state.hash}`, { html, enabled: true, ttl: 2592000 }, state.manage_key);
        if (r.status === 200) {
          const kept = { ...state, enabled: true, published_at: new Date().toISOString() };
          saveShareState(kept, cwd);
          return kept;
        }
      }
      const result = await publishReport(html);
      const newState = { enabled: true, url: result.url, hash: result.hash, published_at: new Date().toISOString() };
      if (typeof result.manage_key === 'string' && result.manage_key) newState.manage_key = result.manage_key;
      saveShareState(newState, cwd);
      return newState;
    } catch (e) {
      return { error: e.message };
    }
  } else if (!enable && state.enabled) {
    // Pause at the relay FIRST, and say so when it did not happen: the report is
    // public, and "off" on this machine while the link still works is the worse lie.
    if (state.hash) {
      let r;
      try { r = await shareRelay(`/r/${state.hash}`, { enabled: false }, state.manage_key); }
      catch (e) { return { ...state, error: `The report is still public: the share relay could not be reached (${e.message})` }; }
      if (r.status !== 200 && r.status !== 404) {
        return { ...state, error: `The report is still public: the share relay refused to pause it (${r.status} ${r.body?.error || ''})`.trim() };
      }
    }
    const newState = { ...state, enabled: false };
    saveShareState(newState, cwd);
    return newState;
  }
  return state;
}

// What a published report carries about a task: the fields share.html reads, and
// nothing else. The report is public to anyone with the link; it used to embed the
// whole record — description, notes, design, assignee — of every listed task.
const SHARE_TASK_FIELDS = Object.freeze(['title', 'status', 'priority', 'labels', 'created_at', 'updated_at', 'closed_at', 'close_reason']);
const CLOSE_REASON_MAX = 71; // the page prints 70 characters and an ellipsis when there are more
function shareTask(t) {
  const str = (v) => (typeof v === 'string' ? v : '');
  return {
    title: str(t?.title),
    status: str(t?.status),
    priority: Number.isFinite(t?.priority) ? t.priority : null,
    labels: Array.isArray(t?.labels) ? t.labels.filter((l) => typeof l === 'string') : [],
    created_at: str(t?.created_at),
    updated_at: str(t?.updated_at),
    closed_at: str(t?.closed_at),
    close_reason: str(t?.close_reason).slice(0, CLOSE_REASON_MAX),
  };
}
// What a published report carries about the metrics: the numbers share.html draws.
// getMetrics also returns recent_done (full records of the last ten completed tasks),
// the last twenty agent verdicts and server counters; none of that is shown, and all
// of it used to be published.
const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
function pickNumbers(o, keys) {
  const out = {};
  for (const k of keys) { const v = finite(o?.[k]); if (v !== null) out[k] = v; }
  return out;
}
function shareMetrics(m) {
  const cost = pickNumbers(m?.cost, ['llm_usd', 'human_usd', 'savings_x', 'real_llm_usd', 'count']);
  if (typeof m?.cost?.source === 'string') cost.source = m.cost.source.slice(0, 32);
  const agents = {};
  for (const [name, n] of Object.entries(m?.agents && typeof m.agents === 'object' ? m.agents : {})) {
    if (finite(n) !== null) agents[String(name).slice(0, 64)] = n;
  }
  const agentsCost = (Array.isArray(m?.agents_cost) ? m.agents_cost : []).map((a) => ({
    agent: typeof a?.agent === 'string' ? a.agent.slice(0, 64) : '',
    tasks_total: finite(a?.tasks_total) ?? 0,
    tasks_done: finite(a?.tasks_done) ?? 0,
    time_min: finite(a?.time_min) ?? 0,
    llm_usd: finite(a?.llm_usd) ?? 0,
    human_usd: finite(a?.human_usd) ?? 0,
  }));
  return {
    tasks: pickNumbers(m?.tasks, ['total', 'done', 'in_progress', 'backlog']),
    velocity: pickNumbers(m?.velocity, ['this_week']),
    cost,
    qa: pickNumbers(m?.qa, ['pass_rate', 'passed', 'failed']),
    security: pickNumbers(m?.security, ['approved', 'blocked']),
    agents,
    agents_cost: agentsCost,
  };
}
// JSON that is safe inside a <script> block: `<` is escaped, so no value can close
// the tag, and U+2028/2029 cannot end a line in older parsers.
const scriptJson = (v) => JSON.stringify(v ?? null)
  .replace(/</g, '\\u003c')
  .replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);

function generateShareHTML(tasks, metrics, cwd = process.cwd()) {
  const meta = readProjectMd(cwd);
  // The name lands in <title>, an attribute and a JS string literal: letters, digits,
  // space, dot, dash and underscore only.
  const projectName = String(meta?.slug || path.basename(cwd)).replace(/[^\p{L}\p{N} ._-]/gu, '');
  const date = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const done = tasks.filter(t => t.status === 'done' || t.status === 'closed');
  const shareTemplate = fs.readFileSync(path.join(PUBLIC, 'share.html'), 'utf8');
  // Use replaceAll: placeholders appear multiple times (title + script var)
  // BH-22: substitute {{PAUSED}} before publish. The worker can still flip
  // the stored pause flag independently via POST /r/<hash> {enabled:false}
  // from toggleShare, but the published HTML must be valid on its own —
  // shipping `const paused = {{PAUSED}};` literal triggers a SyntaxError
  // and blanks the entire report if the worker forgets to post-process.
  // Function replacers: a string replacement would expand `$&`, `$1` and `$'` found
  // in the data.
  return shareTemplate
    .replaceAll('{{PROJECT}}', () => projectName)
    .replaceAll('{{DATE}}', () => date)
    .replaceAll('{{METRICS_JSON}}', () => scriptJson(shareMetrics(metrics)))
    .replaceAll('{{TASKS_JSON}}', () => scriptJson(done.slice(-20).map(shareTask)))
    .replaceAll('{{PAUSED}}', () => 'false');
}

export { getResume, shareStatePath, getShareState, saveShareState, publishReport, toggleShare, generateShareHTML, shareTask, SHARE_TASK_FIELDS, shareMetrics, shareStateForPage, shareRelay };
