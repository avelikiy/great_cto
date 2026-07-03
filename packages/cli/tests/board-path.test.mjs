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
