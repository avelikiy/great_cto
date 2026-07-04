import fs from 'fs';
import crypto from 'node:crypto';
import { GREAT_CTO_DIR, NOTIF_HISTORY_FILE } from './config.mjs';
import { notifHistory, MAX_NOTIF_HISTORY } from './state.mjs';
import { eventSurface } from './util.mjs';
import { broadcast } from './sse.mjs';

function loadNotifHistory() {
  try {
    if (fs.existsSync(NOTIF_HISTORY_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(NOTIF_HISTORY_FILE, 'utf8'));
      if (Array.isArray(parsed)) { notifHistory.length = 0; notifHistory.push(...parsed); }
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
function addNotification(event, payload, dedupeKey = null) {
  // Idempotent per dedupeKey: the alert crons tick every 5 min and a persistent
  // condition (open P0, blocked/stale gate, cost over threshold, the daily
  // digest during its whole UTC hour) would otherwise add a fresh in-app
  // notification on every tick — spamming the bell. Email/push already dedupe
  // via alerts-fired.json; this makes the in-app notification dedupe the same.
  if (dedupeKey && notifHistory.some(n => n.dedupeKey === dedupeKey)) {
    return null;
  }
  const notif = {
    id: crypto.randomUUID(),
    event,
    surface: eventSurface(event),
    title: payload.title,
    body: payload.body,
    level: payload.level || 'info',
    project: payload.project || '',
    ts: new Date().toISOString(),
    read: false,
    ...(dedupeKey ? { dedupeKey } : {}),
  };
  notifHistory.unshift(notif);
  if (notifHistory.length > MAX_NOTIF_HISTORY) notifHistory.length = MAX_NOTIF_HISTORY;
  broadcast('notification', notif);
  saveNotifHistory();
  return notif;
}

// Load history at server start
loadNotifHistory();

export { loadNotifHistory, saveNotifHistory, addNotification };
