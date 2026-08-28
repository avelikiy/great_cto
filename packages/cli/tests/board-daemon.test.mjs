// Tests for the OS-supervisor + ensure-gate core (ADR-007).
// Pure functions only — no process is spawned, no unit file is written. The
// side-effectful shell (spawn / launchctl / systemctl) lives in main.ts and is
// exercised by the manual verify + integration path, mirroring board-path.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderLaunchdPlist,
  renderSystemdUnit,
  renderSchtasksCommand,
  daemonSpec,
  decideEnsureAction,
} from "../dist/board-daemon.js";

const OPTS = {
  nodePath: "/usr/local/bin/node",
  cliPath: "/opt/great-cto/index.mjs",
  port: 3141,
  home: "/home/tester",
};

test("renderLaunchdPlist: keep-alive + start-at-login + correct program args", () => {
  const p = renderLaunchdPlist(OPTS);
  assert.match(p, /^<\?xml/);
  assert.match(p, /<key>Label<\/key>\s*<string>co\.greatcto\.board<\/string>/);
  assert.match(p, /<key>KeepAlive<\/key>\s*<true\/>/);
  assert.match(p, /<key>RunAtLoad<\/key>\s*<true\/>/);
  // ProgramArguments must invoke: node <cli> board --no-open
  assert.ok(p.includes("/usr/local/bin/node"), "node path present");
  assert.ok(p.includes("/opt/great-cto/index.mjs"), "cli path present");
  assert.ok(p.includes("<string>board</string>"), "board verb present");
  assert.ok(p.includes("<string>--no-open</string>"), "--no-open present");
  assert.match(p, /BOARD_PORT<\/key>\s*<string>3141<\/string>/);
});

test("renderLaunchdPlist: custom label + port flow through", () => {
  const p = renderLaunchdPlist({ ...OPTS, label: "co.greatcto.console", port: 8788 });
  assert.match(p, /<string>co\.greatcto\.console<\/string>/);
  assert.match(p, /BOARD_PORT<\/key>\s*<string>8788<\/string>/);
});

test("renderSystemdUnit: restart-always user service with correct ExecStart", () => {
  const u = renderSystemdUnit(OPTS);
  assert.match(u, /\[Service\]/);
  assert.match(u, /Restart=always/);
  assert.match(u, /\[Install\]/);
  assert.match(u, /WantedBy=default\.target/);
  assert.ok(/ExecStart=.*\/usr\/local\/bin\/node.*index\.mjs.*board.*--no-open/.test(u), "ExecStart runs the board");
  assert.match(u, /BOARD_PORT=3141/);
});

test("renderSchtasksCommand: onlogon task invoking the board", () => {
  const c = renderSchtasksCommand(OPTS);
  assert.ok(c.includes("schtasks"), "uses schtasks");
  assert.ok(c.includes("/create"), "creates a task");
  assert.ok(/\/sc\s+onlogon/.test(c), "runs at logon");
  assert.ok(c.includes("index.mjs"), "invokes the cli");
});

test("daemonSpec darwin → launchd LaunchAgent under home", () => {
  const s = daemonSpec("darwin", OPTS);
  assert.equal(s.supported, true);
  assert.equal(s.kind, "launchd");
  assert.equal(s.unitPath, "/home/tester/Library/LaunchAgents/co.greatcto.board.plist");
  assert.equal(s.render(), renderLaunchdPlist(OPTS));
  assert.ok(s.installCmds.some(c => c[0] === "launchctl" && c.includes("load")), "loads via launchctl");
  assert.ok(s.uninstallCmds.some(c => c[0] === "launchctl" && c.includes("unload")), "unloads via launchctl");
});

test("daemonSpec linux → systemd --user unit", () => {
  const s = daemonSpec("linux", OPTS);
  assert.equal(s.supported, true);
  assert.equal(s.kind, "systemd");
  assert.equal(s.unitPath, "/home/tester/.config/systemd/user/greatcto-board.service");
  assert.equal(s.render(), renderSystemdUnit(OPTS));
  assert.ok(
    s.installCmds.some(c => c[0] === "systemctl" && c.includes("--user") && c.includes("enable")),
    "enables via systemctl --user",
  );
});

test("daemonSpec win32 → schtasks, no unit file to write", () => {
  const s = daemonSpec("win32", OPTS);
  assert.equal(s.supported, true);
  assert.equal(s.kind, "schtasks");
  assert.equal(s.unitPath, "");
  assert.ok(s.installCmds.length > 0, "has an install command");
});

test("daemonSpec unknown platform → unsupported, no crash", () => {
  const s = daemonSpec(/** @type {any} */ ("sunos"), OPTS);
  assert.equal(s.supported, false);
});

// The case that broke it: a board running with no pid file this CLI wrote.
//
// Observed on a real machine — pid file naming 56328 (dead), port 3141 served by
// 47326 (HTTP 200). `ensure` asked the pid first, decided nothing was running,
// spawned a second server onto the occupied port, that one died on EADDRINUSE,
// and its pid was written down anyway. Every later run repeated it: a health gate
// failing forever while reporting success.
test("decideEnsureAction: port answering with no pid of ours → adopt, never start", () => {
  assert.equal(decideEnsureAction({ pid: null, alive: false, healthy: true }), "adopt");
  assert.equal(decideEnsureAction({ pid: 999, alive: false, healthy: true }), "adopt",
    "a dead pid beside a healthy port is a board someone else started");
});

test("decideEnsureAction: no pid → start", () => {
  assert.equal(decideEnsureAction({ pid: null, alive: false, healthy: false }), "start");
});
test("decideEnsureAction: stale pid (dead) → start", () => {
  assert.equal(decideEnsureAction({ pid: 999, alive: false, healthy: false }), "start");
});
test("decideEnsureAction: alive but port hung → restart", () => {
  assert.equal(decideEnsureAction({ pid: 999, alive: true, healthy: false }), "restart");
});
test("decideEnsureAction: alive + healthy → noop", () => {
  assert.equal(decideEnsureAction({ pid: 999, alive: true, healthy: true }), "noop");
});

// `board ensure` used to accept any HTTP response as proof the board was up, so
// anything squatting on the port — a dev server, a proxy, another app — made it
// report a healthy board and refuse to start the real one.
test("a foreign process on the port is not the board", async () => {
  const { isBoardResponse } = await import("../dist/board-daemon.js");
  assert.equal(isBoardResponse(200, "<!doctype html><h1>Vite</h1>"), false, "HTML is not the board");
  assert.equal(isBoardResponse(404, ""), false, "a 404 was the original false positive");
  assert.equal(isBoardResponse(200, '{"ok":true}'), false, "JSON alone proves nothing");
  assert.equal(isBoardResponse(502, '{"version":"1","surface":"builder"}'), false, "a gateway error is not up");
});

test("the board's own /api/version is recognised", async () => {
  const { isBoardResponse } = await import("../dist/board-daemon.js");
  assert.equal(isBoardResponse(200, '{"version":"2.90.0","surface":"builder","node":"22.0.0"}'), true);
});
