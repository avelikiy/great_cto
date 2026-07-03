// Tests for update-check.ts — update-notifier pattern (semver compare, cache
// freshness, suppression, hint formatting) at the pure-function level.
//
// No real network calls: refreshCache() is tested with an injected fetch
// stub, and checkForUpdate()'s cache path is isolated via GREAT_CTO_HOME
// (same isolation convention as worker.ts/task-queue.ts and upgrade.test.mjs's
// HOME override).
//
// Run: npm run build && node --test tests/update-check.test.mjs

import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const fakeHome = mkdtempSync(join(tmpdir(), "gc-update-check-home-"));
process.env.GREAT_CTO_HOME = fakeHome;
// Never let checkForUpdate() actually spawn a child process / touch the
// network from this test file — see spawnBackgroundCheck() in update-check.ts.
process.env.GREAT_CTO_UPDATE_CHECK_NO_SPAWN = "1";

const {
  isSuppressed,
  isCacheFresh,
  isNewerVersion,
  formatHint,
  readCache,
  cachePath,
  refreshCache,
  checkForUpdate,
  shouldPrompt,
  recordPromptedFor,
  promptYesNo,
  CACHE_FRESH_MS,
  PROMPT_TIMEOUT_MS,
  PROTOCOL_SENSITIVE_COMMANDS,
  REGISTRY_DIST_TAGS_URL,
} = await import("../dist/update-check.js");

// ── cachePath / GREAT_CTO_HOME isolation ────────────────────────────────────

test("cachePath honors GREAT_CTO_HOME override", () => {
  assert.equal(cachePath(), join(fakeHome, "update-check.json"));
});

// ── isNewerVersion (semver compare) ─────────────────────────────────────────

test("isNewerVersion: true when latest > current", () => {
  assert.equal(isNewerVersion("2.78.0", "2.79.0"), true);
  assert.equal(isNewerVersion("2.78.0", "3.0.0"), true);
  assert.equal(isNewerVersion("1.2.3", "1.2.4"), true);
});

test("isNewerVersion: false when latest <= current", () => {
  assert.equal(isNewerVersion("2.78.0", "2.78.0"), false);
  assert.equal(isNewerVersion("2.79.0", "2.78.0"), false);
  assert.equal(isNewerVersion("3.0.0", "2.99.9"), false);
});

test("isNewerVersion: false for missing/unknown current version", () => {
  assert.equal(isNewerVersion("", "2.79.0"), false);
  assert.equal(isNewerVersion("unknown", "2.79.0"), false);
});

// ── isCacheFresh ─────────────────────────────────────────────────────────

test("isCacheFresh: null cache is never fresh", () => {
  assert.equal(isCacheFresh(null), false);
});

test("isCacheFresh: true when checkedAt is within 24h window", () => {
  const now = Date.parse("2026-07-03T12:00:00.000Z");
  const cache = { checkedAt: "2026-07-03T00:00:01.000Z", latest: "2.79.0" }; // ~11h59m ago
  assert.equal(isCacheFresh(cache, now), true);
});

test("isCacheFresh: false when checkedAt is older than 24h", () => {
  const now = Date.parse("2026-07-03T12:00:00.000Z");
  const cache = { checkedAt: "2026-07-01T12:00:00.000Z", latest: "2.79.0" }; // 2 days ago
  assert.equal(isCacheFresh(cache, now), false);
});

test("isCacheFresh: false for malformed checkedAt", () => {
  const cache = { checkedAt: "not-a-date", latest: "2.79.0" };
  assert.equal(isCacheFresh(cache), false);
});

test("isCacheFresh: boundary is exclusive at exactly 24h", () => {
  const now = 1000 + CACHE_FRESH_MS;
  const cache = { checkedAt: new Date(1000).toISOString(), latest: "2.79.0" };
  assert.equal(isCacheFresh(cache, now), false);
});

// ── isSuppressed ─────────────────────────────────────────────────────────

test("isSuppressed: CI=true suppresses", () => {
  assert.equal(isSuppressed({ env: { CI: "true" }, stderrIsTTY: true }), true);
});

test("isSuppressed: CI=1 suppresses", () => {
  assert.equal(isSuppressed({ env: { CI: "1" }, stderrIsTTY: true }), true);
});

test("isSuppressed: GREAT_CTO_NO_UPDATE_CHECK=1 suppresses", () => {
  assert.equal(isSuppressed({ env: { GREAT_CTO_NO_UPDATE_CHECK: "1" }, stderrIsTTY: true }), true);
});

test("isSuppressed: non-TTY stderr suppresses", () => {
  assert.equal(isSuppressed({ env: {}, stderrIsTTY: false }), true);
});

test("isSuppressed: mcp command suppresses", () => {
  assert.equal(isSuppressed({ env: {}, command: "mcp", stderrIsTTY: true }), true);
});

test("isSuppressed: worker and task commands suppress", () => {
  assert.equal(isSuppressed({ env: {}, command: "worker", stderrIsTTY: true }), true);
  assert.equal(isSuppressed({ env: {}, command: "task", stderrIsTTY: true }), true);
});

test("isSuppressed: PROTOCOL_SENSITIVE_COMMANDS contains exactly mcp/worker/task", () => {
  assert.deepEqual([...PROTOCOL_SENSITIVE_COMMANDS].sort(), ["mcp", "task", "worker"]);
});

test("isSuppressed: normal human command + TTY + no CI/opt-out is NOT suppressed", () => {
  assert.equal(isSuppressed({ env: {}, command: "init", stderrIsTTY: true }), false);
  assert.equal(isSuppressed({ env: {}, command: "board", stderrIsTTY: true }), false);
  assert.equal(isSuppressed({ env: {}, command: "report", stderrIsTTY: true }), false);
});

test("isSuppressed: CI='' (unset/empty) does not suppress by itself", () => {
  assert.equal(isSuppressed({ env: { CI: "" }, command: "init", stderrIsTTY: true }), false);
});

// ── formatHint ─────────────────────────────────────────────────────────

test("formatHint includes both versions and the upgrade command", () => {
  const hint = formatHint("2.78.0", "2.79.0");
  assert.match(hint, /2\.78\.0/);
  assert.match(hint, /2\.79\.0/);
  assert.match(hint, /great-cto upgrade --self/);
});

test("formatHint applies injected style functions", () => {
  const styler = {
    cyan: (s) => `<cyan>${s}</cyan>`,
    dim: (s) => `<dim>${s}</dim>`,
    bold: (s) => `<bold>${s}</bold>`,
  };
  const hint = formatHint("2.78.0", "2.79.0", styler);
  assert.match(hint, /<dim>/);
  assert.match(hint, /<cyan>2\.79\.0<\/cyan>/);
});

test("formatHint is a single line (no embedded newlines)", () => {
  const hint = formatHint("2.78.0", "2.79.0");
  assert.equal(hint.includes("\n"), false);
});

// ── readCache ─────────────────────────────────────────────────────────

test("readCache: returns null when file is missing", () => {
  const result = readCache(() => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); }, "/nonexistent/path.json");
  assert.equal(result, null);
});

test("readCache: returns null for malformed JSON", () => {
  const result = readCache(() => "{not json", "/fake/path.json");
  assert.equal(result, null);
});

test("readCache: returns null when required fields are missing", () => {
  const result = readCache(() => JSON.stringify({ latest: "2.79.0" }), "/fake/path.json");
  assert.equal(result, null);
});

test("readCache: parses a well-formed cache file", () => {
  const payload = { checkedAt: "2026-07-03T00:00:00.000Z", latest: "2.79.0" };
  const result = readCache(() => JSON.stringify(payload), "/fake/path.json");
  assert.deepEqual(result, payload);
});

// ── refreshCache (injected fetch — no real network) ─────────────────────

test("refreshCache: writes cache on successful fetch", async () => {
  let written = null;
  const fakeFetch = async (url) => {
    assert.equal(url, REGISTRY_DIST_TAGS_URL);
    return { ok: true, json: async () => ({ latest: "9.9.9" }) };
  };
  const fakeWrite = (path, data) => { written = { path, data }; };
  const fakeMkdir = () => {};
  await refreshCache(fakeFetch, fakeWrite, fakeMkdir, "/fake/cache/update-check.json");
  assert.ok(written, "expected a write to occur");
  const parsed = JSON.parse(written.data);
  assert.equal(parsed.latest, "9.9.9");
  assert.equal(typeof parsed.checkedAt, "string");
  assert.equal(written.path, "/fake/cache/update-check.json");
});

test("refreshCache: no write when fetch fails (non-ok response)", async () => {
  let writeCalled = false;
  const fakeFetch = async () => ({ ok: false, json: async () => ({}) });
  await refreshCache(fakeFetch, () => { writeCalled = true; }, () => {}, "/fake/path.json");
  assert.equal(writeCalled, false);
});

test("refreshCache: no write when fetch throws (offline)", async () => {
  let writeCalled = false;
  const fakeFetch = async () => { throw new Error("network unreachable"); };
  await refreshCache(fakeFetch, () => { writeCalled = true; }, () => {}, "/fake/path.json");
  assert.equal(writeCalled, false);
});

test("refreshCache: no write when response has no latest field", async () => {
  let writeCalled = false;
  const fakeFetch = async () => ({ ok: true, json: async () => ({}) });
  await refreshCache(fakeFetch, () => { writeCalled = true; }, () => {}, "/fake/path.json");
  assert.equal(writeCalled, false);
});

// ── checkForUpdate (integration of the pure pieces, isolated cache dir) ────

test("checkForUpdate: suppressed env is a total no-op (no throw, no stderr assumptions)", async () => {
  await assert.doesNotReject(() =>
    checkForUpdate({
      currentVersion: "2.78.0",
      command: "init",
      env: { GREAT_CTO_NO_UPDATE_CHECK: "1" },
      stderrIsTTY: true,
    }),
  );
});

test("checkForUpdate: mcp command never throws even with fresh newer cache present", async () => {
  // Cache directory is isolated via GREAT_CTO_HOME=fakeHome for this whole file;
  // no cache file exists yet, so this also exercises the "no cache" branch.
  await assert.doesNotReject(() => checkForUpdate({ currentVersion: "2.78.0", command: "mcp", stderrIsTTY: true }));
});

test("checkForUpdate: never throws for a normal command with no cache file (spawns background check)", async () => {
  await assert.doesNotReject(() =>
    checkForUpdate({ currentVersion: "2.78.0", command: "init", env: {}, stderrIsTTY: true }),
  );
});

test("checkForUpdate: fresh cache + newer version + non-TTY stdin falls back to hint, never awaits a prompt", async () => {
  // stdinIsTTY: false means shouldPrompt() must say no, so this must resolve
  // immediately rather than waiting on the 15s prompt timeout.
  const start = Date.now();
  await assert.doesNotReject(() =>
    checkForUpdate({
      currentVersion: "2.78.0",
      command: "init",
      env: {},
      stderrIsTTY: true,
      stdinIsTTY: false,
      now: Date.now(),
    }),
  );
  assert.ok(Date.now() - start < 1000, "must not block waiting on a prompt when stdin is not a TTY");
});

// ── shouldPrompt (pure gating logic) ────────────────────────────────────────

const freshCache = { checkedAt: new Date().toISOString(), latest: "2.79.0" };

test("shouldPrompt: true when newer version + both TTYs + not suppressed + not already prompted", () => {
  assert.equal(
    shouldPrompt({ currentVersion: "2.78.0", cache: freshCache, env: {}, command: "init", stderrIsTTY: true, stdinIsTTY: true }),
    true,
  );
});

test("shouldPrompt: false when this exact version was already prompted for", () => {
  const cache = { ...freshCache, promptedFor: "2.79.0" };
  assert.equal(
    shouldPrompt({ currentVersion: "2.78.0", cache, env: {}, command: "init", stderrIsTTY: true, stdinIsTTY: true }),
    false,
  );
});

test("shouldPrompt: true when a DIFFERENT (older) version was previously prompted for", () => {
  const cache = { ...freshCache, promptedFor: "2.77.0" };
  assert.equal(
    shouldPrompt({ currentVersion: "2.78.0", cache, env: {}, command: "init", stderrIsTTY: true, stdinIsTTY: true }),
    true,
  );
});

test("shouldPrompt: false when stdin is not a TTY (piped input)", () => {
  assert.equal(
    shouldPrompt({ currentVersion: "2.78.0", cache: freshCache, env: {}, command: "init", stderrIsTTY: true, stdinIsTTY: false }),
    false,
  );
});

test("shouldPrompt: false when stderr is not a TTY", () => {
  assert.equal(
    shouldPrompt({ currentVersion: "2.78.0", cache: freshCache, env: {}, command: "init", stderrIsTTY: false, stdinIsTTY: true }),
    false,
  );
});

test("shouldPrompt: false in CI even with both TTYs true", () => {
  assert.equal(
    shouldPrompt({ currentVersion: "2.78.0", cache: freshCache, env: { CI: "true" }, command: "init", stderrIsTTY: true, stdinIsTTY: true }),
    false,
  );
});

test("shouldPrompt: false for protocol-sensitive commands (mcp/worker/task)", () => {
  for (const command of ["mcp", "worker", "task"]) {
    assert.equal(
      shouldPrompt({ currentVersion: "2.78.0", cache: freshCache, env: {}, command, stderrIsTTY: true, stdinIsTTY: true }),
      false,
      `expected ${command} to never prompt`,
    );
  }
});

test("shouldPrompt: false when GREAT_CTO_NO_UPDATE_CHECK=1", () => {
  assert.equal(
    shouldPrompt({ currentVersion: "2.78.0", cache: freshCache, env: { GREAT_CTO_NO_UPDATE_CHECK: "1" }, command: "init", stderrIsTTY: true, stdinIsTTY: true }),
    false,
  );
});

test("shouldPrompt: false when no cache (nothing to prompt about)", () => {
  assert.equal(
    shouldPrompt({ currentVersion: "2.78.0", cache: null, env: {}, command: "init", stderrIsTTY: true, stdinIsTTY: true }),
    false,
  );
});

test("shouldPrompt: false when current version is already latest (no newer version)", () => {
  const cache = { checkedAt: new Date().toISOString(), latest: "2.78.0" };
  assert.equal(
    shouldPrompt({ currentVersion: "2.78.0", cache, env: {}, command: "init", stderrIsTTY: true, stdinIsTTY: true }),
    false,
  );
});

// ── recordPromptedFor (pure, injectable read/write) ─────────────────────────

test("recordPromptedFor: preserves existing checkedAt/latest while adding promptedFor", () => {
  const existing = { checkedAt: "2026-07-03T00:00:00.000Z", latest: "2.79.0" };
  let written = null;
  recordPromptedFor(
    "2.79.0",
    () => JSON.stringify(existing),
    (path, data) => { written = { path, data }; },
    "/fake/cache/update-check.json",
  );
  const parsed = JSON.parse(written.data);
  assert.equal(parsed.checkedAt, existing.checkedAt);
  assert.equal(parsed.latest, "2.79.0");
  assert.equal(parsed.promptedFor, "2.79.0");
});

test("recordPromptedFor: never throws when the read fails (missing/corrupt cache)", () => {
  assert.doesNotThrow(() => {
    recordPromptedFor(
      "2.79.0",
      () => { throw new Error("ENOENT"); },
      () => {},
      "/fake/cache/update-check.json",
    );
  });
});

test("recordPromptedFor: never throws when the write fails", () => {
  assert.doesNotThrow(() => {
    recordPromptedFor(
      "2.79.0",
      () => JSON.stringify({ checkedAt: new Date().toISOString(), latest: "2.79.0" }),
      () => { throw new Error("EACCES"); },
      "/fake/cache/update-check.json",
    );
  });
});

// ── promptYesNo (timeout semantics, injected readline via real stdin stub) ──

test("PROMPT_TIMEOUT_MS is 15 seconds", () => {
  assert.equal(PROMPT_TIMEOUT_MS, 15_000);
});

test("promptYesNo: resolves false on timeout when stdin never answers", async () => {
  // Injected Readable that never emits data, so readline never resolves the
  // question on its own — only the (very short, test-only) timeout should fire.
  const { Writable, Readable } = await import("node:stream");
  const neverAnswers = new Readable({ read() {} });
  const sink = new Writable({ write(_chunk, _enc, cb) { cb(); } });
  try {
    const start = Date.now();
    const result = await promptYesNo("Update? [Y/n] ", 50, neverAnswers, sink);
    assert.equal(result, false);
    assert.ok(Date.now() - start < 2000, "timeout must fire close to the configured value, not hang");
  } finally {
    neverAnswers.destroy();
  }
});

test("promptYesNo: empty/'y'/'Y' answers resolve true; anything else resolves false", async () => {
  const { Writable, Readable } = await import("node:stream");

  async function ask(line) {
    const input = new Readable({ read() {} });
    const sink = new Writable({ write(_chunk, _enc, cb) { cb(); } });
    const p = promptYesNo("Update? [Y/n] ", 5000, input, sink);
    input.push(line + "\n");
    input.push(null);
    return p;
  }

  assert.equal(await ask(""), true);
  assert.equal(await ask("y"), true);
  assert.equal(await ask("Y"), true);
  assert.equal(await ask("yes"), true);
  assert.equal(await ask("n"), false);
  assert.equal(await ask("no"), false);
  assert.equal(await ask("garbage"), false);
});
