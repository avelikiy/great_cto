import fs from 'fs';
import path from 'path';
import {
  getVapidKeys,
  sendWebPush,
  loadSubscriptions,
  removeSubscription,
} from '../push-adapter.mjs';
import { GREAT_CTO_DIR, PUSH_SUBS_FILE, VAPID_KEYS_FILE, VAPID_SUBJECT, BUILD_VERSION } from './config.mjs';
import { _reportRepublishDedupeSet } from './state.mjs';
import { listProjects, readProjectMd } from './projects.mjs';
import { addNotification } from './notifications.mjs';
import { getMetrics } from './metrics.mjs';
import { getCostHistory, getInbox } from './data-readers.mjs';
import { getTasks } from './beads.mjs';
import { readVerdicts } from './verdicts.mjs';
import { isFailure } from './fleet.mjs';
import { getShareState, toggleShare } from './share.mjs';
import { checkForRelease, buildUpdatePayload } from './update-alert.mjs';
import { log } from './log.mjs';

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
      log.warn(`fireEmailAlert ${eventName}: relay HTTP ${res.status} ${txt.slice(0, 200)}`);
      return;
    }
    log.info(`fireEmailAlert: sent ${eventName} (${dedupeKey})`);
  } catch (e) {
    log.warn(`fireEmailAlert ${eventName} failed:`, e.message);
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
        else log.warn(`firePushAlert send failed for ${sub.endpoint}:`, e.message);
      }
    }
    fired[pushKey] = new Date().toISOString();
    writeAlertsFired(fired);
  } catch (e) { log.warn('firePushAlert failed:', e.message); }
}

// ── Cron: scan gates / cost / weekly digest ───────────────────────────────
// Runs every 5 minutes once the server boots. Each check is idempotent
// thanks to alerts-fired.json dedupe.
function startAlertCron() {
  const FIVE_MIN = 5 * 60 * 1000;
  const ONE_HOUR = 60 * 60 * 1000;
  const ONE_DAY = 24 * 60 * 60 * 1000;

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
    } catch (e) { log.warn('cron incident.p0 failed:', e.message); }
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
    } catch (e) { log.warn('cron gate.blocked failed:', e.message); }
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
    } catch (e) { log.warn('cron gate.stale failed:', e.message); }
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
    } catch (e) { log.warn('cron cost.threshold failed:', e.message); }
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
    } catch (e) { log.warn('cron digest.weekly failed:', e.message); }
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
    } catch (e) { log.warn('cron digest.daily failed:', e.message); }
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
          .then(() => log.info(`report.daily: republished ${proj.slug}`))
          .catch(e => log.warn(`report.daily: ${proj.slug} failed: ${e.message}`));
      }
    } catch (e) { log.warn('cron report.daily failed:', e.message); }
  }, FIVE_MIN);

  // update.available: daily check for a newer great-cto npm release.
  // Dedupe key embeds the latest version string (see update-alert.mjs), so a
  // given release notifies exactly once no matter how many daily ticks pass
  // while it remains latest — a fresh key is only minted when npm publishes
  // a newer version. Fails silent offline; skipped entirely when
  // GREAT_CTO_NO_UPDATE_CHECK=1 (checkForRelease honors the env var itself).
  setInterval(() => {
    checkForRelease({
      currentVersion: BUILD_VERSION,
      isFired: (dedupeKey) => Boolean(readAlertsFired()[dedupeKey]),
      notify: (current, latest, dedupeKey) => {
        const payload = buildUpdatePayload(current, latest);
        fireEmailAlert('update.available', dedupeKey, payload);
        addNotification('update.available', payload);
        firePushAlert('update.available', dedupeKey, payload);
      },
    }).catch(e => log.warn('cron update.available failed:', e.message));
  }, ONE_DAY);

  log.info('Alert cron started: gate.stale (5min), sla.escalate (5min), connector.health (5min), cost.threshold (1h), digest.daily (Mon–Fri 08:00), digest.weekly (Fri 09:00), report.daily (09:00), update.available (24h)');
}

export { readAlertsFired, writeAlertsFired, fireEmailAlert, firePushAlert, startAlertCron };
