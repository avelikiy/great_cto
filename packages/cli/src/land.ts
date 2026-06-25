// ZRS land-step — the ctx merge-queue borrow: "agent finished" != "change landed".
// Two gates: (1) apply-clean rebase onto the LIVE target, (2) combined-verify on the rebased
// result. Advance the target with ff-only ONLY when both pass. Runners are injected so the gates
// are unit-testable without a real repo (see tests/task-queue.test.mjs).
import { spawnSync } from "node:child_process";
import type { Task, TaskState } from "./task-queue.js";

export interface Runners {
  git(cwd: string, args: string[]): { code: number; out: string };
  verify(cmd: string, cwd: string): number;
}

export const realRunners: Runners = {
  git(cwd, args) {
    const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
    return { code: r.status ?? 1, out: (r.stdout || "") + (r.stderr || "") };
  },
  verify(cmd, cwd) {
    if (!cmd) return 0; // no verify configured → Gate 2 is a no-op (still green)
    const r = spawnSync("sh", ["-c", cmd], { cwd, stdio: "inherit" });
    return r.status ?? 1;
  },
};

export type LandResult = Pick<TaskState, "status" | "gate1" | "gate2" | "commit" | "reason">;

/**
 * Land `branch` (built in `worktree`) onto `task.target`. Returns the terminal status.
 *   needs-revision = Gate 1 conflict (rebase failed) — bounce back for human re-add / agent rebase
 *   failed         = Gate 2 red (verify non-zero)
 *   landed         = clean ∧ green, fast-forwarded onto target
 */
export function land(task: Task, branch: string, worktree: string, runners: Runners = realRunners): LandResult {
  const { git, verify } = runners;
  const target = task.target;

  // ── Gate 1: rebase the work onto the live target (it may have moved under us) ──
  const reb = git(worktree, ["rebase", target]);
  if (reb.code !== 0) {
    git(worktree, ["rebase", "--abort"]);
    return { status: "needs-revision", gate1: "conflict", reason: `rebase conflict onto ${target}` };
  }

  // ── Gate 2: verify the REBASED (combined) result — A green + B green can still be A+B red ──
  if (verify(task.verify, worktree) !== 0) {
    return { status: "failed", gate1: "clean", gate2: "red", reason: "verify failed on rebased result" };
  }

  // ── Land: advance target with ff-only (never force, never clobber a concurrent commit) ──
  if (git(task.repo, ["checkout", target]).code !== 0) {
    return { status: "failed", gate1: "clean", gate2: "green", reason: `checkout ${target} failed` };
  }
  let merged = git(task.repo, ["merge", "--ff-only", branch]);
  if (merged.code !== 0) {
    // target moved during verify → re-rebase once, re-verify, retry ff
    const re = git(worktree, ["rebase", target]);
    if (re.code !== 0) {
      git(worktree, ["rebase", "--abort"]);
      return { status: "needs-revision", gate1: "conflict", gate2: "green", reason: "target moved + conflict" };
    }
    if (verify(task.verify, worktree) !== 0) {
      return { status: "failed", gate1: "clean", gate2: "red", reason: "verify red after re-rebase" };
    }
    git(task.repo, ["checkout", target]);
    merged = git(task.repo, ["merge", "--ff-only", branch]);
    if (merged.code !== 0) {
      return { status: "needs-revision", gate1: "clean", gate2: "green", reason: "still not fast-forward after re-rebase" };
    }
  }

  const sha = git(task.repo, ["rev-parse", "--short", "HEAD"]).out.trim();
  return { status: "landed", gate1: "clean", gate2: "green", commit: sha };
}
