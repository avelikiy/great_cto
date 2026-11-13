// Tests for the compare-and-swap settings writer (ARCH-plugin-activation Q2 step 8).
//
// Every test works in its own temp dir and passes explicit paths. Nothing here reads or
// writes the real ~/.claude. The two legacy-wrapper tests swap HOME to a temp dir and
// assert the resolved settings path is inside it before calling anything.
//
// Run: npm run build && node --test tests/settings-cas.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync,
  readdirSync, symlinkSync, lstatSync, statSync, chmodSync, realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const { enablePluginCas, enablePlugin, enableGreatCto, getSettingsPath, SettingsRefusal } =
  await import("../dist/settings.js");

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const KEY = "great_cto@local";

function sandbox(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gcto-settings-cas-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, "claude");
  mkdirSync(dir);
  return { root, dir, settings: join(dir, "settings.json"), backups: join(root, "txn", "previous") };
}

function refusal(fn, reason) {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof SettingsRefusal, `expected SettingsRefusal, got ${e && e.stack}`);
    if (reason) assert.equal(e.reason, reason, e.message);
    return e;
  }
  assert.fail("expected a SettingsRefusal, but the call returned");
}

test("creates the file when absent and reports digests", (t) => {
  const s = sandbox(t);
  const r = enablePluginCas(KEY, { settingsPath: s.settings });
  assert.equal(r.enabled, true);
  assert.equal(r.alreadyEnabled, false);
  assert.equal(r.previousDigest, null);
  const bytes = readFileSync(s.settings);
  assert.equal(r.writtenDigest, sha256(bytes));
  assert.deepEqual(JSON.parse(bytes.toString("utf8")), { enabledPlugins: { [KEY]: true } });
  assert.equal(statSync(s.settings).mode & 0o777, 0o600);
});

test("preserves every other key and reports previous and written digests", (t) => {
  const s = sandbox(t);
  const initial = {
    theme: "dark",
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }] },
    enabledPlugins: { "other@source": true, "off@source": false },
    cleanupPeriodDays: 30,
    nested: { a: [1, 2, { b: null }] },
  };
  const before = JSON.stringify(initial, null, 2) + "\n";
  writeFileSync(s.settings, before);

  const r = enablePluginCas(KEY, { settingsPath: s.settings });

  const expected = JSON.stringify(
    { ...initial, enabledPlugins: { ...initial.enabledPlugins, [KEY]: true } }, null, 2) + "\n";
  assert.equal(readFileSync(s.settings, "utf8"), expected, "only the one key may differ");
  assert.equal(r.previousDigest, sha256(before));
  assert.equal(r.writtenDigest, sha256(expected));
  assert.equal(r.reformatted, false);
});

test("keeps the file's own indentation and missing trailing newline", (t) => {
  const s = sandbox(t);
  const before = JSON.stringify({ theme: "dark" }, null, 4);
  writeFileSync(s.settings, before);
  enablePluginCas(KEY, { settingsPath: s.settings });
  assert.equal(readFileSync(s.settings, "utf8"),
    JSON.stringify({ theme: "dark", enabledPlugins: { [KEY]: true } }, null, 4));
});

test("an empty file is an empty object, not a failed read", (t) => {
  const s = sandbox(t);
  writeFileSync(s.settings, "");
  const r = enablePluginCas(KEY, { settingsPath: s.settings });
  assert.equal(r.enabled, true);
  assert.deepEqual(JSON.parse(readFileSync(s.settings, "utf8")), { enabledPlugins: { [KEY]: true } });
});

test("enabledPlugins: null is treated as absent", (t) => {
  const s = sandbox(t);
  writeFileSync(s.settings, JSON.stringify({ enabledPlugins: null, keep: 1 }));
  enablePluginCas(KEY, { settingsPath: s.settings });
  assert.deepEqual(JSON.parse(readFileSync(s.settings, "utf8")),
    { enabledPlugins: { [KEY]: true }, keep: 1 });
});

test("idempotent: a second call writes nothing, not even a backup", (t) => {
  const s = sandbox(t);
  enablePluginCas(KEY, { settingsPath: s.settings });
  const bytes = readFileSync(s.settings);
  const mtime = statSync(s.settings).mtimeMs;
  const listing = readdirSync(s.dir);

  const again = enablePluginCas(KEY, { settingsPath: s.settings, backupDir: s.backups });

  assert.equal(again.alreadyEnabled, true);
  assert.equal(again.enabled, false);
  assert.equal(again.previousDigest, sha256(bytes));
  assert.equal(again.writtenDigest, null, "nothing was written, so there is nothing to restore");
  assert.deepEqual(readFileSync(s.settings), bytes);
  assert.equal(statSync(s.settings).mtimeMs, mtime);
  assert.deepEqual(readdirSync(s.dir), listing);
  assert.equal(existsSync(s.backups), false, "an idempotent call must not create the backup dir");
});

for (const phase of ["read", "staged"]) {
  test(`lost update is refused when the host writes after the ${phase} phase`, (t) => {
    const s = sandbox(t);
    writeFileSync(s.settings, JSON.stringify({ theme: "dark" }, null, 2) + "\n");
    const hostWrite = JSON.stringify({ theme: "light", addedByHost: true }, null, 2) + "\n";

    const e = refusal(() => enablePluginCas(KEY, {
      settingsPath: s.settings,
      onPhase: (p) => { if (p === phase) writeFileSync(s.settings, hostWrite); },
    }), "settings-changed-concurrently");

    assert.match(e.message, /retry after the host update/);
    assert.equal(readFileSync(s.settings, "utf8"), hostWrite, "the host's write must survive");
    assert.deepEqual(readdirSync(s.dir), ["settings.json"], "no temp file may be left behind");
  });
}

test("a file the host creates while we staged is not overwritten", (t) => {
  const s = sandbox(t);
  const hostWrite = '{"createdByHost":true}\n';
  refusal(() => enablePluginCas(KEY, {
    settingsPath: s.settings,
    onPhase: (p) => { if (p === "staged") writeFileSync(s.settings, hostWrite); },
  }), "settings-changed-concurrently");
  assert.equal(readFileSync(s.settings, "utf8"), hostWrite);
  assert.deepEqual(readdirSync(s.dir), ["settings.json"]);
});

test("a host deletion between read and rename is refused, not resurrected", (t) => {
  const s = sandbox(t);
  writeFileSync(s.settings, '{"a":1}\n');
  refusal(() => enablePluginCas(KEY, {
    settingsPath: s.settings,
    onPhase: (p) => { if (p === "staged") rmSync(s.settings); },
  }), "settings-changed-concurrently");
  assert.deepEqual(readdirSync(s.dir), []);
});

test("unparseable settings refuse, name the file and the one key to add by hand", (t) => {
  const s = sandbox(t);
  const garbage = "{ not valid json [[[";
  writeFileSync(s.settings, garbage);

  const e = refusal(() => enablePluginCas(KEY, { settingsPath: s.settings, backupDir: s.backups }),
    "settings-unparseable");

  assert.ok(e.message.includes(s.settings), `message must name the file: ${e.message}`);
  assert.ok(e.message.includes(`enabledPlugins["${KEY}"] = true`), `message must name the key: ${e.message}`);
  assert.equal(e.settingsPath, s.settings);
  assert.equal(readFileSync(s.settings, "utf8"), garbage);
  assert.deepEqual(readdirSync(s.dir), ["settings.json"]);
  assert.equal(existsSync(s.backups), false);
});

for (const [label, text, reason] of [
  ["a top-level array", "[1,2]", "settings-not-object"],
  ["a top-level null", "null", "settings-not-object"],
  ["a top-level string", '"x"', "settings-not-object"],
  ["enabledPlugins as an array", '{"enabledPlugins":[1]}', "enabled-plugins-not-object"],
  ["enabledPlugins as a string", '{"enabledPlugins":"yes"}', "enabled-plugins-not-object"],
]) {
  test(`refuses ${label} without changing the file`, (t) => {
    const s = sandbox(t);
    writeFileSync(s.settings, text);
    const e = refusal(() => enablePluginCas(KEY, { settingsPath: s.settings }), reason);
    assert.ok(e.message.includes(s.settings));
    assert.equal(readFileSync(s.settings, "utf8"), text);
    assert.deepEqual(readdirSync(s.dir), ["settings.json"]);
  });
}

test("a symlinked target is refused and the link is left intact", (t) => {
  const s = sandbox(t);
  const real = join(s.root, "dotfiles-settings.json");
  writeFileSync(real, '{"keep":true}\n');
  symlinkSync(real, s.settings);

  const e = refusal(() => enablePluginCas(KEY, { settingsPath: s.settings }), "target-not-regular-file");

  assert.ok(e.message.includes(s.settings));
  assert.ok(lstatSync(s.settings).isSymbolicLink(), "the symlink must still be a symlink");
  assert.equal(readFileSync(real, "utf8"), '{"keep":true}\n');
  assert.deepEqual(readdirSync(s.dir), ["settings.json"]);
});

test("a dangling symlink is refused rather than written through", (t) => {
  const s = sandbox(t);
  const missing = join(s.root, "does-not-exist.json");
  symlinkSync(missing, s.settings);
  refusal(() => enablePluginCas(KEY, { settingsPath: s.settings }), "target-not-regular-file");
  assert.equal(existsSync(missing), false, "must not create the link's target");
});

test("an unreadable file is a refusal, never an empty object", (t) => {
  if (process.platform === "win32" || (process.getuid && process.getuid() === 0)) {
    t.skip("file permissions are not enforced for this user");
    return;
  }
  const s = sandbox(t);
  writeFileSync(s.settings, '{"keep":true}\n');
  chmodSync(s.settings, 0o000);
  try {
    refusal(() => enablePluginCas(KEY, { settingsPath: s.settings }), "settings-unreadable");
  } finally {
    chmodSync(s.settings, 0o600);
  }
  assert.equal(readFileSync(s.settings, "utf8"), '{"keep":true}\n');
});

test("backupDir receives the original bytes, 0600, before the swap", (t) => {
  const s = sandbox(t);
  const before = '{"theme":"dark"}\n';
  writeFileSync(s.settings, before);

  const r = enablePluginCas(KEY, { settingsPath: s.settings, backupDir: s.backups });

  const backup = join(s.backups, "settings.json");
  assert.equal(readFileSync(backup, "utf8"), before);
  assert.equal(sha256(readFileSync(backup)), r.previousDigest);
  assert.equal(statSync(backup).mode & 0o777, 0o600);
  assert.equal(r.backupPath, backup);
  assert.deepEqual(readdirSync(s.dir), ["settings.json"], "nothing is written beside the target");
});

test("a snapshot that no longer matches the file refuses and leaves both alone", (t) => {
  const s = sandbox(t);
  mkdirSync(s.backups, { recursive: true });
  writeFileSync(join(s.backups, "settings.json"), '{"snapshot":"older"}\n');
  writeFileSync(s.settings, '{"host":"changed it since"}\n');

  refusal(() => enablePluginCas(KEY, { settingsPath: s.settings, backupDir: s.backups }),
    "changed-since-snapshot");

  assert.equal(readFileSync(s.settings, "utf8"), '{"host":"changed it since"}\n');
  assert.equal(readFileSync(join(s.backups, "settings.json"), "utf8"), '{"snapshot":"older"}\n');
});

test("a snapshot that matches the file is accepted as is", (t) => {
  const s = sandbox(t);
  const before = '{"theme":"dark"}\n';
  mkdirSync(s.backups, { recursive: true });
  writeFileSync(join(s.backups, "settings.json"), before);
  writeFileSync(s.settings, before);
  const r = enablePluginCas(KEY, { settingsPath: s.settings, backupDir: s.backups });
  assert.equal(r.enabled, true);
  assert.equal(readFileSync(join(s.backups, "settings.json"), "utf8"), before);
});

for (const bad of ["", "a b", "__proto__", "x\ny@z", 7, null, undefined]) {
  test(`refuses plugin key ${JSON.stringify(bad)} before reading anything`, (t) => {
    const s = sandbox(t);
    writeFileSync(s.settings, '{"a":1}\n');
    refusal(() => enablePluginCas(bad, { settingsPath: s.settings }), "invalid-plugin-key");
    assert.equal(readFileSync(s.settings, "utf8"), '{"a":1}\n');
  });
}

// ── legacy wrappers: same names, same non-throwing contract ────────────────────────────

function withHome(t, fn) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gcto-settings-cas-home-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".claude"));
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = root;
  process.env.USERPROFILE = root;
  try {
    assert.ok(getSettingsPath().startsWith(root), "refusing to run against a path outside the temp HOME");
    return fn(root);
  } finally {
    process.env.HOME = saved.HOME;
    process.env.USERPROFILE = saved.USERPROFILE;
  }
}

test("legacy enablePlugin reports an unparseable file as a refusal and does not throw", (t) => {
  withHome(t, (home) => {
    const path = join(home, ".claude", "settings.json");
    writeFileSync(path, "{ nope");
    const r = enablePlugin("other@src");
    assert.equal(r.enabled, false);
    assert.equal(r.alreadyEnabled, false);
    assert.equal(r.refusal.reason, "settings-unparseable");
    assert.ok(r.refusal.message.includes(path));
    assert.ok(r.refusal.message.includes('enabledPlugins["other@src"] = true'));
    assert.equal(readFileSync(path, "utf8"), "{ nope");
    assert.deepEqual(readdirSync(join(home, ".claude")), ["settings.json"], "no backup of a file we did not touch");
  });
});

test("legacy enableGreatCto no longer leaks a backup file on the idempotent call", (t) => {
  withHome(t, (home) => {
    const path = join(home, ".claude", "settings.json");
    writeFileSync(path, '{"theme":"dark"}\n');
    assert.equal(enableGreatCto().enabled, true);
    const after = readdirSync(join(home, ".claude")).sort();
    assert.equal(after.filter((n) => n.startsWith("settings.json.bak-")).length, 1);

    assert.equal(enableGreatCto().alreadyEnabled, true);
    assert.deepEqual(readdirSync(join(home, ".claude")).sort(), after, "the second call must write nothing");
  });
});

test("legacy enablePlugin leaves a symlinked settings.json alone", (t) => {
  withHome(t, (home) => {
    const real = join(home, "dotfiles.json");
    writeFileSync(real, '{"keep":1}\n');
    const link = join(home, ".claude", "settings.json");
    symlinkSync(real, link);
    const r = enablePlugin(KEY);
    assert.equal(r.enabled, false);
    assert.equal(r.refusal.reason, "target-not-regular-file");
    assert.ok(lstatSync(link).isSymbolicLink());
    assert.equal(readFileSync(real, "utf8"), '{"keep":1}\n');
  });
});
