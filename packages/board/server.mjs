#!/usr/bin/env node
/**
 * great_cto board server
 * Serves Kanban + CTO Dashboard on localhost:3141
 * Data source: bd list --json (Beads), verdicts/*.log, docs/
 *
 * Usage: node server.mjs [--port 3141] [--no-open]
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.BOARD_PORT || '3141', 10);
const PUBLIC = path.join(__dirname, 'public');
const GREAT_CTO_DIR = path.join(os.homedir(), '.great_cto');
const SHARE_STATE_FILE = path.join(GREAT_CTO_DIR, 'board-share.json');
const PROJECTS_FILE = path.join(GREAT_CTO_DIR, 'projects.json');
const SHARE_ENDPOINT = 'https://greatcto.systems/r/';

// ── Project registry ───────────────────────────────────────────────────────────
function readProjectsRegistry() {
  try { if (fs.existsSync(PROJECTS_FILE)) return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')); }
  catch {}
  return { projects: [] };
}
function writeProjectsRegistry(reg) {
  fs.mkdirSync(GREAT_CTO_DIR, { recursive: true });
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(reg, null, 2));
}
function readProjectMd(dir) {
  const p = path.join(dir, '.great_cto', 'PROJECT.md');
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, 'utf8');
  const get = k => (text.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim() || '';
  return {
    slug: get('project') || path.basename(dir),
    archetype: get('archetype') || 'web-service',
    description: get('description') || '',
    path: dir,
    added_at: new Date().toISOString(),
  };
}
function autoRegisterProject(dir) {
  const meta = readProjectMd(dir);
  if (!meta) return null;
  const reg = readProjectsRegistry();
  if (!reg.projects.find(p => p.path === meta.path)) {
    reg.projects.push(meta);
    writeProjectsRegistry(reg);
  }
  return meta;
}

// Discover great_cto projects across common dev folders + Claude Code's known
// project list. Runs at server startup AND every /api/projects request, so any
// project that ran /audit or /start (which writes .great_cto/PROJECT.md) gets
// auto-registered without the user having to do anything.
// Fully async — never blocks the event loop.
async function discoverProjects() {
  const fsAsync = fs.promises;
  const HOME = os.homedir();
  const seen = new Set();
  const found = [];

  async function scanDir(dir, depth) {
    if (depth < 0 || seen.has(dir)) return;
    seen.add(dir);
    try {
      // Check the dir itself first
      try {
        await fsAsync.access(path.join(dir, '.great_cto', 'PROJECT.md'));
        found.push(dir);
        return; // don't descend into a registered project
      } catch {}
      if (depth === 0) return;
      // Scan children (skip dotfiles + heavyweight dirs)
      const entries = await fsAsync.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const name = e.name;
        if (name.startsWith('.') || name === 'node_modules' || name === 'dist' ||
            name === 'build' || name === 'target' || name === 'venv' || name === '__pycache__') continue;
        await scanDir(path.join(dir, name), depth - 1);
      }
    } catch {} // permission denied — skip silently
  }

  // 1) Common dev folders — top-level scan, 1-level deep
  const roots = [
    path.join(HOME, 'work'),
    path.join(HOME, 'dev'),
    path.join(HOME, 'development'),
    path.join(HOME, 'code'),
    path.join(HOME, 'projects'),
    path.join(HOME, 'src'),
    path.join(HOME, 'Documents', 'projects'),
    HOME,
  ];
  for (const root of roots) {
    try { await fsAsync.access(root); await scanDir(root, 1); } catch {}
  }

  // 2) Claude Code's known project list (~/.claude/projects/<encoded-path>/)
  try {
    const ccProj = path.join(HOME, '.claude', 'projects');
    await fsAsync.access(ccProj);
    const entries = await fsAsync.readdir(ccProj);
    for (const dir of entries) {
      // Claude encodes paths as -Users-foo-projects-bar — decode to /Users/foo/projects/bar
      const decoded = '/' + dir.replace(/^-+/, '').replace(/-/g, '/');
      try {
        await fsAsync.access(path.join(decoded, '.great_cto', 'PROJECT.md'));
        found.push(decoded);
      } catch {}
    }
  } catch {}

  // Auto-register everything found
  for (const dir of found) autoRegisterProject(dir);
  return found.length;
}

function listProjects() {
  // Auto-register cwd if it has PROJECT.md (cheap)
  autoRegisterProject(process.cwd());
  const reg = readProjectsRegistry();
  // Filter out projects whose paths no longer exist
  reg.projects = reg.projects.filter(p => fs.existsSync(p.path));
  // Re-read metadata in case archetype/description changed
  return reg.projects.map(p => {
    const fresh = readProjectMd(p.path);
    return fresh ? { ...p, ...fresh } : p;
  });
}
function resolveProjectCwd(slugOrPath) {
  if (!slugOrPath) return process.cwd();
  // If absolute path or starts with ~, use directly
  if (slugOrPath.startsWith('/')) return slugOrPath;
  if (slugOrPath.startsWith('~')) return slugOrPath.replace(/^~/, os.homedir());
  // Else look up in registry by slug
  const reg = readProjectsRegistry();
  const found = reg.projects.find(p => p.slug === slugOrPath);
  return found ? found.path : process.cwd();
}

// ── SSE clients ────────────────────────────────────────────────────────────────
const sseClients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { sseClients.delete(res); }
  }
}

function broadcastTasks(cwd) {
  const msg = `event: tasks\ndata: ${JSON.stringify(getTasks(cwd))}\n\n`;
  for (const res of sseClients) {
    if (res._gctoCwd === cwd) {
      try { res.write(msg); } catch { sseClients.delete(res); }
    }
  }
}

// ── Memory: 4-layer file contents ─────────────────────────────────────────────
function readFileSafe(p) {
  try { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; } catch { return null; }
}
function getMemory(cwd = process.cwd()) {
  const layers = [
    { id: 'project',  layer: 'L1', name: 'PROJECT.md',  desc: 'Archetype, size, compliance, owners',          path: path.join(cwd, '.great_cto', 'PROJECT.md') },
    { id: 'codebase', layer: 'L2', name: 'CODEBASE.md', desc: 'God nodes, entry points, public API, routes',  path: path.join(cwd, '.great_cto', 'CODEBASE.md') },
    { id: 'brain',    layer: 'L3', name: 'brain.md',    desc: 'Patterns in use, what failed, team patterns',  path: path.join(cwd, '.great_cto', 'brain.md') },
    { id: 'lessons',  layer: 'L3', name: 'lessons.md',  desc: 'Per-project lessons',                          path: path.join(cwd, '.great_cto', 'lessons.md') },
    { id: 'handoff',  layer: 'L3', name: 'HANDOFF.md',  desc: 'Auto-written on context compaction',           path: path.join(cwd, '.great_cto', 'HANDOFF.md') },
  ];
  const result = layers.map(l => ({
    ...l,
    content: readFileSafe(l.path),
    exists: fs.existsSync(l.path),
    size: fs.existsSync(l.path) ? fs.statSync(l.path).size : 0,
  }));

  // Cross-project global patterns (~/.great_cto/global-patterns/)
  const gpDir = path.join(GREAT_CTO_DIR, 'global-patterns');
  let patterns = [];
  if (fs.existsSync(gpDir)) {
    patterns = fs.readdirSync(gpDir)
      .filter(f => f.startsWith('GP-') && f.endsWith('.md'))
      .map(f => {
        const fp = path.join(gpDir, f);
        const content = readFileSafe(fp) || '';
        const titleMatch = content.match(/^#\s+(.+)$/m);
        return {
          id: f.replace(/\.md$/, ''),
          name: f,
          title: titleMatch ? titleMatch[1] : f,
          path: fp,
          size: fs.statSync(fp).size,
        };
      });
  }
  return { layers: result, patterns, cwd };
}

// ── Pipeline state ────────────────────────────────────────────────────────────
function getPipeline(cwd = process.cwd()) {
  const stages = ['architect', 'senior-dev', 'reviewers', 'qa-engineer', 'security-officer', 'devops', 'l3-support'];
  const verdicts = readVerdicts();
  const now = Date.now();
  const ACTIVE_WINDOW = 30 * 60 * 1000;  // 30 min

  // Map agents → most recent verdict
  const lastByAgent = {};
  for (const v of verdicts) {
    const a = (v.agent || '').toLowerCase();
    if (!lastByAgent[a] || lastByAgent[a].ts < v.ts) lastByAgent[a] = v;
  }

  // Tasks in_progress give us "active" agents
  const tasks = getTasks(cwd);
  const activeAgents = new Set(
    tasks.filter(t => t.status === 'in_progress').map(t => (t.agent || '').toLowerCase()).filter(Boolean)
  );

  return stages.map(stage => {
    // agent log file naming convention: shortened agent name
    const aliases = {
      'architect': ['architect'],
      'senior-dev': ['senior-dev', 'senior_dev', 'backend', 'frontend'],
      'reviewers': ['reviewer', 'review', 'code-reviewer'],
      'qa-engineer': ['qa-engineer', 'qa'],
      'security-officer': ['security-officer', 'security'],
      'devops': ['devops', 'ops'],
      'l3-support': ['l3-support', 'l3', 'support'],
    };
    const cands = aliases[stage] || [stage];
    let last = null;
    for (const c of cands) {
      if (lastByAgent[c] && (!last || last.ts < lastByAgent[c].ts)) last = lastByAgent[c];
    }
    const isActive = cands.some(c => activeAgents.has(c));
    const ageMs = last ? (now - new Date(last.ts).getTime()) : null;
    const recent = ageMs != null && ageMs < ACTIVE_WINDOW;
    let status = 'idle';
    if (isActive || (recent && (last?.verdict || '').toUpperCase() === 'DONE' === false && recent)) status = 'active';
    if (last && (last.verdict || '').toUpperCase().match(/BLOCKED|FAIL/)) status = 'failed';
    if (last && !isActive && (last.verdict || '').toUpperCase().match(/APPROVED|DONE|PASS/)) status = 'done';
    return {
      stage,
      status,
      verdict: last?.verdict || null,
      last_message: last ? (last.raw || '').slice(last.ts.length + 1).split(' ').slice(1).join(' ').slice(0, 80) : null,
      ts: last?.ts || null,
      age_min: ageMs != null ? Math.round(ageMs / 60000) : null,
    };
  });
}

// ── Cost history (daily LLM burn) ────────────────────────────────────────────
function getCostHistory(cwd = process.cwd(), days = 30) {
  // Build a map<dateISO, { llm, human, plans, verdictCost }>
  const buckets = new Map();
  const now = Date.now();
  for (let i = 0; i < days; i++) {
    const d = new Date(now - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, llm: 0, human: 0, plans: 0, runs: 0 });
  }

  // Plans: file mtime as date
  const plansDir = path.join(cwd, 'docs/plans');
  if (fs.existsSync(plansDir)) {
    for (const f of fs.readdirSync(plansDir).filter(x => x.endsWith('.md'))) {
      const fp = path.join(plansDir, f);
      const stat = fs.statSync(fp);
      const dayKey = stat.mtime.toISOString().slice(0, 10);
      if (!buckets.has(dayKey)) continue;
      const content = fs.readFileSync(fp, 'utf8');
      const llmMatch = content.match(/LLM.*?(\d+\.?\d*)\s*[-–]\s*\$?(\d+\.?\d*)/i);
      const humanMatch = content.match(/Human.*?\$(\d[\d,]+)/i);
      const b = buckets.get(dayKey);
      if (llmMatch) b.llm += parseFloat(llmMatch[2]);
      if (humanMatch) b.human += parseFloat(humanMatch[1].replace(/,/g, ''));
      b.plans++;
    }
  }

  // Verdicts: cost=$X tag (from ~/.great_cto/verdicts/)
  const verdicts = readVerdicts();
  for (const v of verdicts) {
    if (v.cost_usd == null) continue;
    const dayKey = (v.ts || '').slice(0, 10);
    if (!buckets.has(dayKey)) continue;
    const b = buckets.get(dayKey);
    b.llm += v.cost_usd;
    b.runs++;
  }

  const series = Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
  const totalLlm = series.reduce((a, b) => a + b.llm, 0);
  const totalHuman = series.reduce((a, b) => a + b.human, 0);
  const totalPlans = series.reduce((a, b) => a + b.plans, 0);
  // Read budget from PROJECT.md (monthly-budget: $X)
  const projMd = readFileSafe(path.join(cwd, '.great_cto', 'PROJECT.md')) || '';
  const budgetMatch = projMd.match(/monthly[-_]budget:\s*\$?(\d[\d,]+)/i);
  const budget = budgetMatch ? parseFloat(budgetMatch[1].replace(/,/g, '')) : null;
  // Burn projection: assume same daily rate, project to 30-day month
  const dayRate = totalLlm / Math.max(1, days);
  const projectedMonthly = Math.round(dayRate * 30 * 100) / 100;
  return {
    days,
    series,
    total_llm: Math.round(totalLlm * 100) / 100,
    total_human: Math.round(totalHuman),
    total_plans: totalPlans,
    daily_avg: Math.round(dayRate * 100) / 100,
    projected_monthly: projectedMonthly,
    monthly_budget: budget,
    over_budget: budget != null && projectedMonthly > budget,
    savings_x: totalLlm > 0 ? Math.round(totalHuman / totalLlm) : 0,
  };
}

// ── Inbox: what needs the user's decision right now ──────────────────────────
function getInbox(cwd = process.cwd()) {
  const tasks = getTasks(cwd);
  const pendingGates = tasks.filter(t => t.is_gate && t.status !== 'done' && t.status !== 'closed');
  const blocked = tasks.filter(t => t.status === 'blocked');
  const p0 = tasks.filter(t => t.priority === 0 && t.status !== 'done' && t.status !== 'closed');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const stale = inProgress.filter(t => {
    if (!t.updated_at) return false;
    const ageH = (Date.now() - new Date(t.updated_at).getTime()) / 3600_000;
    return ageH > 48;
  });
  const sec = readSecStats(cwd);
  return {
    pending_gates: pendingGates.slice(0, 20),
    blocked: blocked.slice(0, 10),
    p0_open: p0.slice(0, 10),
    stale_in_progress: stale.slice(0, 10),
    security: { blocked: sec.blocked, approved: sec.approved },
    summary: {
      gates: pendingGates.length,
      blocked: blocked.length,
      p0: p0.length,
      stale: stale.length,
    },
  };
}

// ── Beads data ─────────────────────────────────────────────────────────────────
function bdList(cwd = process.cwd()) {
  try {
    const result = spawnSync('bd', ['list', '--json', '--all', '--include-gates'], {
      encoding: 'utf8', timeout: 8000, cwd
    });
    if (result.status !== 0) return [];
    return JSON.parse(result.stdout || '[]');
  } catch { return []; }
}

function getTasks(cwd = process.cwd()) {
  const all = bdList(cwd);
  return all.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description || '',
    notes: t.notes || '',
    design: t.design || '',
    acceptance: t.acceptance || '',
    status: mapStatus(t.status, t.labels),
    raw_status: t.status,                     // bd-native status (open/in_progress/closed/blocked)
    priority: t.priority,
    labels: t.labels || [],
    owner: t.owner || '',
    created_at: t.created_at,
    updated_at: t.updated_at,
    closed_at: t.closed_at || null,
    close_reason: t.close_reason || '',
    comment_count: t.comment_count || 0,
    is_gate: (t.labels || []).includes('gate'),
    agent: detectAgent(t),
  }));
}

function mapStatus(status, labels = []) {
  if ((labels || []).includes('gate')) return 'gate';
  switch (status) {
    case 'open': return 'backlog';
    case 'in_progress': return 'in_progress';
    case 'closed': return 'done';
    case 'blocked': return 'blocked';
    default: return 'backlog';
  }
}

function detectAgent(task) {
  const title = (task.title || '').toLowerCase();
  if (title.includes('architect') || title.includes('arch')) return 'architect';
  if (title.includes('senior') || title.includes('impl') || title.includes('feat') || title.includes('fix')) return 'senior-dev';
  if (title.includes('qa') || title.includes('test')) return 'qa-engineer';
  if (title.includes('sec') || title.includes('cso')) return 'security-officer';
  if (title.includes('deploy') || title.includes('release')) return 'devops';
  if (title.includes('gate:')) return 'gate';
  return '';
}

// ── Metrics ────────────────────────────────────────────────────────────────────
function getMetrics(cwd = process.cwd()) {
  const tasks = getTasks(cwd);
  const done = tasks.filter(t => t.status === 'done');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const backlog = tasks.filter(t => t.status === 'backlog');

  // Velocity: features closed per week
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const doneThisWeek = done.filter(t => t.closed_at && (now - new Date(t.closed_at).getTime()) < week);
  const doneThisMonth = done.filter(t => t.closed_at && (now - new Date(t.closed_at).getTime()) < 30 * 24 * 60 * 60 * 1000);

  // Avg completion time (ms)
  const completionTimes = done
    .filter(t => t.created_at && t.closed_at)
    .map(t => new Date(t.closed_at).getTime() - new Date(t.created_at).getTime());
  const avgCompletionMs = completionTimes.length
    ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
    : 0;

  // Verdicts (global verdicts log lives in ~/.great_cto/verdicts/)
  const verdicts = readVerdicts();

  // Cost from plans (per-project)
  const costData = readPlanCosts(cwd);

  // QA/Security (per-project)
  const qaStats = readQAStats(cwd);
  const secStats = readSecStats(cwd);

  // Agent utilization from verdicts
  const agentRuns = {};
  for (const v of verdicts) {
    agentRuns[v.agent] = (agentRuns[v.agent] || 0) + 1;
  }

  return {
    tasks: { total: tasks.length, done: done.length, in_progress: inProgress.length, backlog: backlog.length },
    velocity: { this_week: doneThisWeek.length, this_month: doneThisMonth.length },
    avg_completion_min: Math.round(avgCompletionMs / 60000),
    cost: costData,
    qa: qaStats,
    security: secStats,
    agents: agentRuns,
    verdicts: verdicts.slice(-20),
    recent_done: done.slice(-10).reverse(),
  };
}

function readVerdicts() {
  const verdictDir = path.join(GREAT_CTO_DIR, 'verdicts');
  const results = [];
  if (!fs.existsSync(verdictDir)) return results;
  for (const file of fs.readdirSync(verdictDir)) {
    const agent = file.replace('.log', '');
    const lines = fs.readFileSync(path.join(verdictDir, file), 'utf8')
      .split('\n').filter(Boolean);
    for (const line of lines) {
      const parts = line.split(' ');
      const costMatch = line.match(/\bcost=\$?(\d+\.?\d*)\b/i);
      results.push({
        ts: parts[0],
        agent,
        verdict: parts[1] || '',
        cost_usd: costMatch ? parseFloat(costMatch[1]) : null,
        raw: line.replace(/\s*\bcost=\$?\d+\.?\d*\b/i, ''),
      });
    }
  }
  return results.sort((a, b) => a.ts.localeCompare(b.ts));
}

function readPlanCosts(cwd = process.cwd()) {
  const plansDir = path.join(cwd, 'docs/plans');
  let totalLlmMin = 0, totalLlmUsd = 0, totalHumanUsd = 0, count = 0;
  if (!fs.existsSync(plansDir)) return { llm_usd: 0, human_usd: 0, savings_x: 0, count: 0 };
  for (const file of fs.readdirSync(plansDir).filter(f => f.endsWith('.md'))) {
    const content = fs.readFileSync(path.join(plansDir, file), 'utf8');
    // Parse cost lines from PLAN-*.md
    const llmMatch = content.match(/LLM.*?(\d+\.?\d*)\s*[-–]\s*\$?(\d+\.?\d*)/i);
    const humanMatch = content.match(/Human.*?\$(\d[\d,]+)/i);
    if (llmMatch) totalLlmUsd += parseFloat(llmMatch[2]);
    if (humanMatch) totalHumanUsd += parseFloat(humanMatch[1].replace(',', ''));
    count++;
  }
  return {
    llm_usd: Math.round(totalLlmUsd * 100) / 100,
    human_usd: Math.round(totalHumanUsd),
    savings_x: totalLlmUsd > 0 ? Math.round(totalHumanUsd / totalLlmUsd) : 0,
    count,
  };
}

function readQAStats(cwd = process.cwd()) {
  const qaDir = path.join(cwd, 'docs/qa-reports');
  let passed = 0, failed = 0;
  if (!fs.existsSync(qaDir)) return { pass_rate: null, passed: 0, failed: 0 };
  for (const file of fs.readdirSync(qaDir).filter(f => f.endsWith('.md'))) {
    const content = fs.readFileSync(path.join(qaDir, file), 'utf8');
    if (/verdict.*pass/i.test(content)) passed++;
    else if (/verdict.*fail/i.test(content)) failed++;
  }
  const total = passed + failed;
  return { pass_rate: total ? Math.round((passed / total) * 100) : null, passed, failed };
}

function readSecStats(cwd = process.cwd()) {
  const secDir = path.join(cwd, 'docs/security');
  let approved = 0, blocked = 0;
  if (!fs.existsSync(secDir)) return { approved: 0, blocked: 0 };
  for (const file of fs.readdirSync(secDir).filter(f => f.endsWith('.md'))) {
    const content = fs.readFileSync(path.join(secDir, file), 'utf8');
    if (/APPROVED/i.test(content)) approved++;
    if (/BLOCKED/i.test(content)) blocked++;
  }
  return { approved, blocked };
}

// ── Share state (per project) ──────────────────────────────────────────────────
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

async function toggleShare(enable, cwd = process.cwd()) {
  const state = getShareState(cwd);
  if (enable && !state.enabled) {
    // Generate and publish
    const html = generateShareHTML(getTasks(cwd), getMetrics(cwd), cwd);
    try {
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

function generateShareHTML(tasks, metrics, cwd = process.cwd()) {
  const meta = readProjectMd(cwd);
  const projectName = meta?.slug || path.basename(cwd);
  const date = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const done = tasks.filter(t => t.status === 'done' || t.status === 'closed');
  const shareTemplate = fs.readFileSync(path.join(PUBLIC, 'share.html'), 'utf8');
  // Use replaceAll: placeholders appear multiple times (title + script var)
  return shareTemplate
    .replaceAll('{{PROJECT}}', projectName)
    .replaceAll('{{DATE}}', date)
    .replaceAll('{{METRICS_JSON}}', JSON.stringify(metrics))
    .replaceAll('{{TASKS_JSON}}', JSON.stringify(done.slice(-20)));
}

// ── File watcher ───────────────────────────────────────────────────────────────
function watchBeads() {
  // Watch every registered project's interactions.jsonl
  const projects = listProjects();
  const dirs = projects.map(p => p.path);
  if (!dirs.includes(process.cwd())) dirs.push(process.cwd());
  for (const dir of dirs) {
    const interactionsFile = path.join(dir, '.beads', 'interactions.jsonl');
    if (!fs.existsSync(interactionsFile)) continue;
    let lastSize = fs.statSync(interactionsFile).size;
    try {
      fs.watch(interactionsFile, () => {
        try {
          const newSize = fs.statSync(interactionsFile).size;
          if (newSize !== lastSize) {
            lastSize = newSize;
            // Broadcast to clients watching this project
            for (const res of sseClients) {
              if (res._gctoCwd === dir) {
                res.write(`event: tasks\ndata: ${JSON.stringify(getTasks(dir))}\n\n`);
                res.write(`event: pipeline\ndata: ${JSON.stringify(getPipeline(dir))}\n\n`);
                res.write(`event: inbox\ndata: ${JSON.stringify(getInbox(dir))}\n\n`);
              }
            }
          }
        } catch {}
      });
    } catch {}
  }
}

// Watch ~/.great_cto/verdicts/ — push pipeline updates whenever an agent
// emits a verdict (any project gets the broadcast for its own cwd).
function watchVerdicts() {
  const verdictDir = path.join(GREAT_CTO_DIR, 'verdicts');
  if (!fs.existsSync(verdictDir)) {
    try { fs.mkdirSync(verdictDir, { recursive: true }); } catch { return; }
  }
  let pushTimer = null;
  const broadcastPipeline = () => {
    if (pushTimer) clearTimeout(pushTimer);
    // debounce: collapse a burst of writes (multiple agents finishing within ~150ms)
    pushTimer = setTimeout(() => {
      for (const res of sseClients) {
        const dir = res._gctoCwd || process.cwd();
        try {
          res.write(`event: pipeline\ndata: ${JSON.stringify(getPipeline(dir))}\n\n`);
          res.write(`event: inbox\ndata: ${JSON.stringify(getInbox(dir))}\n\n`);
        } catch { sseClients.delete(res); }
      }
    }, 150);
  };
  try {
    fs.watch(verdictDir, () => broadcastPipeline());
    // Also watch each existing log file (some agents append to existing)
    for (const f of fs.readdirSync(verdictDir).filter(x => x.endsWith('.log'))) {
      try { fs.watch(path.join(verdictDir, f), () => broadcastPipeline()); } catch {}
    }
  } catch {}
}

// ── HTTP router ────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const proj = url.searchParams.get('project');
  const cwd = resolveProjectCwd(proj);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  // SSE
  if (pathname === '/api/sse') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res._gctoCwd = cwd;  // remember which project this client wants
    sseClients.add(res);
    res.write(`event: tasks\ndata: ${JSON.stringify(getTasks(cwd))}\n\n`);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // API
  if (pathname === '/api/projects') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(listProjects()));
    return;
  }

  if (pathname === '/api/tasks') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getTasks(cwd)));
    return;
  }

  if (pathname === '/api/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getMetrics(cwd)));
    return;
  }

  if (pathname === '/api/share') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getShareState(cwd)));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        const { enabled } = JSON.parse(body || '{}');
        const state = await toggleShare(enabled, cwd);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(state));
      });
      return;
    }
  }

  // Gate approval / rejection
  if (pathname.startsWith('/api/gates/') && req.method === 'POST') {
    const id = pathname.replace('/api/gates/', '');
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const { action, reason } = JSON.parse(body || '{}');
      if (!['approve', 'reject'].includes(action)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid action' }));
        return;
      }
      try {
        const status = action === 'approve' ? 'closed' : 'blocked';
        const args = ['update', id, '--status', status];
        if (reason) args.push('--notes', `[${action}] ${reason}`);
        const r = spawnSync('bd', args, { cwd, encoding: 'utf8' });
        if (r.status !== 0) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: r.stderr || 'bd update failed' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id, action }));
        // Broadcast updated tasks via SSE
        broadcastTasks(cwd);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e.message || e) }));
      }
    });
    return;
  }

  // Inbox — what needs your attention right now
  if (pathname === '/api/inbox') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getInbox(cwd)));
    return;
  }

  // Memory — 4-layer memory file contents
  if (pathname === '/api/memory') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getMemory(cwd)));
    return;
  }

  // Pipeline — current stage states (idle / active / done / failed)
  if (pathname === '/api/pipeline') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getPipeline(cwd)));
    return;
  }

  // Cost history — daily LLM burn over N days
  if (pathname === '/api/cost') {
    const days = parseInt(url.searchParams.get('days') || '30', 10);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getCostHistory(cwd, days)));
    return;
  }

  // Memory — single global pattern content
  if (pathname === '/api/memory-pattern') {
    const id = url.searchParams.get('id') || '';
    if (!/^GP-[A-Za-z0-9_-]+$/.test(id)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid id' }));
      return;
    }
    const fp = path.join(GREAT_CTO_DIR, 'global-patterns', id + '.md');
    const content = readFileSafe(fp);
    res.writeHead(content == null ? 404 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ content: content || null }));
    return;
  }

  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(PUBLIC, filePath);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath);
    const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
    res.end(fs.readFileSync(fullPath));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// ── Start ──────────────────────────────────────────────────────────────────────
server.listen(PORT, '127.0.0.1', () => {
  console.log(`great_cto board → http://localhost:${PORT}`);
  // Discover all great_cto projects on disk asynchronously — don't block
  // the listening event so /api/tasks is available immediately.
  discoverProjects().then(n => {
    if (n > 0) console.log(`  → discovered ${n} project${n === 1 ? '' : 's'} with .great_cto/PROJECT.md`);
  }).catch(() => {}); // non-fatal
  watchBeads();
  watchVerdicts();

  // Auto-open browser unless --no-open
  if (!process.argv.includes('--no-open')) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawnSync(opener, [`http://localhost:${PORT}`], { detached: true });
  }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} in use — board already running at http://localhost:${PORT}`);
  } else {
    console.error(e);
  }
  process.exit(0);
});
