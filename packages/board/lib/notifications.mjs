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
function addNotification(event, payload) {
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
