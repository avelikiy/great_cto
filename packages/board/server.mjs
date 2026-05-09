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
// Map legacy / informal archetype names to canonical archetype slugs.
// This lets the board correctly badge old PROJECT.md files (mobile, saas-platform,
// ai-agent, etc.) without forcing users to rewrite them.
const ARCHETYPE_ALIASES = {
  'mobile': 'mobile-app',
  'mobile-android': 'mobile-app',
  'mobile-ios': 'mobile-app',
  'saas-platform': 'enterprise-saas',
  'saas': 'enterprise-saas',
  'ai-agent': 'agent-product',
  'agent': 'agent-product',
  'rag-system': 'ai-system',
  'llm-app': 'ai-system',
  'trading-system': 'fintech',
  'financial-platform': 'fintech',
  'neobroker': 'fintech',
  'neobank': 'fintech',
  'ml-platform': 'mlops',
  'ml-training': 'mlops',
  'ml-serving': 'mlops',
  'web-fullstack': 'web-service',
  'web-app': 'web-service',
  'api': 'web-service',
  'backend': 'web-service',
  'cli': 'cli-tool',
  'sdk': 'library',
  'npm-library': 'library',
};

function normalizeArchetype(raw) {
  if (!raw) return '';
  // Strip backticks, quotes, surrounding whitespace
  const clean = raw.replace(/[`'"]/g, '').trim().toLowerCase();
  // Take first token if comma/plus-separated (e.g. "trading-system + financial-platform")
  const first = clean.split(/[,+]/)[0].trim();
  return ARCHETYPE_ALIASES[first] || first;
}

function extractArchetype(text) {
  // 1. Canonical: `archetype: foo`
  let m = text.match(/^archetype:\s*(.+)$/m);
  if (m) return normalizeArchetype(m[1]);
  // 2. Legacy yaml-like: `primary: foo`
  m = text.match(/^primary:\s*(.+)$/m);
  if (m) return normalizeArchetype(m[1]);
  // 3. Markdown list (bullet): `- Primary: \`foo\`` or `- primary: foo + bar`
  m = text.match(/^[-*]\s*Primary:\s*(.+)$/im);
  if (m) return normalizeArchetype(m[1]);
  return '';
}

function readProjectMd(dir) {
  const p = path.join(dir, '.great_cto', 'PROJECT.md');
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, 'utf8');
  const get = k => (text.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim() || '';
  return {
    slug: get('project') || get('name') || path.basename(dir),
    archetype: extractArchetype(text) || 'unknown',
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
  // Enrich with last_activity (mtime of .beads/interactions.jsonl) so the UI
  // can sort projects by recent activity instead of slug-alpha.
  return reg.projects.map(p => {
    const fresh = readProjectMd(p.path);
    let lastActivity = null;
    try {
      const interactionsFile = path.join(p.path, '.beads', 'interactions.jsonl');
      if (fs.existsSync(interactionsFile)) {
        lastActivity = fs.statSync(interactionsFile).mtime.toISOString();
      }
    } catch {}
    return { ...(fresh ? { ...p, ...fresh } : p), last_activity: lastActivity };
  }).sort((a, b) => {
    // Recent activity first; projects with no activity sink to the bottom (alphabetic)
    const ax = a.last_activity || '';
    const bx = b.last_activity || '';
    if (ax && bx) return bx.localeCompare(ax);
    if (ax) return -1;
    if (bx) return 1;
    return (a.slug || '').localeCompare(b.slug || '');
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
  const home = os.homedir();
  const layers = [
    // Project-local (.great_cto/) — L1 archetype + L2 codebase + L3 retros
    { id: 'project',     scope: 'project', layer: 'L1', name: 'PROJECT.md',    desc: 'Archetype, size, compliance, owners',           path: path.join(cwd, '.great_cto', 'PROJECT.md') },
    { id: 'archetypes',  scope: 'project', layer: 'L1', name: 'ARCHETYPES.md', desc: 'Archetype catalogue used by /start + agents',   path: path.join(cwd, '.great_cto', 'ARCHETYPES.md') },
    { id: 'skill',       scope: 'project', layer: 'L1', name: 'SKILL.md',      desc: 'Pipeline skill — synced from plugin',           path: path.join(cwd, '.great_cto', 'SKILL.md') },
    { id: 'codebase',    scope: 'project', layer: 'L2', name: 'CODEBASE.md',   desc: 'God nodes, entry points, public API, routes',   path: path.join(cwd, '.great_cto', 'CODEBASE.md') },
    { id: 'brain',       scope: 'project', layer: 'L3', name: 'brain.md',      desc: 'Patterns in use, what failed, team patterns',   path: path.join(cwd, '.great_cto', 'brain.md') },
    { id: 'lessons',     scope: 'project', layer: 'L3', name: 'lessons.md',    desc: 'Per-project lessons (extracted by /learn)',     path: path.join(cwd, '.great_cto', 'lessons.md') },
    { id: 'handoff',     scope: 'project', layer: 'L3', name: 'HANDOFF.md',    desc: 'Auto-written on context compaction',            path: path.join(cwd, '.great_cto', 'HANDOFF.md') },
    { id: 'local',       scope: 'project', layer: 'L3', name: 'local.md',      desc: 'Project-local notes (gitignored)',              path: path.join(cwd, '.great_cto', 'local.md') },
    // Cross-project (~/.great_cto/) — L4 global memory shared across all projects
    { id: 'g-decisions', scope: 'global',  layer: 'L4', name: 'decisions.md',  desc: 'Append-only ADR log — every gate approval',     path: path.join(home, '.great_cto', 'decisions.md') },
    { id: 'g-prefs',     scope: 'global',  layer: 'L4', name: 'preferences.md',desc: 'User-level CTO preferences (style, defaults)',  path: path.join(home, '.great_cto', 'preferences.md') },
    { id: 'g-lessons',   scope: 'global',  layer: 'L4', name: 'lessons.md',    desc: 'Cross-project lessons promoted from L3',        path: path.join(home, '.great_cto', 'lessons.md') },
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
  const stages = ['architect', 'pm', 'senior-dev', 'reviewers', 'qa-engineer', 'security-officer', 'devops', 'l3-support'];
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
      'pm': ['pm', 'product-manager', 'project-manager', 'planner'],
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
  // Build a map<dateISO, { llm, human, plans, verdictCost }>.
  // Inclusive window: `days=30` means [today-30 ... today] = 31 buckets.
  // Previous behaviour (days buckets only) created a one-day gap on the
  // far edge — tasks closed exactly on `today - days` fell out of the
  // history while still being valid "last 30 days" data per user expectation.
  const buckets = new Map();
  const now = Date.now();
  for (let i = 0; i <= days; i++) {
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
  let hasRealCostData = false;
  for (const v of verdicts) {
    if (v.cost_usd == null) continue;
    const dayKey = (v.ts || '').slice(0, 10);
    if (!buckets.has(dayKey)) continue;
    const b = buckets.get(dayKey);
    b.llm += v.cost_usd;
    b.runs++;
    hasRealCostData = true;
  }
  // Plans loop (above) sets hasRealCostData if any plan had llm/human numbers
  for (const b of buckets.values()) if (b.plans > 0) { hasRealCostData = true; break; }

  // Fallback: estimate per-task cost on the day a task was closed when neither
  // plan files nor verdict cost lines exist. Same model as getMetrics:
  // $0.02/AI-hr, $150/human-hr, default 30 min if no timing data.
  // Only engages when there's no real cost data anywhere — otherwise we'd
  // double-count buckets that DO have plan/verdict data alongside buckets that
  // don't. All-or-nothing keeps the series internally consistent.
  if (!hasRealCostData) {
    const HUMAN_RATE_PER_HR = 150;
    const LLM_RATE_PER_HR   = 0.02;
    const DEFAULT_TASK_MIN  = 30;
    try {
      const tasks = getTasks(cwd);
      for (const t of tasks) {
        if (!t.closed_at) continue;
        // Only count tasks with an assigned agent — same rule as getMetrics()
        // agents_cost so the LLM SPEND tile and LAST 30 DAYS tile agree.
        if (!t.agent) continue;
        const dayKey = new Date(t.closed_at).toISOString().slice(0, 10);
        if (!buckets.has(dayKey)) continue;
        let mins = 0;
        if (t.created_at) {
          const ms = new Date(t.closed_at).getTime() - new Date(t.created_at).getTime();
          if (ms > 0 && ms < 30 * 86400_000) mins = ms / 60000;
        }
        if (!mins) mins = t.estimated_minutes || DEFAULT_TASK_MIN;
        const b = buckets.get(dayKey);
        b.llm   += mins / 60 * LLM_RATE_PER_HR;
        b.human += mins / 60 * HUMAN_RATE_PER_HR;
        b.runs++;
      }
    } catch { /* getTasks failure is non-fatal */ }
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
  // Use raw_status here: mapStatus() rewrites status to 'gate' for any task with the
  // 'gate' label, regardless of bd-native state. Filtering on the mapped value would
  // leave closed/blocked gates in the inbox forever.
  const pendingGates = tasks.filter(t => t.is_gate && t.raw_status !== 'closed' && t.raw_status !== 'blocked');
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
// Cache bdList output per cwd for BD_CACHE_TTL_MS. Invalidated when the project's
// .beads/interactions.jsonl changes (the file watcher in watchBeads() calls
// bdCacheInvalidate(cwd) before broadcasting). This avoids spawning `bd list`
// on every API call when 5+ projects are open in tabs.
const BD_CACHE_TTL_MS = 2000;
const bdCache = new Map(); // cwd → { ts, data }

function bdCacheInvalidate(cwd) { bdCache.delete(cwd); }

function bdList(cwd = process.cwd()) {
  const cached = bdCache.get(cwd);
  if (cached && Date.now() - cached.ts < BD_CACHE_TTL_MS) return cached.data;
  try {
    const result = spawnSync('bd', ['list', '--json', '--all', '--include-gates'], {
      encoding: 'utf8', timeout: 8000, cwd
    });
    if (result.status !== 0) {
      bdCache.set(cwd, { ts: Date.now(), data: [] });
      return [];
    }
    const data = JSON.parse(result.stdout || '[]');
    bdCache.set(cwd, { ts: Date.now(), data });
    return data;
  } catch {
    bdCache.set(cwd, { ts: Date.now(), data: [] });
    return [];
  }
}

// Fallback: parse .great_cto/tasks.md when Beads isn't initialized.
// Format: `- [ ] TASK-001: Title [agent] [~42min]\n  Description: ...\n  Depends: ...`
function parseTasksMd(cwd) {
  const fp = path.join(cwd, '.great_cto', 'tasks.md');
  if (!fs.existsSync(fp)) return [];
  try {
    const text = fs.readFileSync(fp, 'utf8');
    const tasks = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^-\s+\[([ x])\]\s+([A-Z]+-\d+):\s+(.+?)(?:\s+\[([\w-]+)\])?(?:\s+\[~?([^\]]+)\])?\s*$/);
      if (!m) continue;
      const [, done, id, title, agent, est] = m;
      // Collect indented description lines until next blank or task
      let desc = '';
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s+\S/.test(lines[j])) { desc += lines[j].trim() + ' '; }
        else break;
      }
      const isGate = /^gate:/i.test(title) || (title || '').toLowerCase().includes('gate');
      tasks.push({
        id,
        title: title.trim(),
        description: desc.trim(),
        notes: '',
        design: '',
        acceptance: '',
        status: done === 'x' ? 'done' : (isGate ? 'gate' : 'backlog'),
        raw_status: done === 'x' ? 'closed' : 'open',
        priority: 2,
        labels: agent ? [agent] : [],
        owner: agent || '',
        created_at: null,
        updated_at: null,
        closed_at: null,
        close_reason: '',
        comment_count: 0,
        is_gate: isGate,
        agent: agent || '',
        estimated_minutes: est ? parseInt(est) || null : null,
        source: 'tasks.md',
      });
    }
    return tasks;
  } catch { return []; }
}

function getTasks(cwd = process.cwd()) {
  const all = bdList(cwd);
  // Fallback to tasks.md when no Beads tasks (project not initialized with bd)
  if (all.length === 0) {
    const mdTasks = parseTasksMd(cwd);
    if (mdTasks.length > 0) return mdTasks;
  }
  return all.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description || '',
    notes: t.notes || '',
    design: t.design || '',
    acceptance: t.acceptance || '',
    status: mapStatus(t.status, t.labels, t.issue_type),
    raw_status: t.status,                     // bd-native status (open/in_progress/closed/blocked)
    priority: t.priority,
    labels: t.labels || [],
    owner: t.owner || '',
    created_at: t.created_at,
    updated_at: t.updated_at,
    closed_at: t.closed_at || null,
    close_reason: t.close_reason || '',
    comment_count: t.comment_count || 0,
    // Gate detection: explicit 'gate' label OR bd decision type OR title contains 'gate:'
    is_gate: (t.labels || []).includes('gate')
          || t.issue_type === 'decision'
          || (t.title || '').toLowerCase().startsWith('gate:'),
    agent: detectAgent(t),
  }));
}

function mapStatus(status, labels = [], issue_type = '') {
  // Terminal status takes precedence over the 'gate' classification.
  // Otherwise closed gate tasks would still appear as 'gate' status, which
  // breaks Pending-decisions / P0-open / Active-pipeline aggregates that
  // consider "anything mapped to gate" still actionable.
  // Reported by Codex against /api/inbox showing 3 closed gates as P0 open.
  if (status === 'closed') return 'done';
  if (status === 'blocked') return 'blocked';
  if ((labels || []).includes('gate') || issue_type === 'decision') return 'gate';
  switch (status) {
    case 'open': return 'backlog';
    case 'in_progress': return 'in_progress';
    default: return 'backlog';
  }
}

function detectAgent(task) {
  const title = (task.title || '').toLowerCase();
  if (title.includes('architect') || title.includes('arch')) return 'architect';
  if (title.includes('pm:') || title.includes('product-manager') || title.includes('plan ')) return 'pm';
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

  // Agent cost + time breakdown.
  // Time source priority: 1) closed_at-created_at on done tasks, 2) estimated_minutes, 3) default 30min
  // LLM cost proxy: $0.02 per AI-hour (rough Sonnet 4 average for a typical task at ~2k tokens/min)
  // Human cost baseline: $150/hr (mid-level engineer fully-loaded)
  const HUMAN_RATE_PER_HR = 150;
  const LLM_RATE_PER_HR   = 0.02;
  const DEFAULT_TASK_MIN  = 30;  // fallback when no timing data
  const agentCostMap = {};
  for (const t of tasks) {
    if (!t.agent) continue;
    let mins = 0;
    if (t.created_at && t.closed_at) {
      const ms = new Date(t.closed_at).getTime() - new Date(t.created_at).getTime();
      if (ms > 0 && ms < 30 * 86400_000) mins = ms / 60000;
    }
    if (!mins) mins = t.estimated_minutes || DEFAULT_TASK_MIN;
    const llmCost   = mins / 60 * LLM_RATE_PER_HR;
    const humanCost = mins / 60 * HUMAN_RATE_PER_HR;
    if (!agentCostMap[t.agent]) agentCostMap[t.agent] = { agent: t.agent, llm_usd: 0, human_usd: 0, time_min: 0, tasks_total: 0, tasks_done: 0 };
    agentCostMap[t.agent].llm_usd   += llmCost;
    agentCostMap[t.agent].human_usd += humanCost;
    agentCostMap[t.agent].time_min  += mins;
    agentCostMap[t.agent].tasks_total += 1;
    if (t.status === 'done') agentCostMap[t.agent].tasks_done += 1;
  }
  const agentsCost = Object.values(agentCostMap)
    .map(a => ({
      ...a,
      llm_usd:   Math.round(a.llm_usd   * 100) / 100,
      human_usd: Math.round(a.human_usd * 100) / 100,
      time_min:  Math.round(a.time_min),
    }))
    .sort((a, b) => b.time_min - a.time_min);

  // Fallback: when no docs/plans/*.md cost data exists, derive cost from
  // tasks (agentCostMap) — every project with bd tasks gets meaningful tiles
  // even before a single PLAN-*.md is written.
  const taskLlmTotal   = agentsCost.reduce((s, a) => s + a.llm_usd, 0);
  const taskHumanTotal = agentsCost.reduce((s, a) => s + a.human_usd, 0);
  const cost = (costData.llm_usd > 0 || costData.human_usd > 0)
    ? costData
    : {
        llm_usd:   Math.round(taskLlmTotal   * 100) / 100,
        human_usd: Math.round(taskHumanTotal),
        savings_x: taskLlmTotal > 0 ? Math.round(taskHumanTotal / taskLlmTotal) : 0,
        count:     0,
        source:    'tasks',  // hint to UI: "estimated from tasks, no plans yet"
      };

  return {
    tasks: { total: tasks.length, done: done.length, in_progress: inProgress.length, backlog: backlog.length },
    velocity: { this_week: doneThisWeek.length, this_month: doneThisMonth.length },
    avg_completion_min: Math.round(avgCompletionMs / 60000),
    cost,
    qa: qaStats,
    security: secStats,
    agents: agentRuns,
    agents_cost: agentsCost,
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
    // Accept any of:  "verdict: pass" / "**Verdict:** PASS" / "Status: PASSED" / "✅ pass" / "result: ✓"
    if (/(?:verdict|status|result)\s*[:=]?\s*[*_`]*\s*(?:✅|✓|pass(?:ed)?)/i.test(content)) passed++;
    else if (/(?:verdict|status|result)\s*[:=]?\s*[*_`]*\s*(?:❌|✗|fail(?:ed)?|block(?:ed)?)/i.test(content)) failed++;
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
// ── decisions.md (global ADR log) ──────────────────────────────────────────
// Append-only architectural decisions log. Triggered on gate approve/reject.
// One line per decision; pure markdown so users can `cat` / `grep` / view in
// their editor without tooling.
function decisionsLogPath() {
  return path.join(GREAT_CTO_DIR, 'decisions.md');
}

function appendDecisionLog({ ts, project, action, id, title, reason }) {
  const file = decisionsLogPath();
  try { fs.mkdirSync(GREAT_CTO_DIR, { recursive: true }); } catch {}
  // Initialize header if file doesn't exist
  if (!fs.existsSync(file)) {
    const header =
`# great_cto — decisions log

Append-only architectural decisions across all projects. One line per
gate approve/reject. Agents and humans can grep this for "have we decided
this before?" lookups.

Format: \`- [TIMESTAMP] [PROJECT] [APPROVED|REJECTED] gate-id — title — reason\`

`;
    fs.writeFileSync(file, header);
  }
  const verdict = action === 'approve' ? 'APPROVED' : 'REJECTED';
  const safeTitle = (title || '').replace(/\n/g, ' ').slice(0, 120);
  const safeReason = (reason || '').replace(/\n/g, ' ').slice(0, 200);
  const line = `- [${ts}] [${project}] [${verdict}] ${id} — ${safeTitle}${safeReason ? ` — ${safeReason}` : ''}\n`;
  fs.appendFileSync(file, line);
}

function readDecisionsLog(limit = 20) {
  const file = decisionsLogPath();
  if (!fs.existsSync(file)) return [];
  try {
    const text = fs.readFileSync(file, 'utf-8');
    const lines = text.split('\n').filter(l => l.startsWith('- ['));
    // Newest last → reverse and take last `limit`
    return lines.slice(-limit).reverse().map(line => {
      // Parse: - [TS] [PROJECT] [VERDICT] id — title — reason
      const m = line.match(/^- \[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] ([^\s]+)\s+—\s+(.+?)(?:\s+—\s+(.+))?$/);
      if (!m) return null;
      return { ts: m[1], project: m[2], verdict: m[3], id: m[4], title: m[5], reason: m[6] || '' };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Resume — what happened recently for this project ─────────────────────
// Returns a compact bundle for the "Resume" inbox card:
//   - last 3 verdicts (APPROVED / DONE / etc.)
//   - open gates (already in inbox, but cheap to include for one-shot fetch)
//   - 3 most-recent WIP tasks (in_progress, sorted by updated_at desc)
//   - last 5 decisions from the global log filtered to this project
function getResume(cwd = process.cwd()) {
  const tasks = getTasks(cwd);
  const verdicts = readVerdicts()
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
  // Watch every registered project's beads files.
  // Note: bd create only writes to dolt DB, NOT interactions.jsonl. So we must
  // watch BOTH: (a) interactions.jsonl for status/priority changes (from bd
  // update/close), and (b) the dolt manifest/journal for new-issue detection.
  const projects = listProjects();
  const dirs = projects.map(p => p.path);
  if (!dirs.includes(process.cwd())) dirs.push(process.cwd());

  const broadcast = (dir) => {
    bdCacheInvalidate(dir);
    for (const res of sseClients) {
      if (res._gctoCwd === dir) {
        try {
          res.write(`event: tasks\ndata: ${JSON.stringify(getTasks(dir))}\n\n`);
          res.write(`event: pipeline\ndata: ${JSON.stringify(getPipeline(dir))}\n\n`);
          res.write(`event: inbox\ndata: ${JSON.stringify(getInbox(dir))}\n\n`);
        } catch {}
      }
    }
  };

  // Debounce per-dir: dolt writes can fire 3-5 events in <50ms during a single
  // bd command. Collapse them into one broadcast 200ms after the last event.
  const debouncers = new Map();
  const schedule = (dir) => {
    if (debouncers.has(dir)) clearTimeout(debouncers.get(dir));
    debouncers.set(dir, setTimeout(() => {
      debouncers.delete(dir);
      broadcast(dir);
    }, 200));
  };

  for (const dir of dirs) {
    // (a) interactions.jsonl — captures bd update/close
    const interactionsFile = path.join(dir, '.beads', 'interactions.jsonl');
    if (fs.existsSync(interactionsFile)) {
      try { fs.watch(interactionsFile, () => schedule(dir)); } catch {}
    }
    // (b) dolt embeddeddolt directory (recursive) — captures bd create
    const doltDir = path.join(dir, '.beads', 'embeddeddolt');
    if (fs.existsSync(doltDir)) {
      try { fs.watch(doltDir, { recursive: true }, () => schedule(dir)); } catch {}
    }
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

  // Manually register a project at an arbitrary path (e.g. /tmp/...).
  // Body: { path: "/tmp/neobank-test" }
  if (pathname === '/api/projects/register' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { path: projPath } = JSON.parse(body || '{}');
        if (!projPath || !fs.existsSync(projPath)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'path missing or does not exist' }));
        }
        // Auto-create PROJECT.md stub if missing — required for autoRegisterProject
        const greatCtoDir = path.join(projPath, '.great_cto');
        const projectMd = path.join(greatCtoDir, 'PROJECT.md');
        if (!fs.existsSync(projectMd)) {
          fs.mkdirSync(greatCtoDir, { recursive: true });
          fs.writeFileSync(projectMd, `# PROJECT — ${path.basename(projPath)}\n\nname: ${path.basename(projPath)}\narchetype: unknown\nphase: discovery\n`);
        }
        autoRegisterProject(projPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: projPath, slug: path.basename(projPath) }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (pathname === '/api/tasks' && req.method === 'GET') {
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
      const parsed = JSON.parse(body || '{}');
      const { action, reason } = parsed;
      // Allow project override via body (fallback when ?project= not in URL)
      const gateCwd = parsed.project ? resolveProjectCwd(parsed.project) : cwd;
      if (!['approve', 'reject'].includes(action)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid action' }));
        return;
      }
      try {
        const status = action === 'approve' ? 'closed' : 'blocked';
        const args = ['update', id, '--status', status];
        if (reason) args.push('--notes', `[${action}] ${reason}`);
        const r = spawnSync('bd', args, { cwd: gateCwd, encoding: 'utf8' });
        if (r.status !== 0) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: r.stderr || 'bd update failed' }));
          return;
        }
        bdCacheInvalidate(gateCwd);

        // Append to global decisions log (~/.great_cto/decisions.md)
        try {
          const projectSlug = parsed.project || path.basename(gateCwd);
          // Look up gate title for nicer log entry
          const allTasks = getTasks(gateCwd);
          const gateTask = allTasks.find(t => t.id === id);
          const title = gateTask?.title || id;
          appendDecisionLog({
            ts: new Date().toISOString(),
            project: projectSlug,
            action,
            id,
            title,
            reason: reason || '',
          });
        } catch { /* best-effort, don't fail gate on log error */ }

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

  // Resume — pick up where you left off (last verdicts + WIP + recent decisions)
  if (pathname === '/api/resume') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getResume(cwd)));
    return;
  }

  // Decisions log — global ADR-style log across all projects
  if (pathname === '/api/decisions') {
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readDecisionsLog(limit)));
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

  // Create new task
  if (pathname === '/api/tasks' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { title, description, priority, agent, labels } = JSON.parse(body || '{}');
        if (!title || !title.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'title required' }));
          return;
        }
        // Build bd create args
        const args = ['create', title.trim()];
        if (description) args.push('-d', description);
        if (priority != null && priority >= 0 && priority <= 3) args.push('--priority', `P${priority}`);

        const r = spawnSync('bd', args, { cwd, encoding: 'utf8' });
        if (r.status !== 0) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: r.stderr || 'bd create failed' }));
          return;
        }
        // Extract created issue id
        const idMatch = (r.stdout || '').match(/Created issue:\s*(\S+)/);
        const id = idMatch ? idMatch[1] : null;

        // Apply optional labels and agent (assignee) if provided
        if (id) {
          const updateArgs = ['update', id];
          let needUpdate = false;
          if (agent) { updateArgs.push('--assignee', agent); needUpdate = true; }
          const lbls = Array.isArray(labels) ? labels : (labels ? [labels] : []);
          for (const lbl of lbls) {
            if (lbl) { updateArgs.push('--add-label', lbl); needUpdate = true; }
          }
          // If agent is provided also add it as a label so the pipeline picks it up
          if (agent && !lbls.includes(agent)) { updateArgs.push('--add-label', agent); needUpdate = true; }
          if (needUpdate) spawnSync('bd', updateArgs, { cwd, encoding: 'utf8' });
        }

        bdCacheInvalidate(cwd);
        broadcastTasks(cwd);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e.message || e) }));
      }
    });
    return;
  }

  // Task status update
  if (pathname.match(/^\/api\/tasks\/[^/]+\/status$/) && req.method === 'POST') {
    const id = pathname.split('/')[3];
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { status } = JSON.parse(body || '{}');
        const validStatuses = ['open', 'in_progress', 'blocked', 'closed'];
        if (!validStatuses.includes(status)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid status' }));
          return;
        }
        const r = spawnSync('bd', ['update', id, '--status', status], { cwd, encoding: 'utf8' });
        if (r.status !== 0) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: r.stderr || 'bd update failed' }));
          return;
        }
        bdCacheInvalidate(cwd);
        broadcastTasks(cwd);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e.message || e) }));
      }
    });
    return;
  }

  // Task priority update
  if (pathname.match(/^\/api\/tasks\/[^/]+\/priority$/) && req.method === 'POST') {
    const id = pathname.split('/')[3];
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { priority } = JSON.parse(body || '{}');
        if (priority == null || priority < 0 || priority > 3) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid priority' }));
          return;
        }
        const r = spawnSync('bd', ['update', id, '--priority', String(priority)], { cwd, encoding: 'utf8' });
        if (r.status !== 0) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: r.stderr || 'bd update failed' }));
          return;
        }
        bdCacheInvalidate(cwd);
        broadcastTasks(cwd);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e.message || e) }));
      }
    });
    return;
  }

  // Task history / timeline from interactions.jsonl
  if (pathname.match(/^\/api\/tasks\/[^/]+\/history$/) && req.method === 'GET') {
    const taskId = pathname.split('/')[3];
    const interactionsFile = path.join(cwd, '.beads', 'interactions.jsonl');
    if (!fs.existsSync(interactionsFile)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ events: [] }));
      return;
    }
    try {
      const lines = fs.readFileSync(interactionsFile, 'utf8').split('\n').filter(Boolean);
      const events = [];
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.id === taskId) {
            events.push({
              ts: obj.ts || obj.created_at || null,
              actor: obj.actor || obj.agent || null,
              action: obj.action || obj.type || 'updated',
              from: obj.from || null,
              to: obj.to || null,
              notes: obj.notes || null,
            });
          }
        } catch {}
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ events }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
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

  // Session logs — list .great_cto/logs/session-*.md for the current project.
  // When no /save logs exist, synthesize day-grouped entries from verdicts so
  // the panel is useful immediately — every project with agent activity gets
  // a meaningful log even before the first /save.
  if (pathname === '/api/logs') {
    const logsDir = path.join(cwd, '.great_cto', 'logs');
    let logs = [];
    try {
      const files = fs.readdirSync(logsDir)
        .filter(f => f.startsWith('session-') && f.endsWith('.md'))
        .sort().reverse().slice(0, 30);
      logs = files.map(f => {
        const fp = path.join(logsDir, f);
        const raw = readFileSafe(fp) || '';
        const dateM = raw.match(/^date:\s*(.+)$/m);
        const timeM = raw.match(/^time:\s*(.+)$/m);
        const durM  = raw.match(/^duration:\s*(.+)$/m);
        const titleM = raw.match(/^#\s+Session:\s*(.+)$/m);
        const doneM = raw.match(/## Done\n([\s\S]*?)(?=\n##|$)/);
        const done = doneM ? doneM[1].trim().split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2)) : [];
        const pendM = raw.match(/## Pending\n([\s\S]*?)(?=\n##|$)/);
        const pending = pendM ? pendM[1].trim().split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2)) : [];
        return {
          file: f,
          source: 'save',
          date: dateM?.[1]?.trim() || f.slice(8, 18),
          time: timeM?.[1]?.trim() || '',
          duration: durM?.[1]?.trim() || '',
          title: titleM?.[1]?.trim() || f.replace(/^session-\d{4}-\d{2}-\d{2}-/, '').replace('.md', ''),
          done,
          pending,
          raw,
        };
      });
    } catch {}

    // Fallback: synthesize from verdicts grouped by day
    if (!logs.length) {
      try {
        const verdicts = readVerdicts();
        // Filter to verdicts referencing this project (best-effort: include all
        // when project-tagging not available)
        const byDay = new Map();
        for (const v of verdicts) {
          const day = (v.ts || '').slice(0, 10);
          if (!day) continue;
          if (!byDay.has(day)) byDay.set(day, { ok: [], fail: [], earliest: v.ts, latest: v.ts });
          const b = byDay.get(day);
          const verdictUp = (v.verdict || '').toUpperCase();
          const isOk = ['OK','APPROVED','DONE','PASS','PASSED'].includes(verdictUp);
          const isFail = ['FAIL','FAILED','BLOCKED','REJECTED'].includes(verdictUp);
          const summary = `${v.agent}: ${v.verdict || 'event'}${v.raw ? ` — ${v.raw.replace(/\s+/g,' ').slice(0,140)}` : ''}`;
          if (isFail) b.fail.push(summary);
          else b.ok.push(summary);
          if (v.ts < b.earliest) b.earliest = v.ts;
          if (v.ts > b.latest)   b.latest   = v.ts;
        }
        logs = Array.from(byDay.entries())
          .sort(([a],[b]) => b.localeCompare(a))
          .slice(0, 30)
          .map(([day, b]) => ({
            file: `auto-${day}`,
            source: 'verdicts',
            date: day,
            time: (b.earliest || '').slice(11, 16),
            duration: '',
            title: `Auto-log · ${b.ok.length + b.fail.length} agent run${(b.ok.length+b.fail.length)===1?'':'s'}`,
            done: b.ok.slice(0, 50),
            pending: b.fail.slice(0, 50),
            raw: '_Auto-generated from ~/.great_cto/verdicts/. Run `/save` to create a curated session log._',
          }));
      } catch {}
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ logs }));
    return;
  }

  // Installed agents — list ~/.claude/agents/great_cto-*.md with last-used from verdicts
  if (pathname === '/api/agents-installed') {
    const agentsDir = path.join(os.homedir(), '.claude', 'agents');
    let agents = [];
    try {
      const files = fs.readdirSync(agentsDir)
        .filter(f => f.startsWith('great_cto-') && f.endsWith('.md'))
        .sort();
      // Read verdict logs to get last-used per agent
      const verdicts = readVerdicts();
      const lastUsed = new Map();
      for (const v of verdicts) {
        if (v.agent && !lastUsed.has(v.agent)) lastUsed.set(v.agent, v.ts);
      }
      agents = files.map(f => {
        const name = f.replace(/^great_cto-/, '').replace(/\.md$/, '');
        const fp = path.join(agentsDir, f);
        const raw = readFileSafe(fp) || '';
        // Extract description from YAML frontmatter
        const descM = raw.match(/^description:\s*"?([^"\n]+)"?/m);
        const modelM = raw.match(/^model:\s*(\S+)/m);
        return {
          name,
          description: descM?.[1]?.trim() || '',
          model: modelM?.[1]?.trim() || 'sonnet',
          lastUsed: lastUsed.get(name) || null,
        };
      });
    } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ agents, total: agents.length }));
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
