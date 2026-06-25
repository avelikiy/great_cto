// ZRS worker — single persistent worker: poll queue → one agent in an isolated worktree → land-step.
// CLI: `great-cto task add|ls|status|cancel` and `great-cto worker`. See docs/strategy/ZRS-TASK-RUNNER-DESIGN.md.
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, openSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";
import {
  appendTask, readQueue, readState, setState, nextRunnable, recoverCrashed, isTerminal, type Task,
} from "./task-queue.js";
import { land } from "./land.js";

const ROOT = process.env.GREAT_CTO_HOME || join(homedir(), ".great_cto");
const LOGDIR = join(ROOT, "worker-logs");
const LOCK = join(ROOT, "worker.lock");

const flagOf = (rest: string[]) => (name: string, def = ""): string => {
  const i = rest.indexOf("--" + name);
  return i >= 0 ? (rest[i + 1] ?? def) : def;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── CLI: great-cto task <add|ls|status|cancel> ──────────────────────────────
export async function runTask(rest: string[]): Promise<number> {
  const action = rest[0];
  const flag = flagOf(rest);
  if (action === "add") {
    const prompt = rest.slice(1).find((a) => !a.startsWith("--"));
    if (!prompt) {
      console.error('usage: great-cto task add "<prompt>" [--repo .] [--target main] [--model sonnet] [--verify "npm test"] [--timeout 3600]');
      return 1;
    }
    const t = appendTask({
      repo: resolve(flag("repo", process.cwd())),
      target: flag("target", "main"),
      prompt,
      model: flag("model", "sonnet"),
      verify: flag("verify", ""),
      timeout_s: parseInt(flag("timeout", "3600"), 10),
      priority: parseInt(flag("priority", "0"), 10),
    });
    console.log("queued " + t.id);
    return 0;
  }
  if (action === "ls") {
    const st = readState();
    for (const t of readQueue()) {
      const s = st[t.id];
      console.log(`${t.id}  ${(s?.status ?? "queued").padEnd(14)} ${t.prompt.slice(0, 60)}`);
    }
    return 0;
  }
  if (action === "status") {
    const s = readState()[rest[1] ?? ""];
    console.log(s ? JSON.stringify(s, null, 2) : "unknown task");
    return s ? 0 : 1;
  }
  if (action === "cancel") {
    const id = rest[1] ?? "";
    const s = readState()[id];
    if (s && !isTerminal(s.status)) {
      setState(id, { status: "cancelled", ended_at: new Date().toISOString() });
      console.log("cancelled " + id);
      return 0;
    }
    console.log("not cancellable");
    return 1;
  }
  console.error("usage: great-cto task <add|ls|status|cancel>");
  return 1;
}

// ── CLI: great-cto worker ───────────────────────────────────────────────────
export async function runWorker(rest: string[]): Promise<number> {
  const flag = flagOf(rest);
  const poll = parseInt(flag("poll", "10"), 10) * 1000;
  const port = parseInt(flag("status-port", "4319"), 10);
  const once = rest.includes("--once");
  mkdirSync(LOGDIR, { recursive: true });

  if (existsSync(LOCK)) {
    console.error(`worker.lock present — another worker is running (or stale: rm ${LOCK})`);
    return 1;
  }
  writeFileSync(LOCK, String(process.pid));
  const cleanup = () => { try { unlinkSync(LOCK); } catch { /* ignore */ } };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });

  recoverCrashed();
  let current: string | null = null;

  const srv = createServer((req, res) => {
    if (req.url === "/healthz") { res.end("ok"); return; }
    const st = readState();
    const counts: Record<string, number> = {};
    for (const v of Object.values(st)) counts[v.status] = (counts[v.status] ?? 0) + 1;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ host: hostname(), worker_pid: process.pid, current, counts, tasks: st }, null, 2));
  });
  srv.listen(port, "127.0.0.1");
  console.log(`great-cto worker up · status http://127.0.0.1:${port}/status · poll ${poll / 1000}s${once ? " · once" : ""}`);

  for (;;) {
    const t = nextRunnable();
    if (!t) { if (once) break; await sleep(poll); continue; }
    current = t.id;
    const branch = `zrs/${t.id}`;
    const wt = join(t.repo, ".worktrees", t.id);
    setState(t.id, { status: "claimed", branch, worktree: wt, attempts: (readState()[t.id]?.attempts ?? 0) + 1 });

    const wtAdd = spawnSync("git", ["-C", t.repo, "worktree", "add", wt, "-b", branch, t.target], { encoding: "utf8" });
    if (wtAdd.status !== 0) {
      setState(t.id, { status: "failed", reason: "worktree add failed: " + (wtAdd.stderr || "").trim(), ended_at: new Date().toISOString() });
      current = null; if (once) break; continue;
    }
    setState(t.id, { status: "running", started_at: new Date().toISOString() });

    const log = join(LOGDIR, `${t.id}.log`);
    const code = await runAgent(t, wt, log);
    if (code !== 0) {
      setState(t.id, { status: "failed", reason: "agent exit " + code, ended_at: new Date().toISOString(), log });
      cleanupWorktree(t.repo, wt); current = null; if (once) break; continue;
    }

    setState(t.id, { status: "landing", log });
    const result = land(t, branch, wt);
    setState(t.id, { ...result, ended_at: new Date().toISOString(), log });
    cleanupWorktree(t.repo, wt);
    current = null;
    if (once) break;
  }
  srv.close();
  cleanup();
  return 0;
}

function cleanupWorktree(repo: string, wt: string): void {
  spawnSync("git", ["-C", repo, "worktree", "remove", wt, "--force"]);
}

function runAgent(t: Task, wt: string, log: string): Promise<number> {
  return new Promise((res) => {
    const out = openSync(log, "a");
    // GREAT_CTO_AGENT_CMD overrides the spawn (CI / dry-run with a fake agent). PROMPT is exported.
    const override = process.env.GREAT_CTO_AGENT_CMD;
    const child = override
      ? spawn("sh", ["-c", override], { cwd: wt, stdio: ["ignore", out, out], env: { ...process.env, PROMPT: t.prompt } })
      : spawn("claude", ["-p", t.prompt, "--permission-mode", "acceptEdits", "--model", t.model], {
          cwd: wt,
          stdio: ["ignore", out, out],
        });
    const timer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
      setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* ignore */ } }, 5000);
    }, t.timeout_s * 1000);
    child.on("exit", (c) => { clearTimeout(timer); res(c ?? 1); });
    child.on("error", () => { clearTimeout(timer); res(127); });
  });
}
