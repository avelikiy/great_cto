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
const SHARE_ENDPOINT = 'https://greatcto.systems/r/';

// ── SSE clients ────────────────────────────────────────────────────────────────
const sseClients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { sseClients.delete(res); }
  }
}

// ── Beads data ─────────────────────────────────────────────────────────────────
function bdList(flags = '') {
  try {
    const result = spawnSync('bd', ['list', '--json', '--all', '--include-gates', ...flags.split(' ').filter(Boolean)], {
      encoding: 'utf8', timeout: 8000, cwd: process.cwd()
    });
    if (result.status !== 0) return [];
    return JSON.parse(result.stdout || '[]');
  } catch { return []; }
}

function getTasks() {
  const all = bdList();
  return all.map(t => ({
    id: t.id,
    title: t.title,
    status: mapStatus(t.status, t.labels),
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
function getMetrics() {
  const tasks = getTasks();
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

  // Verdicts
  const verdicts = readVerdicts();

  // Cost from plans
  const costData = readPlanCosts();

  // QA/Security
  const qaStats = readQAStats();
  const secStats = readSecStats();

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
      results.push({
        ts: parts[0],
        agent,
        verdict: parts[1] || '',
        raw: line,
      });
    }
  }
  return results.sort((a, b) => a.ts.localeCompare(b.ts));
}

function readPlanCosts() {
  const plansDir = 'docs/plans';
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

function readQAStats() {
  const qaDir = 'docs/qa-reports';
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

function readSecStats() {
  const secDir = 'docs/security';
  let approved = 0, blocked = 0;
  if (!fs.existsSync(secDir)) return { approved: 0, blocked: 0 };
  for (const file of fs.readdirSync(secDir).filter(f => f.endsWith('.md'))) {
    const content = fs.readFileSync(path.join(secDir, file), 'utf8');
    if (/APPROVED/i.test(content)) approved++;
    if (/BLOCKED/i.test(content)) blocked++;
  }
  return { approved, blocked };
}

// ── Share state ────────────────────────────────────────────────────────────────
function getShareState() {
  try {
    if (fs.existsSync(SHARE_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(SHARE_STATE_FILE, 'utf8'));
    }
  } catch {}
  return { enabled: false, url: null, hash: null, published_at: null };
}

function saveShareState(state) {
  fs.mkdirSync(GREAT_CTO_DIR, { recursive: true });
  fs.writeFileSync(SHARE_STATE_FILE, JSON.stringify(state, null, 2));
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

async function toggleShare(enable) {
  const state = getShareState();
  if (enable && !state.enabled) {
    // Generate and publish
    const html = generateShareHTML(getTasks(), getMetrics());
    try {
      const result = await publishReport(html);
      const newState = { enabled: true, url: result.url, hash: result.hash, published_at: new Date().toISOString() };
      saveShareState(newState);
      return newState;
    } catch (e) {
      return { error: e.message };
    }
  } else if (!enable && state.enabled) {
    const newState = { ...state, enabled: false };
    saveShareState(newState);
    // Optionally: PATCH /r/{hash} with { enabled: false }
    return newState;
  }
  return state;
}

function generateShareHTML(tasks, metrics) {
  const projectName = path.basename(process.cwd());
  const date = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const done = tasks.filter(t => t.status === 'done');
  const shareTemplate = fs.readFileSync(path.join(PUBLIC, 'share.html'), 'utf8');
  return shareTemplate
    .replace('{{PROJECT}}', projectName)
    .replace('{{DATE}}', date)
    .replace('{{METRICS_JSON}}', JSON.stringify(metrics))
    .replace('{{TASKS_JSON}}', JSON.stringify(done.slice(-20)));
}

// ── File watcher ───────────────────────────────────────────────────────────────
function watchBeads() {
  const beadsDir = path.join(process.cwd(), '.beads');
  if (!fs.existsSync(beadsDir)) return;
  const interactionsFile = path.join(beadsDir, 'interactions.jsonl');
  if (fs.existsSync(interactionsFile)) {
    let lastSize = fs.statSync(interactionsFile).size;
    fs.watch(interactionsFile, () => {
      const newSize = fs.statSync(interactionsFile).size;
      if (newSize !== lastSize) {
        lastSize = newSize;
        broadcast('tasks', getTasks());
      }
    });
  }
}

// ── HTTP router ────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  // SSE
  if (pathname === '/api/sse') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    sseClients.add(res);
    res.write(`event: tasks\ndata: ${JSON.stringify(getTasks())}\n\n`);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // API
  if (pathname === '/api/tasks') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getTasks()));
    return;
  }

  if (pathname === '/api/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getMetrics()));
    return;
  }

  if (pathname === '/api/share') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getShareState()));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        const { enabled } = JSON.parse(body || '{}');
        const state = await toggleShare(enabled);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(state));
      });
      return;
    }
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
  watchBeads();

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
