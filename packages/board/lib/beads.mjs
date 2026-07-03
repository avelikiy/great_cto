import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { bdCache } from './state.mjs';

// ── Beads data ─────────────────────────────────────────────────────────────────
// Cache bdList output per cwd for BD_CACHE_TTL_MS. Invalidated when the project's
// .beads/interactions.jsonl changes (the file watcher in watchBeads() calls
// bdCacheInvalidate(cwd) before broadcasting). This avoids spawning `bd list`
// on every API call when 5+ projects are open in tabs.
const BD_CACHE_TTL_MS = 2000;

function bdCacheInvalidate(cwd) { bdCache.delete(cwd); }

// ── bd binary resolution (BH-32) ────────────────────────────────────────────
// A board launched from a GUI / launchd / a login shell that didn't source the
// usual profile often has a minimal PATH (`/usr/bin:/bin`) that omits where
// Homebrew (`/opt/homebrew/bin`) or a user install (`~/.local/bin`) put `bd`.
// Then `spawnSync('bd', …)` → ENOENT, and a gate Approve fails with the opaque
// "bd update failed" — even though `bd list` was served from cache. Resolve the
// binary once against the common locations, and always spawn with an augmented
// PATH so bd's own child processes (git) are found too.
const BD_EXTRA_PATHS = ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin'), '/usr/bin', '/bin'];
const BD_BIN = (() => {
  // honor an explicit override first
  if (process.env.GREAT_CTO_BD_BIN && fs.existsSync(process.env.GREAT_CTO_BD_BIN)) return process.env.GREAT_CTO_BD_BIN;
  for (const dir of BD_EXTRA_PATHS) {
    const p = path.join(dir, 'bd');
    try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
  }
  return 'bd'; // fall back to PATH lookup
})();
function bdEnv() {
  const cur = process.env.PATH || '';
  const have = new Set(cur.split(path.delimiter).filter(Boolean));
  const add = BD_EXTRA_PATHS.filter((d) => !have.has(d));
  return add.length ? { ...process.env, PATH: [...add, cur].filter(Boolean).join(path.delimiter) } : process.env;
}
// Centralized bd invocation — resolved binary + augmented PATH for every call site.
function bd(args, opts = {}) {
  return spawnSync(BD_BIN, args, { encoding: 'utf8', timeout: 8000, ...opts, env: { ...bdEnv(), ...(opts.env || {}) } });
}
// Turn a failed bd result into an actionable message (the bare "bd update failed" hid ENOENT).
function bdErr(r, what) {
  if (r.error && r.error.code === 'ENOENT') return `${what}: 'bd' not found. Install Beads (brew install beads) or set GREAT_CTO_BD_BIN to the bd path, then restart the board.`;
  if (r.error && r.error.code === 'ETIMEDOUT') return `${what}: bd timed out — a stale .beads/.lock can cause this`;
  return (r.stderr && r.stderr.trim()) || (r.stdout && r.stdout.trim()) || what;
}

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

// On a transient bd failure (nonzero exit, dolt lock, timeout, throw), keep
// serving the last-good cached data instead of overwriting it with [] — an
// empty result is indistinguishable from "no tasks" and would wipe a
// populated board on every SSE push (great_cto-e2ew). We deliberately do NOT
// refresh cached.ts on failure, so the next call retries bd immediately
// rather than being TTL-gated on a failed read.
function bdList(cwd = process.cwd(), runner = bd) {
  const cached = bdCache.get(cwd);
  if (cached && Date.now() - cached.ts < BD_CACHE_TTL_MS) return cached.data;
  try {
    const result = runner(['list', '--json', '--all', '--include-gates'], { cwd });
    if (result.status !== 0) {
      if (cached) return cached.data; // last-good data, cache untouched
      bdCache.set(cwd, { ts: Date.now(), data: [] });
      return [];
    }
    const data = JSON.parse(result.stdout || '[]');
    bdCache.set(cwd, { ts: Date.now(), data });
    return data;
  } catch {
    if (cached) return cached.data; // last-good data, cache untouched
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

export {
  bdCacheInvalidate,
  BD_BIN,
  bdEnv,
  bd,
  bdErr,
  checkBeadsAvailable,
  bdWriteSerialised,
  bdList,
  parseTasksMd,
  getTasks,
  mapStatus,
  detectAgent,
};
