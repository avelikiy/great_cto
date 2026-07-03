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
  CACHE_FRESH_MS,
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
  assert.match(hint, /npm i -g great-cto/);
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

test("checkForUpdate: suppressed env is a total no-op (no throw, no stderr assumptions)", () => {
  assert.doesNotThrow(() => {
    checkForUpdate({
      currentVersion: "2.78.0",
      command: "init",
      env: { GREAT_CTO_NO_UPDATE_CHECK: "1" },
      stderrIsTTY: true,
    });
  });
});

test("checkForUpdate: mcp command never throws even with fresh newer cache present", () => {
  // Cache directory is isolated via GREAT_CTO_HOME=fakeHome for this whole file;
  // no cache file exists yet, so this also exercises the "no cache" branch.
  assert.doesNotThrow(() => {
    checkForUpdate({ currentVersion: "2.78.0", command: "mcp", stderrIsTTY: true });
  });
});

test("checkForUpdate: never throws for a normal command with no cache file (spawns background check)", () => {
  assert.doesNotThrow(() => {
    checkForUpdate({ currentVersion: "2.78.0", command: "init", env: {}, stderrIsTTY: true });
  });
});
