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
  fs.writeFileSync(shareStatePath(cwd), JSON.stringify(state, null, 2));
}

async function publishReport(html) {
  // POST to Cloudflare Worker
  const { default: https } = await import('https');
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ html, ttl: 2592000 }); // 30 days
    const url = new URL(SHARE_ENDPOINT);
    const req = https.request({
      hostname: url.hostname, path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid response: ' + data)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function toggleShare(enable, cwd = process.cwd(), force = false) {
  const state = getShareState(cwd);
  // (enable && !state.enabled) → first publish
  // (enable && state.enabled && force) → re-publish with fresh data (new URL)
  if (enable && (!state.enabled || force)) {
    // Generate and publish
    // Share report is a marketing artifact — show LIFETIME numbers, not a
    // rolling window. 365 days × 100 = effectively-lifetime cap for any project.
    try {
      const tasks = await getTasksAsync(cwd);
      if (getReadDegradation(cwd)) return { error: 'Task snapshot is unavailable; report not published' };
      const html = generateShareHTML(tasks, getMetrics(cwd, 36500, { tasks }), cwd);
      const result = await publishReport(html);
      const newState = { enabled: true, url: result.url, hash: result.hash, published_at: new Date().toISOString() };
      saveShareState(newState, cwd);
      return newState;
    } catch (e) {
      return { error: e.message };
    }
  } else if (!enable && state.enabled) {
    const newState = { ...state, enabled: false };
    saveShareState(newState, cwd);
    // Tell Cloudflare worker to mark this hash as paused
    if (state.hash) {
      try {
        const { default: https } = await import('https');
        await new Promise((resolve) => {
          const body = JSON.stringify({ enabled: false });
          const req = https.request({
            hostname: 'greatcto.systems', path: `/r/${state.hash}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          }, res => { res.on('data', () => {}); res.on('end', resolve); });
          req.on('error', resolve);
          req.write(body); req.end();
        });
      } catch {}
    }
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
    .replaceAll('{{METRICS_JSON}}', () => scriptJson(metrics))
    .replaceAll('{{TASKS_JSON}}', () => scriptJson(done.slice(-20).map(shareTask)))
    .replaceAll('{{PAUSED}}', () => 'false');
}

export { getResume, shareStatePath, getShareState, saveShareState, publishReport, toggleShare, generateShareHTML, shareTask, SHARE_TASK_FIELDS };
