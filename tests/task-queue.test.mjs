// ZRS bounded task-runner — queue state machine + land-step two gates.
// GREAT_CTO_HOME is set to a throwaway dir BEFORE importing task-queue (ROOT is module-const).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.GREAT_CTO_HOME = mkdtempSync(join(tmpdir(), "zrs-"));

const { appendTask, readQueue, nextRunnable, setState, readState, recoverCrashed, isTerminal } =
  await import("../packages/cli/dist/task-queue.js");
const { land } = await import("../packages/cli/dist/land.js");

// ── queue + state machine ───────────────────────────────────────────────────
test("queue: append → nextRunnable picks priority then FIFO", () => {
  const a = appendTask({ repo: "/r", prompt: "low", priority: 0 });
  const b = appendTask({ repo: "/r", prompt: "high", priority: 5 });
  assert.equal(nextRunnable().id, b.id, "higher priority first");
  setState(b.id, { status: "landed" });
  assert.equal(nextRunnable().id, a.id, "then the remaining queued one");
});

test("setState transitions + isTerminal", () => {
  const t = appendTask({ repo: "/r", prompt: "x" });
  assert.equal(readState()[t.id], undefined, "no state until claimed");
  setState(t.id, { status: "claimed" });
  setState(t.id, { status: "running", started_at: "now" });
  const s = setState(t.id, { status: "landed", commit: "abc" });
  assert.equal(s.status, "landed");
  assert.equal(s.started_at, "now", "patch merges, does not clobber");
  assert.ok(isTerminal("landed") && isTerminal("failed") && !isTerminal("running"));
});

test("recoverCrashed: non-terminal → failed(interrupted)", () => {
  const t = appendTask({ repo: "/r", prompt: "crash" });
  setState(t.id, { status: "running" });
  const n = recoverCrashed();
  assert.ok(n >= 1);
  assert.equal(readState()[t.id].status, "failed");
  assert.equal(readState()[t.id].reason, "interrupted");
});

// ── land-step two gates (injected runners — no real git) ────────────────────
const TASK = { id: "x", created_at: "", repo: "/repo", target: "main", prompt: "", model: "sonnet", verify: "npm test", timeout_s: 1, priority: 0 };
const runner = (gitFn, verifyVal) => ({ git: (_cwd, args) => gitFn(args), verify: () => verifyVal });

test("land Gate 1: rebase conflict → needs-revision (does NOT land)", () => {
  const conflict = runner((args) => (args[0] === "rebase" && args[1] !== "--abort" ? { code: 1, out: "CONFLICT" } : { code: 0, out: "" }), 0);
  const r = land(TASK, "zrs/x", "/wt", conflict);
  assert.equal(r.status, "needs-revision");
  assert.equal(r.gate1, "conflict");
});

test("land Gate 2: verify red → failed (clean rebase, red verify)", () => {
  const red = runner(() => ({ code: 0, out: "" }), 1);
  const r = land(TASK, "zrs/x", "/wt", red);
  assert.equal(r.status, "failed");
  assert.equal(r.gate1, "clean");
  assert.equal(r.gate2, "red");
});

test("land: clean ∧ green → landed with commit", () => {
  const green = runner((args) => (args[0] === "rev-parse" ? { code: 0, out: "abc1234\n" } : { code: 0, out: "" }), 0);
  const r = land(TASK, "zrs/x", "/wt", green);
  assert.equal(r.status, "landed");
  assert.equal(r.gate1, "clean");
  assert.equal(r.gate2, "green");
  assert.equal(r.commit, "abc1234");
});

test("land: target moved (ff fails) then re-rebase clean+green → landed", () => {
  let ffCalls = 0;
  const moved = runner((args) => {
    if (args[0] === "merge") { ffCalls++; return { code: ffCalls === 1 ? 1 : 0, out: "" }; } // first ff fails, second ok
    if (args[0] === "rev-parse") return { code: 0, out: "def5678\n" };
    return { code: 0, out: "" };
  }, 0);
  const r = land(TASK, "zrs/x", "/wt", moved);
  assert.equal(r.status, "landed");
  assert.equal(r.commit, "def5678");
});
