// Keeping great_cto current inside Codex.
//
// Codex installs great_cto from a Git marketplace snapshot and never refreshes it on
// its own: on the maintainer's machine it sat at 3.37.0 while 3.45.0 shipped, so the
// Codex guards of 3.42–3.45 had never arrived. These tests use a fake `codex` binary
// and a throwaway CODEX_HOME.
//
// Run: npm run build && node --test tests/codex-upgrade.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findCodexBinary, codexHasGreatCtoMarketplace, installedCodexVersion, upgradeCodexPlugin } from "../dist/codex.js";

const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };

function codexHome({ marketplace = true, versions = ["3.37.0"] } = {}) {
  const h = tmp("codex-home-");
  writeFileSync(join(h, "config.toml"), marketplace
    ? '[plugins."great-cto@great-cto"]\nenabled = true\n\n[marketplaces.great-cto]\nsource_type = "git"\nsource = "https://github.com/avelikiy/great_cto.git"\nref = "main"\n'
    : '[plugins."figma@openai-curated"]\nenabled = true\n');
  for (const v of versions) mkdirSync(join(h, "plugins", "cache", "great-cto", "great-cto", v), { recursive: true });
  return h;
}
/** A fake codex that records its argv and "installs" 3.45.0 the way the real upgrade does. */
function fakeCodex(home, { fail = false } = {}) {
  const dir = tmp("codex-bin-");
  const bin = join(dir, "codex");
  writeFileSync(bin, `#!/bin/sh\necho "$@" > "${dir}/argv"\n${fail ? "echo boom >&2; exit 1" : `mkdir -p "${home}/plugins/cache/great-cto/great-cto/3.45.0"`}\n`);
  chmodSync(bin, 0o755);
  return { bin, dir };
}

test("native refresh refuses before invoking the host or replacing any cache", () => {
  const h = codexHome();
  const { bin, dir } = fakeCodex(h);
  const r = upgradeCodexPlugin({ codexHome: h, bin });
  assert.equal(r.status, "failed");
  assert.equal(r.fromVersion, "3.37.0");
  assert.equal(r.toVersion, "3.37.0");
  assert.match(r.reason, /unsupported.*preactivation/);
  assert.throws(() => readFileSync(join(dir, "argv")), "native updater must not run");
  assert.equal(installedCodexVersion(h), "3.37.0");
});

test("nothing is touched when great_cto is not installed for Codex", () => {
  const h = codexHome({ marketplace: false, versions: [] });
  const { bin, dir } = fakeCodex(h);
  const r = upgradeCodexPlugin({ codexHome: h, bin });
  assert.equal(r.status, "skipped");
  assert.throws(() => readFileSync(join(dir, "argv")), "codex was not called");
});

test("unproven native activation cannot be enabled by a provided host executable", () => {
  const h = codexHome();
  const none = upgradeCodexPlugin({ codexHome: h, bin: null });
  assert.equal(none.status, "failed");
  assert.match(none.reason, /verified native Codex activation/);
  const helper = fakeCodex(h, { fail: true });
  const failed = upgradeCodexPlugin({ codexHome: h, bin: helper.bin });
  assert.equal(failed.status, "failed");
  assert.equal(failed.toVersion, "3.37.0");
  assert.throws(() => readFileSync(join(helper.dir, "argv")));
});

test("installedCodexVersion compares versions as numbers; the marketplace check reads config.toml", () => {
  assert.equal(installedCodexVersion(codexHome({ versions: ["3.9.0", "3.10.0", "3.37.0"] })), "3.37.0");
  assert.equal(installedCodexVersion(codexHome({ versions: ["3.9.0", "3.10.0"] })), "3.10.0");
  assert.equal(codexHasGreatCtoMarketplace(codexHome()), true);
  assert.equal(codexHasGreatCtoMarketplace(codexHome({ marketplace: false })), false);
});

test("findCodexBinary looks past a PATH without nvm — the shell the maintainer typed into", () => {
  const h = tmp("fake-home-");
  const nvmBin = join(h, ".nvm", "versions", "node", "v22.19.0", "bin");
  mkdirSync(nvmBin, { recursive: true });
  writeFileSync(join(nvmBin, "codex"), "#!/bin/sh\n");
  assert.equal(findCodexBinary({ PATH: "/usr/bin:/bin" }, h), join(nvmBin, "codex"));
  const onPath = tmp("path-");
  writeFileSync(join(onPath, "codex"), "#!/bin/sh\n");
  assert.equal(findCodexBinary({ PATH: `${onPath}:/usr/bin` }, h), join(onPath, "codex"), "PATH wins");
});
