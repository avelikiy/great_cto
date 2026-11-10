// What init offers about the board after setup: the always-on question, the
// browser open, and the install-app hint. Pure functions only; the prompt, the
// unit file and the spawn live in main.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  alwaysOnVerdict,
  shouldOpenBoard,
  parseAlwaysOnState,
  renderAlwaysOnState,
  installAppHint,
} from "../dist/board-onboarding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASK = { isTTY: true, env: {}, yes: false, supported: true, installed: false, decided: false };

test("asks a person at a terminal who has not answered yet", () => {
  assert.deepEqual(alwaysOnVerdict(ASK), { ask: true });
});

test("never asks in CI or under a test runner", () => {
  for (const env of [{ CI: "1" }, { GITHUB_ACTIONS: "true" }, { NODE_TEST_CONTEXT: "child" }]) {
    assert.deepEqual(alwaysOnVerdict({ ...ASK, env }), { ask: false, reason: "ci" });
  }
});

test("--yes skips the question instead of installing a login item unasked", () => {
  assert.deepEqual(alwaysOnVerdict({ ...ASK, yes: true }), { ask: false, reason: "yes-flag" });
});

test("no terminal, no question", () => {
  assert.deepEqual(alwaysOnVerdict({ ...ASK, isTTY: false }), { ask: false, reason: "not-a-tty" });
});

test("asks once: a recorded answer or an installed unit ends it", () => {
  assert.deepEqual(alwaysOnVerdict({ ...ASK, decided: true }), { ask: false, reason: "already-decided" });
  assert.deepEqual(alwaysOnVerdict({ ...ASK, installed: true }), { ask: false, reason: "already-installed" });
});

test("opt-out and unsupported platforms stay quiet", () => {
  assert.deepEqual(alwaysOnVerdict({ ...ASK, env: { GREAT_CTO_NO_BOARD: "1" } }), { ask: false, reason: "opted-out" });
  assert.deepEqual(alwaysOnVerdict({ ...ASK, supported: false }), { ask: false, reason: "unsupported-platform" });
});

test("the browser opens only for a person who did not say --no-open", () => {
  assert.equal(shouldOpenBoard({ isTTY: true, env: {}, noOpen: false }), true);
  assert.equal(shouldOpenBoard({ isTTY: true, env: {}, noOpen: true }), false);
  assert.equal(shouldOpenBoard({ isTTY: false, env: {}, noOpen: false }), false);
  assert.equal(shouldOpenBoard({ isTTY: true, env: { CI: "1" }, noOpen: false }), false);
  assert.equal(shouldOpenBoard({ isTTY: true, env: { GREAT_CTO_NO_BOARD: "1" }, noOpen: false }), false);
});

test("the recorded answer round-trips; garbage is not an answer", () => {
  const now = new Date("2026-11-10T10:00:00Z");
  assert.deepEqual(parseAlwaysOnState(renderAlwaysOnState("no", now)), {
    decision: "no", decided_at: "2026-11-10T10:00:00.000Z",
  });
  assert.equal(parseAlwaysOnState(renderAlwaysOnState("yes", now)).decision, "yes");
  for (const bad of ["", "{", "{}", '{"decision":"maybe","decided_at":"x"}', '{"decision":"yes"}', "null"]) {
    assert.equal(parseAlwaysOnState(bad), null, `not a decision: ${bad}`);
  }
});

test("the hint names the port and the button the board really has", () => {
  const lines = installAppHint(3155);
  assert.ok(lines[0].includes("http://localhost:3155"));
  assert.ok(lines.some((l) => l.includes("Install app")));
  assert.ok(lines.some((l) => l.includes("Safari")));
  // The hint points at a control by its label; if the board renames it, this must fail.
  const index = fs.readFileSync(path.join(HERE, "..", "..", "board", "public", "index.html"), "utf8");
  assert.match(index, /id="install-app-btn"[\s\S]{0,400}Install app/);
});

test("init calls the board step after bootstrap and before it says ready", () => {
  const main = fs.readFileSync(path.join(HERE, "..", "src", "main.ts"), "utf8");
  const bootstrapAt = main.indexOf('step(5, 5, "bootstrapping .great_cto/PROJECT.md")');
  const offerAt = main.indexOf("await offerBoardAfterInit(args);");
  const readyAt = main.indexOf("✓ great_cto is ready.");
  assert.ok(bootstrapAt > 0 && offerAt > bootstrapAt && readyAt > offerAt);
});
