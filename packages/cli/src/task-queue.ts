// ZRS bounded task-runner — queue + worker-owned state (see docs/strategy/ZRS-TASK-RUNNER-DESIGN.md).
// Producer appends to task-queue.jsonl; the single worker owns task-state.json (atomic rewrite).
// State lives under ~/.great_cto/ (override with GREAT_CTO_HOME) so a VPS worker is self-contained.
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, renameSync } from "node:fs";

export type Status =
  | "queued" | "claimed" | "running" | "landing"
  | "landed" | "failed" | "needs-revision" | "cancelled";

export interface Task {
  id: string;
  created_at: string;
  repo: string;
  target: string;
  prompt: string;
  model: string;
  verify: string;       // Gate-2 command ("" = skip)
  timeout_s: number;
  priority: number;
}

export interface TaskState {
  status: Status;
  branch?: string;
  worktree?: string;
  attempts: number;
  started_at?: string;
  ended_at?: string;
  gate1?: string;       // clean | conflict
  gate2?: string;       // green | red
  commit?: string;
  reason?: string;
  log?: string;
}

const ROOT = process.env.GREAT_CTO_HOME || join(homedir(), ".great_cto");
export const QUEUE = join(ROOT, "task-queue.jsonl");
export const STATE = join(ROOT, "task-state.json");

const TERMINAL = new Set<Status>(["landed", "failed", "needs-revision", "cancelled"]);
export function isTerminal(s: Status): boolean { return TERMINAL.has(s); }

function ensureDir(): void { mkdirSync(ROOT, { recursive: true }); }

export function newId(now = Date.now()): string {
  return `t_${Math.floor(now / 1000)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function appendTask(
  t: Pick<Task, "repo" | "prompt"> & Partial<Task>,
): Task {
  ensureDir();
  const task: Task = {
    id: t.id ?? newId(),
    created_at: t.created_at ?? new Date().toISOString(),
    repo: t.repo,
    target: t.target || "main",
    prompt: t.prompt,
    model: t.model || "sonnet",
    verify: t.verify ?? "",
    timeout_s: t.timeout_s || 3600,
    priority: t.priority || 0,
  };
  appendFileSync(QUEUE, JSON.stringify(task) + "\n");
  return task;
}

export function readQueue(): Task[] {
  if (!existsSync(QUEUE)) return [];
  return readFileSync(QUEUE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Task);
}

export function readState(): Record<string, TaskState> {
  if (!existsSync(STATE)) return {};
  try { return JSON.parse(readFileSync(STATE, "utf8")) as Record<string, TaskState>; }
  catch { return {}; }
}

export function writeState(s: Record<string, TaskState>): void {
  ensureDir();
  const tmp = STATE + ".tmp";
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, STATE); // atomic on the same fs
}

export function setState(id: string, patch: Partial<TaskState>): TaskState {
  const s = readState();
  const prev: TaskState = s[id] ?? { status: "queued", attempts: 0 };
  s[id] = { ...prev, ...patch };
  writeState(s);
  return s[id]!;
}

/** Highest-priority queued task with no (or queued) state. One worker → no claim race beyond this. */
export function nextRunnable(): Task | null {
  const st = readState();
  const cand = readQueue().filter((t) => {
    const s = st[t.id];
    return !s || s.status === "queued";
  });
  cand.sort((a, b) => (b.priority - a.priority) || a.created_at.localeCompare(b.created_at));
  return cand[0] ?? null;
}

/** On worker boot, any non-terminal task is a crash remnant → fail it so a restart never double-runs. */
export function recoverCrashed(): number {
  const s = readState();
  let n = 0;
  for (const id of Object.keys(s)) {
    if (!isTerminal(s[id]!.status)) {
      s[id] = { ...s[id]!, status: "failed", reason: "interrupted", ended_at: new Date().toISOString() };
      n++;
    }
  }
  if (n) writeState(s);
  return n;
}
