/**
 * security-status.mjs — aggregator for the board's "Security" tab.
 *
 * Surfaces three runtime governance signals in one JSON payload:
 *   1. llm-leash          — runtime LLM firewall (delegated to leash-adapter)
 *   2. pre-push hook      — git push blocker for private project leaks
 *   3. secret-scan hook   — PreToolUse hook that blocks API keys / PEMs / JWTs
 *
 * Zero npm deps. All errors swallowed: a missing log file just returns zero
 * counters, never an HTTP error.
 *
 * Log file conventions:
 *   ~/.great_cto/pre-push-stats.jsonl     one line per block event
 *   ~/.great_cto/secret-scan-stats.jsonl  one line per block OR warn
 *
 * Each line is `{ts, kind, ...details}`.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { getLeashAvailability, readLeashState } from './leash-adapter.mjs';

const GREAT_CTO_HOME = path.join(os.homedir(), '.great_cto');
const PRE_PUSH_LOG = path.join(GREAT_CTO_HOME, 'pre-push-stats.jsonl');
const SECRET_SCAN_LOG = path.join(GREAT_CTO_HOME, 'secret-scan-stats.jsonl');

/**
 * Aggregate security status. Synchronous + fast — board polls this every 5–10 s.
 *
 * `tenant` (optional, propagated from /api/security?project=...) scopes the
 * leash sub-payload to one project:
 *   undefined → adapter falls back to the project of cwd
 *   null      → no filter ("all projects")
 *   string    → filter to that tenant_id
 *
 * pre_push and secret_scan stats are global per machine and ignore tenant.
 */
export function getSecurityStatus(cwd = process.cwd(), tenant) {
  return {
    leash: getLeashSummary(cwd, tenant),
    pre_push: getPrePushSummary(cwd),
    secret_scan: getSecretScanSummary(),
    generated_at: new Date().toISOString(),
  };
}

// ── leash ────────────────────────────────────────────────────────────────────

function getLeashSummary(cwd, tenant) {
  try {
    const avail = getLeashAvailability(cwd);
    // Resolve tenant filter: if caller passed `undefined`, default to project of cwd
    const filter = (tenant === undefined) ? avail.project_tenant_id : tenant;
    const state = avail.available ? readLeashState(cwd, filter) : null;
    return { ...avail, state, tenant_filter: filter };
  } catch (e) {
    return { available: false, error: String(e) };
  }
}

// ── pre-push hook ────────────────────────────────────────────────────────────

/**
 * Pre-push status combines two questions:
 *   - Is the hook installed for THIS repo? (.git/hooks/pre-push)
 *   - How many blocks has it fired across all repos? (~/.great_cto/pre-push-stats.jsonl)
 *
 * We also fingerprint the canonical hook source so we can flag a "stale"
 * installation that needs `great-cto init --force`.
 */
function getPrePushSummary(cwd) {
  const hookPath = path.join(cwd, '.git', 'hooks', 'pre-push');
  const installed = fs.existsSync(hookPath);

  let installed_hash = null;
  let canonical_hash = null;
  let stale = false;

  if (installed) {
    installed_hash = sha1(safeRead(hookPath));
  }

  // The canonical hook lives in the installed plugin dir. Cross-version
  // comparison is approximate — we only flag stale when the user's hook is
  // present but doesn't match ANY recent plugin install.
  const pluginRoots = listPluginVersions();
  const canonicalHashes = pluginRoots
    .map((p) => sha1(safeRead(path.join(p, 'scripts', 'hooks', 'pre-push.sh'))))
    .filter(Boolean);
  if (canonicalHashes.length) {
    canonical_hash = canonicalHashes[canonicalHashes.length - 1]; // most recent install
    stale = installed && installed_hash && !canonicalHashes.includes(installed_hash);
  }

  const events = readJsonl(PRE_PUSH_LOG, 1000);
  const blocks = events.filter((e) => e.kind === 'block');
  const last = blocks[blocks.length - 1] || null;
  const last30d = blocks.filter((e) => withinDays(e.ts, 30));

  return {
    installed,
    installed_hash,
    canonical_hash,
    stale,
    blocks_total: blocks.length,
    blocks_30d: last30d.length,
    last_block: last,
  };
}

// ── secret scan ─────────────────────────────────────────────────────────────

function getSecretScanSummary() {
  // The hook is part of plugin.json's PreToolUse — it's not "per-repo".
  // We don't try to verify it's wired; we just summarise its activity log.
  const events = readJsonl(SECRET_SCAN_LOG, 1000);
  const blocks = events.filter((e) => e.kind === 'block');
  const warns = events.filter((e) => e.kind === 'warn');
  const lastBlock = blocks[blocks.length - 1] || null;
  const last30d = events.filter((e) => withinDays(e.ts, 30));

  // Aggregate by rule
  const byRule = {};
  for (const e of last30d) {
    const rule = e.rule || e.detected?.[0] || 'unknown';
    byRule[rule] = (byRule[rule] || 0) + 1;
  }

  return {
    blocks_total: blocks.length,
    warns_total: warns.length,
    events_30d: last30d.length,
    by_rule_30d: byRule,
    last_block: lastBlock,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function readJsonl(file, limit = 1000) {
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const out = [];
    for (let i = Math.max(0, lines.length - limit); i < lines.length; i++) {
      try { out.push(JSON.parse(lines[i])); } catch { /* skip */ }
    }
    return out;
  } catch { return []; }
}

function safeRead(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function sha1(s) {
  if (!s) return null;
  return createHash('sha1').update(s).digest('hex').slice(0, 12);
}

function listPluginVersions() {
  const base = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'local', 'great_cto');
  try {
    if (!fs.existsSync(base)) return [];
    return fs.readdirSync(base)
      .filter((n) => /^[0-9]+\.[0-9]+\.[0-9]+$/.test(n))
      .sort()
      .map((n) => path.join(base, n));
  } catch { return []; }
}

function withinDays(ts, days) {
  try {
    const ms = Date.parse(ts);
    return Date.now() - ms < days * 24 * 3600 * 1000;
  } catch { return false; }
}
