import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { planGates } from '../../../scripts/lib/gate-plan.mjs';
import { GREAT_CTO_DIR, PROJECTS_FILE } from './config.mjs';

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
// change_tier for a project's working-tree diff (gate-tiering, ADR-003/004): which
// human gates open for the current change + which judge model runs. Pure planGates()
// over the project's archetype/size + `git diff --name-only`.
function getChangeTier(dir) {
  try {
    const meta = readProjectMd(dir);
    if (!meta) return { tier: null, error: 'no PROJECT.md' };
    const pm = fs.readFileSync(path.join(dir, '.great_cto', 'PROJECT.md'), 'utf8');
    const size = (pm.match(/^project_size:\s*(\S+)/m) || [])[1] || 'medium';
    const out = spawnSync('git', ['diff', '--name-only', 'HEAD'], { cwd: dir, encoding: 'utf8', timeout: 5000 });
    const changedFiles = String(out.stdout || '').split('\n').map(s => s.trim()).filter(Boolean);
    return planGates({ archetype: meta.archetype, size, changedFiles });
  } catch (e) {
    return { tier: 'T2', error: e.message };  // fail-safe: unknown → full gates
  }
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

export {
  readProjectsRegistry,
  writeProjectsRegistry,
  ARCHETYPE_ALIASES,
  normalizeArchetype,
  extractArchetype,
  readProjectMd,
  getChangeTier,
  autoRegisterProject,
  discoverProjects,
  listProjects,
  resolveProjectCwd,
  resolveProjectInfo,
};
