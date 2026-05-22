// Tests for upgrade.ts — force re-clone companion plugins + apply overlays.
//
// HOME is redirected to a tmpdir before any module is imported so that
// upgradeAll() targets an isolated cache instead of the real ~/.claude.
// This prevents tests from mutating the developer's installed plugins.
//
// Run: npm run build && node --test tests/upgrade.test.mjs

import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

// ── Isolate HOME before importing any module that uses homedir() ───────────
// upgrade.ts and overlay.ts both call homedir() inside functions, so setting
// HOME here (before the dynamic imports below) ensures they see the fake HOME.
const fakeHome = mkdtempSync(join(tmpdir(), "gc-upgrade-home-"));
const realHome = process.env.HOME;
process.env.HOME = fakeHome;
process.env.USERPROFILE = fakeHome; // Windows

// ── Module imports (must come AFTER HOME is set) ────────────────────────────
const { upgradeAll } = await import("../dist/upgrade.js");
const { COMPANION_PLUGINS } = await import("../dist/companion.js");

// ── Tests ────────────────────────────────────────────────────────────────────

test("COMPANION_PLUGINS has superpowers and beads", () => {
  const names = COMPANION_PLUGINS.map((p) => p.name);
  assert.ok(names.includes("superpowers"), "missing superpowers");
  assert.ok(names.includes("beads"), "missing beads");
});

test("upgradeAll returns one result per companion plugin (isolated HOME)", async () => {
  // With an empty fake HOME, no plugins are installed.
  // upgradeAll will try ls-remote (may succeed or skip if no network/git).
  // All results must have a valid status — "skipped" is acceptable.
  const results = await upgradeAll();
  assert.equal(results.length, COMPANION_PLUGINS.length);
  for (const r of results) {
    assert.ok(
      ["upgraded", "already_latest", "skipped"].includes(r.status),
      `unexpected status '${r.status}' for ${r.name}`,
    );
    assert.ok(typeof r.name === "string" && r.name.length > 0);
    assert.ok(typeof r.fromVersion === "string");
    assert.ok(typeof r.toVersion === "string");
  }
});

test("upgradeAll result names match COMPANION_PLUGINS names", async () => {
  const results = await upgradeAll();
  const resultNames = results.map((r) => r.name).sort();
  const pluginNames = COMPANION_PLUGINS.map((p) => p.name).sort();
  assert.deepEqual(resultNames, pluginNames);
});

test("upgradeAll does not touch real HOME", () => {
  // Verify HOME was not restored mid-test (sanity check)
  assert.equal(process.env.HOME, fakeHome, "HOME must still point to tmpdir");
  assert.notEqual(fakeHome, realHome, "fakeHome must differ from real HOME");
});
