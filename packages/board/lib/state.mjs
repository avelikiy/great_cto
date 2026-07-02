// ── In-process mutable singletons ───────────────────────────────────────────
// Rule: only this module holds mutable shared state. Every module that needs
// sseClients, bdCache, or notification history imports from here — no
// top-level shared state anywhere else.

const sseClients = new Set();
const _reportRepublishDedupeSet = new Set(); // dedupe daily report republish

// ── In-app notification history ────────────────────────────────────────────────
// Persisted to ~/.great_cto/notif-history.json. Capped at 100 entries.
// Each entry: { id, event, title, body, level, project, ts, read }
const MAX_NOTIF_HISTORY = 100;
// NOTE: kept as a mutable array (not a `let` rebind) so importing modules can
// replace its contents in place (`notifHistory.length = 0; notifHistory.push(...items)`)
// — ESM live bindings do not allow an importer to reassign an imported `let`.
let notifHistory = [];

// ── Beads data ─────────────────────────────────────────────────────────────────
// Cache bdList output per cwd for BD_CACHE_TTL_MS. Invalidated when the project's
// .beads/interactions.jsonl changes (the file watcher in watchBeads() calls
// bdCacheInvalidate(cwd) before broadcasting). This avoids spawning `bd list`
// on every API call when 5+ projects are open in tabs.
const bdCache = new Map(); // cwd → { ts, data }

export {
  sseClients,
  _reportRepublishDedupeSet,
  MAX_NOTIF_HISTORY,
  notifHistory,
  bdCache,
};
