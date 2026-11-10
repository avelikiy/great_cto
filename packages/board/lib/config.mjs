import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stateHome } from '../../cli/src/state-home.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// `--port N` (or `--port=N`) first — server.mjs's usage line documents it, and
// ignoring it put a test board started with `--port 3177` onto :3141 (3.58.1).
// Then BOARD_PORT, PORT, and 3141. A value that is not a port is skipped.
export function portFrom(argv = process.argv, env = process.env) {
  const ok = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n < 65536 ? n : null; };
  const i = argv.indexOf('--port');
  const eq = argv.find((a) => typeof a === 'string' && a.startsWith('--port='));
  return ok(i > -1 ? argv[i + 1] : eq ? eq.slice(7) : null) ?? ok(env.BOARD_PORT) ?? ok(env.PORT) ?? 3141;
}
const PORT = portFrom();
const PUBLIC = path.join(__dirname, '..', 'public');
// Build version — read the plugin manifest this board ships inside (packages/board → ../../.claude-plugin).
const BUILD_VERSION = (() => {
  for (const rel of ['../../../.claude-plugin/plugin.json', '../../cli/package.json']) {
    try { const v = JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8')).version; if (v) return v; } catch { /* try next */ }
  }
  return 'unknown';
})();
// Bind host. Default loopback. `--host`, then GREAT_CTO_BOARD_HOST, then the legacy
// GREAT_CTO_HOST — but only when that one holds an address. The same variable name
// carries the AGENT host (`codex`, `claude-code`) for hook children
// (scripts/hooks/codex-adapter.mjs), and a board started from such a child used to
// try to bind the name "codex".
const LOOPBACK_BINDS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const looksLikeAddress = (v) => v === 'localhost' || /^[0-9.]+$/.test(v) || v.includes(':');
export function bindHostFrom(argv = process.argv, env = process.env) {
  const i = argv.indexOf('--host');
  if (i > -1 && argv[i + 1]) return String(argv[i + 1]);
  if (env.GREAT_CTO_BOARD_HOST) return String(env.GREAT_CTO_BOARD_HOST);
  const legacy = String(env.GREAT_CTO_HOST || '');
  return looksLikeAddress(legacy) ? legacy : '127.0.0.1';
}
// The board has no login. Beyond loopback, anyone who can reach the port can read
// every project and approve gates, so the bind is refused unless the operator states
// that authentication sits in front of it (a reverse proxy, a tunnel with access
// control). Returns the reason to refuse, or null.
export function bindRefusal(host = HOST, env = process.env, argv = process.argv) {
  if (LOOPBACK_BINDS.has(String(host).toLowerCase())) return null;
  if (env.GREAT_CTO_BOARD_BEHIND_AUTH === '1' || argv.includes('--behind-auth')) return null;
  return `refusing to bind ${host}: the board has no authentication of its own, and beyond loopback ` +
    `anyone who reaches this port can read every project and approve gates. ` +
    `Put authentication in front of it (a reverse proxy or a tunnel with access control), ` +
    `then start it with GREAT_CTO_BOARD_BEHIND_AUTH=1 (or --behind-auth).`;
}
const HOST = bindHostFrom();
// Shared dedicated namespace with the CLI; unset/empty keeps the operator default.
const GREAT_CTO_DIR = stateHome();
const SHARE_STATE_FILE = path.join(GREAT_CTO_DIR, 'board-share.json');
// Test seam: honor an explicit override so tests can point the registry at a
// tmp fixture without touching the real ~/.great_cto/projects.json (same
// convention as GREAT_CTO_BD_BIN in lib/beads.mjs). Unset in production —
// zero behavior change at runtime.
function stateFileOverride(name, fallback) {
  const value = process.env[name];
  if (!value) return path.join(GREAT_CTO_DIR, fallback);
  if (!path.isAbsolute(value) || value.includes('\0')) throw new Error(`${name} must be absolute and contain no NUL`);
  return path.resolve(value);
}
const PROJECTS_FILE = stateFileOverride('GREAT_CTO_PROJECTS_FILE', 'projects.json');
const SHARE_ENDPOINT = 'https://greatcto.systems/r/';
const VAPID_KEYS_FILE = path.join(GREAT_CTO_DIR, 'vapid-keys.json');
const PUSH_SUBS_FILE = path.join(GREAT_CTO_DIR, 'push-subscriptions.json');
const NOTIF_HISTORY_FILE = stateFileOverride('GREAT_CTO_NOTIF_HISTORY_FILE', 'notif-history.json');
const VAPID_SUBJECT = 'mailto:hi@updates.greatcto.systems';

export {
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
};
