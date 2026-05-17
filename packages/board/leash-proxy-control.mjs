/**
 * leash-proxy-control.mjs — minimal process manager for the llm-leash HTTP
 * proxy. The board's Security toggle uses this to actually start/stop leash,
 * not just flip a config flag.
 *
 * Storage:
 *   ~/.great_cto/leash-proxy.pid   — detached PID of the running proxy
 *   ~/.great_cto/leash-proxy.log   — stdout/stderr of the proxy
 *
 * Two startup strategies, tried in order:
 *   1. `llm-leash-proxy` binary on PATH (preferred — installed via pip entry-point)
 *   2. `python3 -m leash.proxy` (fallback — works after `pip install -e .`)
 *
 * Stop is `kill -SIGTERM <pid>` + grace period; we don't escalate to KILL because
 * the proxy installs an asyncio handler and drains in-flight requests cleanly.
 *
 * Zero npm deps. Every function returns { ok, ...details }; never throws.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const HOME = os.homedir();
const PID_FILE = path.join(HOME, '.great_cto', 'leash-proxy.pid');
const LOG_FILE = path.join(HOME, '.great_cto', 'leash-proxy.log');
const INSTALL_ROOT = path.join(HOME, '.great_cto', 'llm-leash');

const DEFAULT_LISTEN = '127.0.0.1:8000';

/**
 * Is the proxy currently up? Two-stage check:
 *   - PID file exists AND the process is alive (signal 0)
 *   - OR the port is bound (someone else may have started leash manually)
 */
export function isProxyRunning(cfg = {}) {
  const pid = readPid();
  if (pid && processAlive(pid)) {
    return { running: true, pid, source: 'pid-file' };
  }
  // PID file stale or absent — check the port directly
  const listen = parseListen(cfg.proxy_url || `http://${DEFAULT_LISTEN}`);
  if (portInUse(listen.host, listen.port)) {
    return { running: true, pid: null, source: 'port-bound' };
  }
  return { running: false };
}

/**
 * Start the proxy in the background. Idempotent — fast-returns if already up.
 */
export function startProxy(cfg = {}) {
  const status = isProxyRunning(cfg);
  if (status.running) return { ok: true, already_running: true, ...status };

  if (!fs.existsSync(INSTALL_ROOT)) {
    return { ok: false, error: 'llm-leash not installed — run `great-cto leash install`' };
  }

  // Build CLI invocation
  const listen = parseListen(cfg.proxy_url || `http://${DEFAULT_LISTEN}`);
  const auditPath = cfg.audit_path || path.join(HOME, '.leash', 'audit.jsonl');
  const cap = cfg.daily_cap_usd ?? 50;
  const args = [
    '--listen', `${listen.host}:${listen.port}`,
    '--audit-log', auditPath,
    '--budget-usd', String(cap),
  ];

  // Ensure dirs exist for audit + log files
  try {
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  } catch { /* ignore */ }

  // Try `llm-leash-proxy` first, fall back to `python3 -m leash.proxy`
  const candidates = [
    { cmd: 'llm-leash-proxy', args },
    { cmd: 'python3', args: ['-m', 'leash.proxy', ...args] },
    { cmd: 'python', args: ['-m', 'leash.proxy', ...args] },
  ];

  let lastError = null;
  for (const c of candidates) {
    if (!hasCommand(c.cmd)) continue;
    try {
      const out = fs.openSync(LOG_FILE, 'a');
      const child = spawn(c.cmd, c.args, {
        detached: true,
        stdio: ['ignore', out, out],
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });
      child.unref();
      if (!child.pid) {
        lastError = `failed to fork ${c.cmd}`;
        continue;
      }
      writePid(child.pid);
      // Brief readiness wait — give the proxy ~1.5 s to bind the port
      return waitForReady(listen.host, listen.port, child.pid, 1500);
    } catch (e) {
      lastError = String(e);
    }
  }
  return { ok: false, error: lastError || 'no startup strategy succeeded' };
}

/**
 * Stop the proxy. Sends SIGTERM and waits up to 2 s for the process to exit.
 */
export function stopProxy(cfg = {}) {
  const status = isProxyRunning(cfg);
  if (!status.running) return { ok: true, already_stopped: true };

  let pid = status.pid;
  if (!pid) {
    // Port is bound but PID unknown — try `lsof` to discover
    pid = findPidByPort(parseListen(cfg.proxy_url || `http://${DEFAULT_LISTEN}`).port);
  }
  if (!pid) {
    return { ok: false, error: 'proxy running but PID not found — kill manually' };
  }

  try { process.kill(pid, 'SIGTERM'); } catch (e) {
    return { ok: false, error: `SIGTERM failed: ${e.message}` };
  }

  // Wait up to 2 s for graceful exit
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (!processAlive(pid)) break;
    sleepMs(100);
  }
  if (processAlive(pid)) {
    // Escalate
    try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ }
  }
  clearPid();
  return { ok: true, stopped_pid: pid };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function readPid() {
  try {
    if (!fs.existsSync(PID_FILE)) return null;
    const n = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

function writePid(pid) {
  try { fs.writeFileSync(PID_FILE, String(pid)); } catch { /* ignore */ }
}

function clearPid() {
  try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function portInUse(host, port) {
  // Use lsof on Unix; on Windows fall back to netstat (board only targets Unix)
  if (process.platform === 'win32') return false;
  try {
    const r = spawnSync('lsof', ['-iTCP:' + port, '-sTCP:LISTEN', '-Pn'], {
      stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500,
    });
    return (r.stdout || '').toString().trim().length > 0;
  } catch { return false; }
}

function findPidByPort(port) {
  if (process.platform === 'win32') return null;
  try {
    const r = spawnSync('lsof', ['-iTCP:' + port, '-sTCP:LISTEN', '-Pn', '-t'], {
      stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500,
    });
    const pid = parseInt((r.stdout || '').toString().trim().split('\n')[0], 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch { return null; }
}

function hasCommand(cmd) {
  try {
    const r = spawnSync(cmd, ['--help'], { stdio: 'ignore', timeout: 2000 });
    return r.status === 0 || r.status === 1; // many CLIs return 1 on --help
  } catch { return false; }
}

function parseListen(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname || '127.0.0.1', port: parseInt(u.port || '8000', 10) };
  } catch { return { host: '127.0.0.1', port: 8000 }; }
}

function waitForReady(host, port, pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processAlive(pid)) {
      clearPid();
      return { ok: false, error: 'proxy exited during startup — check ~/.great_cto/leash-proxy.log' };
    }
    if (portInUse(host, port)) {
      return { ok: true, pid, listen: `${host}:${port}` };
    }
    sleepMs(100);
  }
  // Didn't bind in time; might still be slow-starting — return ok=true with warning
  return { ok: true, pid, listen: `${host}:${port}`, warn: 'started but port not bound yet' };
}

function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* spin */ }
}
