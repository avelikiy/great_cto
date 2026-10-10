import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

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
// Bind host. Default loopback. --host/GREAT_CTO_HOST allows binding the board to a
// non-loopback address for tunnelling; put your reverse-proxy auth in front.
const HOST = (() => {
  const i = process.argv.indexOf('--host');
  return String(i > -1 ? process.argv[i + 1] : process.env.GREAT_CTO_HOST || '127.0.0.1');
})();
const GREAT_CTO_DIR = path.join(os.homedir(), '.great_cto');
const SHARE_STATE_FILE = path.join(GREAT_CTO_DIR, 'board-share.json');
// Test seam: honor an explicit override so tests can point the registry at a
// tmp fixture without touching the real ~/.great_cto/projects.json (same
// convention as GREAT_CTO_BD_BIN in lib/beads.mjs). Unset in production —
// zero behavior change at runtime.
const PROJECTS_FILE = process.env.GREAT_CTO_PROJECTS_FILE || path.join(GREAT_CTO_DIR, 'projects.json');
const SHARE_ENDPOINT = 'https://greatcto.systems/r/';
const VAPID_KEYS_FILE = path.join(GREAT_CTO_DIR, 'vapid-keys.json');
const PUSH_SUBS_FILE = path.join(GREAT_CTO_DIR, 'push-subscriptions.json');
const NOTIF_HISTORY_FILE = process.env.GREAT_CTO_NOTIF_HISTORY_FILE || path.join(GREAT_CTO_DIR, 'notif-history.json');
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
