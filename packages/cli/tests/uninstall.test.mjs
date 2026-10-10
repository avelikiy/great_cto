// Tests for uninstall.ts — the plan is a pure read of the filesystem, and --yes
// removes exactly the plan: what an install wrote, never what the user made.
//
// Every test builds a temporary HOME; nothing here touches the real one.
//
// Run: npm run build && node --test tests/uninstall.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planUninstall, applyUninstall, liveRootsFromPs, MANAGED_MARKER } from "../dist/uninstall.js";

const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

function put(p, text) { mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, text); }

/** A HOME that looks like a machine with great_cto installed and used for a while. */
function home() {
  const h = mkdtempSync(join(tmpdir(), "gcto-uninstall-"));
  made.push(h);
  const c = join(h, ".claude");
  put(join(c, "agents", "great_cto-architect.md"), `# architect\n${MANAGED_MARKER}\n`);
  put(join(c, "agents", "my-own-agent.md"), "# mine\n");
  put(join(c, "commands", "start.md"), `# start\n${MANAGED_MARKER}\n`);
  put(join(c, "commands", "deploy.md"), "# the user's own /deploy — no marker\n");
  put(join(c, "settings.json"), JSON.stringify({
    theme: "dark",
    enabledPlugins: { "great_cto@great-cto": true, "great_cto@local": true, "superpowers@local": true, "other@x": true },
  }));
  put(join(c, "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "great_cto@local": [{}], "other@x": [{}] } }));
  put(join(c, "plugins", "known_marketplaces.json"), JSON.stringify({ "great-cto": {}, "someone-else": {} }));
  for (const v of ["3.39.0", "3.40.0", "3.40.1"]) put(join(c, "plugins", "cache", "great-cto", "great_cto", v, "plugin.json"), "{}");
  put(join(c, "plugins", "cache", "other", "thing", "1.0.0", "plugin.json"), "{}");
  const g = join(h, ".great_cto");
  put(join(g, "secrets.env"), "API_KEY=keep-me\n");
  put(join(g, "lessons.md"), "# lessons\n");
  put(join(g, "decisions.md"), "# decisions\n");
  put(join(g, "catalog", "README.md"), "clone\n");
  put(join(g, "skills-registry.json"), "{}");
  put(join(g, ".welcomed-3.40"), "");
  put(join(g, "board.pid"), "999999\n");
  return h;
}

test("the plan names only what great_cto wrote", () => {
  const h = home();
  const p = planUninstall({ home: h });
  assert.deepEqual(p.agents.map((f) => f.split("/").pop()), ["great_cto-architect.md"]);
  assert.deepEqual(p.commands.map((f) => f.split("/").pop()), ["start.md"], "an unmarked command is the user's");
  assert.deepEqual(p.settingsKeys.sort(), ["great_cto@great-cto", "great_cto@local"]);
  assert.deepEqual(p.installedKeys, ["great_cto@local"]);
  assert.deepEqual(p.companions, ["superpowers@local"], "companions are reported, not removed");
  assert.deepEqual(p.marketplaces, ["great-cto"]);
  assert.equal(p.pluginVersions.length, 3);
  assert.ok(p.pluginVersions.every((d) => d.includes("/great_cto/")), "another plugin's cache is not in the plan");
  const base = (xs) => xs.map((f) => f.split("/").pop()).sort();
  assert.deepEqual(base(p.caches), [".welcomed-3.40", "board.pid", "catalog", "skills-registry.json"]);
  assert.deepEqual(base(p.userData), ["decisions.md", "lessons.md", "secrets.env"]);
});

test("a version a running session loads is kept, with the reason", () => {
  const h = home();
  const live = join(h, ".claude", "plugins", "cache", "great-cto", "great_cto", "3.40.1");
  const ps = `node /x/cli.js CLAUDE_PLUGIN_ROOT=${live} HOME=${h}\nzsh TERM=xterm`;
  const p = planUninstall({ home: h, psText: ps });
  assert.equal(p.pluginVersions.length, 2);
  assert.equal(p.keptVersions.length, 1);
  assert.equal(p.keptVersions[0].dir, live);
  assert.match(p.keptVersions[0].why, /running/);
});

test("liveRootsFromPs keeps a path with spaces whole", () => {
  const roots = liveRootsFromPs("claude CLAUDE_PLUGIN_ROOT=/Users/a/Library/Application Support/x/great_cto/3.40.1 PATH=/bin");
  assert.deepEqual(roots, ["/Users/a/Library/Application Support/x/great_cto/3.40.1"]);
});

test("--yes removes the plan and nothing else; settings keep every other key", () => {
  const h = home();
  const c = join(h, ".claude");
  const r = applyUninstall(planUninstall({ home: h }), { stamp: "T" });
  assert.deepEqual(r.failed, []);
  assert.ok(!existsSync(join(c, "agents", "great_cto-architect.md")));
  assert.ok(existsSync(join(c, "agents", "my-own-agent.md")), "the user's agent stays");
  assert.ok(!existsSync(join(c, "commands", "start.md")));
  assert.ok(existsSync(join(c, "commands", "deploy.md")), "the user's command stays");
  assert.ok(!existsSync(join(c, "plugins", "cache", "great-cto")), "an emptied market directory goes too");
  assert.ok(existsSync(join(c, "plugins", "cache", "other", "thing", "1.0.0")), "another plugin stays");

  const s = JSON.parse(readFileSync(join(c, "settings.json"), "utf8"));
  assert.equal(s.theme, "dark");
  assert.deepEqual(s.enabledPlugins, { "superpowers@local": true, "other@x": true });
  assert.ok(existsSync(join(c, "settings.json.bak-T")), "settings are backed up before the write");
  const inst = JSON.parse(readFileSync(join(c, "plugins", "installed_plugins.json"), "utf8"));
  assert.deepEqual(Object.keys(inst.plugins), ["other@x"]);
  assert.equal(inst.version, 2);

  const g = join(h, ".great_cto");
  assert.equal(readFileSync(join(g, "secrets.env"), "utf8"), "API_KEY=keep-me\n", "secrets survive without --purge-data");
  assert.ok(existsSync(join(g, "lessons.md")));
  assert.ok(!existsSync(join(g, "catalog")) && !existsSync(join(g, "board.pid")), "caches go");
  assert.equal(r.movedData, null);
});

test("--purge-data moves ~/.great_cto aside — reversible, secrets intact", () => {
  const h = home();
  const r = applyUninstall(planUninstall({ home: h }), { purgeData: true, stamp: "T" });
  assert.ok(!existsSync(join(h, ".great_cto")));
  assert.equal(r.movedData, join(h, ".great_cto.removed-T"));
  assert.equal(readFileSync(join(r.movedData, "secrets.env"), "utf8"), "API_KEY=keep-me\n");
  assert.ok(existsSync(join(r.movedData, "decisions.md")));
});

test("a live version survives --yes, and its market directory with it", () => {
  const h = home();
  const live = join(h, ".claude", "plugins", "cache", "great-cto", "great_cto", "3.40.1");
  applyUninstall(planUninstall({ home: h, psText: `x CLAUDE_PLUGIN_ROOT=${live}` }), { stamp: "T" });
  assert.deepEqual(readdirSync(join(live, "..")), ["3.40.1"]);
});

test("an unparseable settings.json is left untouched", () => {
  const h = home();
  const f = join(h, ".claude", "settings.json");
  writeFileSync(f, "{ not json");
  const p = planUninstall({ home: h });
  assert.deepEqual(p.settingsKeys, [], "an unreadable file yields no keys to drop");
  applyUninstall(p, { stamp: "T" });
  assert.equal(readFileSync(f, "utf8"), "{ not json");
});

test("an empty HOME plans nothing and applies cleanly", () => {
  const h = mkdtempSync(join(tmpdir(), "gcto-uninstall-empty-"));
  made.push(h);
  const p = planUninstall({ home: h });
  for (const k of ["pluginVersions", "agents", "commands", "settingsKeys", "installedKeys", "caches", "userData"]) assert.deepEqual(p[k], [], k);
  assert.deepEqual(applyUninstall(p).failed, []);
});
