// Tests for installer.ts — semver comparison and version discovery edge cases.
// Note: we don't test the actual `install()` function here because it
// shells out to `git clone` against the real repo. That's covered by
// the CI dry-run-fixtures job and end-to-end tests.
//
// Run: npm run build && node --test tests/installer.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { hasGit, getPluginBaseDir } from "../dist/installer.js";
import { homedir } from "node:os";
import { join } from "node:path";

test("hasGit returns boolean", () => {
  const result = hasGit();
  assert.equal(typeof result, "boolean");
});

test("getPluginBaseDir returns ~/.claude/plugins/cache/local/great_cto", () => {
  const base = getPluginBaseDir();
  const expected = join(homedir(), ".claude", "plugins", "cache", "local", "great_cto");
  assert.equal(base, expected);
});
