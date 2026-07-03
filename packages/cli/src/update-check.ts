// Update notifier — classic update-notifier pattern, zero dependency.
//
// Design:
//   - Foreground NEVER waits on the network. It only reads a local cache
//     file (~/.great_cto/update-check.json) written by a previous run.
//   - When the cache is missing or stale (>24h), a DETACHED background
//     process is spawned (node, stdio ignored, unref'd) that hits the npm
//     registry and refreshes the cache for the *next* invocation to read.
//   - This means the very first run (and the first run after 24h) never
//     shows a hint — the hint appears one run later, once the cache is
//     warm. That's the standard update-notifier trade-off: never block,
//     never slow down the command the user actually asked for.
//
// Registry endpoint: https://registry.npmjs.org/-/package/great-cto/dist-tags
//   Verified with curl to return only `{"latest":"x.y.z"}` — much smaller
//   than the full package document (https://registry.npmjs.org/great-cto),
//   which would pull the entire versions/times history.
//
// Privacy: read-only GET against the public npm registry, equivalent to the
// request `npm install` already performs. No project data, no PII, nothing
// user-specific is sent. See docs/PRIVACY.md.
//
// Opt-out: GREAT_CTO_NO_UPDATE_CHECK=1 (checked by both the foreground read
// and the background refresh entry point).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { semverDescending } from "./semver.js";

export const REGISTRY_DIST_TAGS_URL = "https://registry.npmjs.org/-/package/great-cto/dist-tags";
export const CACHE_FRESH_MS = 24 * 60 * 60 * 1000; // 24h
export const PACKAGE_NAME = "great-cto";

/** Commands where stdout/stderr are machine-parsed — never print a hint, never spawn a check. */
export const PROTOCOL_SENSITIVE_COMMANDS = new Set([
  "mcp",      // stdio JSON-RPC protocol — any stray byte on stdout/stderr breaks the client
  "worker",   // long-running daemon; status is polled programmatically
  "task",     // machine-invoked task runner (spawned by worker)
]);

export interface UpdateCache {
  checkedAt: string; // ISO timestamp
  latest: string;    // semver string, e.g. "2.79.0"
}

function defaultCachePath(): string {
  return join(homedir(), ".great_cto", "update-check.json");
}

/** Resolve the cache file path — GREAT_CTO_HOME lets tests/worker isolate state, same convention as worker.ts/task-queue.ts. */
export function cachePath(): string {
  const base = process.env.GREAT_CTO_HOME || join(homedir(), ".great_cto");
  return join(base, "update-check.json");
}

/** Pure function: is a suppression condition active? Fail-open to "suppressed" on any ambiguity. */
export function isSuppressed(opts: {
  env?: NodeJS.ProcessEnv;
  command?: string;
  stderrIsTTY?: boolean;
} = {}): boolean {
  const env = opts.env ?? process.env;
  if (env.CI != null && env.CI !== "" && env.CI !== "0" && env.CI !== "false") return true;
  if (env.GREAT_CTO_NO_UPDATE_CHECK === "1") return true;
  if (opts.command && PROTOCOL_SENSITIVE_COMMANDS.has(opts.command)) return true;
  if (opts.stderrIsTTY === false) return true;
  return false;
}

/** Pure function: read + parse cache JSON. Returns null on any error (missing/corrupt). */
export function readCache(readFileFn: (p: string) => string = (p) => readFileSync(p, "utf8"), path: string = cachePath()): UpdateCache | null {
  try {
    const raw = readFileFn(path);
    const parsed = JSON.parse(raw) as Partial<UpdateCache>;
    if (typeof parsed.checkedAt !== "string" || typeof parsed.latest !== "string") return null;
    return { checkedAt: parsed.checkedAt, latest: parsed.latest };
  } catch {
    return null;
  }
}

/** Pure function: is a cache entry still fresh (<24h old)? */
export function isCacheFresh(cache: UpdateCache | null, now: number = Date.now(), freshMs: number = CACHE_FRESH_MS): boolean {
  if (!cache) return false;
  const checkedAtMs = Date.parse(cache.checkedAt);
  if (Number.isNaN(checkedAtMs)) return false;
  return now - checkedAtMs < freshMs;
}

/** Pure function: does `latest` represent a newer version than `current`? */
export function isNewerVersion(current: string, latest: string): boolean {
  if (!current || !latest || current === "unknown") return false;
  // semverDescending(a, b) < 0 means a > b (descending sort). latest > current => descending(latest, current) < 0.
  return semverDescending(latest, current) < 0;
}

/** Pure function: build the one-line stderr hint text. `styler` lets callers inject color helpers (matches ui.ts). */
export function formatHint(
  current: string,
  latest: string,
  styler: { cyan: (s: string) => string; dim: (s: string) => string; bold: (s: string) => string } = {
    cyan: (s) => s,
    dim: (s) => s,
    bold: (s) => s,
  },
): string {
  return `${styler.dim("update available:")} ${styler.dim(current)} ${styler.dim("→")} ${styler.bold(styler.cyan(latest))}  ${styler.dim(`run ${styler.cyan("npm i -g great-cto")} to upgrade`)}`;
}

/**
 * Foreground entry point. Call once per CLI invocation, after the command's
 * normal output has been printed. Never throws, never awaits network I/O.
 *
 * - If suppressed: no-op.
 * - If cache is fresh: print hint (if newer) synchronously, no spawn.
 * - If cache is missing/stale: spawn a detached background refresh and
 *   return immediately (no hint this run — the cache isn't warm yet).
 */
export function checkForUpdate(opts: {
  currentVersion: string;
  command: string;
  env?: NodeJS.ProcessEnv;
  stderrIsTTY?: boolean;
  now?: number;
}): void {
  try {
    const env = opts.env ?? process.env;
    const stderrIsTTY = opts.stderrIsTTY ?? Boolean(process.stderr.isTTY);
    if (isSuppressed({ env, command: opts.command, stderrIsTTY })) return;

    const cache = readCache();
    if (isCacheFresh(cache, opts.now)) {
      if (cache && isNewerVersion(opts.currentVersion, cache.latest)) {
        printHint(opts.currentVersion, cache.latest);
      }
      return;
    }

    spawnBackgroundCheck();
  } catch {
    // Fail-silent — an update hint must never break or slow down a real command.
  }
}

function printHint(current: string, latest: string): void {
  try {
    // Local, minimal color helpers mirroring ui.ts's NO_COLOR-aware wrap(),
    // but gated on stderr TTY (ui.ts gates on stdout, which is the wrong
    // stream for a hint that must print to stderr).
    const useColor = Boolean(process.stderr.isTTY) && process.env.NO_COLOR !== "1";
    const wrap = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
    const styler = { cyan: wrap("36"), dim: wrap("2"), bold: wrap("1") };
    process.stderr.write(formatHint(current, latest, styler) + "\n");
  } catch {
    /* fail-silent */
  }
}

/** Spawn a detached, unref'd background process that refreshes the cache. Never awaited by the caller. */
function spawnBackgroundCheck(): void {
  try {
    // Test-only escape hatch: unit tests exercise checkForUpdate()'s control
    // flow (including "cache missing/stale -> spawn") without ever launching
    // a real child process or touching the network. Never set in production.
    if (process.env.GREAT_CTO_UPDATE_CHECK_NO_SPAWN === "1") return;
    const here = dirname(fileURLToPath(import.meta.url));
    const entry = join(here, "update-check-worker.js");
    if (!existsSync(entry)) return; // dist not built (e.g. running from src in dev) — skip rather than crash
    const child = spawn(process.execPath, [entry], {
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();
  } catch {
    /* fail-silent — network/update check is best-effort only */
  }
}

/**
 * Background worker body — invoked as a standalone script by
 * update-check-worker.ts. Fetches the registry dist-tags and writes the
 * cache. Exported so it's independently unit-testable with an injected
 * fetcher, without needing to actually spawn a child process.
 */
export async function refreshCache(
  fetchFn: typeof fetch = fetch,
  writeFileFn: (p: string, data: string) => void = writeFileSync,
  mkdirFn: (p: string) => void = (p) => mkdirSync(p, { recursive: true }),
  path: string = cachePath(),
): Promise<void> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    let latest: string | undefined;
    try {
      const res = await fetchFn(REGISTRY_DIST_TAGS_URL, { signal: ctrl.signal });
      if (res.ok) {
        const body = (await res.json()) as { latest?: string };
        latest = body.latest;
      }
    } finally {
      clearTimeout(timer);
    }
    if (!latest) return;
    mkdirFn(dirname(path));
    const cache: UpdateCache = { checkedAt: new Date().toISOString(), latest };
    writeFileFn(path, JSON.stringify(cache, null, 2) + "\n");
  } catch {
    /* offline / registry unreachable — fail-silent, next invocation retries */
  }
}
