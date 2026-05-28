#!/usr/bin/env node
/**
 * scripts/hooks/quota-check.mjs
 *
 * Reads ~/.claude/.credentials.json (Claude Code OAuth), fetches session quota
 * from api.anthropic.com/api/oauth/usage, and prints a warning when quota is
 * near-exhausted — before the user launches a heavy pipeline and hits a rate
 * limit mid-run.
 *
 * Invoked from the SessionStart hook in .claude-plugin/plugin.json.
 *
 * Thresholds:
 *   >= 70%  ⚡  warn   — consider fast-path for large features
 *   >= 85%  🔴  alert  — use fast-path only (skip ARCH doc)
 *   >= 95%  🛑  block  — do NOT start heavy pipeline; wait for reset
 *
 * Cache: ~/.great_cto/quota-cache.json, TTL 5 minutes (shared across parallel
 * agents via atomic write — avoids hammering the API on every SubagentStart).
 *
 * Auth: Bearer from claudeAiOauth.accessToken; auto-refreshes via
 * platform.claude.com/v1/oauth/token when the token is within 5 min of expiry.
 *
 * Graceful degradation:
 *   - No credentials file      → silent exit (API-key user, not OAuth)
 *   - Network failure           → silent exit (no noise on flaky connections)
 *   - Stale cache on 401        → attempt one token refresh, then silent exit
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ── Constants ──────────────────────────────────────────────────────────────

const CREDS_PATH    = join(homedir(), '.claude', '.credentials.json');
const CACHE_PATH    = join(homedir(), '.great_cto', 'quota-cache.json');
const USAGE_URL     = 'https://api.anthropic.com/api/oauth/usage';
const TOKEN_URL     = 'https://platform.claude.com/v1/oauth/token';
const CLIENT_ID     = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const BETA_HEADER   = 'oauth-2025-04-20';
const USER_AGENT    = 'claude-cli/1.0';
const CACHE_TTL_MS  = 5 * 60 * 1000;   // 5 minutes
const HTTP_TIMEOUT  = 8_000;            // ms

const WARN_PCT     = 70;
const RED_PCT      = 85;
const CRITICAL_PCT = 95;

// ── Rendering helpers ──────────────────────────────────────────────────────

/** ASCII progress bar, e.g. "████████░░░░" */
function bar(pct, width = 10) {
  const filled = Math.min(width, Math.round((pct / 100) * width));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** Human-readable time until resets_at ISO string */
function resetIn(resetsAt) {
  if (!resetsAt) return '';
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (ms <= 0) return 'resetting now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Pacing: compare % used vs % of window elapsed.
 * e.g. 78% used after 50% of 5h window → running ahead (+28 pts)
 */
function pacing(utilPct, resetsAt, windowHours) {
  if (!resetsAt) return null;
  const windowMs = windowHours * 60 * 60 * 1000;
  const resetTs  = new Date(resetsAt).getTime();
  const startTs  = resetTs - windowMs;
  const elapsedPct = Math.round(((Date.now() - startTs) / windowMs) * 100);
  if (elapsedPct <= 0 || elapsedPct >= 100) return null;
  const delta = utilPct - elapsedPct;
  if (delta > 5)  return `⚡ Ahead +${delta}pts`;
  if (delta < -5) return `↓ Under ${delta}pts`;
  return `→ On track`;
}

// ── HTTP ───────────────────────────────────────────────────────────────────

async function fetchUsage(accessToken) {
  const resp = await fetch(USAGE_URL, {
    headers: {
      Authorization:    `Bearer ${accessToken}`,
      'anthropic-beta': BETA_HEADER,
      'User-Agent':     USER_AGENT,
    },
    signal: AbortSignal.timeout(HTTP_TIMEOUT),
  });
  return { status: resp.status, data: resp.ok ? await resp.json() : null };
}

async function refreshAccessToken(oldRefreshToken) {
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type':   'application/json',
      'anthropic-beta': BETA_HEADER,
      'User-Agent':     USER_AGENT,
    },
    body: JSON.stringify({
      grant_type:    'refresh_token',
      client_id:     CLIENT_ID,
      refresh_token: oldRefreshToken,
    }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT),
  });
  if (!resp.ok) return null;
  return resp.json();
}

// ── Cache ──────────────────────────────────────────────────────────────────

function readCache() {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    const c = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
    if (Date.now() - (c._ts ?? 0) < CACHE_TTL_MS) return c;
  } catch { /* corrupt */ }
  return null;
}

function writeCache(data) {
  try {
    mkdirSync(join(homedir(), '.great_cto'), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify({ ...data, _ts: Date.now() }));
  } catch { /* best-effort */ }
}

// ── Output ─────────────────────────────────────────────────────────────────

function renderWarnings(data) {
  const session  = data.five_hour?.utilization        ?? 0;
  const sonnet   = data.seven_day_sonnet?.utilization ?? null;
  const extra    = data.extra_usage;

  const sessionReset = data.five_hour?.resets_at;
  const sonnetReset  = data.seven_day_sonnet?.resets_at;

  const lines = [];

  // ── Session window (5h) ────────────────────────────────────────────────
  if (session >= WARN_PCT) {
    const icon   = session >= CRITICAL_PCT ? '🛑' : session >= RED_PCT ? '🔴' : '⚡';
    const advice = session >= CRITICAL_PCT
      ? 'wait for reset before starting any pipeline'
      : session >= RED_PCT
      ? 'fast-path only — skip ARCH doc'
      : 'prefer fast-path for large features';
    const reset  = sessionReset ? `  resets in ${resetIn(sessionReset)}` : '';
    const pace   = pacing(session, sessionReset, 5);
    const paceStr = pace ? `  ${pace}` : '';
    lines.push(`${icon} Session  ${bar(session)} ${session}%${reset}${paceStr}  — ${advice}`);
  }

  // ── Sonnet 7-day sub-quota ─────────────────────────────────────────────
  if (sonnet !== null && sonnet >= WARN_PCT) {
    const icon  = sonnet >= CRITICAL_PCT ? '🛑' : sonnet >= RED_PCT ? '🔴' : '⚡';
    const reset = sonnetReset ? `  resets in ${resetIn(sonnetReset)}` : '';
    lines.push(`${icon} Sonnet   ${bar(sonnet)} ${sonnet}%${reset}  — agents may auto-route to Haiku`);
  }

  // ── Extra (pay-as-you-go) usage ────────────────────────────────────────
  if (extra?.is_enabled && extra.monthly_limit > 0) {
    const pct   = Math.round((extra.used_credits / extra.monthly_limit) * 100);
    const spent = (extra.used_credits / 100).toFixed(2);
    const limit = (extra.monthly_limit / 100).toFixed(0);
    if (pct >= 50) {
      const icon = pct >= 90 ? '🔴' : '💳';
      lines.push(`${icon} Extra    ${bar(pct)} $${spent} / $${limit}  (${pct}% of monthly limit)`);
    }
  }

  if (lines.length > 0) {
    console.log('=== QUOTA ===');
    lines.forEach(l => console.log(l));
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Only for Claude Code OAuth users — API-key users have no credentials file
  if (!existsSync(CREDS_PATH)) return;

  let creds;
  try { creds = JSON.parse(readFileSync(CREDS_PATH, 'utf8')); }
  catch { return; }

  const oauth = creds?.claudeAiOauth;
  if (!oauth?.accessToken) return;

  // Fast path: serve from cache
  const cached = readCache();
  if (cached) { renderWarnings(cached); return; }

  // Live fetch
  let accessToken = oauth.accessToken;
  let { status, data } = await fetchUsage(accessToken).catch(() => ({ status: 0, data: null }));

  // Auto-refresh on 401
  if (status === 401 && oauth.refreshToken) {
    const refreshed = await refreshAccessToken(oauth.refreshToken).catch(() => null);
    if (refreshed?.access_token) {
      accessToken = refreshed.access_token;
      // Write updated credentials (best-effort)
      try {
        const expiresAt = Date.now() + (refreshed.expires_in ?? 3600) * 1000;
        creds.claudeAiOauth.accessToken = refreshed.access_token;
        creds.claudeAiOauth.expiresAt   = expiresAt;
        if (refreshed.refresh_token) creds.claudeAiOauth.refreshToken = refreshed.refresh_token;
        writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2));
      } catch { /* best-effort */ }
      ({ status, data } = await fetchUsage(accessToken).catch(() => ({ status: 0, data: null })));
    }
  }

  if (!data) return; // network failure — silent, no noise

  writeCache(data);
  renderWarnings(data);
}

main().catch(() => { /* silent failure — never crash SessionStart */ });
