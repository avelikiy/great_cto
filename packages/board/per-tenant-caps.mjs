/**
 * per-tenant-caps.mjs — local per-tenant budget cap enforcement.
 *
 * llm-leash v2.27+ ships native `per_tenant_caps` in /admin/stats. The board
 * reads those via readLeashNativeCaps() and shows them in the Security tab.
 * This module is kept as a local fallback for installs that are older or that
 * need offline / air-gapped enforcement without a running proxy.
 *
 * Storage: ~/.great_cto/per-tenant-caps.json
 *   { "<tenant>": { "cap_usd": <number>, "updated_at": "<iso>" } }
 *
 * Enforcement is best-effort, not real-time: it runs whenever the board
 * polls /api/leash/per-tenant-status (every 10 s while Security panel is
 * active). When today's spend ≥ cap for a tenant, we fire
 * `POST /admin/tenant/<tenant>/pause` on the proxy — which kills every
 * active session of that tenant. The pause is recorded in
 * ~/.great_cto/per-tenant-locks.json with an ISO timestamp so /api/...
 * can show "locked since X" until the operator clears it.
 *
 * Zero npm deps. Every function returns a plain object; errors swallowed.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { readLeashAudit, readLeashConfig, readLeashNativeCaps } from './leash-adapter.mjs';

const HOME = os.homedir();
const CAPS_FILE = path.join(HOME, '.great_cto', 'per-tenant-caps.json');
const LOCKS_FILE = path.join(HOME, '.great_cto', 'per-tenant-locks.json');

function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { /* fall through */ }
  return fallback;
}

function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
    return true;
  } catch { return false; }
}

export function listCaps() {
  return readJson(CAPS_FILE, {});
}

export function setCap(tenant, capUsd) {
  if (!tenant || typeof tenant !== 'string') throw new Error('tenant must be a string');
  const caps = listCaps();
  if (capUsd == null || capUsd === '') {
    delete caps[tenant];
  } else {
    const n = Number(capUsd);
    if (!Number.isFinite(n) || n < 0) throw new Error('cap_usd must be a non-negative number');
    caps[tenant] = { cap_usd: n, updated_at: new Date().toISOString() };
  }
  return writeJson(CAPS_FILE, caps) ? caps : null;
}

export function listLocks() {
  return readJson(LOCKS_FILE, {});
}

function setLock(tenant, reason) {
  const locks = listLocks();
  locks[tenant] = { locked_at: new Date().toISOString(), reason };
  writeJson(LOCKS_FILE, locks);
}

export function clearLock(tenant) {
  const locks = listLocks();
  if (locks[tenant]) {
    delete locks[tenant];
    writeJson(LOCKS_FILE, locks);
  }
}

/**
 * Compute today's UTC-day spend for each tenant from the audit log.
 * Returns { <tenant>: <spent_usd> }.
 */
function spentTodayPerTenant(cwd = process.cwd()) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const records = readLeashAudit(cwd, 20000, start.getTime(), null);
  const acc = {};
  for (const r of records) {
    const t = r.tenant_id;
    if (!t) continue;
    if (typeof r.cost_usd === 'number') {
      acc[t] = (acc[t] || 0) + r.cost_usd;
    }
  }
  return acc;
}

function postPause(proxyUrl, tenant) {
  return new Promise((resolve) => {
    try {
      const u = new URL(`${proxyUrl.replace(/\/$/, '')}/admin/tenant/${encodeURIComponent(tenant)}/pause`);
      const body = JSON.stringify({ reason: 'per-tenant-cap-exceeded' });
      const req = http.request({
        method: 'POST',
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 3000,
      }, (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }));
      });
      req.on('error', () => resolve({ ok: false }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
      req.write(body);
      req.end();
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
}

/**
 * For each tenant with a cap, compute today's spend and decide whether to
 * pause the tenant. Returns the full status payload the UI consumes:
 *   { tenants: [{ tenant, cap_usd, spent_usd, ratio, status, locked_at }] }
 *
 * `status`:
 *   ok       spent < 80 % cap
 *   warn     80 % ≤ spent < 100 %
 *   over     spent ≥ 100 %, lock fired this run OR earlier
 *   locked   tenant was already locked (no new pause sent)
 *
 * `enforce=true` triggers POST /admin/tenant/<t>/pause when over.
 * Caller controls cadence (board polls every 5–10 s while panel active).
 */
export async function getStatus(cwd = process.cwd(), enforce = true) {
  const caps = listCaps();
  const locks = listLocks();
  const spent = spentTodayPerTenant(cwd);
  const cfg = readLeashConfig(cwd);
  const proxyUrl = cfg.proxy_url || 'http://localhost:8765';

  const tenants = [];
  for (const [tenant, capInfo] of Object.entries(caps)) {
    const cap_usd = capInfo.cap_usd;
    const spent_usd = Number((spent[tenant] || 0).toFixed(6));
    const ratio = cap_usd > 0 ? spent_usd / cap_usd : 0;
    let status = 'ok';
    if (ratio >= 1) status = 'over';
    else if (ratio >= 0.8) status = 'warn';

    let locked_at = locks[tenant]?.locked_at || null;
    let pause_fired = null;
    if (status === 'over' && enforce && !locked_at) {
      const r = await postPause(proxyUrl, tenant);
      pause_fired = r.ok;
      if (r.ok) {
        setLock(tenant, `cap-exceeded:${spent_usd}/${cap_usd}`);
        locked_at = new Date().toISOString();
      }
    }
    if (locked_at) status = 'locked';

    tenants.push({
      tenant,
      cap_usd,
      spent_usd,
      ratio: Number(ratio.toFixed(3)),
      status,
      locked_at,
      pause_fired,
      updated_at: capInfo.updated_at,
    });
  }

  // Also surface tenants that have spend today but no cap configured —
  // operator sees them and can choose to set a cap.
  for (const [tenant, spent_usd] of Object.entries(spent)) {
    if (caps[tenant]) continue;
    tenants.push({
      tenant,
      cap_usd: null,
      spent_usd: Number(spent_usd.toFixed(6)),
      ratio: 0,
      status: 'no-cap',
      locked_at: null,
      pause_fired: null,
    });
  }

  return {
    tenants: tenants.sort((a, b) => (b.spent_usd || 0) - (a.spent_usd || 0)),
    caps_file: CAPS_FILE,
    locks_file: LOCKS_FILE,
  };
}

/**
 * Fetch native per-tenant caps from llm-leash v2.27+ /admin/stats.
 * Returns { source: 'native', tenants: [...] } when the proxy exposes them,
 * or { source: 'local', tenants: [...] } falling back to getStatus().
 *
 * Shape of each tenant entry matches getStatus() so callers need no branching.
 */
export async function getStatusWithNativeFallback(cwd = process.cwd(), enforce = true) {
  try {
    const native = await readLeashNativeCaps(cwd);
    if (native && typeof native === 'object' && Object.keys(native).length > 0) {
      // Native format from v2.27: { <tenant>: { cap_usd, spent_usd, period, ... } }
      const tenants = Object.entries(native).map(([tenant, info]) => {
        const cap_usd = info.cap_usd ?? null;
        const spent_usd = typeof info.spent_usd === 'number' ? Number(info.spent_usd.toFixed(6)) : 0;
        const ratio = cap_usd && cap_usd > 0 ? spent_usd / cap_usd : 0;
        let status = 'ok';
        if (ratio >= 1) status = 'over';
        else if (ratio >= 0.8) status = 'warn';
        if (!cap_usd) status = 'no-cap';
        return { tenant, cap_usd, spent_usd, ratio: Number(ratio.toFixed(3)), status, locked_at: null, pause_fired: null };
      }).sort((a, b) => (b.spent_usd || 0) - (a.spent_usd || 0));
      return { source: 'native', tenants, caps_file: null, locks_file: null };
    }
  } catch { /* fall through to local */ }
  const local = await getStatus(cwd, enforce);
  return { source: 'local', ...local };
}
