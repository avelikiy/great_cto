/**
 * leash-adapter.mjs — thin facade between the great_cto board and a local
 * llm-leash deployment.
 *
 * Reads:
 *   - `.great_cto/leash.json` (per-project config; written by `great-cto leash init`)
 *   - `~/.leash/audit.jsonl` (default audit sink — JSONL, hash-chained)
 *   - `~/.leash/state.json` (optional; written by `leash status --json` cron)
 *
 * Writes (via child process / HTTP):
 *   - `leash kill --all` to stop in-flight LLM calls (<300 ms propagation)
 *   - POST to leash admin HITL endpoint for human approve / reject decisions
 *
 * Admin API (llm-leash v2.27+):
 *   GET  /admin/hitl/pending           — pending HITL items
 *   POST /admin/hitl/{id}/approve      — approve a pending item
 *   POST /admin/hitl/{id}/reject       — reject a pending item
 *   GET  /admin/rate-limits            — current rate-limit config & counters
 *   GET  /admin/stats                  — includes per_tenant_caps (v2.27+)
 *
 * Zero npm deps. All errors swallowed and surfaced as `{ available: false }`
 * so the board never crashes if leash isn't installed.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import http from 'http';
import { isProxyRunning } from './leash-proxy-control.mjs';

const DEFAULTS = {
  enabled: false,
  audit_path: path.join(os.homedir(), '.leash', 'audit.jsonl'),
  state_path: path.join(os.homedir(), '.leash', 'state.json'),
  proxy_url: 'http://localhost:8765',
  // hitl_url removed — admin HITL paths are derived from proxy_url + /admin/hitl/*
  metrics_url: 'http://localhost:9000/metrics',
  console_url: 'http://localhost:8801',   // llm-leash-console (v2.1+)
  cli_path: 'leash',
  install_root: path.join(os.homedir(), '.great_cto', 'llm-leash'),
  // admin_token: read from LEASH_ADMIN_TOKEN env or leash.json; null = no auth (default install)
  admin_token: null,
};

/**
 * Read project-level leash.json overlaid on DEFAULTS.
 */
export function readLeashConfig(cwd = process.cwd()) {
  const projectCfg = path.join(cwd, '.great_cto', 'leash.json');
  const globalCfg = path.join(os.homedir(), '.great_cto', 'leash.json');
  let cfg = { ...DEFAULTS };
  const loaded = [];
  for (const p of [globalCfg, projectCfg]) {
    try {
      if (fs.existsSync(p)) {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
        cfg = { ...cfg, ...parsed };
        loaded.push(p);
      }
    } catch { /* ignore corrupt config */ }
  }
  // expand ~ in paths
  for (const k of ['audit_path', 'state_path', 'install_root']) {
    if (typeof cfg[k] === 'string' && cfg[k].startsWith('~/')) {
      cfg[k] = path.join(os.homedir(), cfg[k].slice(2));
    }
  }
  // LEASH_ADMIN_TOKEN env overrides config file (useful for CI / headless board)
  const envToken = process.env.LEASH_ADMIN_TOKEN;
  if (envToken) cfg.admin_token = envToken;

  // Self-describe which files actually contributed (in load order).
  // Last entry wins on conflicting keys.
  cfg._config_sources = loaded;
  return cfg;
}

/**
 * Read project's tenant_id from PROJECT.md. Falls back to a slug derived from
 * cwd basename so older projects (created before the leash: block landed)
 * still slot into a stable tenant bucket.
 *
 * Returns null if cwd is plainly not a great_cto project (no .great_cto dir).
 */
export function readProjectTenantId(cwd = process.cwd()) {
  const projectMd = path.join(cwd, '.great_cto', 'PROJECT.md');
  if (!fs.existsSync(path.join(cwd, '.great_cto'))) return null;
  try {
    if (fs.existsSync(projectMd)) {
      const md = fs.readFileSync(projectMd, 'utf8');
      // Match nested `tenant_id:` under the `leash:` block (YAML-ish, 2-space indent)
      const m = md.match(/^leash:\s*\n(?:\s+[a-z_]+:.*\n)*\s+tenant_id:\s*([A-Za-z0-9_-]+)/m);
      if (m) return m[1];
    }
  } catch { /* fall through to derived slug */ }
  // Derive from basename — keep in sync with bootstrap.ts slugifyTenant()
  const base = path.basename(cwd) || 'default';
  return base
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'default';
}

/**
 * Resolve the tenant filter for a request.
 *   `null` → no filter (system-wide / "show all projects")
 *   string → filter audit/leaks by tenant_id == that value
 */
export function resolveTenantFilter(cwd, explicit) {
  if (explicit === 'all' || explicit === '*') return null;
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  return readProjectTenantId(cwd);
}

/**
 * Is leash installed and reachable? Returns rich status object.
 */
export function getLeashAvailability(cwd = process.cwd()) {
  const cfg = readLeashConfig(cwd);
  const auditExists = fs.existsSync(cfg.audit_path);
  const installExists = fs.existsSync(cfg.install_root);
  let installedVersion = null;
  try {
    if (installExists) {
      const r = spawnSync('git', ['-C', cfg.install_root, 'rev-parse', '--short', 'HEAD'], {
        stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
      });
      if (r.status === 0) installedVersion = r.stdout.toString().trim();
    }
  } catch { /* ignore */ }
  const runStatus = isProxyRunning(cfg);
  const tenant = readProjectTenantId(cwd);
  return {
    enabled: cfg.enabled,
    available: cfg.enabled && (auditExists || installExists),
    audit_exists: auditExists,
    install_exists: installExists,
    installed_version: installedVersion,
    proxy_running: runStatus.running,
    proxy_pid: runStatus.pid || null,
    proxy_source: runStatus.source || null,
    project_tenant_id: tenant,
    config: {
      audit_path: cfg.audit_path,
      proxy_url: cfg.proxy_url,
      metrics_url: cfg.metrics_url,
      console_url: cfg.console_url,
      install_root: cfg.install_root,
      sources: cfg._config_sources || [],
    },
  };
}

/**
 * Read last N records from the JSONL audit log. Fast: reverse-streams.
 * Records have shape (per llm-leash audit spec):
 *   { ts, kind, model, tokens_in, tokens_out, cost_usd, decision, rule, hash, prev_hash, tenant_id, session_id, agent_name }
 *
 * `tenant` filters records by `tenant_id` field. Pass null to disable filter
 * (system-admin "all projects" view). Records without a tenant_id are
 * INCLUDED only when no filter is requested (they came from un-tagged
 * clients — usually pre-integration sessions).
 */
export function readLeashAudit(cwd = process.cwd(), limit = 100, sinceMs = 0, tenant = null) {
  const cfg = readLeashConfig(cwd);
  if (!fs.existsSync(cfg.audit_path)) return [];
  try {
    const raw = fs.readFileSync(cfg.audit_path, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const out = [];
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      try {
        const rec = JSON.parse(lines[i]);
        if (sinceMs && Date.parse(rec.ts || rec.timestamp || 0) < sinceMs) break;
        if (tenant && rec.tenant_id !== tenant) continue;
        out.push(rec);
      } catch { /* skip malformed line */ }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Compute live budget state from audit log (fallback when leash state.json absent).
 * Sums cost_usd for the current calendar day (UTC).
 */
export function computeBudgetFromAudit(cwd = process.cwd(), tenant = null) {
  const cfg = readLeashConfig(cwd);
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const sinceMs = startOfDay.getTime();
  const records = readLeashAudit(cwd, 10000, sinceMs, tenant);
  let spent_usd = 0;
  let calls = 0;
  let blocked = 0;
  let hitl_pending = 0;
  for (const r of records) {
    if (typeof r.cost_usd === 'number') spent_usd += r.cost_usd;
    calls += 1;
    if (r.decision === 'block') blocked += 1;
    if (r.decision === 'hitl' && r.status === 'pending') hitl_pending += 1;
  }
  return {
    period: 'day',
    spent_usd: Number(spent_usd.toFixed(4)),
    cap_usd: cfg.daily_cap_usd || null,
    calls_total: calls,
    calls_blocked: blocked,
    hitl_pending,
  };
}

/**
 * Prefer leash state.json (authoritative). Fall back to computeBudgetFromAudit.
 */
export function readLeashState(cwd = process.cwd(), tenant = null) {
  const cfg = readLeashConfig(cwd);
  // state.json from `leash status --json` is global per-machine. When a tenant
  // filter is requested we MUST recompute from audit — state.json doesn't
  // break the totals down per tenant.
  if (!tenant) {
    try {
      if (fs.existsSync(cfg.state_path)) {
        const raw = fs.readFileSync(cfg.state_path, 'utf8');
        return { source: 'state.json', tenant: null, ...JSON.parse(raw) };
      }
    } catch { /* fall through */ }
  }
  return { source: 'audit-fallback', tenant, ...computeBudgetFromAudit(cwd, tenant) };
}

/**
 * Read pending HITL items. Two strategies:
 *   1. GET /admin/hitl/pending (llm-leash v2.27+ admin API — preferred)
 *   2. Scan audit for `decision: hitl, status: pending`
 */
export async function readHitlPending(cwd = process.cwd(), tenant = null) {
  const cfg = readLeashConfig(cwd);
  const baseUrl = (cfg.proxy_url || 'http://localhost:8765').replace(/\/$/, '');
  // Try admin HTTP API first (v2.27+)
  try {
    const items = await httpGetJson(`${baseUrl}/admin/hitl/pending`, 1500, _adminHeaders(cfg));
    if (Array.isArray(items)) {
      return tenant ? items.filter((it) => it.tenant_id === tenant) : items;
    }
  } catch { /* fall through */ }
  // Fallback: scan audit (already tenant-filtered)
  const recs = readLeashAudit(cwd, 1000, 0, tenant);
  return recs.filter((r) => r.decision === 'hitl' && r.status === 'pending');
}

/**
 * Fire kill switch. If `sessionId` is given, kills only that session via the
 * leash admin API; otherwise kills all in-flight sessions. Returns { ok, output }.
 */
export function fireKillSwitch(cwd = process.cwd(), reason = 'board-ui', sessionId = null) {
  const cfg = readLeashConfig(cwd);
  if (sessionId) {
    // Per-session kill via admin HTTP API (no admin token needed for default install)
    const url = (cfg.proxy_url || 'http://localhost:8765').replace(/\/$/, '') + `/admin/kill/${encodeURIComponent(sessionId)}`;
    return httpJson(url, 'POST', { reason }, 5000);
  }
  const r = spawnSync(cfg.cli_path, ['kill', '--all', '--reason', reason], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5000,
  });
  return {
    ok: r.status === 0,
    output: (r.stdout?.toString() || '') + (r.stderr?.toString() || ''),
  };
}

function httpJson(url, method, body, timeoutMs) {
  // Synchronous-style wrapper that returns a promise-shaped object the caller
  // can consume with `result.ok`. We use a fire-and-forget request here so the
  // board endpoint doesn't have to await — kill via HTTP is best-effort.
  try {
    const u = new URL(url);
    const data = JSON.stringify(body || {});
    const req = http.request({
      method, hostname: u.hostname, port: u.port,
      path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: timeoutMs,
    });
    req.on('error', () => { /* swallow — leash may not be running */ });
    req.write(data);
    req.end();
    return { ok: true, output: `kill request sent to ${url}` };
  } catch (e) {
    return { ok: false, output: String(e?.message || e) };
  }
}

/**
 * Post HITL decision for a pending item.
 * llm-leash v2.27 API: POST /admin/hitl/{id}/approve  or  /admin/hitl/{id}/reject
 */
export async function postHitlDecision(cwd, itemId, decision) {
  const cfg = readLeashConfig(cwd);
  if (!['approve', 'reject'].includes(decision)) {
    throw new Error(`invalid decision: ${decision}`);
  }
  const baseUrl = (cfg.proxy_url || 'http://localhost:8765').replace(/\/$/, '');
  const url = `${baseUrl}/admin/hitl/${encodeURIComponent(itemId)}/${decision}`;
  return await httpPostJson(url, {}, 3000, _adminHeaders(cfg));
}

/**
 * Read current rate-limit config and counters from llm-leash v2.27+.
 * GET /admin/rate-limits
 * Returns raw response object or null if unavailable.
 */
export async function readLeashRateLimits(cwd = process.cwd()) {
  const cfg = readLeashConfig(cwd);
  const baseUrl = (cfg.proxy_url || 'http://localhost:8765').replace(/\/$/, '');
  try {
    return await httpGetJson(`${baseUrl}/admin/rate-limits`, 2000, _adminHeaders(cfg));
  } catch {
    return null;
  }
}

/**
 * Read native per-tenant caps from llm-leash v2.27+ /admin/stats.
 * Returns { per_tenant_caps: { <tenant>: { cap_usd, spent_usd, ... } } } or null.
 * Callers fall back to local per-tenant-caps.mjs when this returns null.
 */
export async function readLeashNativeCaps(cwd = process.cwd()) {
  const cfg = readLeashConfig(cwd);
  const baseUrl = (cfg.proxy_url || 'http://localhost:8765').replace(/\/$/, '');
  try {
    const stats = await httpGetJson(`${baseUrl}/admin/stats`, 2000, _adminHeaders(cfg));
    if (stats && stats.per_tenant_caps) return stats.per_tenant_caps;
  } catch { /* fall through */ }
  return null;
}

// ── helpers ────────────────────────────────────────────────────────────────────

/** Build Authorization header if admin_token is configured. */
function _adminHeaders(cfg) {
  return cfg.admin_token ? { Authorization: `Bearer ${cfg.admin_token}` } : {};
}

function httpGetJson(url, timeoutMs, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      method: 'GET',
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: { Accept: 'application/json', ...extraHeaders },
      timeout: timeoutMs,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

function httpPostJson(url, body, timeoutMs, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = http.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...extraHeaders,
      },
      timeout: timeoutMs,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf || '{}') }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}
