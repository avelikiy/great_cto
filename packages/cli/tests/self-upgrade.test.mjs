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

// ── performSelfUpgrade: install failure propagates exit code ───────────────

test("performSelfUpgrade: non-zero install exit code propagates and skips verify spawn", () => {
  let spawnCount = 0;
  const result = performSelfUpgrade({
    currentVersion: "2.79.0",
    binaryPath: "/Users/dev/.nvm/versions/node/v20.11.0/bin/great-cto",
    spawnFn: () => { spawnCount += 1; return { status: 7 }; },
  });
  assert.equal(result.exitCode, 7);
  assert.equal(spawnCount, 1, "verify spawn must not run after a failed install");
  assert.match(result.message, /failed/);
});

test("performSelfUpgrade: spawn error (e.g. ENOENT) propagates as exit code 1 with a clear message", () => {
  const result = performSelfUpgrade({
    currentVersion: "2.79.0",
    binaryPath: "/Users/dev/.volta/bin/great-cto",
    spawnFn: () => ({ error: new Error("spawn volta ENOENT"), status: null }),
  });
  assert.equal(result.exitCode, 1);
  assert.match(result.message, /volta/);
});

// ── performSelfUpgrade: successful install + verify reports old -> new ─────

test("performSelfUpgrade: successful install verifies new version via --version spawn", () => {
  let calls = [];
  const result = performSelfUpgrade({
    currentVersion: "2.79.0",
    binaryPath: "/Users/dev/.nvm/versions/node/v20.11.0/bin/great-cto",
    spawnFn: (cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === "npm") return { status: 0 };
      // verify spawn: node <binaryPath> --version
      return { status: 0, stdout: "2.80.0\n" };
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.oldVersion, "2.79.0");
  assert.equal(result.newVersion, "2.80.0");
  assert.match(result.message, /2\.79\.0.*2\.80\.0|2\.80\.0/);
  assert.equal(calls.length, 2, "expected install spawn + verify spawn");
  assert.deepEqual(calls[0].args, ["install", "-g", "great-cto@latest", "--prefix", "/Users/dev/.nvm/versions/node/v20.11.0"]);
  assert.ok(calls[1].args.includes("--version"));
});

test("performSelfUpgrade: install succeeds but verify fails -> still exitCode 0, newVersion null", () => {
  const result = performSelfUpgrade({
    currentVersion: "2.79.0",
    binaryPath: "/Users/dev/.nvm/versions/node/v20.11.0/bin/great-cto",
    spawnFn: (cmd) => (cmd === "npm" ? { status: 0 } : { status: 1, stdout: "" }),
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.newVersion, null);
  assert.match(result.message, /could not verify/);
});
