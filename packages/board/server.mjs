#!/usr/bin/env node
/**
 * great_cto board server
 * Serves Kanban + CTO Dashboard on localhost:3141
 * Data source: bd list --json (Beads), verdicts/*.log, docs/
 *
 * Usage: node server.mjs [--port 3141] [--no-open]
 */

import http from 'http';
// The build board. (The separate operator-console runtime lives in its own repo.)
import fs from 'fs';
import path from 'path';
import { execSync, spawnSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';
import {
  getVapidKeys,
  sendWebPush,
  loadSubscriptions,
  addSubscription,
  removeSubscription,
} from './push-adapter.mjs';
import crypto from 'node:crypto';
import {
  __dirname,
  PORT,
  PUBLIC,
  BUILD_VERSION,
  HOST,
  GREAT_CTO_DIR,
  SHARE_STATE_FILE,
  PROJECTS_FILE,
  SHARE_ENDPOINT,
  VAPID_KEYS_FILE,
  PUSH_SUBS_FILE,
  NOTIF_HISTORY_FILE,
  VAPID_SUBJECT,
} from './lib/config.mjs';
import { csvCell, originAllowed, eventSurface, readFileSafe } from './lib/util.mjs';
import { sseClients, _reportRepublishDedupeSet, MAX_NOTIF_HISTORY, notifHistory, bdCache } from './lib/state.mjs';
import {
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
} from './lib/projects.mjs';
import { broadcast, broadcastTasks } from './lib/sse.mjs';
import { loadNotifHistory, saveNotifHistory, addNotification } from './lib/notifications.mjs';
import { getMemory, getPipeline, getCostHistory, getInbox } from './lib/data-readers.mjs';
import {
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
} from './lib/beads.mjs';
import { getMetrics, getCanonicalAgents } from './lib/metrics.mjs';
import { readVerdicts, readPlanCosts, readQAStats, readSecStats } from './lib/verdicts.mjs';
import {
  deriveDomain,
  clusterFailureModes,
  isRetired,
  isSuccess,
  isFailure,
  getAgentsFleet,
  getAgentProfile,
  retireAgent,
  restoreAgent,
  decisionsLogPath,
  appendDecisionLog,
  readDecisionsLog,
} from './lib/fleet.mjs';

// ── Helpers ────────────────────────────────────────────────────────────────────

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

    // Mark fired optimistically BEFORE the async fetch so that concurrent
    // calls for other projects (same cron tick) see this key immediately
    // and don't fire duplicate sends. Also prevents infinite retry on relay
    // errors — a failed send is still recorded so the next 5-min tick skips.
    fired[dedupeKey] = new Date().toISOString();
    const keys = Object.keys(fired);
    if (keys.length > 500) {
      const trimmed = {};
      keys.slice(-500).forEach(k => trimmed[k] = fired[k]);
      writeAlertsFired(trimmed);
    } else {
      writeAlertsFired(fired);
    }

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
  setInterval(async () => {
    try {
      const now = new Date();
      // Friday = 5, hour 9, dedupe by ISO-week
      if (now.getUTCDay() !== 5 || now.getUTCHours() !== 9) return;
      // Correct ISO-8601 week number (getUTCDate is day-of-month, not day-of-year)
      const thu = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      thu.setUTCDate(thu.getUTCDate() + 4 - (thu.getUTCDay() || 7));
      const isoWeek = `${thu.getUTCFullYear()}-W${Math.ceil(((thu - new Date(Date.UTC(thu.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7)}`;
      const projects = listProjects();
      // Sequential loop — each project awaits so file writes complete before the
      // next project reads alerts-fired.json. Prevents the race condition where
      // all N projects read an empty map simultaneously and all fire.
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
        await fireEmailAlert('digest.weekly', dedupeKey, weeklyPayload);
        addNotification('digest.weekly', weeklyPayload);
        await firePushAlert('digest.weekly', dedupeKey, weeklyPayload);
      }
    } catch (e) { console.warn('cron digest.weekly failed:', e.message); }
  }, FIVE_MIN);

  // digest.daily: morning summary (Mon–Fri, 08:00 UTC).
  // Covers yesterday's activity: spend, features shipped, blocked gates.
  // Idempotent via date-keyed dedupe so re-starts don't re-send.
  setInterval(async () => {
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
        await fireEmailAlert('digest.daily', dedupeKey, dailyPayload);
        addNotification('digest.daily', dailyPayload);
        await firePushAlert('digest.daily', dedupeKey, dailyPayload);
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

  console.log('Alert cron started: gate.stale (5min), sla.escalate (5min), connector.health (5min), cost.threshold (1h), digest.daily (Mon–Fri 08:00), digest.weekly (Fri 09:00), report.daily (09:00)');
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
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB — board payloads are tiny; cap guards against unbounded `body += c` accumulation.
const server = http.createServer(async (req, res) => {
  // Single-point body-size guard: every route reads `body += c`, so cap cumulative
  // request bytes here and kill the socket on overflow rather than buffering forever.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    let _seen = 0;
    req.on('data', (c) => {
      _seen += c.length;
      if (_seen > MAX_BODY_BYTES && !res.headersSent) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'request body too large' }));
        req.destroy();
      }
    });
  }
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

  // ── CSRF guard (BH-31) ──────────────────────────────────────────────────────
  // The board binds 127.0.0.1, but a page the user visits in their browser can still
  // issue *simple* cross-origin POSTs to localhost (no preflight). Every state-changing
  // request must therefore be SAME-ORIGIN — otherwise a malicious page could approve an
  // autopilot gate (→ run an irreversible write), approve a dev gate, or mutate tasks.
  // (originAllowed() permits requests with no Origin — curl, the CLI, server-to-server —
  // and rejects a foreign browser Origin.)
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !originAllowed(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'cross-origin request blocked — the board only accepts same-origin state changes' }));
    return;
  }

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

  // ── Read a project doc (markdown) referenced from a task — for the side-panel viewer.
  // Path-traversal-safe: the resolved path must stay inside the project cwd; .md only.
  if (pathname === '/api/doc' && req.method === 'GET') {
    const c = url.searchParams.get('project') ? resolveProjectCwd(url.searchParams.get('project')) : cwd;
    const rel = String(url.searchParams.get('path') || '');
    const abs = path.resolve(c, rel);
    if (!rel || !abs.startsWith(path.resolve(c) + path.sep) || !abs.toLowerCase().endsWith('.md')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'path must be a .md file inside the project' }));
      return;
    }
    try {
      const st = fs.statSync(abs);
      if (!st.isFile() || st.size > 1024 * 1024) throw new Error('not a readable doc');
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ name: path.basename(abs), path: rel, content: fs.readFileSync(abs, 'utf8') }));
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'doc not found: ' + rel }));
    }
    return;
  }
  // (board-triggered agent launch removed — the board no longer spawns coding agents)

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
        const r = bd(args, { cwd: gateCwd, timeout: 5000 });
        if (r.status !== 0) return { error: bdErr(r, 'bd update failed') };
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

  // change_tier for the current working-tree diff — the gate + judge plan (ADR-003/004).
  if (pathname === '/api/change-tier') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getChangeTier(cwd)));
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
          const r = bd(args, { cwd, timeout: 5000 });
          if (r.status !== 0) return { error: bdErr(r, 'bd create failed') };
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
            if (needUpdate) bd(updateArgs, { cwd, timeout: 5000 });
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
        const r = bd(['update', id, '--status', status], { cwd, timeout: 5000 });
        if (r.status !== 0) return { error: bdErr(r, 'bd update failed') };
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
        const r = bd(['update', id, '--priority', String(priority)], { cwd, timeout: 5000 });
        if (r.status !== 0) return { error: bdErr(r, 'bd update failed') };
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
    res.end(JSON.stringify(getAgentsFleet(cwd)));
    return;
  }

  // Build version — so the board shows which great_cto version it's running.
  if (pathname === '/api/version') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ version: BUILD_VERSION, surface: 'builder', node: process.version.replace(/^v/, '') }));
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
    // Surface filter: the builder board must not see operate-side alerts (autopilot dead-letters,
    // connector health, case SLA). Default to the builder surface; `?scope=operate|all` opts in.
    // Classify by event name too, so entries written before the surface tag existed are filtered.
    const scope = url.searchParams.get('scope') || 'builder';
    const surfaceOf = (n) => n.surface || eventSurface(n.event);
    let items = notifHistory;
    if (scope === 'builder') items = items.filter(n => surfaceOf(n) !== 'operate');
    else if (scope === 'operate') items = items.filter(n => surfaceOf(n) === 'operate');
    items = items.slice(0, limit);
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

  // ── Heartbeat watchdog (Paperclip pattern) ──────────────────────────────
  // GET /api/heartbeat → { stuck: [{id,title,agent,age_h}], budgets: {agent→cap},
  //                        goal_ancestry: string, tool_failure_rate_1h: number }
  if (pathname === '/api/heartbeat') {
    const tasks = getTasks(cwd);
    const nowMs = Date.now();
    const STUCK_H = 48;
    const stuck = tasks
      .filter(t => t.status === 'in_progress')
      .map(t => {
        const startedAt = t.startedAt ? new Date(t.startedAt).getTime() : null;
        const ageH = startedAt ? (nowMs - startedAt) / 3600000 : null;
        return { id: t.id, title: t.title, agent: t.agent, age_h: ageH ? Math.round(ageH) : null };
      })
      .filter(t => t.age_h !== null && t.age_h > STUCK_H);

    // Per-agent budgets from PROJECT.md
    const projectMdPath = path.join(cwd, '.great_cto', 'PROJECT.md');
    let budgets = {};
    let goalAncestry = null;
    try {
      const projectTxt = fs.readFileSync(projectMdPath, 'utf8');
      const sectionMatch = projectTxt.match(/^agent-budget:\s*\n((?:[ \t]+\S[^\n]*\n?)*)/m);
      if (sectionMatch) {
        for (const line of sectionMatch[1].split('\n')) {
          const m = line.match(/^\s+([a-z][a-z0-9-]*):\s*(\d+(?:\.\d+)?)/);
          if (m) budgets[m[1]] = parseFloat(m[2]);
        }
      }
      // Goal ancestry
      const archetype = (projectTxt.match(/^(?:archetype|primary):\s*(\S+)/m) || [])[1] || null;
      const compliance = (projectTxt.match(/^compliance:\s*(.+)$/m) || [])[1] || null;
      const phase = (projectTxt.match(/^phase:\s*(\S+)/m) || [])[1] || null;
      const complianceClean = compliance && !/^\[?none\]?$/i.test(compliance.trim()) ? compliance.trim() : null;
      if (archetype) goalAncestry = `[archetype:${archetype}]${complianceClean ? ` [compliance:${complianceClean}]` : ''}${phase ? ` [phase:${phase}]` : ''}`;
    } catch { /* project not found */ }

    // Tool failure rate in last hour
    let toolFailureRate1h = 0;
    try {
      const failLog = fs.readFileSync(path.join(cwd, '.great_cto', 'tool-failures.log'), 'utf8');
      const cutoff = new Date(nowMs - 3600000).toISOString();
      toolFailureRate1h = failLog.split('\n').filter(l => l > cutoff && l.trim()).length;
    } catch { /* no log */ }

    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ stuck, budgets, goal_ancestry: goalAncestry, tool_failure_rate_1h: toolFailureRate1h }));
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
server.listen(PORT, HOST, () => {
  console.log(`great_cto board → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.log(`  ⚠ bound to ${HOST} — reachable beyond this machine. Operators authenticate via invite`);
    console.log(`    links; put your reverse-proxy auth in front for anything admin-grade.`);
  }
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
