// Tests for self-upgrade.ts — `great-cto upgrade --self` install-method
// detection (path -> {manager, prefix, command}).
//
// Pure-function tests only: detectInstall() takes a binary path string and
// returns a plan without touching the filesystem, spawning a process, or
// hitting the network. No real installs happen in this test file.
//
// Run: npm run build && node --test tests/self-upgrade.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

const { detectInstall, performSelfUpgrade } = await import("../dist/self-upgrade.js");

// ── npx / npm exec cache -> no-op ───────────────────────────────────────────

test("detectInstall: npx cache path -> npx no-op", () => {
  const plan = detectInstall("/Users/dev/.npm/_npx/abc123/node_modules/.bin/great-cto");
  assert.equal(plan.manager, "npx");
  assert.equal(plan.prefix, null);
  assert.equal(plan.command, null);
});

test("detectInstall: alternate _npx cache layout -> npx no-op", () => {
  const plan = detectInstall("/home/dev/.npm/_npx/deadbeef/bin/great-cto");
  assert.equal(plan.manager, "npx");
  assert.equal(plan.command, null);
});

// ── Volta -> volta install ──────────────────────────────────────────────────

test("detectInstall: volta path (real-world dotfile form ~/.volta) -> volta install command", () => {
  const plan = detectInstall("/Users/dev/.volta/bin/great-cto");
  assert.equal(plan.manager, "volta");
  assert.deepEqual(plan.command, ["volta", "install", "great-cto@latest"]);
});

test("detectInstall: volta path (bare 'volta' segment) -> volta install command", () => {
  const plan = detectInstall("/opt/volta/bin/great-cto");
  assert.equal(plan.manager, "volta");
  assert.deepEqual(plan.command, ["volta", "install", "great-cto@latest"]);
});

// ── pnpm -> pnpm add -g ──────────────────────────────────────────────────────

test("detectInstall: pnpm global path (real-world dotfile form ~/.pnpm) -> pnpm add -g command", () => {
  const plan = detectInstall("/Users/dev/.local/share/pnpm/global/5/node_modules/.bin/great-cto");
  assert.equal(plan.manager, "pnpm");
  assert.deepEqual(plan.command, ["pnpm", "add", "-g", "great-cto@latest"]);
});

test("detectInstall: pnpm global path (bare 'pnpm' segment) -> pnpm add -g command", () => {
  const plan = detectInstall("/Users/dev/Library/pnpm/global/5/node_modules/.bin/great-cto");
  assert.equal(plan.manager, "pnpm");
  assert.deepEqual(plan.command, ["pnpm", "add", "-g", "great-cto@latest"]);
});

// ── nvm-style npm layout -> npm install -g with derived prefix ─────────────

test("detectInstall: nvm-style path -> npm install with derived prefix = version dir", () => {
  const plan = detectInstall("/Users/dev/.nvm/versions/node/v20.11.0/bin/great-cto");
  assert.equal(plan.manager, "npm");
  assert.equal(plan.prefix, "/Users/dev/.nvm/versions/node/v20.11.0");
  assert.deepEqual(plan.command, [
    "npm", "install", "-g", "great-cto@latest", "--prefix", "/Users/dev/.nvm/versions/node/v20.11.0",
  ]);
});

// ── Custom dotfile-managed toolchain prefix -> npm install ─────────────────

test("detectInstall: custom toolchain prefix path -> npm install with derived prefix", () => {
  const plan = detectInstall("/Users/dev/.toolchain/node/bin/great-cto");
  assert.equal(plan.manager, "npm");
  assert.equal(plan.prefix, "/Users/dev/.toolchain/node");
  assert.deepEqual(plan.command, [
    "npm", "install", "-g", "great-cto@latest", "--prefix", "/Users/dev/.toolchain/node",
  ]);
});

// ── Two prefixes on the same machine resolve independently ─────────────────

test("detectInstall: two distinct npm prefixes on one machine each resolve to their own prefix", () => {
  const custom = detectInstall("/Users/dev/.toolchain/node/bin/great-cto");
  const nvm = detectInstall("/Users/dev/.nvm/versions/node/v20.11.0/bin/great-cto");
  assert.notEqual(custom.prefix, nvm.prefix);
  assert.equal(custom.prefix, "/Users/dev/.toolchain/node");
  assert.equal(nvm.prefix, "/Users/dev/.nvm/versions/node/v20.11.0");
});

// ── Unknown / undetectable layout -> npm install without --prefix ──────────

test("detectInstall: path with no 'bin' segment -> npm install fallback, no prefix", () => {
  const plan = detectInstall("/opt/weird-install/great-cto");
  assert.equal(plan.manager, "npm");
  assert.equal(plan.prefix, null);
  assert.deepEqual(plan.command, ["npm", "install", "-g", "great-cto@latest"]);
});

test("detectInstall: 'bin' as the very first path segment -> fallback (no sane prefix above it)", () => {
  const plan = detectInstall("/bin/great-cto");
  assert.equal(plan.manager, "npm");
  assert.equal(plan.prefix, null);
});

// ── Priority ordering: npx check wins even if path also contains other markers ──

test("detectInstall: npx marker takes priority over volta/pnpm-looking paths", () => {
  const plan = detectInstall("/Users/dev/.npm/_npx/abc/volta/pnpm/bin/great-cto");
  assert.equal(plan.manager, "npx");
});

test("detectInstall: volta marker takes priority over plain npm bin derivation", () => {
  const plan = detectInstall("/Users/dev/.volta/tools/image/packages/great-cto/bin/great-cto");
  assert.equal(plan.manager, "volta");
});

// ── performSelfUpgrade: npx short-circuits without spawning ────────────────

test("performSelfUpgrade: npx install never spawns and reports no-op success", () => {
  let spawnCalled = false;
  const result = performSelfUpgrade({
    currentVersion: "2.79.0",
    binaryPath: "/Users/dev/.npm/_npx/abc123/node_modules/.bin/great-cto",
    spawnFn: () => { spawnCalled = true; return { status: 0 }; },
  });
  assert.equal(spawnCalled, false);
  assert.equal(result.exitCode, 0);
  assert.equal(result.manager, "npx");
  assert.match(result.message, /npx/);
});

// ADR-045 retires registry activation from the synchronous adapter. These
// cases preserve coverage of every former route with the stronger requirement:
// no unverified process execution, even when a caller supplies a runner.
test("legacy npm self-upgrade refuses before invoking a successful supplied runner", () => {
  let calls = 0;
  const result = performSelfUpgrade({ currentVersion: "2.79.0", binaryPath: "/opt/node/bin/great-cto", spawnFn: () => { calls++; return { status: 0 }; } });
  assert.equal(calls, 0);
  assert.equal(result.exitCode, 1);
  assert.equal(result.oldVersion, "2.79.0");
  assert.equal(result.newVersion, null);
  assert.match(result.message, /verified artifact admission/);
});

test("legacy Volta self-upgrade cannot start an unadmitted executable", () => {
  let calls = 0;
  const result = performSelfUpgrade({ currentVersion: "2.79.0", binaryPath: "/opt/.volta/bin/great-cto", spawnFn: () => { calls++; throw new Error("must never execute"); } });
  assert.equal(calls, 0);
  assert.equal(result.manager, "volta");
  assert.equal(result.exitCode, 1);
  assert.equal(result.newVersion, null);
});

test("legacy pnpm self-upgrade refuses before install or version smoke", () => {
  let calls = 0;
  const result = performSelfUpgrade({ currentVersion: "2.79.0", binaryPath: "/opt/pnpm/bin/great-cto", spawnFn: () => { calls++; return { status: 0, stdout: "2.80.0" }; } });
  assert.equal(calls, 0);
  assert.equal(result.manager, "pnpm");
  assert.equal(result.exitCode, 1);
  assert.equal(result.newVersion, null);
});

test("unknown install layouts cannot fall back to npm's global prefix", () => {
  let calls = 0;
  const result = performSelfUpgrade({ currentVersion: "2.79.0", binaryPath: "/opt/unknown/great-cto", spawnFn: () => { calls++; return { status: 0 }; } });
  assert.equal(calls, 0);
  assert.equal(result.prefix, null);
  assert.equal(result.exitCode, 1);
  assert.equal(result.newVersion, null);
});

// `npm i -g` replaces the CLI. It does not touch
// ~/.claude/plugins/cache/local/great_cto/<version>/, which is where hooks and
// agent prompts are actually read from — so a user can take the update prompt,
// be told the upgrade succeeded, and keep running the previous release's agents
// with nothing anywhere saying so. This happened during the 2.91.0 release:
// publishing left the cache on the prior version until install-local.sh ran.
import { newestCachedPlugin, pluginCacheLagWarning } from "../dist/self-upgrade.js";

test("the newest cached plugin is chosen numerically, not alphabetically", () => {
  assert.equal(newestCachedPlugin(["2.9.0", "2.10.0", "2.86.0"]), "2.86.0");
  assert.equal(newestCachedPlugin(["2.91.0", "2.9.0"]), "2.91.0",
    "a string sort would put 2.9.0 after 2.91.0 and report the wrong cache");
});

test("non-version directories are ignored", () => {
  assert.equal(newestCachedPlugin(["latest", ".DS_Store", "2.5.0"]), "2.5.0");
  assert.equal(newestCachedPlugin(["latest", "tmp"]), null);
  assert.equal(newestCachedPlugin([]), null);
});

test("a cache behind npm produces a warning that names both versions and the fix", () => {
  const w = pluginCacheLagWarning("2.91.0", ["2.86.0", "2.90.0"]);
  assert.ok(w);
  assert.match(w, /npm package is 2\.91\.0/);
  assert.match(w, /plugin Claude Code loads is 2\.90\.0/);
  assert.match(w, /install-local\.sh --prune/, "a warning with no next step is a warning people learn to skip");
});

test("matching versions warn about nothing", () => {
  assert.equal(pluginCacheLagWarning("2.91.0", ["2.90.0", "2.91.0"]), null);
});

test("no plugin cache is not a lag — the plugin is simply not installed", () => {
  assert.equal(pluginCacheLagWarning("2.91.0", []), null);
  assert.equal(pluginCacheLagWarning("2.91.0", ["latest"]), null);
});

test("a cache ahead of npm is not the case this guards", () => {
  assert.equal(pluginCacheLagWarning("2.90.0", ["2.91.0"]), null,
    "a local build newer than the registry is normal during development");
});

test("a missing npm version warns about nothing rather than guessing", () => {
  assert.equal(pluginCacheLagWarning("", ["2.90.0"]), null);
});
