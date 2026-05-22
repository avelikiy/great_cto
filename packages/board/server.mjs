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
import {
  readLeashConfig,
  getLeashAvailability,
  readLeashAudit,
  readLeashState,
  readHitlPending,
  fireKillSwitch,
  postHitlDecision,
  readProjectTenantId,
} from './leash-adapter.mjs';
import { getSecurityStatus } from './security-status.mjs';
import { startProxy, stopProxy, isProxyRunning } from './leash-proxy-control.mjs';
import {
  getVapidKeys,
  sendWebPush,
  loadSubscriptions,
  addSubscription,
  removeSubscription,
} from './push-adapter.mjs';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.BOARD_PORT || process.env.PORT || '3141', 10);
const PUBLIC = path.join(__dirname, 'public');
const GREAT_CTO_DIR = path.join(os.homedir(), '.great_cto');
const SHARE_STATE_FILE = path.join(GREAT_CTO_DIR, 'board-share.json');
const PROJECTS_FILE = path.join(GREAT_CTO_DIR, 'projects.json');
const SHARE_ENDPOINT = 'https://greatcto.systems/r/';
const VAPID_KEYS_FILE = path.join(GREAT_CTO_DIR, 'vapid-keys.json');
const PUSH_SUBS_FILE = path.join(GREAT_CTO_DIR, 'push-subscriptions.json');
const NOTIF_HISTORY_FILE = path.join(GREAT_CTO_DIR, 'notif-history.json');
const VAPID_SUBJECT = 'mailto:hi@updates.greatcto.systems';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Resolve the ?project= query param into a tenant filter:
 *   ?project=foo       → 'foo'
 *   ?project=all|*     → null  (no filter)
 *   ?project= empty    → null
 *   omitted            → readProjectTenantId(cwd)  (default = active project)
 */
/**
 * Escape a single value for inclusion in a CSV cell.
 * Quotes the value if it contains comma / quote / newline.
 */
function csvCell(v) {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function resolveProjectParam(urlObj, cwd) {
  const raw = urlObj.searchParams.get('project');
  if (raw == null) {
    // Not specified — fall back to the tenant tied to the current cwd
    try { return readProjectTenantId(cwd); }
    catch { return null; }
  }
  if (raw === 'all' || raw === '*' || raw === '') return null;
  return raw;
}

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

/**
 * Same as resolveProjectCwd but returns { cwd, resolved, fallback? } so
 * callers know whether resolution was authoritative or fell back to the
 * server's working directory. Used by HTTP handlers to set an explicit
 * `X-Project-Fallback` response header (BH-5 fix, 2026-05-15).
 *
 * resolved values:
 *   'cwd'      — no project param passed; using server cwd as documented
 *   'path'     — absolute / tilde path passed and used directly
 *   'slug'     — slug found in registry
 *   'fallback' — slug requested but NOT in registry; using cwd as fallback.
 *                Caller should warn the user (header + log).
 */
function resolveProjectInfo(slugOrPath) {
  if (!slugOrPath) return { cwd: process.cwd(), resolved: 'cwd' };
  if (slugOrPath.startsWith('/')) return { cwd: slugOrPath, resolved: 'path' };
  if (slugOrPath.startsWith('~')) {
    return { cwd: slugOrPath.replace(/^~/, os.homedir()), resolved: 'path' };
  }
  const reg = readProjectsRegistry();
  const found = reg.projects.find(p => p.slug === slugOrPath);
  if (found) return { cwd: found.path, resolved: 'slug' };
  return { cwd: process.cwd(), resolved: 'fallback', requested: slugOrPath };
}

// ── SSE clients ────────────────────────────────────────────────────────────────
const sseClients = new Set();
const _reportRepublishDedupeSet = new Set(); // dedupe daily report republish

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

// ── In-app notification history ────────────────────────────────────────────────
// Persisted to ~/.great_cto/notif-history.json. Capped at 100 entries.
// Each entry: { id, event, title, body, level, project, ts, read }
const MAX_NOTIF_HISTORY = 100;
let notifHistory = [];

function loadNotifHistory() {
  try {
    if (fs.existsSync(NOTIF_HISTORY_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(NOTIF_HISTORY_FILE, 'utf8'));
      if (Array.isArray(parsed)) notifHistory = parsed;
    }
  } catch { /* start fresh on corrupt file */ }
}

function saveNotifHistory() {
  try {
    fs.mkdirSync(GREAT_CTO_DIR, { recursive: true });
    fs.writeFileSync(NOTIF_HISTORY_FILE, JSON.stringify(notifHistory, null, 2));
  } catch { /* best-effort */ }
}

/**
 * Record a notification, broadcast via SSE, and persist.
 * Called alongside fireEmailAlert / firePushAlert at every trigger point.
 */
function addNotification(event, payload) {
  const notif = {
    id: crypto.randomUUID(),
    event,
    title: payload.title,
    body: payload.body,
    level: payload.level || 'info',
    project: payload.project || '',
    ts: new Date().toISOString(),
    read: false,
  };
  notifHistory.unshift(notif);
  if (notifHistory.length > MAX_NOTIF_HISTORY) notifHistory.length = MAX_NOTIF_HISTORY;
  broadcast('notification', notif);
  saveNotifHistory();
  return notif;
}

// Load history at server start
loadNotifHistory();

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
  const verdicts = readVerdicts(cwd);
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
  // Cost extraction from LLM-written plan docs is intentionally lenient about
  // shape — agents emit "LLM time: ~5 min · ~$0.30" as often as the old
  // "LLM cost: 5–10 min" range form. We match a $-amount near the word
  // "LLM" and another near "Human", and FIRE the sanity check below to
  // reject pathological pairs (the 7,638× regression — total_human present
  // but total_llm fell to zero because the LLM regex was too strict).
  const plansDir = path.join(cwd, 'docs/plans');
  if (fs.existsSync(plansDir)) {
    for (const f of fs.readdirSync(plansDir).filter(x => x.endsWith('.md'))) {
      const fp = path.join(plansDir, f);
      const stat = fs.statSync(fp);
      const dayKey = stat.mtime.toISOString().slice(0, 10);
      if (!buckets.has(dayKey)) continue;
      const content = fs.readFileSync(fp, 'utf8');
      // Anchor LLM/Human at START of line (with optional markdown emphasis)
      // so we never mis-match cases like:
      //   "**Cost**: $0.50 LLM | $240 human"  ← would have grabbed $240 as LLM
      // The label MUST be the first non-emphasis token on the line. Examples
      // that correctly match:
      //   "**LLM**: $0.50–1.20"
      //   "LLM time: ~$0.30"
      //   "- **LLM cost:** $0.75 – $1.85"
      // Examples correctly skipped:
      //   "**Cost**: $0.50–1.20 LLM | $240–360 human" (LLM mid-line)
      //   "Savings = Human/LLM"                       (LLM mid-line)
      const llmMatch   = content.match(/^[\s*_>\-]*LLM[^\n]*?\$(\d+\.?\d*)/im);
      const humanMatch = content.match(/^[\s*_>\-]*Human[^\n]*?\$(\d[\d,]*\.?\d*)/im);
      const b = buckets.get(dayKey);
      if (llmMatch) b.llm += parseFloat(llmMatch[1]);
      if (humanMatch) b.human += parseFloat(humanMatch[1].replace(/,/g, ''));
      // SANITY GUARD: if Human matched but LLM regex missed, suppress Human
      // for THIS plan rather than emit an implausible ratio. This is the
      // production safety net for the 7,638× bug class.
      if (humanMatch && !llmMatch && b.human > 0) {
        // Reverse the suppression — drop the bogus single-sided Human entry.
        b.human -= parseFloat(humanMatch[1].replace(/,/g, ''));
      }
      b.plans++;
    }
  }

  // hasRealCostData: true only when actual dollar figures exist — from plan
  // files with parseable $ amounts OR from verdicts with cost_usd tags.
  // A plan FILE existing (b.plans > 0) without a $ match does NOT count —
  // that was the original BH-26 bug: plans without $ data blocked task
  // estimates, causing /api/cost and /api/metrics to diverge.
  let hasRealCostData = false;
  for (const b of buckets.values()) { if (b.llm > 0) { hasRealCostData = true; break; } }

  // Verdicts: cost=$X tag (from ~/.great_cto/verdicts/)
  const verdicts = readVerdicts(cwd);
  // feature=X aggregation — answers "how much did stripe-webhook cost?"
  const featureMap = new Map(); // feature → { llm, runs }
  for (const v of verdicts) {
    if (v.cost_usd == null) continue;
    const dayKey = (v.ts || '').slice(0, 10);
    if (!buckets.has(dayKey)) continue;
    const b = buckets.get(dayKey);
    b.llm += v.cost_usd;
    b.runs++;
    hasRealCostData = true;
    // Extract feature= tag from raw verdict line
    const featMatch = v.raw && v.raw.match(/\bfeature=([^\s|]+)/);
    if (featMatch) {
      const feat = featMatch[1];
      const f = featureMap.get(feat) || { llm: 0, runs: 0 };
      f.llm += v.cost_usd;
      f.runs++;
      featureMap.set(feat, f);
    }
  }

  // Human cost: ALWAYS compute as `closed_tasks_per_day × 4h × $150/hr`.
  // This is the industry-baseline per-feature estimate and is INDEPENDENT
  // of LLM cost source — so even when AI cost comes from real verdict data,
  // human comparison is meaningful. Fallback LLM estimate engages only when
  // no real cost data exists anywhere (verdicts or PLAN files).
  const HUMAN_PER_TASK_USD = 4 * 150;  // 4 hours × $150/hr
  const LLM_RATE_PER_HR   = parseFloat(process.env.GREATCTO_LLM_RATE_PER_HR || '0.30');
  const DEFAULT_TASK_MIN  = 30;
  try {
    const tasks = getTasks(cwd);
    for (const t of tasks) {
      if (!t.closed_at) continue;
      if (!t.agent) continue;
      const dayKey = new Date(t.closed_at).toISOString().slice(0, 10);
      if (!buckets.has(dayKey)) continue;
      const b = buckets.get(dayKey);
      b.human += HUMAN_PER_TASK_USD;
      // Only add LLM estimate when we have no real cost data anywhere
      if (!hasRealCostData) {
        const mins = t.estimated_minutes || DEFAULT_TASK_MIN;
        b.llm += mins / 60 * LLM_RATE_PER_HR;
        b.runs++;
      }
    }
  } catch { /* getTasks failure is non-fatal */ }

  const series = Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
  let totalLlm = series.reduce((a, b) => a + b.llm, 0);
  let totalHuman = series.reduce((a, b) => a + b.human, 0);
  const totalPlans = series.reduce((a, b) => a + b.plans, 0);

  // SANITY GUARD — anti-7,638× regression. If ratio > 1000×, one of the
  // numbers is wrong. Almost always: total_llm collapsed to ~0 because plan
  // parsing missed the LLM value, while total_human matched a "$7,500 saved"
  // marketing line. Better to under-report than show an implausible 7,500×
  // savings on the dashboard. Caller can still see the raw `series`.
  if (totalLlm > 0 && totalHuman > 0 && totalPlans > 0 && (totalHuman / totalLlm) > 1000) {
    totalHuman = 0;
    for (const b of series) b.human = 0;
  }

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
    // savings_x semantics:
    //   null  → cannot compute (no human estimate available — distinct from "no savings")
    //   0+    → real ratio, total_human / total_llm
    // Pre-fix this returned 0 in both cases, conflating "no human estimate"
    // with "human cost is identical to LLM cost" — misleading on dashboards.
    savings_x: (totalLlm > 0 && totalHuman > 0)
      ? Math.round(totalHuman / totalLlm)
      : null,
    // Top features by LLM spend — sorted desc, top 10
    by_feature: Array.from(featureMap.entries())
      .map(([feature, f]) => ({ feature, llm: Math.round(f.llm * 100) / 100, runs: f.runs }))
      .sort((a, b) => b.llm - a.llm)
      .slice(0, 10),
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

// Check whether `bd` is initialized in the given cwd. Returns null on success,
// or a structured error object suitable for a 409 Conflict response.
// Used to give the admin UI a clean signal ("project not initialized") rather
// than a 500 with a raw stderr dump.
function checkBeadsAvailable(cwd) {
  // Quick filesystem check first — beads stores its DB under .beads/.
  // Some installs use ~/.beads or env-var BEADS_DIR; respect those too.
  const candidates = [
    path.join(cwd, '.beads'),
    process.env.BEADS_DIR,
  ].filter(Boolean);
  if (candidates.some(p => { try { return fs.existsSync(p); } catch { return false; } })) {
    return null;  // looks initialized
  }
  return {
    error: 'beads_not_initialized',
    message: `No .beads/ directory found in ${cwd}. Initialize with 'bd init' or set BEADS_DIR.`,
    cwd,
    hint: "Run 'bd init' in the project root, then retry.",
  };
}

// ── bd write serialisation (BH-12, 2026-05-15) ─────────────────────────────
//
// bd uses Dolt-embedded DB with file-level locking. Concurrent `bd create`
// or `bd update` calls compete for the lock; if one crashes mid-write, it
// leaves a stale `.beads/.lock` that blocks ALL subsequent operations
// until manually removed.
//
// Server-level fix: serialise bd write operations through this single
// promise chain. Reads (`bd list`) are unaffected — Dolt's read path
// doesn't take the write lock.
//
// Adds ~100ms per write under burst load; no-op under normal usage.
let _bdWriteChain = Promise.resolve();
function bdWriteSerialised(fn) {
  const next = _bdWriteChain.then(() => fn()).catch((e) => {
    console.error('[bd-write-serialised] error:', e?.message || e);
    return null;
  });
  _bdWriteChain = next.then(() => undefined).catch(() => undefined);
  return next;
}

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
function getMetrics(cwd = process.cwd(), days = 30) {
  // `days` controls the window for cost/agents_cost and for "shipped in window".
  // Tasks shipped within the window are returned in `tasks.done_in_window`.
  // Full lifetime `tasks.done` is still returned for backwards compatibility.
  const tasks = getTasks(cwd);
  // BH-28: resolved gates (approve→closed, reject→blocked) get mapped to
  // status='done' by mapStatus(). Those are governance decisions, not shipped
  // features — counting them inflates velocity / tasks-shipped on the report.
  const done = tasks.filter(t => t.status === 'done' && !t.is_gate);
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const backlog = tasks.filter(t => t.status === 'backlog');

  // Velocity: features closed per week
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const doneThisWeek = done.filter(t => t.closed_at && (now - new Date(t.closed_at).getTime()) < week);
  const doneThisMonth = done.filter(t => t.closed_at && (now - new Date(t.closed_at).getTime()) < 30 * 24 * 60 * 60 * 1000);

  // Cycle time (median, last 30 days, cap individual cycles at 30 days).
  // Previously: arithmetic mean over ALL tasks ever, no cap — stuck tasks
  // (created months earlier, finally closed) pulled the average into the
  // tens of thousands of minutes. Median + 30d cap matches how the cost
  // tile bounds cycles ([server.mjs:816](server.mjs:816)).
  const cycleCap = 30 * 86400_000;
  const completionTimes = done
    .filter(t => t.created_at && t.closed_at && (now - new Date(t.closed_at).getTime()) < cycleCap)
    .map(t => new Date(t.closed_at).getTime() - new Date(t.created_at).getTime())
    .filter(ms => ms > 0 && ms < cycleCap)
    .sort((a, b) => a - b);
  const medianCompletionMs = completionTimes.length
    ? completionTimes[Math.floor(completionTimes.length / 2)]
    : 0;

  // Verdicts (global verdicts log lives in ~/.great_cto/verdicts/)
  const verdicts = readVerdicts(cwd);

  // Cost from plans (per-project)
  const costData = readPlanCosts(cwd);

  // QA/Security (per-project)
  const qaStats = readQAStats(cwd);
  const secStats = readSecStats(cwd);

  // Agent utilization from verdicts.
  // Filter against canonical list of installed agents (~/.claude/agents/great_cto-*.md)
  // so a typo in a verdict line does not produce a phantom agent in the dashboard.
  //
  // Previously: non-canonical agents bucketed into `unknown` — which became
  // the TOP agent in production dashboards because legacy verdict log files
  // (backend.log, frontend.log, docs.log, ops.log, qa.log, security.log,
  // test-agent.log) from older great_cto versions were all aggregated there.
  // That hid real agent activity under a misleading label.
  //
  // Now: non-canonical agents are tracked separately (legacy_agent_runs)
  // and surfaced as a single summary count, NOT individually polluting the
  // agent-runs map. Users see honest specialist metrics + a cleanup hint.
  const canonicalAgents = getCanonicalAgents();
  const agentRuns = {};
  const legacyAgentRuns = {};
  for (const v of verdicts) {
    if (!v.agent) continue;
    if (canonicalAgents.has(v.agent)) {
      agentRuns[v.agent] = (agentRuns[v.agent] || 0) + 1;
    } else {
      legacyAgentRuns[v.agent] = (legacyAgentRuns[v.agent] || 0) + 1;
    }
  }
  const legacyAgentCount = Object.values(legacyAgentRuns).reduce((a, b) => a + b, 0);

  // Agent cost + time breakdown.
  //
  // Cost model derivation (LLM_RATE_PER_HR):
  //   Sonnet 4.6:  input $3/1M, output $15/1M.
  //     Typical agent task: ~30K in + 5K out → ~$0.165 per task.
  //     At 30 min/task → ~$0.33/hour.
  //   Haiku 4.5:   input $1/1M, output $5/1M.
  //     Same task shape → ~$0.055 → ~$0.11/hour.
  //   Mixed pipeline (architect Sonnet, qa Haiku, ...): ~$0.30/hour avg.
  //
  // Previous default of $0.02/hour produced an unbelievable 7500× ratio in
  // the UI. v2.5.9: realistic default $0.30/hour gives ~500× — still a
  // huge advantage, but defensible.
  //
  // Override via env var:
  //   GREATCTO_LLM_RATE_PER_HR=0.50   (e.g. all-Sonnet pipeline)
  //   GREATCTO_HUMAN_RATE_PER_HR=200  (e.g. SF senior engineer fully-loaded)
  //
  // When verdict logs contain real `cost=$X` tags, those override the
  // time-based estimate per agent (see "real cost overlay" loop below).
  const HUMAN_RATE_PER_HR = parseFloat(process.env.GREATCTO_HUMAN_RATE_PER_HR || '150');
  const LLM_RATE_PER_HR   = parseFloat(process.env.GREATCTO_LLM_RATE_PER_HR || '0.30');
  const DEFAULT_TASK_MIN  = 30;  // fallback when no timing data
  // Window: count only tasks closed in the last `days` (or still in progress).
  // Previously: lifetime — produced LLM-spend tile ($1749) wildly out of step
  // with the "Last 30 days" panel ($6.42) shown directly below it. Now both
  // sit on the same N-day window so the dashboard numbers reconcile.
  const costWindowMs = days * 86400_000;
  // AI active time per task: use estimated_minutes if set, else DEFAULT_TASK_MIN (30m).
  // We deliberately DO NOT use wall-clock (closed_at - created_at) because that
  // includes idle time — tasks that sit in backlog for days before being closed
  // in a single commit would inflate "AI time" to weeks/months. This is the only
  // honest model without per-agent-run timing data from verdicts.
  const agentCostMap = {};
  for (const t of tasks) {
    if (!t.agent) continue;
    if (t.closed_at && (now - new Date(t.closed_at).getTime()) > costWindowMs) continue;
    const mins = t.estimated_minutes || DEFAULT_TASK_MIN;
    const llmCost   = mins / 60 * LLM_RATE_PER_HR;
    const humanCost = mins / 60 * HUMAN_RATE_PER_HR;
    if (!agentCostMap[t.agent]) agentCostMap[t.agent] = { agent: t.agent, llm_usd: 0, human_usd: 0, time_min: 0, tasks_total: 0, tasks_done: 0, real_llm_usd: 0 };
    agentCostMap[t.agent].llm_usd   += llmCost;
    agentCostMap[t.agent].human_usd += humanCost;
    agentCostMap[t.agent].time_min  += mins;
    agentCostMap[t.agent].tasks_total += 1;
    if (t.status === 'done') agentCostMap[t.agent].tasks_done += 1;
  }
  // Real cost overlay — sum verdict cost=$X tags per agent. We expose this
  // as a separate field (`real_llm_usd`) for transparency, but DON'T
  // overwrite the time-based estimate. Reason: verdict data is often
  // synthetic test fixtures or partial (only some agents log cost), which
  // would distort the savings ratio with implausibly low numbers.
  //
  // Heuristic for trusted production verdicts (future): require >= 50%
  // of agent runs to have cost_usd, AND sum/time hourly rate >= $0.05/hr.
  // Until that's implemented, time-based estimate is the canonical number.
  // Window verdicts by timestamp — same window as agents_cost / tasks.
  // Without this, "AI spend" stayed at lifetime $93 even when period=7D
  // showed only 12 tasks worth ~$0.30 — making savings ratios nonsensical.
  for (const v of verdicts) {
    if (v.cost_usd == null) continue;
    if (!agentCostMap[v.agent]) continue;
    if (v.ts && (now - new Date(v.ts).getTime()) > costWindowMs) continue;
    agentCostMap[v.agent].real_llm_usd += v.cost_usd;
  }
  for (const a of Object.values(agentCostMap)) {
    a.cost_source = 'estimate';   // time-based is canonical
    if (a.real_llm_usd > 0) {
      a.real_llm_usd = Math.round(a.real_llm_usd * 10000) / 10000;
    } else {
      delete a.real_llm_usd;
    }
  }
  const agentsCost = Object.values(agentCostMap)
    .map(a => ({
      ...a,
      llm_usd:   Math.round(a.llm_usd   * 100) / 100,
      human_usd: Math.round(a.human_usd * 100) / 100,
      time_min:  Math.round(a.time_min),
    }))
    .sort((a, b) => b.time_min - a.time_min);

  // Cost source priority (v2.5.9 — flipped to put time-based estimate
  // before verdict-totals; verdict cost data is often synthetic test
  // fixtures or partial coverage, which produced unbelievable 25,000×
  // ratios in earlier versions):
  //
  //   1) PLAN-*.md files (real planned cost figures) — costData
  //   2) Task-based estimation (canonical — uses realistic $0.30/$150 rates)
  //   3) Verdict totals expose as `real_llm_usd` for transparency, NOT
  //      used as the headline number unless plans / tasks are absent
  const taskLlmTotal   = agentsCost.reduce((s, a) => s + a.llm_usd, 0);
  const taskHumanTotal = agentsCost.reduce((s, a) => s + a.human_usd, 0);
  // Filter verdicts to the same window for consistent total
  const verdictLlmTotal = verdicts.reduce((s, v) => {
    if (v.cost_usd == null) return s;
    if (v.ts && (now - new Date(v.ts).getTime()) > costWindowMs) return s;
    return s + v.cost_usd;
  }, 0);

  let cost;
  if (costData.llm_usd > 0 || costData.human_usd > 0) {
    cost = { ...costData, real_llm_usd: verdictLlmTotal > 0 ? Math.round(verdictLlmTotal * 10000) / 10000 : null };
  } else if (taskLlmTotal > 0) {
    // savings_x intentionally NULL for source='tasks': it would always equal
    // HUMAN_RATE_PER_HR / LLM_RATE_PER_HR (e.g. 500) because both legs share
    // the same task-minute base. That's the rate ratio, not measured savings —
    // putting it on a dashboard tile misleads. Only plans/verdicts have an
    // independent human number worth comparing.
    cost = {
      llm_usd:   Math.round(taskLlmTotal   * 100) / 100,
      human_usd: Math.round(taskHumanTotal),
      savings_x: null,
      rate_ratio: Math.round(HUMAN_RATE_PER_HR / LLM_RATE_PER_HR),
      window_days: 30,
      count:     0,
      source:    'tasks',
      real_llm_usd: verdictLlmTotal > 0 ? Math.round(verdictLlmTotal * 10000) / 10000 : null,
    };
  } else if (verdictLlmTotal > 0) {
    // Last-resort: no tasks, only verdict data. Pair with a token human
    // baseline (verdict count × DEFAULT_TASK_MIN × $150/hr) so the ratio
    // stays meaningful.
    const verdictHuman = verdicts.length * (30 / 60) * HUMAN_RATE_PER_HR;
    cost = {
      llm_usd:   Math.round(verdictLlmTotal * 100) / 100,
      human_usd: Math.round(verdictHuman),
      savings_x: Math.round(verdictHuman / verdictLlmTotal),
      count:     verdicts.filter(v => v.cost_usd != null).length,
      source:    'verdicts',
      real_llm_usd: Math.round(verdictLlmTotal * 10000) / 10000,
    };
  } else {
    cost = { llm_usd: 0, human_usd: 0, savings_x: 0, count: 0, source: 'none', real_llm_usd: null };
  }

  // Count tasks completed in selected window (for period-scoped reports)
  const doneInWindow = done.filter(t => t.closed_at && (now - new Date(t.closed_at).getTime()) <= costWindowMs);

  return {
    window_days: days,
    tasks: {
      total: tasks.length,
      done: done.length,
      done_in_window: doneInWindow.length,
      in_progress: inProgress.length,
      backlog: backlog.length,
    },
    // BH-22 fix: these are ROLLING windows (last 7 days, last 30 days from
    // 'now') — not calendar week/month. Old keys this_week/this_month are
    // kept for backward compat but the canonical names are last_7d/last_30d.
    velocity: {
      last_7d: doneThisWeek.length,
      last_30d: doneThisMonth.length,
      this_week: doneThisWeek.length,    // alias, deprecated — remove in v3.0
      this_month: doneThisMonth.length,  // alias, deprecated — remove in v3.0
    },
    avg_completion_min: Math.round(medianCompletionMs / 60000),
    cycle_time_stat: 'median_30d',
    cost,
    qa: qaStats,
    security: secStats,
    agents: agentRuns,
    agents_cost: agentsCost,
    legacy_agent_runs: legacyAgentRuns,
    legacy_agent_count: legacyAgentCount,
    verdicts: verdicts.slice(-20),
    recent_done: done.slice(-10).reverse(),
    // Observability counters (BH-13, 2026-05-15): surface internal queues
    // so users + monitoring can spot leaks / runaway state.
    server: {
      sse_clients: sseClients.size,
      bd_cache_entries: bdCache.size,
    },
  };
}

// Canonical list of installed agents from ~/.claude/agents/great_cto-*.md.
// Cached with a 30s TTL to avoid stat'ing on every metrics request.
let _canonicalAgentsCache = { agents: null, ts: 0 };
function getCanonicalAgents() {
  const now = Date.now();
  if (_canonicalAgentsCache.agents && now - _canonicalAgentsCache.ts < 30_000) {
    return _canonicalAgentsCache.agents;
  }
  const agentsDir = path.join(os.homedir(), '.claude', 'agents');
  const set = new Set();
  try {
    for (const f of fs.readdirSync(agentsDir)) {
      if (f.startsWith('great_cto-') && f.endsWith('.md')) {
        set.add(f.replace(/^great_cto-/, '').replace(/\.md$/, ''));
      }
    }
  } catch { /* dir missing — empty set is fine */ }
  _canonicalAgentsCache = { agents: set, ts: now };
  return set;
}

// ── Email alerts (Resend) ─────────────────────────────────────────────────
// Dispatch model: read webhooks.json on every fire (idempotent if disabled
// or no Resend hook configured). Each trigger has a dedupe key persisted to
// ~/.great_cto/alerts-fired.json so we don't email the same event twice.

const ALERTS_FIRED_PATH = path.join(GREAT_CTO_DIR, 'alerts-fired.json');

function readAlertsFired() {
  try { return JSON.parse(fs.readFileSync(ALERTS_FIRED_PATH, 'utf8')); } catch { return {}; }
}

function writeAlertsFired(map) {
  try {
    if (!fs.existsSync(GREAT_CTO_DIR)) fs.mkdirSync(GREAT_CTO_DIR, { recursive: true });
    fs.writeFileSync(ALERTS_FIRED_PATH, JSON.stringify(map, null, 2));
  } catch {/* best-effort */}
}

/**
 * Fire an email alert through the greatcto.systems/notify relay (Cloudflare
 * Worker → Resend). Idempotent per dedupeKey — same key won't email twice.
 *
 * Reads ~/.great_cto/notifications.json for the user's verified email + per-
 * trigger enable flags. Silent no-op if not configured / not verified / event
 * not in the user's selected triggers.
 *
 * @param {string} eventName   e.g. "incident.p0", "gate.stale"
 * @param {string} dedupeKey   unique per event instance (e.g. "great_cto:GC-42")
 * @param {object} payload     { title, body, level, project, link, action, kv }
 */
async function fireEmailAlert(eventName, dedupeKey, payload) {
  try {
    const stateFile = path.join(GREAT_CTO_DIR, 'notifications.json');
    if (!fs.existsSync(stateFile)) return;
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (!state.enabled || !state.verified || !state.to) return;
    if (!(state.triggers || []).includes(eventName)) return;

    // Dedupe — never email the same instance twice
    const fired = readAlertsFired();
    if (fired[dedupeKey]) return;

    const relay = process.env.GREATCTO_NOTIFY_URL || 'https://greatcto.systems';
    const res = await fetch(`${relay}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: state.to,
        title: payload.title,
        body: payload.body,
        level: payload.level || 'info',
        project: payload.project || 'great_cto',
        link: payload.link,
        action: payload.action,
        kv: payload.kv || {},
        event: eventName,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`fireEmailAlert ${eventName}: relay HTTP ${res.status} ${txt.slice(0, 200)}`);
      return;
    }

    // Mark fired (keep last 500 keys to avoid file bloat)
    fired[dedupeKey] = new Date().toISOString();
    const keys = Object.keys(fired);
    if (keys.length > 500) {
      const trimmed = {};
      keys.slice(-500).forEach(k => trimmed[k] = fired[k]);
      writeAlertsFired(trimmed);
    } else {
      writeAlertsFired(fired);
    }
    console.log(`fireEmailAlert: sent ${eventName} (${dedupeKey})`);
  } catch (e) {
    console.warn(`fireEmailAlert ${eventName} failed:`, e.message);
  }
}

/**
 * Fire Web Push notifications to all registered browser subscriptions.
 * Uses the same alerts-fired.json dedupe map as fireEmailAlert (keyed as
 * "push:<dedupeKey>") so a single event never sends duplicate pushes.
 * Expired subscriptions (HTTP 410) are removed automatically.
 */
async function firePushAlert(eventName, dedupeKey, payload) {
  try {
    const subs = loadSubscriptions(PUSH_SUBS_FILE);
    if (!subs.length) return;
    const vapidKeys = getVapidKeys(VAPID_KEYS_FILE);
    const fired = readAlertsFired();
    const pushKey = `push:${dedupeKey}`;
    if (fired[pushKey]) return;
    for (const sub of subs) {
      try { await sendWebPush(sub, vapidKeys, VAPID_SUBJECT); }
      catch (e) {
        // 410 = subscription expired — browser unsubscribed, clean up
        if (e.statusCode === 410) removeSubscription(PUSH_SUBS_FILE, sub.endpoint);
        else console.warn(`firePushAlert send failed for ${sub.endpoint}:`, e.message);
      }
    }
    fired[pushKey] = new Date().toISOString();
    writeAlertsFired(fired);
  } catch (e) { console.warn('firePushAlert failed:', e.message); }
}

// ── Cron: scan gates / cost / weekly digest ───────────────────────────────
// Runs every 5 minutes once the server boots. Each check is idempotent
// thanks to alerts-fired.json dedupe.
function startAlertCron() {
  const FIVE_MIN = 5 * 60 * 1000;
  const ONE_HOUR = 60 * 60 * 1000;

  // incident.p0: open P0 task with recent activity (last 24h).
  // Older P0s are existing backlog — surfacing them via email is spam.
  // If you want to be reminded about stale P0s, that's gate.stale's job.
  const RECENT_WINDOW_MS = 24 * 3600_000;
  setInterval(() => {
    try {
      const projects = listProjects();
      const now = Date.now();
      for (const proj of projects) {
        const tasks = getTasks(proj.path);
        const p0 = tasks.filter(t => {
          if (t.priority !== 0) return false;
          if (t.raw_status === 'closed' || t.raw_status === 'done') return false;
          const updatedTs = new Date(t.updated_at || t.created_at || 0).getTime();
          // Only fresh activity — silent on old backlog P0s
          return updatedTs > 0 && (now - updatedTs) < RECENT_WINDOW_MS;
        });
        for (const t of p0) {
          const dedupeKey = `incident.p0:${proj.slug}:${t.id}`;
          const p0Payload = {
            title: `P0 — ${t.title.slice(0, 70)} (${proj.slug})`,
            body: `A P0 incident is open and needs your attention.\n\n${t.description || ''}`.slice(0, 600),
            level: 'critical',
            project: proj.slug,
            link: `http://localhost:3141/?project=${encodeURIComponent(proj.slug)}&task=${encodeURIComponent(t.id)}#inbox`,
            action: 'Claim P0 in board',
            kv: {
              id: t.id,
              title: t.title.slice(0, 80),
              status: t.status,
              opened: t.created_at ? new Date(t.created_at).toISOString().slice(0, 16) : 'now',
            },
          };
          fireEmailAlert('incident.p0', dedupeKey, p0Payload);
          addNotification('incident.p0', p0Payload);
          firePushAlert('incident.p0', dedupeKey, p0Payload);
        }
      }
    } catch (e) { console.warn('cron incident.p0 failed:', e.message); }
  }, FIVE_MIN);

  // gate.blocked: new BLOCKED verdict from security-officer
  setInterval(() => {
    try {
      const verdicts = readVerdicts();
      const recent = verdicts.filter(v => {
        if (v.agent !== 'security-officer') return false;
        if (!isFailure(v.verdict) && !/BLOCKED/i.test(v.verdict || '')) return false;
        if (!v.ts) return false;
        return (Date.now() - new Date(v.ts).getTime()) < 24 * 3600_000;
      });
      for (const v of recent) {
        const dedupeKey = `gate.blocked:${v.ts}:${(v.task || v.reason || '').slice(0, 40)}`;
        const taskParam = v.task ? `&task=${encodeURIComponent(v.task)}` : '';
        const projParam = v.project ? `?project=${encodeURIComponent(v.project)}${taskParam}` : '';
        const blockedPayload = {
          title: `Security BLOCKED — ${(v.reason || v.task || 'unknown').slice(0, 70)}`,
          body: `security-officer rejected a gate. Review the verdict and address the finding before re-submitting.\n\nReason: ${v.reason || '(see verdicts log)'}`,
          level: 'error',
          project: v.project || 'great_cto',
          link: `http://localhost:3141/${projParam}#logs`,
          action: 'Review verdict',
          kv: {
            agent: v.agent,
            verdict: v.verdict,
            ts: v.ts,
            reason: (v.reason || '').slice(0, 120),
          },
        };
        fireEmailAlert('gate.blocked', dedupeKey, blockedPayload);
        addNotification('gate.blocked', blockedPayload);
        firePushAlert('gate.blocked', dedupeKey, blockedPayload);
      }
    } catch (e) { console.warn('cron gate.blocked failed:', e.message); }
  }, FIVE_MIN);

  // gate.stale: gate task open between 2h and 7 days.
  // Lower bound: 2h is the soonest you'd want a nudge.
  // Upper bound: gates open >7d are abandoned, not stale — don't keep nagging.
  setInterval(() => {
    try {
      const projects = listProjects();
      for (const proj of projects) {
        const tasks = getTasks(proj.path);
        const gates = tasks.filter(t => t.is_gate && t.raw_status !== 'closed' && t.raw_status !== 'blocked');
        for (const g of gates) {
          const created = new Date(g.created_at || g.updated_at || 0).getTime();
          const ageHr = (Date.now() - created) / 3600_000;
          if (ageHr < 2 || ageHr > 24 * 7) continue;
          const dedupeKey = `gate.stale:${proj.slug}:${g.id}`;
          const stalePayload = {
            title: `${proj.slug} — ${g.title.slice(0, 60)} pending ${ageHr.toFixed(1)}h`,
            body: `A gate has been waiting for your approval for ${ageHr.toFixed(1)} hours.\n\nGate: ${g.id}\nProject: ${proj.slug}`,
            level: 'warning',
            project: proj.slug,
            link: `http://localhost:3141/?project=${encodeURIComponent(proj.slug)}&task=${encodeURIComponent(g.id)}#inbox`,
            action: 'Approve in board',
            kv: { gate: g.id, agent: g.agent || 'unknown', age: `${ageHr.toFixed(1)}h` },
          };
          fireEmailAlert('gate.stale', dedupeKey, stalePayload);
          addNotification('gate.stale', stalePayload);
          firePushAlert('gate.stale', dedupeKey, stalePayload);
        }
      }
    } catch (e) { console.warn('cron gate.stale failed:', e.message); }
  }, FIVE_MIN);

  // cost.threshold: monthly LLM spend at 80% / 100% of budget
  setInterval(() => {
    try {
      const projects = listProjects();
      for (const proj of projects) {
        const m = getMetrics(proj.path);
        const meta = readProjectMd(proj.path) || {};
        const budget = parseFloat(meta['monthly-budget']?.replace?.(/[$\s]/g, '') || '0');
        if (!budget) continue;
        const spent = m.cost?.real_llm_usd || m.cost?.llm_usd || 0;
        const pct = (spent / budget) * 100;
        const month = new Date().toISOString().slice(0, 7);
        for (const threshold of [80, 100]) {
          if (pct < threshold) continue;
          const dedupeKey = `cost.threshold:${proj.slug}:${month}:${threshold}`;
          const costPayload = {
            title: `${proj.slug} — $${spent.toFixed(2)} LLM spend, ${pct.toFixed(0)}% of $${budget} monthly budget`,
            body: threshold === 100
              ? `Budget exceeded. Consider routing more agents to Haiku/Kimi or raising the cap in PROJECT.md.`
              : `Approaching budget limit. Review top-cost runs before crossing 100%.`,
            level: threshold === 100 ? 'critical' : 'warning',
            project: proj.slug,
            link: `http://localhost:3141/?project=${encodeURIComponent(proj.slug)}#dashboard`,
            action: 'Open cost dashboard',
            kv: {
              spent: `$${spent.toFixed(2)}`,
              budget: `$${budget}`,
              percent: `${pct.toFixed(0)}%`,
              month,
            },
          };
          fireEmailAlert('cost.threshold', dedupeKey, costPayload);
          addNotification('cost.threshold', costPayload);
          firePushAlert('cost.threshold', dedupeKey, costPayload);
        }
      }
    } catch (e) { console.warn('cron cost.threshold failed:', e.message); }
  }, ONE_HOUR);

  // digest.weekly: Friday 09:00 UTC ± server tick
  setInterval(() => {
    try {
      const now = new Date();
      // Friday = 5, hour 9, dedupe by ISO-week
      if (now.getUTCDay() !== 5 || now.getUTCHours() !== 9) return;
      const isoWeek = `${now.getUTCFullYear()}-W${Math.ceil((now.getUTCDate() + new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).getUTCDay()) / 7)}`;
      const projects = listProjects();
      for (const proj of projects) {
        const m = getMetrics(proj.path);
        const dedupeKey = `digest.weekly:${proj.slug}:${isoWeek}`;
        const weeklyPayload = {
          title: `${proj.slug} weekly — ${m.tasks?.done || 0} shipped, $${(m.cost?.llm_usd || 0).toFixed(2)} spent`,
          body: `Your week at a glance.`,
          level: 'info',
          project: proj.slug,
          link: `http://localhost:3141/?project=${encodeURIComponent(proj.slug)}#dashboard`,
          action: 'Open dashboard',
          kv: {
            'tasks shipped': String(m.tasks?.done || 0),
            'this week': `+${m.velocity?.this_week ?? 0}`,
            'LLM spend': `$${(m.cost?.llm_usd || 0).toFixed(2)}`,
            'human equiv': `$${(m.cost?.human_usd || 0).toFixed(0)}`,
            'savings_x': m.cost?.savings_x ? `${m.cost.savings_x}×` : '—',
            'QA pass rate': m.qa?.pass_rate != null ? `${m.qa.pass_rate}%` : 'no runs',
          },
        };
        fireEmailAlert('digest.weekly', dedupeKey, weeklyPayload);
        addNotification('digest.weekly', weeklyPayload);
        firePushAlert('digest.weekly', dedupeKey, weeklyPayload);
      }
    } catch (e) { console.warn('cron digest.weekly failed:', e.message); }
  }, FIVE_MIN);

  // digest.daily: morning summary (Mon–Fri, 08:00 UTC).
  // Covers yesterday's activity: spend, features shipped, blocked gates.
  // Idempotent via date-keyed dedupe so re-starts don't re-send.
  setInterval(() => {
    try {
      const now = new Date();
      // Mon=1 … Fri=5 only; skip weekends
      if (now.getUTCDay() === 0 || now.getUTCDay() === 6) return;
      if (now.getUTCHours() !== 8) return;
      const isoDay = now.toISOString().slice(0, 10);
      const yesterday = new Date(now.getTime() - 86400_000).toISOString().slice(0, 10);
      const projects = listProjects();
      for (const proj of projects) {
        const dedupeKey = `digest.daily:${proj.slug}:${isoDay}`;
        // Pull last 2 days so "yesterday" is always in the window
        const cost = getCostHistory(proj.path, 2);
        const yBucket = (cost.series || []).find(s => s.date === yesterday);
        const ySpend = yBucket ? yBucket.llm : 0;
        // Feature breakdown for yesterday
        const topFeatures = (cost.by_feature || []).slice(0, 3);
        // Inbox for blocked + gates
        const inbox = (() => { try { return getInbox(proj.path); } catch { return {}; } })();
        const blocked = inbox.summary?.blocked ?? 0;
        const gates = inbox.summary?.gates ?? 0;
        // Tasks closed yesterday
        const tasks = (() => { try { return getTasks(proj.path); } catch { return []; } })();
        const doneYesterday = tasks.filter(t => {
          if (!t.closed_at) return false;
          return t.closed_at.slice(0, 10) === yesterday;
        }).length;
        // Skip digest if nothing happened yesterday
        if (ySpend === 0 && doneYesterday === 0 && blocked === 0 && gates === 0) continue;
        const kvObj = {
          date: yesterday,
          'AI spend': `$${ySpend.toFixed(2)}`,
          'tasks shipped': String(doneYesterday),
          'blocked': String(blocked),
          'open gates': String(gates),
        };
        if (topFeatures.length > 0) {
          kvObj['top feature'] = `${topFeatures[0].feature} ($${topFeatures[0].llm.toFixed(2)})`;
        }
        const bodyLines = [
          `Yesterday: $${ySpend.toFixed(2)} AI spend · ${doneYesterday} task${doneYesterday !== 1 ? 's' : ''} shipped`,
        ];
        if (blocked > 0) bodyLines.push(`⚠️ ${blocked} blocked task${blocked !== 1 ? 's' : ''} need attention`);
        if (gates > 0) bodyLines.push(`🔒 ${gates} gate${gates !== 1 ? 's' : ''} awaiting approval`);
        if (topFeatures.length > 0) {
          bodyLines.push('', 'Top AI spend by feature:');
          for (const f of topFeatures) bodyLines.push(`  • ${f.feature}: $${f.llm.toFixed(2)}`);
        }
        const dailyPayload = {
          title: `${proj.slug} — ${yesterday} · $${ySpend.toFixed(2)} AI · ${doneYesterday} shipped`,
          body: bodyLines.join('\n'),
          level: blocked > 0 || gates > 0 ? 'warning' : 'info',
          project: proj.slug,
          link: `http://localhost:3141/?project=${encodeURIComponent(proj.slug)}#dashboard`,
          action: 'Open board',
          kv: kvObj,
        };
        fireEmailAlert('digest.daily', dedupeKey, dailyPayload);
        addNotification('digest.daily', dailyPayload);
        firePushAlert('digest.daily', dedupeKey, dailyPayload);
      }
    } catch (e) { console.warn('cron digest.daily failed:', e.message); }
  }, FIVE_MIN);

  // report.daily: republish share reports every day at 09:00 UTC
  setInterval(() => {
    try {
      const now = new Date();
      if (now.getUTCHours() !== 9) return;
      const isoDay = now.toISOString().slice(0, 10); // dedupe by date
      const projects = listProjects();
      for (const proj of projects) {
        const state = getShareState(proj.path);
        if (!state.enabled) continue;
        const dedupeKey = `report.daily:${proj.slug}:${isoDay}`;
        if (_reportRepublishDedupeSet.has(dedupeKey)) continue;
        _reportRepublishDedupeSet.add(dedupeKey);
        toggleShare(true, proj.path, true)
          .then(() => console.log(`report.daily: republished ${proj.slug}`))
          .catch(e => console.warn(`report.daily: ${proj.slug} failed: ${e.message}`));
      }
    } catch (e) { console.warn('cron report.daily failed:', e.message); }
  }, FIVE_MIN);

  console.log('Alert cron started: gate.stale (5min), cost.threshold (1h), digest.daily (Mon–Fri 08:00), digest.weekly (Fri 09:00), report.daily (09:00)');
}

function readVerdicts(cwd = null) {
  // Verdict attribution model:
  //   1. cwd given → read project-local <cwd>/.great_cto/verdicts/
  //      PLUS any global verdict line tagged `project=<slug>` matching cwd
  //   2. cwd absent (cron jobs, fleet view) → read ALL global verdicts
  //
  // Project slug resolution: PROJECT.md `slug:` field, else basename(cwd).
  let projectSlug = null;
  if (cwd) {
    try {
      const md = fs.readFileSync(path.join(cwd, '.great_cto', 'PROJECT.md'), 'utf8');
      const m = md.match(/^slug:\s*(.+)$/m);
      projectSlug = m ? m[1].trim() : path.basename(cwd);
    } catch { projectSlug = path.basename(cwd); }
  }
  // First read project-local verdicts when scoped
  const projectVerdictDir = cwd ? path.join(cwd, '.great_cto', 'verdicts') : null;
  const useProjectDir = projectVerdictDir
    && fs.existsSync(projectVerdictDir)
    && fs.readdirSync(projectVerdictDir).filter(f => f.endsWith('.log')).length > 0;
  // For cwd-scoped reads, we collect from BOTH local AND tagged global lines
  const verdictDirs = [];
  if (useProjectDir) verdictDirs.push(projectVerdictDir);
  if (!cwd) {
    // Unscoped: read everything global
    verdictDirs.push(path.join(GREAT_CTO_DIR, 'verdicts'));
  }
  const results = [];
  // For scoped reads, also iterate global and filter by project= tag
  const globalDir = path.join(GREAT_CTO_DIR, 'verdicts');
  if (cwd && projectSlug && fs.existsSync(globalDir)) {
    verdictDirs.push({ dir: globalDir, filterByProjectTag: projectSlug });
  }
  for (const entry of verdictDirs) {
    const verdictDir = typeof entry === 'string' ? entry : entry.dir;
    const projectTagFilter = typeof entry === 'string' ? null : entry.filterByProjectTag;
    if (!fs.existsSync(verdictDir)) continue;
    for (const file of fs.readdirSync(verdictDir)) {
    const agent = file.replace('.log', '');
    const lines = fs.readFileSync(path.join(verdictDir, file), 'utf8')
      .split('\n').filter(Boolean);
    for (const line of lines) {
      // When reading global with a project filter, only include lines tagged
      // with this project's slug.
      if (projectTagFilter) {
        const tagMatch = line.match(/\bproject=([^\s|]+)/);
        if (!tagMatch || tagMatch[1] !== projectTagFilter) continue;
      }
      // Two formats agents emit in the wild:
      //   space-separated:  "<ts> <verdict> <details> cost=$X"
      //   pipe-separated:   "<ts> | <agent> | <verdict> | <details> | cost=$X"
      // Pre-2026-05: parts[1] always took the 2nd whitespace token, which
      // for the pipe form is "|", breaking /api/pipeline status mapping
      // (verdicts displayed as "|" instead of APPROVED/DONE/BLOCKED).
      // Now we detect the pipe form and parse it differently.
      let ts, verdict;
      if (line.includes(' | ')) {
        const pipeParts = line.split('|').map(s => s.trim());
        ts = pipeParts[0].trim();
        // Pipe form: [ts, agent, verdict, details, cost]
        // Verdict is at index 2 (after ts and agent name).
        verdict = pipeParts[2] || '';
      } else {
        const parts = line.split(' ');
        ts = parts[0];
        verdict = parts[1] || '';
      }
      const costMatch = line.match(/\bcost=\$?(\d+\.?\d*)\b/i);
      results.push({
        ts,
        agent,
        verdict,
        cost_usd: costMatch ? parseFloat(costMatch[1]) : null,
        raw: line.replace(/\s*\bcost=\$?\d+\.?\d*\b/i, ''),
      });
    }
  }
  }  // end verdictDirs loop

  // Fallback: enrich verdicts that lack cost_usd from .great_cto/cost-history.log.
  // Format: "<ISO-ts> <agent> <cost_usd>" per line (written by scripts/log-verdict.sh).
  // Match by ts (minute precision) + agent to avoid double-counting.
  const histPath = path.join(GREAT_CTO_DIR, 'cost-history.log');
  if (fs.existsSync(histPath)) {
    const costByKey = new Map();
    const lines = fs.readFileSync(histPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      const m = line.match(/^(\S+)\s+(\S+)\s+(\d+\.?\d*)/);
      if (!m) continue;
      const key = `${m[1].slice(0, 16)}|${m[2]}`;  // minute + agent
      costByKey.set(key, parseFloat(m[3]));
    }
    for (const v of results) {
      if (v.cost_usd != null) continue;
      const key = `${(v.ts || '').slice(0, 16)}|${v.agent}`;
      if (costByKey.has(key)) v.cost_usd = costByKey.get(key);
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
    // BH-25: /g — replace() with a string only strips the FIRST comma, so
    // "$1,234,567" was silently truncated to 1234. getCostHistory at :413
    // already uses /,/g; this was the divergent twin.
    if (humanMatch) totalHumanUsd += parseFloat(humanMatch[1].replace(/,/g, ''));
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

// ── Agent fleet view (DESIGN-agents-fleet-view §3) ─────────────────────────
//
// Single source of truth for the /agents tab. Composes:
//   • canonical agent files at ~/.claude/agents/great_cto-*.md
//   • verdict log at ~/.great_cto/verdicts/<agent>.log
//   • retire sidecar at ~/.claude/agents/great_cto-<slug>.md.retired
//
// Domain taxonomy is slug-keyword based (founder Q#3 — picked: derived, not
// frontmatter, to avoid pipeline-wide migration). Founder may flip to
// frontmatter-driven later — encapsulated in this function only.

const AGENTS_DIR = path.join(os.homedir(), '.claude', 'agents');

function deriveDomain(slug) {
  const s = slug.toLowerCase();
  if (/architect|adr|design|prompt/.test(s)) return 'arch';
  if (/security|sec-|threat|pci|gdpr|hipaa/.test(s)) return 'security';
  if (/qa|test|eval|review/.test(s)) return 'qa';
  if (/devops|deploy|infra|l3|support|oncall/.test(s)) return 'ops';
  if (/reviewer$/.test(s)) return 'domain';
  if (/pm|plan|product/.test(s)) return 'pm';
  if (/learn|memory|continuous/.test(s)) return 'memory';
  return 'other';
}

// Founder Q#5 — picked: baked-in regex set (start small, expand later).
const FAILURE_PATTERNS = [
  { key: 'rate-limit',          re: /rate[ -]?limit|HTTP 429|too many requests/i },
  { key: 'precondition',        re: /BLOCKED:.*no\s+(ARCH|PLAN|PROJECT)/i },
  { key: 'timeout',             re: /timeout|timed out|exceeded.*window/i },
  { key: 'parse-fail',          re: /JSON\.parse|invalid_json|parse.*fail/i },
  { key: 'spawn-fail',          re: /spawn(Sync)?\b.*ENOENT|command not found/i },
];

function clusterFailureModes(verdicts) {
  const counts = new Map();
  for (const v of verdicts) {
    const text = v.raw || '';
    for (const p of FAILURE_PATTERNS) {
      if (p.re.test(text)) {
        const entry = counts.get(p.key) || { key: p.key, count: 0, last_seen: null };
        entry.count += 1;
        if (!entry.last_seen || v.ts > entry.last_seen) entry.last_seen = v.ts;
        counts.set(p.key, entry);
        break;
      }
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

function isRetired(slug) {
  return fs.existsSync(path.join(AGENTS_DIR, `great_cto-${slug}.md.retired`));
}

// Verdict status mapping — agents emit a mix of vocabularies:
//   APPROVED / OK / DONE / PASS → success
//   BLOCKED / FAIL / FAILED / REJECTED → failure
//   anything else → neutral
function isSuccess(verdict) {
  return /^(APPROVED|OK|DONE|PASS|PASSED)$/i.test(verdict || '');
}
function isFailure(verdict) {
  return /^(BLOCKED|FAIL|FAILED|REJECTED)$/i.test(verdict || '');
}

function getAgentsFleet() {
  const agents = [];
  let files = [];
  try {
    files = fs.readdirSync(AGENTS_DIR)
      .filter(f => f.startsWith('great_cto-') && f.endsWith('.md'))
      .sort();
  } catch { /* dir missing → empty fleet */ }

  const verdicts = readVerdicts();
  const now = Date.now();
  const day30Ms = 30 * 86400_000;
  const day7Ms = 7 * 86400_000;

  // Group verdicts by agent for one pass.
  const byAgent = new Map();
  for (const v of verdicts) {
    if (!v.agent) continue;
    if (!byAgent.has(v.agent)) byAgent.set(v.agent, []);
    byAgent.get(v.agent).push(v);
  }

  // Fleet metrics from getMetrics agents_cost (estimate-based).
  // Currently project-scoped; for fleet view we want global, so recompute
  // a quick aggregate. Time-based estimate using same rates as getMetrics.
  const HUMAN_RATE_PER_HR = parseFloat(process.env.GREATCTO_HUMAN_RATE_PER_HR || '150');
  const LLM_RATE_PER_HR   = parseFloat(process.env.GREATCTO_LLM_RATE_PER_HR || '0.30');
  const DEFAULT_TASK_MIN  = 30;

  for (const f of files) {
    const slug = f.replace(/^great_cto-/, '').replace(/\.md$/, '');
    const fp = path.join(AGENTS_DIR, f);
    const raw = readFileSafe(fp) || '';
    const descM = raw.match(/^description:\s*"?([^"\n]+)"?/m);
    const modelM = raw.match(/^model:\s*(\S+)/m);
    const colorM = raw.match(/^color:\s*(\S+)/m);

    const vs = byAgent.get(slug) || [];
    const vs30d = vs.filter(v => v.ts && (now - new Date(v.ts).getTime()) < day30Ms);
    const vs7d  = vs.filter(v => v.ts && (now - new Date(v.ts).getTime()) < day7Ms);

    const okCount30d   = vs30d.filter(v => isSuccess(v.verdict)).length;
    const failCount30d = vs30d.filter(v => isFailure(v.verdict)).length;
    const failCount7d  = vs7d.filter(v => isFailure(v.verdict)).length;
    const decided = okCount30d + failCount30d;
    const successRate = decided > 0 ? Math.round((okCount30d / decided) * 100) : null;

    const lastRun = vs[0]?.ts || null;  // verdicts already sorted by readVerdicts caller? if not, scan:
    let lastRunActual = null;
    for (const v of vs) {
      if (v.ts && (!lastRunActual || v.ts > lastRunActual)) lastRunActual = v.ts;
    }

    // Estimated cost — DEFAULT_TASK_MIN per verdict (no real timing data here).
    const estLlmUsd   = (vs30d.length * DEFAULT_TASK_MIN / 60) * LLM_RATE_PER_HR;
    const estHumanUsd = (vs30d.length * DEFAULT_TASK_MIN / 60) * HUMAN_RATE_PER_HR;
    const savingsX = estLlmUsd > 0 ? Math.round(estHumanUsd / estLlmUsd) : null;
    const realLlmUsd = vs30d.reduce((s, v) => s + (v.cost_usd || 0), 0);

    // Health classification.
    let health = 'ok';
    if (vs.length === 0) health = 'unused';
    else if (!lastRunActual || (now - new Date(lastRunActual).getTime()) > day30Ms) health = 'idle';
    if (failCount7d >= 3) health = 'failing';

    agents.push({
      slug,
      description: descM?.[1]?.trim() || '',
      model: modelM?.[1]?.trim() || 'sonnet',
      color: colorM?.[1]?.trim() || null,
      domain: deriveDomain(slug),
      runs_total: vs.length,
      runs_30d: vs30d.length,
      runs_7d: vs7d.length,
      fail_30d: failCount30d,
      fail_7d: failCount7d,
      ok_30d: okCount30d,
      success_rate: successRate,
      last_run: lastRunActual,
      llm_usd_30d_est: Math.round(estLlmUsd * 100) / 100,
      human_usd_30d_est: Math.round(estHumanUsd),
      llm_usd_30d_real: realLlmUsd > 0 ? Math.round(realLlmUsd * 100) / 100 : null,
      savings_x: savingsX,
      health,
      retired: isRetired(slug),
    });
  }

  // Summary tiles.
  const total = agents.length;
  const active30d = agents.filter(a => a.runs_30d > 0 && !a.retired).length;
  const retireCandidates = agents.filter(a => a.runs_30d === 0 && !a.retired).length;
  const failing = agents.filter(a => a.health === 'failing' && !a.retired).length;
  const totalLlm30d = agents.reduce((s, a) => s + (a.llm_usd_30d_est || 0), 0);

  return {
    agents,
    total,
    summary: {
      installed: total,
      active_30d: active30d,
      retire_candidates: retireCandidates,
      failing_7d: failing,
      llm_usd_30d: Math.round(totalLlm30d * 100) / 100,
    },
  };
}

function getAgentProfile(slug) {
  const fp = path.join(AGENTS_DIR, `great_cto-${slug}.md`);
  if (!fs.existsSync(fp)) return null;

  const raw = readFileSafe(fp) || '';
  const descM = raw.match(/^description:\s*"?([^"\n]+)"?/m);
  const modelM = raw.match(/^model:\s*(\S+)/m);
  const colorM = raw.match(/^color:\s*(\S+)/m);
  const appliesM = raw.match(/^applies_to:\s*\[([^\]]+)\]/m);
  const applies_to = appliesM
    ? appliesM[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean)
    : [];

  const verdicts = readVerdicts();
  const all = verdicts.filter(v => v.agent === slug);
  const now = Date.now();
  const day30Ms = 30 * 86400_000;
  const day7Ms = 7 * 86400_000;
  const vs30d = all.filter(v => v.ts && (now - new Date(v.ts).getTime()) < day30Ms);

  const okCount30d   = vs30d.filter(v => isSuccess(v.verdict)).length;
  const failCount30d = vs30d.filter(v => isFailure(v.verdict)).length;
  const failCount7d  = all.filter(v => v.ts
    && (now - new Date(v.ts).getTime()) < day7Ms
    && isFailure(v.verdict)).length;
  const decided = okCount30d + failCount30d;

  let lastRun = null;
  for (const v of all) {
    if (v.ts && (!lastRun || v.ts > lastRun)) lastRun = v.ts;
  }

  const HUMAN_RATE_PER_HR = parseFloat(process.env.GREATCTO_HUMAN_RATE_PER_HR || '150');
  const LLM_RATE_PER_HR   = parseFloat(process.env.GREATCTO_LLM_RATE_PER_HR || '0.30');
  const DEFAULT_TASK_MIN  = 30;
  const estLlmUsd   = (vs30d.length * DEFAULT_TASK_MIN / 60) * LLM_RATE_PER_HR;
  const estHumanUsd = (vs30d.length * DEFAULT_TASK_MIN / 60) * HUMAN_RATE_PER_HR;
  const realLlmUsd = vs30d.reduce((s, v) => s + (v.cost_usd || 0), 0);

  // Recent runs — last 20, newest first.
  const recent = [...all]
    .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
    .slice(0, 20)
    .map(v => ({
      ts: v.ts,
      verdict: v.verdict,
      cost_usd: v.cost_usd,
      raw: (v.raw || '').slice(0, 200),
    }));

  // Failure modes — regex-cluster verdicts that look like failures.
  const failures = all.filter(v => isFailure(v.verdict));
  const failure_modes = clusterFailureModes(failures);

  let health = 'ok';
  if (all.length === 0) health = 'unused';
  else if (!lastRun || (now - new Date(lastRun).getTime()) > day30Ms) health = 'idle';
  if (failCount7d >= 3) health = 'failing';

  return {
    slug,
    description: descM?.[1]?.trim() || '',
    model: modelM?.[1]?.trim() || 'sonnet',
    color: colorM?.[1]?.trim() || null,
    applies_to,
    domain: deriveDomain(slug),
    health,
    retired: isRetired(slug),
    runs_total: all.length,
    runs_30d: vs30d.length,
    ok_30d: okCount30d,
    fail_30d: failCount30d,
    success_rate: decided > 0 ? Math.round((okCount30d / decided) * 100) : null,
    last_run: lastRun,
    llm_usd_30d_est: Math.round(estLlmUsd * 100) / 100,
    human_usd_30d_est: Math.round(estHumanUsd),
    llm_usd_30d_real: realLlmUsd > 0 ? Math.round(realLlmUsd * 100) / 100 : null,
    savings_x: estLlmUsd > 0 ? Math.round(estHumanUsd / estLlmUsd) : null,
    recent_runs: recent,
    failure_modes,
    file_path: fp,
  };
}

function retireAgent(slug) {
  const fp = path.join(AGENTS_DIR, `great_cto-${slug}.md`);
  if (!fs.existsSync(fp)) return { ok: false, error: 'agent_not_found' };
  const marker = `${fp}.retired`;
  fs.writeFileSync(marker, new Date().toISOString() + '\n');
  return { ok: true, slug, retired_at: new Date().toISOString() };
}

function restoreAgent(slug) {
  const fp = path.join(AGENTS_DIR, `great_cto-${slug}.md`);
  if (!fs.existsSync(fp)) return { ok: false, error: 'agent_not_found' };
  const marker = `${fp}.retired`;
  if (fs.existsSync(marker)) fs.unlinkSync(marker);
  return { ok: true, slug, restored_at: new Date().toISOString() };
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
    const html = generateShareHTML(getTasks(cwd), getMetrics(cwd, 36500), cwd);
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
  // BH-22: substitute {{PAUSED}} before publish. The worker can still flip
  // the stored pause flag independently via POST /r/<hash> {enabled:false}
  // from toggleShare, but the published HTML must be valid on its own —
  // shipping `const paused = {{PAUSED}};` literal triggers a SyntaxError
  // and blanks the entire report if the worker forgets to post-process.
  return shareTemplate
    .replaceAll('{{PROJECT}}', projectName)
    .replaceAll('{{DATE}}', date)
    .replaceAll('{{METRICS_JSON}}', JSON.stringify(metrics))
    .replaceAll('{{TASKS_JSON}}', JSON.stringify(done.slice(-20)))
    .replaceAll('{{PAUSED}}', 'false');
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
  // BH-5 fix: surface project resolution as a response header. Previously
  // ?project=<unknown> silently returned cwd's data — user thought they
  // were viewing projectX but saw projectY. Now: X-Project-Fallback header
  // tells the client what happened.
  const projInfo = resolveProjectInfo(proj);
  const cwd = projInfo.cwd;
  if (projInfo.resolved === 'fallback') {
    res.setHeader('X-Project-Fallback', `requested='${projInfo.requested}' served='cwd'`);
    res.setHeader('X-Project-Resolved', 'fallback');
  } else {
    res.setHeader('X-Project-Resolved', projInfo.resolved);
  }

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Expose our debug headers to browsers (CORS hides custom headers by default)
  res.setHeader('Access-Control-Expose-Headers', 'X-Project-Fallback, X-Project-Resolved');

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
  //
  // BH-23 (Security): this endpoint creates files + registers projects, so
  // it MUST reject cross-origin requests. The board listens on 127.0.0.1
  // but a malicious page the user visits can still issue text/plain POSTs
  // (simple CORS request — no preflight) to localhost. Two gates:
  //   1) Origin / Referer must match http://localhost:PORT or 127.0.0.1:PORT.
  //   2) Resolved target path must live inside HOME — no /tmp, no /etc.
  if (pathname === '/api/projects/register' && req.method === 'POST') {
    const origin = req.headers.origin || req.headers.referer || '';
    const expectedOrigin = `http://localhost:${PORT}`;
    const expectedOrigin2 = `http://127.0.0.1:${PORT}`;
    const originOk = !origin
      || origin === expectedOrigin
      || origin === expectedOrigin2
      || origin.startsWith(expectedOrigin + '/')
      || origin.startsWith(expectedOrigin2 + '/');
    if (!originOk) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'origin not allowed' }));
    }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { path: projPath } = JSON.parse(body || '{}');
        if (!projPath || typeof projPath !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'path missing' }));
        }
        const resolved = path.resolve(projPath);
        const home = os.homedir();
        if (!resolved.startsWith(home + path.sep) && resolved !== home) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'path must live inside HOME' }));
        }
        if (!fs.existsSync(resolved)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'path does not exist' }));
        }
        const greatCtoDir = path.join(resolved, '.great_cto');
        const projectMd = path.join(greatCtoDir, 'PROJECT.md');
        if (!fs.existsSync(projectMd)) {
          fs.mkdirSync(greatCtoDir, { recursive: true });
          fs.writeFileSync(projectMd, `# PROJECT — ${path.basename(resolved)}\n\nname: ${path.basename(resolved)}\narchetype: unknown\nphase: discovery\n`);
        }
        autoRegisterProject(resolved);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: resolved, slug: path.basename(resolved) }));
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
    let days = parseInt(url.searchParams.get('days') || '30', 10);
    if (!Number.isFinite(days) || days < 1) days = 30;
    if (days > 365) days = 365;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(getMetrics(cwd, days)));
    return;
  }

  // ── /api/notifications — email alerts via greatcto.systems/notify relay ──
  // No API keys to manage — user enters only their email + verifies via
  // 6-digit code sent by our Cloudflare Worker. The Worker rate-limits to
  // 100 emails/24h per verified email.
  //
  // Local state in ~/.great_cto/notifications.json:
  //   { "to": "user@example.com", "verified": true, "enabled": true,
  //     "triggers": ["incident.p0", ...] }
  if (pathname === '/api/notifications') {
    const NOTIFY_RELAY = process.env.GREATCTO_NOTIFY_URL || 'https://greatcto.systems';
    const stateFile = path.join(GREAT_CTO_DIR, 'notifications.json');
    const KNOWN_TRIGGERS = ['incident.p0', 'gate.stale', 'gate.blocked', 'cost.threshold', 'digest.weekly'];
    let state = { to: '', verified: false, enabled: false, triggers: [] };
    try { Object.assign(state, JSON.parse(fs.readFileSync(stateFile, 'utf8'))); } catch {}

    function saveState() {
      if (!fs.existsSync(GREAT_CTO_DIR)) fs.mkdirSync(GREAT_CTO_DIR, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    }

    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        to: state.to || '',
        verified: !!state.verified,
        enabled: !!state.enabled,
        triggers: state.triggers || [],
        known_triggers: KNOWN_TRIGGERS,
        relay: NOTIFY_RELAY,
      }));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        let parsed;
        try { parsed = JSON.parse(body || '{}'); }
        catch {
          res.writeHead(400); return res.end(JSON.stringify({ error: 'invalid_json' }));
        }
        const action = parsed.action || 'save';

        // ── verify: ask the worker to send a 6-digit code to <to> ──
        if (action === 'verify') {
          const to = String(parsed.to || '').trim().toLowerCase();
          if (!to) { res.writeHead(400); return res.end(JSON.stringify({ error: 'to_required' })); }
          try {
            const r = await fetch(`${NOTIFY_RELAY}/notify/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to }),
            });
            const j = await r.json().catch(() => null);
            // Persist email (still unverified) so the UI can show the pending state
            state.to = to;
            state.verified = false;
            saveState();
            res.writeHead(r.ok ? 200 : (r.status || 502), { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(j || { error: 'relay_unreachable' }));
          } catch (e) {
            res.writeHead(502); return res.end(JSON.stringify({ error: e.message }));
          }
        }

        // ── confirm: send the user-typed code to the worker, mark verified on 200 ──
        if (action === 'confirm') {
          const to = String(parsed.to || state.to || '').trim().toLowerCase();
          const code = String(parsed.code || '').trim();
          if (!to)   { res.writeHead(400); return res.end(JSON.stringify({ error: 'to_required' })); }
          if (!code) { res.writeHead(400); return res.end(JSON.stringify({ error: 'code_required' })); }
          try {
            const r = await fetch(`${NOTIFY_RELAY}/notify/confirm`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to, code }),
            });
            const j = await r.json().catch(() => null);
            if (r.ok) {
              state.to = to;
              state.verified = true;
              saveState();
            }
            res.writeHead(r.ok ? 200 : (r.status || 502), { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(j || { error: 'relay_unreachable' }));
          } catch (e) {
            res.writeHead(502); return res.end(JSON.stringify({ error: e.message }));
          }
        }

        // ── save: persist triggers + enabled flag locally ──
        if (action === 'save') {
          const triggers = Array.isArray(parsed.triggers)
            ? parsed.triggers.filter(t => KNOWN_TRIGGERS.includes(t))
            : (state.triggers || []);
          state.triggers = triggers;
          if (parsed.enabled != null) state.enabled = !!parsed.enabled;
          saveState();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, verified: state.verified, enabled: state.enabled }));
        }

        // ── test: fire a synthetic alert through the relay ──
        if (action === 'test') {
          if (!state.verified || !state.to) {
            res.writeHead(400); return res.end(JSON.stringify({ error: 'verify_first' }));
          }
          try {
            const r = await fetch(`${NOTIFY_RELAY}/notify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: state.to,
                title: '🧪 GreatCTO test alert',
                body: 'If you see this, the email alert pipeline is working end-to-end (board → Cloudflare worker → Resend → inbox).',
                level: 'info',
                project: 'great_cto',
                link: 'http://localhost:3141/#notifications',
                action: 'Open Notifications tab',
                kv: { test: 'ok', sent_at: new Date().toISOString() },
                event: 'test',
              }),
            });
            const j = await r.json().catch(() => null);
            res.writeHead(r.ok ? 200 : (r.status || 502), { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: r.ok, response: j }));
          } catch (e) {
            res.writeHead(502); return res.end(JSON.stringify({ error: e.message }));
          }
        }

        res.writeHead(400); return res.end(JSON.stringify({ error: 'unknown_action' }));
      });
      return;
    }
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
        // BH-24: malformed JSON used to throw inside the async handler,
        // turning into an unhandled rejection and hanging the request.
        // Sibling endpoints (/status, /priority, /gates) were fixed in
        // PR #40 (BH-14); /api/share was missed.
        let parsed;
        try { parsed = JSON.parse(body || '{}'); }
        catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'invalid_json' }));
        }
        try {
          const state = await toggleShare(parsed.enabled, cwd, !!parsed.force);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(state));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  // Gate approval / rejection
  if (pathname.startsWith('/api/gates/') && req.method === 'POST') {
    const id = pathname.replace('/api/gates/', '');
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      // BH-14a: catch JSON parse error explicitly → 400 (was 500/uncaught)
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_json', message: String(e.message || e) }));
        return;
      }
      const { action, reason } = parsed;
      const gateCwd = parsed.project ? resolveProjectCwd(parsed.project) : cwd;
      if (!['approve', 'reject'].includes(action)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid action' }));
        return;
      }
      const beadsErr = checkBeadsAvailable(gateCwd);
      if (beadsErr) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(beadsErr));
        return;
      }
      // BH-16 fix: serialise gate writes through bd-write queue.
      // Without this, concurrent approve+reject on the same gate produced
      // TWO appendDecisionLog entries (one wrong) — log says approved AND
      // rejected. bdWriteSerialised guarantees one-at-a-time semantics.
      const result = await bdWriteSerialised(() => {
        const status = action === 'approve' ? 'closed' : 'blocked';
        const args = ['update', id, '--status', status];
        if (reason) args.push('--notes', `[${action}] ${reason}`);
        const r = spawnSync('bd', args, { cwd: gateCwd, encoding: 'utf8', timeout: 5000 });
        if (r.status !== 0) return { error: r.stderr || 'bd update failed' };
        bdCacheInvalidate(gateCwd);
        // Append to global decisions log — still inside the lock window
        try {
          const projectSlug = parsed.project || path.basename(gateCwd);
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
        } catch { /* best-effort */ }
        return { ok: true };
      });
      if (!result || result.error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (result && result.error) || 'bd update failed' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id, action }));
      broadcastTasks(cwd);
      // Auto-republish share report when a gate is approved (fire-and-forget)
      if (action === 'approve') {
        const shareState = getShareState(gateCwd);
        if (shareState.enabled) {
          toggleShare(true, gateCwd, true)
            .then(() => console.log(`report: auto-republished after gate approve (${id})`))
            .catch(e => console.warn(`report: republish after gate failed: ${e.message}`));
        }
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
    // Clamp `limit` to [1, 200]. Same defensive pattern as /api/cost?days
    // — handle ?limit=abc / ?limit=0 / ?limit=-5 / ?limit=999 deterministically.
    const rawLimit = url.searchParams.get('limit');
    const parsed = rawLimit != null ? parseInt(rawLimit, 10) : 20;
    const limit = Number.isFinite(parsed) && parsed > 0
      ? Math.min(parsed, 200)
      : 20;
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

  // Cost history — daily LLM burn over N days.
  // Clamp `days` to [1, 365] to defend against:
  //   ?days=abc       → NaN → default 30 (parseInt fallback to 30)
  //   ?days=999       → 1000-bucket response (memory + payload bloat)
  //   ?days=-5        → empty series, daily_avg = null in UI
  //   ?days=0         → division-by-zero in daily_avg calc
  // 365 is enough for "last year" views; anything bigger should use
  // a different endpoint / batch query path.
  if (pathname === '/api/cost') {
    const rawDays = url.searchParams.get('days');
    const parsed = rawDays != null ? parseInt(rawDays, 10) : 30;
    const days = Number.isFinite(parsed) && parsed > 0
      ? Math.min(parsed, 365)
      : 30;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(getCostHistory(cwd, days)));
    return;
  }

  // ── /api/leash ────────────────────────────────────────────────────────────
  // Façade over llm-leash v2.27+ (https://github.com/avelikiy/llm-leash):
  //   GET  /api/leash/status                — installation + budget snapshot
  //   GET  /api/leash/audit?limit=N&since=  — tail audit JSONL
  //   GET  /api/leash/hitl                  — pending HITL items (admin API)
  //   POST /api/leash/kill                  — fire kill switch (board UI button)
  //   POST /api/leash/hitl/:id/:decision    — approve|reject pending item
  //   GET  /api/leash/rate-limits           — rate-limit config + counters (v2.27+)
  //   GET  /api/leash/per-tenant-status     — tenant cap status (native v2.27 or local)
  // Every endpoint degrades gracefully if leash isn't installed.
  // Admin endpoints use LEASH_ADMIN_TOKEN (or admin_token in leash.json) when set.

  // Aggregator — leash + pre-push hook + secret-scan hook
  if (pathname === '/api/security') {
    try {
      // ?project=<slug>  filter to one tenant
      // ?project=all     no filter (system-admin "all projects")
      // omitted          fall back to project of cwd
      const projectParam = url.searchParams.get('project');
      const tenant = (typeof projectParam === 'string')
        ? (projectParam === 'all' || projectParam === '*' ? null : projectParam)
        : undefined;   // undefined → adapter resolves from cwd
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getSecurityStatus(cwd, tenant)));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  // Toggle leash on/off — fully turns the firewall on or off:
  //   1. Persists `enabled` field in ~/.great_cto/leash.json
  //   2. If enabled=true  → starts the HTTP proxy in the background
  //      If enabled=false → SIGTERM-stops the running proxy
  // Body: { "enabled": true|false }
  // Returns: { ok, enabled, proxy: {running, pid, ...} }
  if (pathname === '/api/leash/toggle' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const { enabled } = JSON.parse(body || '{}');
        if (typeof enabled !== 'boolean') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'enabled (boolean) required' }));
          return;
        }
        // 1. Persist config
        const cfgPath = path.join(os.homedir(), '.great_cto', 'leash.json');
        fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
        let cfg = {};
        try { if (fs.existsSync(cfgPath)) cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); }
        catch { cfg = {}; }
        cfg.enabled = enabled;
        fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

        // 2. Drive the proxy lifecycle
        const action = enabled ? startProxy(cfg) : stopProxy(cfg);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: action.ok !== false,
          enabled,
          proxy: { ...isProxyRunning(cfg), action },
        }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e) }));
      }
    });
    return;
  }

  // Trigger `great-cto leash update` — git pull + pip reinstall. Synchronous
  // (we wait), so the UI can show before/after SHA. Caps at 5 minutes.
  if (pathname === '/api/leash/update' && req.method === 'POST') {
    try {
      const installRoot = path.join(os.homedir(), '.great_cto', 'llm-leash');
      if (!fs.existsSync(installRoot)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'llm-leash not installed' }));
        return;
      }
      const before = spawnSync('git', ['-C', installRoot, 'rev-parse', '--short', 'HEAD'], {
        stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
      }).stdout?.toString().trim();
      const pull = spawnSync('git', ['-C', installRoot, 'pull', '--ff-only', 'origin', 'main'], {
        stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000,
      });
      if (pull.status !== 0) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'git pull failed', detail: pull.stderr?.toString() }));
        return;
      }
      const after = spawnSync('git', ['-C', installRoot, 'rev-parse', '--short', 'HEAD'], {
        stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
      }).stdout?.toString().trim();
      // pip reinstall only if SHA moved (saves ~10 s on no-op updates)
      let pip_ok = true;
      if (before !== after) {
        const pip = spawnSync('python3', ['-m', 'pip', 'install', '-e', installRoot, '--upgrade', '--quiet'], {
          stdio: ['ignore', 'pipe', 'pipe'], timeout: 240_000,
        });
        pip_ok = pip.status === 0;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, before, after, changed: before !== after, pip_ok }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }

  // Proxy through to the leash console's /api/stats. Returns the canonical
  // /admin/stats shape: active_sessions, total_spend_usd, top_sessions[],
  // hitl_pending, hitl_backend, policy_rules, pii_redactor_enabled.
  if (pathname === '/api/leash/console-stats') {
    try {
      const cfg = readLeashConfig(cwd);
      const consoleUrl = cfg.console_url || 'http://localhost:8801';
      const upstream = await fetch(consoleUrl.replace(/\/$/, '') + '/api/stats', {
        signal: AbortSignal.timeout(3000),
      }).then((r) => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...upstream }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
    }
    return;
  }

  // Operator feedback loop (leash v2.22):
  //   /api/feedback/rules?period=7d → per-rule FP-rate from HITL decisions.
  // We forward `?period=` straight through; ?project= is informational only —
  // upstream aggregates across all tenants, the UI filters client-side.
  if (pathname === '/api/leash/feedback') {
    try {
      const cfg = readLeashConfig(cwd);
      const consoleUrl = cfg.console_url || 'http://localhost:8801';
      const period = url.searchParams.get('period') || '7d';
      const upstream = await fetch(`${consoleUrl.replace(/\/$/, '')}/api/feedback/rules?period=${encodeURIComponent(period)}`, {
        signal: AbortSignal.timeout(3000),
      }).then((r) => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...upstream }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
    }
    return;
  }

  // Continuous-eval drift status (leash v2.23):
  //   /api/eval/status?drift_threshold=0.05 → per-rule F1 vs 7-day baseline.
  // Per-agent canonical aggregation (leash v2.14):
  //   GET /api/leash/agents?period=24h&project=<slug>
  // Upstream /api/agents has NO tenant filter — it aggregates across all
  // sessions on the proxy. When the caller scopes to a tenant we intersect
  // with the agents observed in our audit window for that tenant_id.
  //
  // Compared to the previous client-side aggregation in renderLeashPerAgent
  // this surfaces three extra fields (first_seen / last_seen / current_cap_usd)
  // and scales to large audit logs because the heavy lifting is on leash.
  if (pathname === '/api/leash/agents') {
    try {
      const cfg = readLeashConfig(cwd);
      const consoleUrl = cfg.console_url || 'http://localhost:8801';
      const period = url.searchParams.get('period') || '24h';
      const tenant = resolveProjectParam(url, cwd);
      const upstream = await fetch(`${consoleUrl.replace(/\/$/, '')}/api/agents?period=${encodeURIComponent(period)}`, {
        signal: AbortSignal.timeout(3000),
      }).then((r) => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)));

      let agents = Array.isArray(upstream.agents) ? upstream.agents : [];
      let observed = [];
      if (tenant) {
        const periodSecs = { '5m': 300, '15m': 900, '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800, '30d': 2592000, 'all': null }[period] ?? 86400;
        const sinceMs = periodSecs ? Date.now() - periodSecs * 1000 : 0;
        const records = readLeashAudit(cwd, 5000, sinceMs, tenant);
        // Tally per-agent from this tenant's audit slice so we can synthesise
        // rows for agents that have called THIS project but not yet appeared
        // in the proxy's global state (e.g. just-seeded test fixtures, or
        // agents whose previous calls used a different tenant header).
        const tally = new Map();
        for (const r of records) {
          const name = r.agent_name || r.agent || r.actor;
          if (!name) continue;
          if (!tally.has(name)) tally.set(name, { calls: 0, cost: 0, first: r.ts, last: r.ts });
          const t = tally.get(name);
          t.calls += 1;
          if (typeof r.cost_usd === 'number') t.cost += r.cost_usd;
          if (r.ts && r.ts < t.first) t.first = r.ts;
          if (r.ts && r.ts > t.last) t.last = r.ts;
        }
        observed = [...tally.keys()].sort();

        // Union: tenant-observed audit rows + global proxy state. Prefer the
        // proxy-state numbers when both exist (canonical), otherwise project
        // the audit-derived counts so the row still appears.
        const upstreamByName = Object.fromEntries(agents.map((a) => [a.name, a]));
        const merged = [];
        for (const name of observed) {
          const u = upstreamByName[name];
          const t = tally.get(name);
          merged.push(u
            ? { ...u, calls: u.calls ?? t.calls, cost_usd: u.cost_usd ?? Number(t.cost.toFixed(6)) }
            : {
                name,
                calls: t.calls,
                cost_usd: Number(t.cost.toFixed(6)),
                first_seen: t.first,
                last_seen: t.last,
                current_cap_usd: null,
              });
        }
        agents = merged.sort((a, b) => (b.cost_usd || 0) - (a.cost_usd || 0));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        period,
        tenant_filter: tenant,
        agents,
        observed_agents: observed,
        all_count: (upstream.agents || []).length,
      }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
    }
    return;
  }

  if (pathname === '/api/leash/eval-status') {
    try {
      const cfg = readLeashConfig(cwd);
      const consoleUrl = cfg.console_url || 'http://localhost:8801';
      const threshold = url.searchParams.get('drift_threshold') || '0.05';
      const upstream = await fetch(`${consoleUrl.replace(/\/$/, '')}/api/eval/status?drift_threshold=${encodeURIComponent(threshold)}`, {
        signal: AbortSignal.timeout(3000),
      }).then((r) => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...upstream }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
    }
    return;
  }

  // GET /api/leash/rate-limits — proxy to leash v2.27+ /admin/rate-limits
  if (pathname === '/api/leash/rate-limits' && req.method === 'GET') {
    try {
      const { readLeashRateLimits } = await import('./leash-adapter.mjs');
      const data = await readLeashRateLimits(cwd);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: data !== null, data: data || null }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e?.message || e), data: null }));
    }
    return;
  }

  // ── Per-tenant caps (local workaround + native v2.27 fallback) ──
  // GET  /api/leash/per-tenant-caps           list configured caps (no spend lookup)
  // GET  /api/leash/per-tenant-status         caps + spend + lock state; may fire pause
  // POST /api/leash/per-tenant-caps/:tenant   {cap_usd: N|null}
  // POST /api/leash/per-tenant-unlock/:tenant clear a stuck lock
  if (pathname === '/api/leash/per-tenant-caps' && req.method === 'GET') {
    const { listCaps } = await import('./per-tenant-caps.mjs');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ caps: listCaps() }));
    return;
  }

  if (pathname === '/api/leash/per-tenant-status' && req.method === 'GET') {
    try {
      const { getStatusWithNativeFallback } = await import('./per-tenant-caps.mjs');
      const enforce = url.searchParams.get('enforce') !== '0';
      const payload = await getStatusWithNativeFallback(cwd, enforce);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...payload }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
    }
    return;
  }

  {
    const m = pathname.match(/^\/api\/leash\/per-tenant-caps\/([^/]+)$/);
    if (m && req.method === 'POST') {
      const [, tenant] = m;
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', async () => {
        try {
          const { setCap } = await import('./per-tenant-caps.mjs');
          const parsed = JSON.parse(body || '{}');
          const result = setCap(tenant, parsed.cap_usd);
          res.writeHead(result ? 200 : 500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: !!result, caps: result }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
        }
      });
      return;
    }
  }

  {
    const m = pathname.match(/^\/api\/leash\/per-tenant-unlock\/([^/]+)$/);
    if (m && req.method === 'POST') {
      const [, tenant] = m;
      try {
        const { clearLock } = await import('./per-tenant-caps.mjs');
        clearLock(tenant);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, tenant }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
      }
      return;
    }
  }

  if (pathname === '/api/leash/status') {
    try {
      const tenant = resolveProjectParam(url, cwd);
      const avail = getLeashAvailability(cwd);
      const state = avail.available ? readLeashState(cwd, tenant) : null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...avail, state, tenant_filter: tenant }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ available: false, error: String(e) }));
    }
    return;
  }

  if (pathname === '/api/leash/audit') {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1000);
    const sinceMs = parseInt(url.searchParams.get('since') || '0', 10) || 0;
    const tenant = resolveProjectParam(url, cwd);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ records: readLeashAudit(cwd, limit, sinceMs, tenant), tenant_filter: tenant }));
    return;
  }

  if (pathname === '/api/leash/hitl' && req.method === 'GET') {
    const tenant = resolveProjectParam(url, cwd);
    readHitlPending(cwd, tenant)
      .then((items) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items, tenant_filter: tenant }));
      })
      .catch((e) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: [], error: String(e), tenant_filter: tenant }));
      });
    return;
  }

  if (pathname === '/api/leash/kill' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let reason = 'board-ui';
      let sessionId = null;
      try {
        const j = JSON.parse(body || '{}');
        reason = j.reason || reason;
        sessionId = j.session_id || null;
      } catch { /* ignore */ }
      const result = fireKillSwitch(cwd, reason, sessionId);
      res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    return;
  }

  // GET  /api/leash/budgets — proxy to leash console /api/budgets (caps editor)
  // POST /api/leash/budgets/:agent  body {cap_usd: number|null}
  if (pathname === '/api/leash/budgets' && req.method === 'GET') {
    try {
      const cfg = readLeashConfig(cwd);
      const consoleUrl = cfg.console_url || 'http://localhost:8801';
      const up = await fetch(consoleUrl.replace(/\/$/, '') + '/api/budgets', { signal: AbortSignal.timeout(3000) })
        .then((r) => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)));
      // Leash admin /admin/budget is a single-machine global state — caps
      // live there regardless of which project asked. When the caller scopes
      // to a project (?project=<slug>, default = cwd tenant) we filter the
      // returned per_agent_caps to agents that have actually called the
      // proxy with that tenant_id in the audit log. ?project=all returns
      // the unfiltered global list.
      const tenant = resolveProjectParam(url, cwd);
      let perAgentCaps = up.per_agent_caps || {};
      let observedAgents = [];
      if (tenant) {
        // Scan a generous audit window so even rarely-used agents surface.
        const records = readLeashAudit(cwd, 5000, 0, tenant);
        const seen = new Set();
        for (const r of records) {
          const name = r.agent_name || r.agent || r.actor;
          if (name) seen.add(name);
        }
        observedAgents = [...seen].sort();
        const filtered = {};
        for (const [name, cap] of Object.entries(perAgentCaps)) {
          if (seen.has(name)) filtered[name] = cap;
        }
        perAgentCaps = filtered;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        ...up,
        per_agent_caps: perAgentCaps,
        all_per_agent_caps: up.per_agent_caps || {},
        observed_agents: observedAgents,
        tenant_filter: tenant,
      }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
    }
    return;
  }
  {
    const m = pathname.match(/^\/api\/leash\/budgets\/([^/]+)$/);
    if (m && req.method === 'POST') {
      const [, agentName] = m;
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', async () => {
        try {
          const cfg = readLeashConfig(cwd);
          const consoleUrl = cfg.console_url || 'http://localhost:8801';
          const up = await fetch(consoleUrl.replace(/\/$/, '') + `/api/budgets/${encodeURIComponent(agentName)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body, signal: AbortSignal.timeout(3000),
          });
          res.writeHead(up.status, { 'Content-Type': 'application/json' });
          res.end(await up.text());
        } catch (e) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
        }
      });
      return;
    }
  }

  // GET /api/leash/export?kind=threats|audit&period=…&project=… → CSV/JSON download
  if (pathname === '/api/leash/export') {
    const kind = url.searchParams.get('kind') || 'audit';
    const period = url.searchParams.get('period') || 'all';
    const tenant = resolveProjectParam(url, cwd);
    const secs = { '5m': 300, '15m': 900, '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800, '30d': 2592000, 'all': null }[period];
    const sinceMs = secs ? Date.now() - secs * 1000 : 0;
    const records = readLeashAudit(cwd, 5000, sinceMs, tenant);
    const scopeLabel = tenant || 'all';
    if (kind === 'threats') {
      const threats = records.filter((r) => r.kind === 'policy_decision' || r.kind === 'secrets_detected');
      const header = ['ts', 'kind', 'rule_id', 'action', 'agent_name', 'session_id', 'tenant_id', 'reason'];
      const rows = threats.map((r) => header.map((h) => csvCell(r[h]))).join('\n');
      const filename = `leash-threats-${scopeLabel}-${period}-${Date.now()}.csv`;
      res.writeHead(200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      });
      res.end(header.join(',') + '\n' + rows);
      return;
    }
    // default: audit JSON
    const filename = `leash-audit-${scopeLabel}-${period}-${Date.now()}.json`;
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.end(JSON.stringify({ scope: scopeLabel, period, records }, null, 2));
    return;
  }

  {
    const m = pathname.match(/^\/api\/leash\/hitl\/([^/]+)\/(approve|reject)$/);
    if (m && req.method === 'POST') {
      const [, itemId, decision] = m;
      postHitlDecision(cwd, itemId, decision)
        .then((r) => {
          res.writeHead(r.status || 200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(r.body || {}));
        })
        .catch((e) => {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(e) }));
        });
      return;
    }
  }

  // ── leash v2.28–v2.30 endpoints ────────────────────────────────────────────
  // Generic authenticated fetch to leash admin API
  const leashFetch = async (apiPath, leash, opts = {}) => {
    const base = (leash.config && leash.config.proxy_url) ? leash.config.proxy_url : 'http://localhost:4444';
    const tok  = process.env.LEASH_ADMIN_TOKEN || (leash.config && leash.config.admin_token) || '';
    const headers = { 'Content-Type': 'application/json', ...(opts.headers ?? {}) };
    if (tok) headers['X-Admin-Token'] = tok;
    const r = await fetch(`${base.replace(/\/$/, '')}${apiPath}`, { ...opts, headers });
    return r.json();
  };

  // GET /api/leash/issues — issue grouping (leash v2.28)
  // Collapses repeated rule fires into grouped issues with count/first-last-seen/status
  if (pathname === '/api/leash/issues' && req.method === 'GET') {
    const leash = await getLeashAvailability(cwd);
    if (!leash.available) { res.end(JSON.stringify([])); return; }
    const sp = new URL(req.url,'http://x').searchParams;
    const upstream = await leashFetch(`/api/issues?${sp.toString()}`, leash).catch(() => null);
    res.end(JSON.stringify(upstream ?? []));
    return;
  }

  // POST /api/leash/issues/:id/mute
  // POST /api/leash/issues/:id/resolve
  // POST /api/leash/issues/:id/reopen
  {
    const m = pathname.match(/^\/api\/leash\/issues\/([^/]+)\/(mute|resolve|reopen)$/);
    if (m && req.method === 'POST') {
      const leash = await getLeashAvailability(cwd);
      if (!leash.available) { res.writeHead(503); res.end(JSON.stringify({ok:false})); return; }
      const result = await leashFetch(`/api/issues/${m[1]}/${m[2]}`, leash, { method:'POST' }).catch(e=>({ok:false,error:e.message}));
      res.end(JSON.stringify(result));
      return;
    }
  }

  // GET /api/leash/search?q= — Cmd-K global search (leash v2.28)
  if (pathname === '/api/leash/search' && req.method === 'GET') {
    const leash = await getLeashAvailability(cwd);
    if (!leash.available) { res.end(JSON.stringify({results:[]})); return; }
    const q = new URL(req.url,'http://x').searchParams.get('q') ?? '';
    const result = await leashFetch(`/api/search?q=${encodeURIComponent(q)}`, leash).catch(() => ({results:[]}));
    res.end(JSON.stringify(result));
    return;
  }

  // GET /api/leash/sessions/:id/timeline — session event swimlane (leash v2.29)
  {
    const m = pathname.match(/^\/api\/leash\/sessions\/([^/]+)\/timeline$/);
    if (m && req.method === 'GET') {
      const leash = await getLeashAvailability(cwd);
      if (!leash.available) { res.end(JSON.stringify([])); return; }
      const events = await leashFetch(`/api/sessions/${m[1]}/timeline`, leash).catch(() => []);
      res.end(JSON.stringify(events));
      return;
    }
  }

  // GET /api/leash/hitl/:id/preview — sanitized diff for HITL review (leash v2.29)
  {
    const m = pathname.match(/^\/api\/leash\/hitl\/([^/]+)\/preview$/);
    if (m && req.method === 'GET') {
      const leash = await getLeashAvailability(cwd);
      if (!leash.available) { res.writeHead(404); res.end(JSON.stringify({ok:false})); return; }
      const preview = await leashFetch(`/api/hitl/${m[1]}/preview`, leash).catch(() => null);
      res.end(JSON.stringify(preview ?? {}));
      return;
    }
  }

  // POST /api/leash/hitl/:id/approve_sanitized — approve with sanitized prompt (leash v2.29)
  {
    const m = pathname.match(/^\/api\/leash\/hitl\/([^/]+)\/approve_sanitized$/);
    if (m && req.method === 'POST') {
      const leash = await getLeashAvailability(cwd);
      if (!leash.available) { res.writeHead(503); res.end(JSON.stringify({ok:false})); return; }
      const result = await leashFetch(`/api/hitl/${m[1]}/approve_sanitized`, leash, { method:'POST' }).catch(e=>({ok:false,error:e.message}));
      res.end(JSON.stringify(result));
      return;
    }
  }

  // GET /api/leash/kpi/sparklines — 24h trend SVG sparklines (leash v2.30)
  if (pathname === '/api/leash/kpi/sparklines' && req.method === 'GET') {
    const leash = await getLeashAvailability(cwd);
    if (!leash.available) { res.end(JSON.stringify({})); return; }
    const sparklines = await leashFetch('/api/kpi/sparklines', leash).catch(() => ({}));
    res.end(JSON.stringify(sparklines));
    return;
  }

  // GET /api/leash/topology — agent↔model↔tool topology SVG (leash v2.30)
  if (pathname === '/api/leash/topology' && req.method === 'GET') {
    const leash = await getLeashAvailability(cwd);
    if (!leash.available) { res.writeHead(404); res.end(''); return; }
    // Leash returns rendered SVG blob — proxy content-type as-is
    const leashBase = (leash.config && leash.config.proxy_url) ? leash.config.proxy_url : 'http://localhost:4444';
    const adminTok = process.env.LEASH_ADMIN_TOKEN || (leash.config && leash.config.admin_token) || '';
    const headers = { 'Accept': 'image/svg+xml,application/json' };
    if (adminTok) headers['X-Admin-Token'] = adminTok;
    try {
      const r = await fetch(`${leashBase.replace(/\/$/, '')}/api/topology`, { headers });
      const ct = r.headers.get('content-type') ?? 'application/json';
      res.setHeader('content-type', ct);
      const buf = await r.arrayBuffer();
      res.end(Buffer.from(buf));
    } catch { res.writeHead(503); res.end(''); }
    return;
  }

  // POST /api/leash/soc2 — generate SOC 2 evidence pack (leash v1.3+)
  if (pathname === '/api/leash/soc2' && req.method === 'POST') {
    const leash = await getLeashAvailability(cwd);
    if (!leash.available) { res.writeHead(503); res.end(JSON.stringify({ok:false,error:'leash not running'})); return; }
    const auditLog = path.join(os.homedir(), '.great_cto', 'llm-leash', 'audit.jsonl');
    const outDir   = path.join(os.homedir(), '.great_cto', 'soc2-export', `run-${Date.now()}`);
    try {
      const { execFileSync } = await import('node:child_process');
      execFileSync('llm-leash', ['soc2', auditLog, '--out', outDir], { timeout: 30000 });
      res.end(JSON.stringify({ ok: true, outDir }));
    } catch(e) {
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // Create new task
  if (pathname === '/api/tasks' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      // Validation hardening (2026-05-15): bug-hunt found 3 ways to crash this
      // endpoint or silently drop bad input:
      //   - invalid JSON body → 500 (parser exception in catch → 500)
      //   - 10K-char title → 500 (bd argv too long)
      //   - priority=99 → 200 (silently ignored, user thinks it worked)
      // Each is now an explicit 400 with structured error.
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_json', message: String(e.message || e) }));
        return;
      }
      try {
        const { title, description, priority, agent, labels } = parsed;
        if (!title || typeof title !== 'string' || !title.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'title required' }));
          return;
        }
        // Title length bound: bd issue titles practically cap around 200 chars;
        // 500 is a safe ceiling that catches obvious junk while allowing
        // long-form summaries when warranted.
        if (title.length > 500) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'title_too_long',
            message: `Title is ${title.length} chars; max 500 allowed.`,
            length: title.length,
          }));
          return;
        }
        // Priority must be in P0–P3 if specified. Silent ignore was hiding
        // typos like priority=11 (probably meant P1).
        if (priority != null && (typeof priority !== 'number' || priority < 0 || priority > 3)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'invalid_priority',
            message: 'priority must be an integer in [0, 3] (P0–P3).',
            received: priority,
          }));
          return;
        }
        const beadsErr = checkBeadsAvailable(cwd);
        if (beadsErr) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(beadsErr));
          return;
        }
        // Build bd create args
        const args = ['create', title.trim()];
        if (description) args.push('-d', description);
        if (priority != null && priority >= 0 && priority <= 3) args.push('--priority', `P${priority}`);

        // BH-12 fix: serialise bd writes through global write chain.
        // Concurrent POST /api/tasks calls used to race on bd's file lock —
        // one crash would leave a stale .beads/.lock that froze ALL writes.
        const result = await bdWriteSerialised(() => {
          const r = spawnSync('bd', args, { cwd, encoding: 'utf8', timeout: 5000 });
          if (r.status !== 0) return { error: r.stderr || 'bd create failed' };
          const idMatch = (r.stdout || '').match(/Created issue:\s*(\S+)/);
          const id = idMatch ? idMatch[1] : null;

          // Apply optional labels + agent within the same lock window
          if (id) {
            const updateArgs = ['update', id];
            let needUpdate = false;
            if (agent) { updateArgs.push('--assignee', agent); needUpdate = true; }
            const lbls = Array.isArray(labels) ? labels : (labels ? [labels] : []);
            for (const lbl of lbls) {
              if (lbl) { updateArgs.push('--add-label', lbl); needUpdate = true; }
            }
            if (agent && !lbls.includes(agent)) { updateArgs.push('--add-label', agent); needUpdate = true; }
            if (needUpdate) spawnSync('bd', updateArgs, { cwd, encoding: 'utf8', timeout: 5000 });
          }
          return { id };
        });

        if (!result || result.error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: (result && result.error) || 'bd create failed' }));
          return;
        }

        bdCacheInvalidate(cwd);
        broadcastTasks(cwd);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id: result.id }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e.message || e) }));
      }
    });
    return;
  }

  // Task status update — BH-14/BH-16 fixes: JSON parse 400, write serialisation
  if (pathname.match(/^\/api\/tasks\/[^/]+\/status$/) && req.method === 'POST') {
    const id = pathname.split('/')[3];
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_json', message: String(e.message || e) }));
        return;
      }
      const { status } = parsed;
      const validStatuses = ['open', 'in_progress', 'blocked', 'closed'];
      if (!validStatuses.includes(status)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_status', message: `status must be one of: ${validStatuses.join(', ')}`, received: status }));
        return;
      }
      const result = await bdWriteSerialised(() => {
        const r = spawnSync('bd', ['update', id, '--status', status], { cwd, encoding: 'utf8', timeout: 5000 });
        if (r.status !== 0) return { error: r.stderr || 'bd update failed' };
        bdCacheInvalidate(cwd);
        return { ok: true };
      });
      if (!result || result.error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (result && result.error) || 'bd update failed' }));
        return;
      }
      broadcastTasks(cwd);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // Task priority update
  if (pathname.match(/^\/api\/tasks\/[^/]+\/priority$/) && req.method === 'POST') {
    const id = pathname.split('/')[3];
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_json', message: String(e.message || e) }));
        return;
      }
      const { priority } = parsed;
      if (priority == null || typeof priority !== 'number' || priority < 0 || priority > 3) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_priority', message: 'priority must be an integer in [0, 3]', received: priority }));
        return;
      }
      const result = await bdWriteSerialised(() => {
        const r = spawnSync('bd', ['update', id, '--priority', String(priority)], { cwd, encoding: 'utf8', timeout: 5000 });
        if (r.status !== 0) return { error: r.stderr || 'bd update failed' };
        bdCacheInvalidate(cwd);
        return { ok: true };
      });
      if (!result || result.error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (result && result.error) || 'bd update failed' }));
        return;
      }
      broadcastTasks(cwd);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // Task history / timeline from interactions.jsonl
  if (pathname.match(/^\/api\/tasks\/[^/]+\/history$/) && req.method === 'GET') {
    const taskId = pathname.split('/')[3];
    // 404 for unknown task IDs so the UI can distinguish "task does not exist"
    // from "task exists but has no history yet".
    const allTasks = getTasks(cwd);
    if (!allTasks.some(t => t.id === taskId)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'task_not_found', id: taskId }));
      return;
    }
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
        let done = doneM ? doneM[1].trim().split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2)) : [];
        const pendM = raw.match(/## Pending\n([\s\S]*?)(?=\n##|$)/);
        let pending = pendM ? pendM[1].trim().split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2)) : [];

        // v2.7.0: SessionEnd hook auto-captures use a different schema
        // (## Git / ## Beads / ## Cost). When no /save format found,
        // synthesise done/pending bullets from those sections so the
        // panel still has content.
        let source = 'save';
        if (!done.length && !pending.length) {
          source = 'auto';
          const gitM   = raw.match(/## Git\n([\s\S]*?)(?=\n##|$)/);
          const beadsM = raw.match(/## Beads\n([\s\S]*?)(?=\n##|$)/);
          const costM  = raw.match(/## Cost[^\n]*\n([\s\S]*?)(?=\n##|$)/);
          const bullets = (sec) => sec ? sec[1].trim().split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2)) : [];
          // Done = factual snapshot (Git + Cost)
          done = [...bullets(gitM)];
          if (costM) {
            const costLines = costM[1].trim().split('\n').filter(l => l && !l.startsWith('```') && !l.includes('(no cost log)'));
            if (costLines.length) done.push(`Cost: ${costLines.join(' · ')}`);
          }
          // Pending = open work (Beads)
          pending = [...bullets(beadsM)];
        }
        return {
          file: f,
          source,
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

  // Installed agents — fleet view (DESIGN-agents-fleet-view §3.1).
  //
  // Extended in 2026-05-15 from a flat list to a faceted-fleet payload:
  // each row carries domain (slug-derived), runs_30d, success_rate, last_run,
  // retired (sidecar file marker), and savings_x. The board's /agents tab
  // renders these into the .agent-row list with no further server round-trips.
  if (pathname === '/api/agents-installed') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getAgentsFleet()));
    return;
  }

  // Per-agent profile drawer (DESIGN-agents-fleet-view §3.2).
  // GET /api/agents/<slug> → { slug, description, model, applies_to,
  //                            runs_30d, success_rate, last_run, savings_x,
  //                            retired, runs[20], failure_modes[N] }
  if (pathname.startsWith('/api/agents/') && req.method === 'GET') {
    const rest = pathname.slice('/api/agents/'.length);
    const [slug, sub] = rest.split('/');
    if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid_slug' }));
    }
    if (!sub) {
      const profile = getAgentProfile(slug);
      if (!profile) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'agent_not_found', slug }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(profile));
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unknown_subpath', sub }));
  }

  // POST /api/agents/<slug>/retire | restore — sidecar marker
  // (DESIGN-agents-fleet-view §9 Top-2 #2: reversible sidecar chosen over
  // filesystem move; founder may revise.)
  if (pathname.startsWith('/api/agents/') && req.method === 'POST') {
    // Cross-origin guard — same pattern as BH-23 on /api/projects/register.
    const origin = req.headers.origin || req.headers.referer || '';
    const expectedOrigin = `http://localhost:${PORT}`;
    const expectedOrigin2 = `http://127.0.0.1:${PORT}`;
    const originOk = !origin
      || origin === expectedOrigin
      || origin === expectedOrigin2
      || origin.startsWith(expectedOrigin + '/')
      || origin.startsWith(expectedOrigin2 + '/');
    if (!originOk) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'origin_not_allowed' }));
    }
    const rest = pathname.slice('/api/agents/'.length);
    const [slug, action] = rest.split('/');
    if (!slug || !/^[a-z0-9-]+$/i.test(slug) || !['retire', 'restore'].includes(action)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid_request' }));
    }
    try {
      const result = action === 'retire' ? retireAgent(slug) : restoreAgent(slug);
      res.writeHead(result.ok ? 200 : 404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(PUBLIC, filePath);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath);
    const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
    // HTML must never cache — board UI is iterated daily and stale layouts
    // hide new features (period selector, push toggle, etc.) until hard refresh
    const headers = { 'Content-Type': mime[ext] || 'text/plain' };
    if (ext === '.html' || ext === '.js') headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    res.writeHead(200, headers);
    res.end(fs.readFileSync(fullPath));
    return;
  }

  // ── /api/push — Web Push subscription management ────────────────────────
  // GET  /api/push/vapid-key → { publicKey } (base64url, for browser subscribe)
  // POST /api/push/subscribe → body: { endpoint, keys: { p256dh, auth } }
  // DELETE /api/push/subscribe → body: { endpoint }
  if (pathname === '/api/push/vapid-key' && req.method === 'GET') {
    const keys = getVapidKeys(VAPID_KEYS_FILE);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ publicKey: keys.publicKey }));
  }

  if (pathname === '/api/push/subscribe' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const sub = JSON.parse(body || '{}');
        if (!sub.endpoint) { res.writeHead(400); return res.end(JSON.stringify({ error: 'endpoint_required' })); }
        addSubscription(PUSH_SUBS_FILE, sub);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400); return res.end(JSON.stringify({ error: 'invalid_json' }));
      }
    });
    return;
  }

  if (pathname === '/api/push/subscribe' && req.method === 'DELETE') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { endpoint } = JSON.parse(body || '{}');
        if (!endpoint) { res.writeHead(400); return res.end(JSON.stringify({ error: 'endpoint_required' })); }
        removeSubscription(PUSH_SUBS_FILE, endpoint);
        res.writeHead(204);
        return res.end();
      } catch {
        res.writeHead(400); return res.end(JSON.stringify({ error: 'invalid_json' }));
      }
    });
    return;
  }

  // ── /api/notif-history — in-app notification history ─────────────────────
  // GET  /api/notif-history?unread=1&limit=N → JSON array (newest first)
  // POST /api/notif-history/read → body: { id? } (omit id = mark all read)
  if (pathname === '/api/notif-history' && req.method === 'GET') {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
    const unreadOnly = url.searchParams.get('unread') === '1';
    let items = notifHistory.slice(0, limit);
    if (unreadOnly) items = items.filter(n => !n.read);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(items));
  }

  if (pathname === '/api/notif-history/read' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body || '{}');
        if (id) {
          const n = notifHistory.find(n => n.id === id);
          if (n) n.read = true;
        } else {
          // Mark all read
          for (const n of notifHistory) n.read = true;
        }
        saveNotifHistory();
        res.writeHead(204);
        return res.end();
      } catch {
        res.writeHead(400); return res.end(JSON.stringify({ error: 'invalid_json' }));
      }
    });
    return;
  }

  // API requests get a JSON 404 so frontends can JSON.parse() the response
  // without crashing. Static-file 404s stay plain text.
  if (pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path: pathname, hint: 'Endpoint missing — restart the board after a great-cto update.' }));
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
  startAlertCron();
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
