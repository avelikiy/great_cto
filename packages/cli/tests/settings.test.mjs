// Tests for settings.ts — atomic merge into ~/.claude/settings.json.
//
// These tests temporarily override HOME to point at a tmpdir so we don't
// touch the real user's settings.
//
// Run: npm run build && node --test tests/settings.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

function mkHome() {
  const dir = mkdtempSync(join(tmpdir(), "gcto-settings-"));
  mkdirSync(join(dir, ".claude"), { recursive: true });
  return dir;
}

// Override HOME before importing the module under test.
// Note: settings.ts uses os.homedir() at call-time, so we can swap HOME per-test.
const realHome = homedir();

function withHome(fakeHome, fn) {
  process.env.HOME = fakeHome;
  process.env.USERPROFILE = fakeHome; // windows
  try { return fn(); }
  finally {
    process.env.HOME = realHome;
    process.env.USERPROFILE = realHome;
  }
}

// Import AFTER any setup if needed — but settings.ts reads homedir() lazily inside
// enableGreatCto(), so we can import once.
const { enableGreatCto, getSettingsPath } = await import("../dist/settings.js");

test("creates settings.json when none exists", () => {
  const home = mkHome();
  try {
    withHome(home, () => {
      const result = enableGreatCto();
      assert.equal(result.enabled, true);
      assert.equal(result.alreadyEnabled, false);
      assert.equal(result.backupPath, null);
      const path = getSettingsPath();
      assert.ok(existsSync(path));
      const data = JSON.parse(readFileSync(path, "utf-8"));
      assert.equal(data.enabledPlugins["great_cto@local"], true);
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("preserves other keys when settings.json exists", () => {
  const home = mkHome();
  try {
    withHome(home, () => {
      const path = join(home, ".claude", "settings.json");
      const initial = {
        theme: "dark",
        enabledPlugins: { "other-plugin@source": true },
        customField: { nested: "value" },
      };
      writeFileSync(path, JSON.stringify(initial, null, 2));

      const result = enableGreatCto();
      assert.equal(result.enabled, true);
      assert.ok(result.backupPath);

      const data = JSON.parse(readFileSync(path, "utf-8"));
      assert.equal(data.theme, "dark");
      assert.equal(data.enabledPlugins["other-plugin@source"], true);
      assert.equal(data.enabledPlugins["great_cto@local"], true);
      assert.deepEqual(data.customField, { nested: "value" });
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("creates backup with timestamp when settings.json exists", () => {
  const home = mkHome();
  try {
    withHome(home, () => {
      const path = join(home, ".claude", "settings.json");
      writeFileSync(path, JSON.stringify({ existing: "data" }));

      const result = enableGreatCto();
      assert.ok(result.backupPath);
      assert.ok(result.backupPath.startsWith(path + ".bak-"));
      assert.ok(existsSync(result.backupPath));

      const backupContent = JSON.parse(readFileSync(result.backupPath, "utf-8"));
      assert.equal(backupContent.existing, "data");
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("idempotent: second call reports alreadyEnabled", () => {
  const home = mkHome();
  try {
    withHome(home, () => {
      const first = enableGreatCto();
      assert.equal(first.enabled, true);

      const second = enableGreatCto();
      assert.equal(second.enabled, false);
      assert.equal(second.alreadyEnabled, true);
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("leaves invalid JSON untouched and warns", () => {
  const home = mkHome();
  try {
    withHome(home, () => {
      const path = join(home, ".claude", "settings.json");
      const garbage = "{ not valid json [[[";
      writeFileSync(path, garbage);

      const result = enableGreatCto();
      assert.equal(result.enabled, false);
      assert.equal(result.alreadyEnabled, false);

      // File should be untouched
      const content = readFileSync(path, "utf-8");
      assert.equal(content, garbage);
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("handles existing enabledPlugins=null gracefully", () => {
  const home = mkHome();
  try {
    withHome(home, () => {
      const path = join(home, ".claude", "settings.json");
      writeFileSync(path, JSON.stringify({ enabledPlugins: null }));

      const result = enableGreatCto();
      assert.equal(result.enabled, true);

      const data = JSON.parse(readFileSync(path, "utf-8"));
      assert.equal(data.enabledPlugins["great_cto@local"], true);
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("empty JSON object: no existing keys lost", () => {
  const home = mkHome();
  try {
    withHome(home, () => {
      const path = join(home, ".claude", "settings.json");
      writeFileSync(path, "{}");

      const result = enableGreatCto();
      assert.equal(result.enabled, true);

      const data = JSON.parse(readFileSync(path, "utf-8"));
      assert.equal(data.enabledPlugins["great_cto@local"], true);
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("empty file (zero-byte): treats as empty object", () => {
  const home = mkHome();
  try {
    withHome(home, () => {
      const path = join(home, ".claude", "settings.json");
      writeFileSync(path, "");

      const result = enableGreatCto();
      assert.equal(result.enabled, true);
      assert.ok(existsSync(path));
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
