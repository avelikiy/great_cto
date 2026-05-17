/**
 * Service Worker for great_cto board — Web Push support
 *
 * Strategy: empty-body push (SW fetches content from server on push).
 * This avoids payload encryption complexity while keeping notifications fresh.
 */

const BOARD_ORIGIN = self.location.origin;

self.addEventListener('activate', (event) => {
  // Take control of all clients immediately — no reload required after install
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  event.waitUntil(handlePush());
});

async function handlePush() {
  let notif = null;
  try {
    const res = await fetch(`${BOARD_ORIGIN}/api/notif-history?unread=1&limit=1`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        notif = data[0];
      }
    }
  } catch { /* network error — show a generic notification */ }

  const title = notif?.title || 'great_cto';
  const body  = notif?.body  || 'You have a new notification.';
  const tag   = notif?.id    || 'gcto-push';
  const notifId = notif?.id  || null;

  const options = {
    body,
    tag,
    // icon may not exist — browsers handle missing icon gracefully
    icon: `${BOARD_ORIGIN}/assets/logo-192.png`,
    badge: `${BOARD_ORIGIN}/assets/favicon-32.png`,
    data: {
      url: `${BOARD_ORIGIN}/`,
      notifId,
    },
    requireInteraction: false,
  };

  return self.registration.showNotification(title, options);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { url, notifId } = event.notification.data || {};

  event.waitUntil((async () => {
    // Mark notification as read
    if (notifId) {
      try {
        await fetch(`${BOARD_ORIGIN}/api/notif-history/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: notifId }),
        });
      } catch { /* best-effort */ }
    }

    // Focus existing board window or open a new one
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if (client.url.startsWith(BOARD_ORIGIN) && 'focus' in client) {
        return client.focus();
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(url || `${BOARD_ORIGIN}/`);
    }
  })());
});
