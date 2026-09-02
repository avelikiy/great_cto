// Tests for board server resolution (great_cto-hbu3):
//  - plugin cache scan must cover ANY marketplace dir, not just "local"
//  - the npm-bundled copy is the guaranteed fallback on a fresh install
//  - the bundle produced by scripts/bundle-board.mjs is complete and loadable
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { findBoardServerPath } from "../dist/board-path.js";

const here = dirname(fileURLToPath(import.meta.url)); // packages/cli/tests
const cliRoot = join(here, "..");

function makeTmp() {
  return mkdtempSync(join(tmpdir(), "gcto-board-path-"));
}

test("finds server.mjs in a non-'local' marketplace cache dir", () => {
  const home = makeTmp();
  const base = makeTmp(); // no dev layouts, no bundle
  try {
    const vDir = join(home, ".claude", "plugins", "cache", "claude-plugins-official", "great_cto", "2.77.0", "packages", "board");
    mkdirSync(vDir, { recursive: true });
    writeFileSync(join(vDir, "server.mjs"), "// stub");
    const found = findBoardServerPath(base, home);
    assert.equal(found, join(vDir, "server.mjs"));
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(base, { recursive: true, force: true });
  }
});

test("picks the highest semver version numerically (2.100.0 > 2.99.0)", () => {
  const home = makeTmp();
  const base = makeTmp();
  try {
    for (const v of ["2.99.0", "2.100.0"]) {
      const d = join(home, ".claude", "plugins", "cache", "local", "great_cto", v, "packages", "board");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "server.mjs"), "// stub");
    }
    const found = findBoardServerPath(base, home);
    assert.ok(found.includes("2.100.0"), `expected 2.100.0, got ${found}`);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(base, { recursive: true, force: true });
  }
});

test("falls back to the npm-bundled copy when no plugin cache exists", () => {
  const home = makeTmp(); // empty — no ~/.claude at all
  const root = makeTmp(); // fake package root: root/dist + root/board
  try {
    const base = join(root, "dist"); // pretend this is <pkg>/dist
    mkdirSync(base, { recursive: true });
    const bundled = join(root, "board", "packages", "board");
    mkdirSync(bundled, { recursive: true });
    writeFileSync(join(bundled, "server.mjs"), "// stub");
    const found = findBoardServerPath(base, home);
    assert.equal(found, join(bundled, "server.mjs"));
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test("returns undefined when nothing exists anywhere", () => {
  const home = makeTmp();
  const root = makeTmp();
  try {
    const base = join(root, "dist");
    mkdirSync(base, { recursive: true });
    assert.equal(findBoardServerPath(base, home), undefined);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test("bundle-board.mjs produces a complete, syntax-valid bundle", () => {
  execFileSync(process.execPath, [join(cliRoot, "scripts", "bundle-board.mjs")], { cwd: cliRoot });
  const out = join(cliRoot, "board");
  for (const rel of [
    "packages/board/server.mjs",
    "packages/board/push-adapter.mjs",
    "packages/board/lib/routes.mjs",
    "packages/board/public/index.html",
    "scripts/lib/gate-plan.mjs",
    "packages/cli/dist/archetypes.js",
    ".claude-plugin/plugin.json",
  ]) {
    assert.ok(existsSync(join(out, rel)), `bundle missing ${rel}`);
  }
  // no tests / worker in the shipped bundle
  assert.ok(!existsSync(join(out, "packages/board/push-adapter.test.mjs")), "tests must not ship");
  assert.ok(!existsSync(join(out, "packages/board/cloudflare-worker")), "cloudflare-worker must not ship");
  // the bundled server parses (imports resolve is covered by the boot test below)
  execFileSync(process.execPath, ["--check", join(out, "packages/board/server.mjs")]);
});

test("bundled board server boots and serves /api/version", async () => {
  const out = join(cliRoot, "board");
  assert.ok(existsSync(join(out, "packages/board/server.mjs")), "run after bundle test");
  const { spawn } = await import("node:child_process");
  const port = 3197;
  const child = spawn(process.execPath, [join(out, "packages/board/server.mjs"), "--no-open"], {
    env: { ...process.env, BOARD_PORT: String(port) },
    stdio: "ignore",
  });
  try {
    let ok = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/version`);
        if (res.ok) { ok = true; break; }
      } catch { /* not up yet */ }
    }
    assert.ok(ok, "bundled server did not answer /api/version within 6s");
  } finally {
    child.kill("SIGKILL");
  }
});

// ── a stale plugin must not answer for a newer CLI ───────────────────────────
//
// The plugin cache won unconditionally, so `npm i -g great-cto@NEW` installed a
// new CLI carrying a new bundled board and `great-cto board` launched the OLD
// board out of the cache. The CLI reported the new version; the screen served
// the old one; nothing said so.

test('a plugin older than the CLI loses to the bundled board', () => {
  const home = mkdtempSync(join(tmpdir(), 'gcto-bp-stale-'));
  const base = mkdtempSync(join(tmpdir(), 'gcto-bp-cli-'));
  // plugin 3.13.0 installed, CLI 3.14.0 running
  const plug = join(home, '.claude/plugins/cache/local/great_cto/3.13.0/packages/board');
  mkdirSync(plug, { recursive: true });
  writeFileSync(join(plug, 'server.mjs'), '// old');
  const bundled = join(base, '..', 'board', 'packages', 'board');
  mkdirSync(bundled, { recursive: true });
  writeFileSync(join(bundled, 'server.mjs'), '// new');

  const chosen = findBoardServerPath(base, home, '3.14.0');
  assert.match(chosen, /board\/packages\/board\/server\.mjs$/);
  assert.doesNotMatch(chosen, /3\.13\.0/, 'the older plugin must not answer for a newer CLI');
});

test('a plugin at or above the CLI still wins — it carries more than the bundle', () => {
  const home = mkdtempSync(join(tmpdir(), 'gcto-bp-fresh-'));
  const base = mkdtempSync(join(tmpdir(), 'gcto-bp-cli2-'));
  const plug = join(home, '.claude/plugins/cache/local/great_cto/3.14.0/packages/board');
  mkdirSync(plug, { recursive: true });
  writeFileSync(join(plug, 'server.mjs'), '// same version');
  const bundled = join(base, '..', 'board', 'packages', 'board');
  mkdirSync(bundled, { recursive: true });
  writeFileSync(join(bundled, 'server.mjs'), '// bundle');

  const chosen = findBoardServerPath(base, home, '3.14.0');
  assert.match(chosen, /3\.14\.0/,
    'a plugin install carries agents, skills and commands the npm package does not');
});

test('with no CLI version the behaviour is unchanged — no silent difference', () => {
  const home = mkdtempSync(join(tmpdir(), 'gcto-bp-none-'));
  const base = mkdtempSync(join(tmpdir(), 'gcto-bp-cli3-'));
  const plug = join(home, '.claude/plugins/cache/local/great_cto/3.13.0/packages/board');
  mkdirSync(plug, { recursive: true });
  writeFileSync(join(plug, 'server.mjs'), '// old');
  const bundled = join(base, '..', 'board', 'packages', 'board');
  mkdirSync(bundled, { recursive: true });
  writeFileSync(join(bundled, 'server.mjs'), '// new');

  assert.match(findBoardServerPath(base, home), /3\.13\.0/,
    'a caller that cannot determine its version must not get a different answer by surprise');
});

// The plugin manifest's name became kebab-case, because the Claude.ai marketplace
// requires it. A marketplace install therefore writes the cache directory under
// `great-cto`, while `npx great-cto` keeps writing `great_cto`. Both exist in the
// wild — a user who installed from npm before the directory listing, and one who
// installs from the directory after — and one machine can hold both. Neither name
// may be assumed. Before this, the scan hardcoded `great_cto` and a
// marketplace-only install fell through to the bundled board without saying so.
test("finds server.mjs under the kebab-case marketplace directory name", () => {
  const home = makeTmp();
  const base = makeTmp(); // no dev layouts, no bundle
  try {
    const vDir = join(home, ".claude", "plugins", "cache", "claude-community", "great-cto", "3.21.0", "packages", "board");
    mkdirSync(vDir, { recursive: true });
    writeFileSync(join(vDir, "server.mjs"), "// board\n");
    assert.equal(findBoardServerPath(base, home), join(vDir, "server.mjs"));
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(base, { recursive: true, force: true });
  }
});

// And both at once — the npm install and the directory install on one machine.
// The newer version wins regardless of which directory name carries it.
test("prefers the newer version across both directory names", () => {
  const home = makeTmp();
  const base = makeTmp();
  try {
    const older = join(home, ".claude/plugins/cache/local/great_cto/3.20.0/packages/board");
    const newer = join(home, ".claude/plugins/cache/claude-community/great-cto/3.21.0/packages/board");
    for (const d of [older, newer]) {
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "server.mjs"), "// board\n");
    }
    assert.equal(findBoardServerPath(base, home), join(newer, "server.mjs"));
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(base, { recursive: true, force: true });
  }
});
