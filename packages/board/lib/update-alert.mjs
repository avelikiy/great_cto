// Release notification — daily check for a newer great-cto npm release,
// surfaced through the board's existing notification + push-alert pipeline.
//
// Design mirrors the CLI's update-check.ts (same registry endpoint, same
// zero-dependency approach) but fires through addNotification()/firePushAlert()
// instead of a stderr hint, since the board is a long-running server, not a
// one-shot CLI invocation.
//
// Registry endpoint: https://registry.npmjs.org/-/package/great-cto/dist-tags
//   Verified with curl to return only `{"latest":"x.y.z"}`.
//
// Dedupe: alerts-fired.json (existing mechanism in alerts.mjs) is keyed by
// dedupeKey; the key here embeds the latest version string so each new
// release notifies exactly once, no matter how many daily ticks pass while
// that version remains the latest.
//
// Opt-out: GREAT_CTO_NO_UPDATE_CHECK=1 (same env var as the CLI hint).

const REGISTRY_DIST_TAGS_URL = 'https://registry.npmjs.org/-/package/great-cto/dist-tags';
const FETCH_TIMEOUT_MS = 3000;

/** Pure function: parse "x.y.z" into a 3-tuple of ints (missing/garbage segments -> 0). */
function parseSemver(v) {
  return String(v || '').split('.').map(n => parseInt(n, 10) || 0);
}

/** Pure function: true when `latest` is strictly newer than `current` (semver order). */
function isNewerVersion(current, latest) {
  if (!current || !latest || current === 'unknown') return false;
  const a = parseSemver(latest);
  const b = parseSemver(current);
  for (let i = 0; i < 3; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/** Pure function: the dedupe key for a given latest version — one notification per new release, ever. */
function updateDedupeKey(latest) {
  return `update.available:${latest}`;
}

/** Pure function: build the notification payload for a given current/latest pair. */
function buildUpdatePayload(current, latest) {
  return {
    title: `great_cto v${latest} released (you run v${current})`,
    body: `A new great-cto release is available. Upgrade with: npx great-cto upgrade`,
    level: 'info',
    project: 'great_cto',
    link: 'https://github.com/avelikiy/great_cto/releases',
    action: 'View release',
    kv: { current, latest },
  };
}

/** Fetch {latest} from the npm registry. Returns null on any error/timeout/offline — fail-silent by design. */
async function fetchLatestVersion(fetchFn = fetch) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetchFn(REGISTRY_DIST_TAGS_URL, { signal: ctrl.signal });
      if (!res.ok) return null;
      const body = await res.json();
      return typeof body?.latest === 'string' ? body.latest : null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/**
 * Run one update check. Injectable deps for testing — no real network calls
 * or fs/notification side effects when `fetchFn`/`isFired`/`notify` are stubs.
 *
 * @param {object} opts
 * @param {string} opts.currentVersion   BUILD_VERSION from lib/config.mjs
 * @param {(url: string, init?: object) => Promise<Response>} [opts.fetchFn]
 * @param {(dedupeKey: string) => boolean} [opts.isFired]   dedupe lookup (alerts-fired.json)
 * @param {(current: string, latest: string, dedupeKey: string) => void} [opts.notify]
 *   called once when a newer, undelivered version is found
 * @returns {Promise<{checked: boolean, latest: string|null, notified: boolean}>}
 */
async function checkForRelease({ currentVersion, fetchFn = fetch, isFired = () => false, notify = () => {} }) {
  if (process.env.GREAT_CTO_NO_UPDATE_CHECK === '1') {
    return { checked: false, latest: null, notified: false };
  }
  const latest = await fetchLatestVersion(fetchFn);
  if (!latest) return { checked: true, latest: null, notified: false };
  if (!isNewerVersion(currentVersion, latest)) return { checked: true, latest, notified: false };
  const dedupeKey = updateDedupeKey(latest);
  if (isFired(dedupeKey)) return { checked: true, latest, notified: false };
  notify(currentVersion, latest, dedupeKey);
  return { checked: true, latest, notified: true };
}

export {
  REGISTRY_DIST_TAGS_URL,
  isNewerVersion,
  updateDedupeKey,
  buildUpdatePayload,
  fetchLatestVersion,
  checkForRelease,
};
