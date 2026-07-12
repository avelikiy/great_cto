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
