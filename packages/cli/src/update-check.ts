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
//
// Interactive prompt: when a newer version is found AND both stderr and
// stdin are TTYs AND the check isn't suppressed AND this specific version
// hasn't been prompted for before, checkForUpdate() asks `Update to X? [Y/n]`
// on stderr with a 15s timeout (node:readline). "Yes" runs the same
// self-upgrade code path as `great-cto upgrade --self`, in-process. Either
// way the chosen (or timed-out) version is recorded in the cache file's
// `promptedFor` field so a given release is prompted for AT MOST ONCE —
// every later run falls back to the one-line hint.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { semverDescending } from "./semver.js";

export const REGISTRY_DIST_TAGS_URL = "https://registry.npmjs.org/-/package/great-cto/dist-tags";
export const CACHE_FRESH_MS = 24 * 60 * 60 * 1000; // 24h
export const PACKAGE_NAME = "great-cto";
export const PROMPT_TIMEOUT_MS = 15_000;

/** Commands where stdout/stderr are machine-parsed — never print a hint, never spawn a check. */
export const PROTOCOL_SENSITIVE_COMMANDS = new Set([
  "mcp",      // stdio JSON-RPC protocol — any stray byte on stdout/stderr breaks the client
  "worker",   // long-running daemon; status is polled programmatically
  "task",     // machine-invoked task runner (spawned by worker)
]);

export interface UpdateCache {
  checkedAt: string; // ISO timestamp
  latest: string;    // semver string, e.g. "2.79.0"
  promptedFor?: string; // latest version we've already shown the interactive Y/n prompt for, if any
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

/**
 * Pure function: should the interactive `Update to X? [Y/n]` prompt fire?
 *
 * All of the following must hold:
 *   - not suppressed (isSuppressed() — reuses the same CI/opt-out/protocol/TTY rules)
 *   - stdin is ALSO a TTY (isSuppressed only checks stderr; a prompt needs to
 *     read a keystroke, so a piped/redirected stdin must never block on it)
 *   - a newer version is actually available
 *   - this exact `latest` version hasn't already been prompted for
 *     (cache.promptedFor === latest means "already asked, at most once per release")
 */
export function shouldPrompt(opts: {
  currentVersion: string;
  cache: UpdateCache | null;
  env?: NodeJS.ProcessEnv;
  command?: string;
  stderrIsTTY?: boolean;
  stdinIsTTY?: boolean;
}): boolean {
  if (isSuppressed({ env: opts.env, command: opts.command, stderrIsTTY: opts.stderrIsTTY })) return false;
  if (opts.stdinIsTTY !== true) return false;
  if (!opts.cache) return false;
  if (!isNewerVersion(opts.currentVersion, opts.cache.latest)) return false;
  if (opts.cache.promptedFor === opts.cache.latest) return false;
  return true;
}

/** Pure function: read + parse cache JSON. Returns null on any error (missing/corrupt). */
export function readCache(readFileFn: (p: string) => string = (p) => readFileSync(p, "utf8"), path: string = cachePath()): UpdateCache | null {
  try {
    const raw = readFileFn(path);
    const parsed = JSON.parse(raw) as Partial<UpdateCache>;
    if (typeof parsed.checkedAt !== "string" || typeof parsed.latest !== "string") return null;
    const cache: UpdateCache = { checkedAt: parsed.checkedAt, latest: parsed.latest };
    if (typeof parsed.promptedFor === "string") cache.promptedFor = parsed.promptedFor;
    return cache;
  } catch {
    return null;
  }
}

/**
 * Pure function: write `promptedFor` into the cache file, preserving the
 * other fields. Best-effort — swallows write errors (a failed write just
 * means the prompt might fire again next run, which is safe, not silent
 * data loss).
 */
export function recordPromptedFor(
  version: string,
  readFileFn: (p: string) => string = (p) => readFileSync(p, "utf8"),
  writeFileFn: (p: string, data: string) => void = writeFileSync,
  path: string = cachePath(),
): void {
  try {
    const existing = readCache(readFileFn, path);
    const cache: UpdateCache = existing
      ? { ...existing, promptedFor: version }
      : { checkedAt: new Date().toISOString(), latest: version, promptedFor: version };
    writeFileFn(path, JSON.stringify(cache, null, 2) + "\n");
  } catch {
    /* best-effort — never break the CLI over a cache write failure */
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
  return `${styler.dim("update available:")} ${styler.dim(current)} ${styler.dim("→")} ${styler.bold(styler.cyan(latest))}  ${styler.dim(`run ${styler.cyan("great-cto upgrade --self")} to upgrade`)}`;
}

/**
 * Ask `question` on stderr and read one line of input from stdin via
 * node:readline, with a hard timeout. Resolves `true` for an empty/"y"/"Y"
 * answer, `false` for anything else INCLUDING a timeout or "n". Never
 * rejects. Only called when both stderr and stdin are already confirmed
 * TTYs (see shouldPrompt), so this never blocks a piped/CI invocation.
 *
 * `input`/`output` are injectable (defaulting to the real process streams)
 * so tests can exercise real readline behavior — including the timeout —
 * against isolated streams instead of monkey-patching process.stdin.
 */
export function promptYesNo(
  question: string,
  timeoutMs: number = PROMPT_TIMEOUT_MS,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stderr,
): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input, output, terminal: false });
    let settled = false;
    const finish = (answer: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rl.close();
      resolve(answer);
    };
    // Intentionally NOT unref'd: this timer is the only thing standing
    // between "user is deciding" and "give up and fall back to the hint" —
    // it must keep the event loop alive for up to timeoutMs so the prompt
    // reliably resolves (and, on success, so recordPromptedFor()/finish()
    // in main.ts still run). It is always cleared on any resolution path
    // (answer or timeout), so it never actually blocks exit beyond that.
    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      rl.question(question, (answer) => {
        const normalized = answer.trim().toLowerCase();
        finish(normalized === "" || normalized === "y" || normalized === "yes");
      });
    } catch {
      finish(false);
    }
  });
}

/**
 * Foreground entry point. Call once per CLI invocation, after the command's
 * normal output has been printed. Never throws.
 *
 * - If suppressed: no-op.
 * - If cache is fresh:
 *     - if a newer version exists and shouldPrompt() says yes, show the
 *       interactive `Update to X? [Y/n]` prompt (15s timeout) and, on yes,
 *       run the self-upgrade in-process before returning.
 *     - otherwise, print the one-line hint (if newer) exactly as before.
 * - If cache is missing/stale: spawn a detached background refresh and
 *   return immediately (no hint/prompt this run — the cache isn't warm yet).
 *
 * Only the prompt path awaits anything (stdin, up to 15s); every other path
 * returns synchronously-fast, matching the original never-block guarantee.
 */
export async function checkForUpdate(opts: {
  currentVersion: string;
  command: string;
  env?: NodeJS.ProcessEnv;
  stderrIsTTY?: boolean;
  stdinIsTTY?: boolean;
  now?: number;
}): Promise<void> {
  try {
    const env = opts.env ?? process.env;
    const stderrIsTTY = opts.stderrIsTTY ?? Boolean(process.stderr.isTTY);
    const stdinIsTTY = opts.stdinIsTTY ?? Boolean(process.stdin.isTTY);
    if (isSuppressed({ env, command: opts.command, stderrIsTTY })) return;

    const cache = readCache();
    if (isCacheFresh(cache, opts.now)) {
      if (!cache || !isNewerVersion(opts.currentVersion, cache.latest)) return;

      if (shouldPrompt({ currentVersion: opts.currentVersion, cache, env, command: opts.command, stderrIsTTY, stdinIsTTY })) {
        const accepted = await promptYesNo(`Update to ${cache.latest}? [Y/n] `);
        recordPromptedFor(cache.latest);
        if (accepted) {
          await runSelfUpgradeInProcess(opts.currentVersion);
        }
        return;
      }

      printHint(opts.currentVersion, cache.latest);
      return;
    }

    spawnBackgroundCheck();
  } catch {
    // Fail-silent — an update hint must never break or slow down a real command.
  }
}

/**
 * Run the same self-upgrade code path as `great-cto upgrade --self`,
 * in-process, after the user accepted the interactive prompt. Isolated into
 * its own function (rather than importing self-upgrade.ts at module scope)
 * so update-check.ts's own unit tests never need to touch child_process.
 */
async function runSelfUpgradeInProcess(currentVersion: string): Promise<void> {
  try {
    const { performSelfUpgrade, resolveRunningBinaryPath } = await import("./self-upgrade.js");
    const binaryPath = resolveRunningBinaryPath();
    const result = performSelfUpgrade({ currentVersion, binaryPath });
    process.stderr.write((result.exitCode === 0 ? result.message : `error: ${result.message}`) + "\n");
  } catch {
    /* fail-silent — an accepted prompt must never crash the command that triggered it */
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
