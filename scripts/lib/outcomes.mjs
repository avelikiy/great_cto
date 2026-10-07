/**
 * outcomes — what great_cto's agents concluded and what reviews found, across
 * every project on this machine.
 *
 *   agent outcomes  every verdict line of every registered project (and the
 *                   global layer), classified pass / stopped / failed / skipped
 *   findings        bugs in each project's Beads, by priority: filed in the
 *                   window, open now, and how long the closed ones took. Every
 *                   reviewer files its P0/P1 findings as Beads bugs, so this is
 *                   where they land — the review files were written once on this
 *                   machine; the bugs were filed a hundred times.
 *
 * Rules:
 *  - A verdict nobody can classify is `unknown`, not a pass. A project whose
 *    Beads cannot be read is listed as unread, not as a project with no bugs.
 *  - The same line can sit in a project log and in the global layer; it is
 *    counted once.
 *  - Titles and descriptions of bugs never leave this module — counts only.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { parseVerdictLine } from './verdict-record.mjs';
import { dayOf } from './session-usage.mjs';

const DAY = 86400000;

/** pass · stopped · failed · skipped · unknown — what a verdict means for the pipeline. */
export function outcomeOf(verdict) {
  const v = String(verdict || '').toUpperCase();
  if (['APPROVED', 'PASS', 'DONE', 'TASK_DONE'].includes(v)) return 'pass';
  if (['BLOCKED', 'REWORK', 'ESCALATED', 'REJECTED', 'CHANGES_REQUESTED'].includes(v)) return 'stopped';
  if (v === 'FAIL') return 'failed';
  if (v === 'SKIPPED') return 'skipped';
  return 'unknown';
}

/**
 * The agent a verdict belongs to. `great-cto:senior-dev` is senior-dev; a legacy
 * file named `devops-2026-09-15-123328.log` is devops.
 */
export function verdictAgent(raw) {
  return String(raw || '').replace(/^great[-_]cto:/, '').replace(/-\d{4}-\d{2}-\d{2}.*$/, '').trim();
}

/** Project directories from the board registry, plus the global layer's home. */
export function registeredProjects(file = path.join(os.homedir(), '.great_cto', 'projects.json')) {
  try {
    const list = JSON.parse(fs.readFileSync(file, 'utf8')).projects || [];
    return list.map((p) => ({ name: p.name || path.basename(p.path || ''), path: p.path })).filter((p) => p.path && fs.existsSync(p.path));
  } catch { return []; }
}

function verdictFiles(dir) {
  try { return fs.readdirSync(dir).filter((f) => f.endsWith('.log')).map((f) => path.join(dir, f)); } catch { return []; }
}

/**
 * Per-agent outcomes in the window.
 * @param {{projects:{name:string,path:string}[], globalDir?:string, days?:number, now?:number, roster?:string[]}} opts
 */
export function agentOutcomes({ projects, globalDir = path.join(os.homedir(), '.great_cto', 'verdicts'), days = 30, now = Date.now(), roster = [] }) {
  const from = now - days * DAY;
  const known = new Set(roster);
  const seen = new Set();
  const agents = {};
  const other = { runs: 0, names: new Set() };
  let unreadable = 0;
  const sources = [...projects.map((p) => ({ project: p.name, dir: path.join(p.path, '.great_cto', 'verdicts') })), { project: null, dir: globalDir }];
  for (const { project, dir } of sources) {
    for (const file of verdictFiles(dir)) {
      let text;
      try { text = fs.readFileSync(file, 'utf8'); } catch { unreadable++; continue; }
      const fileAgent = verdictAgent(path.basename(file, '.log'));
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        const p = parseVerdictLine(line);
        if (!p.ok) continue;
        const rec = p.rec;
        const t = Date.parse(rec.ts);
        if (!Number.isFinite(t) || t < from || t > now) continue;
        const key = line.trim();
        if (seen.has(key)) continue;
        seen.add(key);
        const agent = verdictAgent(rec.agent || fileAgent) || fileAgent;
        if (known.size && !known.has(agent)) { other.runs++; other.names.add(agent); continue; }
        const a = agents[agent] || (agents[agent] = blankAgent(agent));
        a.runs++;
        a[outcomeOf(rec.verdict)]++;
        if (rec.meta?.need === 'implementer') a.needImplementer++;
        if (rec.meta?.need === 'decision') a.needDecision++;
        if (!a.last || rec.ts > a.last) a.last = rec.ts;
        const proj = rec.project || project;
        if (proj) a.projects.add(proj);
      }
    }
  }
  // How runs ENDED, from the completion hook's agent-stop events: a run that
  // recorded nothing leaves no verdict line, so only these can count it.
  for (const p of projects) {
    let text = '';
    try { text = fs.readFileSync(path.join(p.path, '.great_cto', 'events.jsonl'), 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      if (!line.includes('"agent-stop"') || !line.includes('no-verdict')) continue;
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      const t = Date.parse(e.ts);
      if (!Number.isFinite(t) || t < from || t > now || !/^no-verdict-/.test(e.outcome || '')) continue;
      const agent = verdictAgent(e.agent);
      if (!agent || (known.size && !known.has(agent))) continue;
      const a = agents[agent] || (agents[agent] = blankAgent(agent));
      const why = e.outcome.slice('no-verdict-'.length);
      a.noVerdict[why] = (a.noVerdict[why] || 0) + 1;
      a.noVerdictTotal++;
      a.projects.add(p.name);
    }
  }
  const rows = Object.values(agents).map((a) => ({
    ...a,
    projects: a.projects.size,
    // Of the runs that reached a conclusion, how many stopped the pipeline.
    stopRate: a.pass + a.stopped + a.failed ? (a.stopped + a.failed) / (a.pass + a.stopped + a.failed) : null,
  })).sort((x, y) => (y.runs + y.noVerdictTotal) - (x.runs + x.noVerdictTotal));
  return { agents: rows, other: { runs: other.runs, names: [...other.names].sort().slice(0, 20) }, unreadable };
}

function blankAgent(agent) {
  return { agent, runs: 0, pass: 0, stopped: 0, failed: 0, skipped: 0, unknown: 0, needImplementer: 0, needDecision: 0, noVerdict: {}, noVerdictTotal: 0, last: null, projects: new Set() };
}

/** Run `bd` in a project; resolves to parsed JSON or a reason it could not. */
function bdJson(cwd, args, { timeoutMs = 20000, bin = 'bd' } = {}) {
  return new Promise((resolve) => {
    execFile(bin, args, { cwd, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, BD_NO_DAEMON: '1' } }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') return resolve({ ok: false, why: 'bd is not installed' });
        if (err.killed) return resolve({ ok: false, why: `bd took longer than ${timeoutMs / 1000}s` });
        // bd prints warnings first (".beads has permissions 0750"); the reason is the error line.
        const lines = String(stderr || '').split('\n').map((x) => x.trim()).filter(Boolean);
        const said = lines.find((x) => /^error/i.test(x)) || lines[lines.length - 1];
        return resolve({ ok: false, why: (said || String(err.message || err).split('\n')[0]).split(os.homedir()).join('~').slice(0, 160) });
      }
      try { return resolve({ ok: true, data: JSON.parse(stdout || '[]') }); } catch { return resolve({ ok: false, why: 'bd did not answer JSON' }); }
    });
  });
}

const PRIOS = ['P0', 'P1', 'P2', 'P3'];
const prio = (n) => (Number.isInteger(n) && n >= 0 && n <= 3 ? `P${n}` : 'P?');

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Bugs by priority across the projects that keep Beads.
 * @param {{projects:{name:string,path:string}[], days?:number, now?:number, list?:(cwd:string)=>Promise<{ok:boolean,data?:object[],why?:string}>}} opts
 */
export async function bugFindings({ projects, days = 30, now = Date.now(), list = (cwd) => bdJson(cwd, ['list', '--json', '--type', 'bug', '--all']) }) {
  const from = now - days * DAY;
  const blank = () => Object.fromEntries([...PRIOS, 'P?'].map((p) => [p, 0]));
  const filed = blank();
  const openNow = blank();
  const closedIn = blank();
  const toClose = Object.fromEntries([...PRIOS, 'P?'].map((p) => [p, []]));
  const daily = {};
  const perProject = [];
  const unread = [];
  for (const p of projects) {
    if (!fs.existsSync(path.join(p.path, '.beads'))) continue;
    const r = await list(p.path);
    if (!r.ok) { unread.push({ project: p.name, why: r.why }); continue; }
    const row = { project: p.name, filed: blank(), open: blank() };
    for (const b of Array.isArray(r.data) ? r.data : []) {
      const pr = prio(b.priority);
      const created = Date.parse(b.created_at);
      const closed = b.closed_at ? Date.parse(b.closed_at) : NaN;
      if (Number.isFinite(created) && created >= from && created <= now) {
        filed[pr]++; row.filed[pr]++;
        const d = dayOf(created);
        const slot = daily[d] || (daily[d] = blank());
        slot[pr]++;
      }
      if (b.status !== 'closed' && b.status !== 'tombstone') { openNow[pr]++; row.open[pr]++; }
      if (Number.isFinite(closed) && closed >= from && closed <= now) {
        closedIn[pr]++;
        if (Number.isFinite(created) && closed >= created) toClose[pr].push((closed - created) / DAY);
      }
    }
    const any = (o) => Object.values(o).some(Boolean);
    if (any(row.filed) || any(row.open)) perProject.push(row);
  }
  perProject.sort((a, b) => (b.open.P0 - a.open.P0) || (b.open.P1 - a.open.P1) || (sum(b.filed) - sum(a.filed)));
  return {
    filed, openNow, closedIn,
    daysToClose: Object.fromEntries(Object.entries(toClose).map(([k, xs]) => [k, xs.length ? { median: median(xs), n: xs.length } : null])),
    daily,
    projects: perProject,
    unread,
  };
}

const sum = (o) => Object.values(o).reduce((a, n) => a + n, 0);

/** Both, for the board. */
export async function outcomes({ days = 30, now = Date.now(), roster = [], projects = registeredProjects(), globalDir, list } = {}) {
  const findings = await bugFindings({ projects, days, now, list });
  return {
    state: 'counted',
    window: { days, from: dayOf(now - (days - 1) * DAY), to: dayOf(now) },
    projects: projects.length,
    agents: agentOutcomes({ projects, globalDir, days, now, roster }),
    findings,
  };
}
