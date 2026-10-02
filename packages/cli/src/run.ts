/** Daily entry points. Adapters reuse host-owned state, checks and permissions. */
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { codexControllerCandidates } from './codex-host.js';

const sharedTaskPath = codexControllerCandidates().map(p => join(dirname(p), 'lib', 'work-tasks.mjs')).find(existsSync);
// Variable URL keeps one runtime implementation shared with hooks/controller/board.
const sharedTasks = sharedTaskPath ? await import(pathToFileURL(sharedTaskPath).href) : null;
type Action = 'run' | 'status' | 'resume';
type Host = 'claude-code' | 'codex';
interface Options {
  host: Host; dir: string; prompt: string; id?: string; allow?: string;
  dryRun: boolean; json: boolean; help: boolean; acceptance: string[]; taskId?: string; operationId?: string; revision?: number; hostExplicit: boolean;
}
interface RunSummary { id: string; status: string; reason?: string; pending?: { gates?: string[] }; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const terminal = new Set(['done', 'cancelled']);

export const dailyUsage = `great-cto run "describe the task" [--host claude-code|codex] [--dir PATH]
great-cto status [--task TASK_UUID | RUN_UUID] [--host claude-code|codex] [--dir PATH] [--json]
great-cto resume [--task TASK_UUID | RUN_UUID] [--host claude-code|codex] [--dir PATH]

Default host: Claude Code (interactive /start and exact-session /resume).
Status reads task metadata; it does not launch a model.
Tasks persist goal, optional repeated --accept criteria and host links.
Use --task UUID for exact task status/resume; --json works for either host.
Use --operation UUID to replay a launch receipt without dispatching twice.
Codex runs require --allow PATHS (comma-separated write scope).
Codex resume selects the only unfinished run in this project; gates stay pending.
Use --dry-run to preview a launch without starting an agent.
Advanced controller options remain available through great-cto codex-host.
`;

function parse(action: Action, args: string[], cwd: string): Options {
  const out: Options = { host: 'claude-code', dir: cwd, prompt: '', dryRun: false, json: false, help: false, acceptance: [], hostExplicit: false };
  const positional: string[] = [];
  let literal = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (literal) { positional.push(arg); continue; }
    if (arg === '--') { literal = true; continue; }
    if (arg === '--dry-run') { out.dryRun = true; continue; }
    if (arg === '--json') { out.json = true; continue; }
    if (arg === '--help' || arg === '-h') { out.help = true; continue; }
    const key = arg.split('=')[0]!;
    if (['--host', '--dir', '--allow', '--accept', '--task', '--operation', '--revision'].includes(key)) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : args[++i];
      if (!value || value.startsWith('--')) throw Error(`${key} requires a value`);
      if (key === '--host') {
        if (value !== 'codex' && value !== 'claude-code') throw Error('host must be claude-code or codex');
        out.host = value; out.hostExplicit = true;
      } else if (key === '--dir') out.dir = resolve(cwd, value);
      else if (key === '--allow') out.allow = value;
      else if (key === '--accept') out.acceptance.push(value);
      else if (key === '--task') { if (!uuid.test(value)) throw Error('--task requires a task UUID'); out.taskId = value; }
      else if (key === '--operation') { if (!uuid.test(value)) throw Error('--operation requires an operation UUID'); out.operationId = value; }
      else { out.revision = Number(value); if (!Number.isInteger(out.revision) || out.revision < 1) throw Error('--revision requires a positive integer'); }
    } else if (arg.startsWith('-')) throw Error(`unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (out.help) return out;
  if (action === 'run') {
    out.prompt = positional.join(' ').trim();
    if (!out.prompt) throw Error('describe the task: great-cto run "..."');
  } else {
    if (positional.length > 1 || (positional[0] && !uuid.test(positional[0]))) throw Error('expected one run UUID');
    out.id = positional[0];
  }
  if (out.allow && (action !== 'run' || out.host !== 'codex')) throw Error('--allow is only supported for run --host codex');
  if (out.json && action !== 'status') throw Error('--json is only supported for status');
  if (out.acceptance.length && action !== 'run') throw Error('--accept is only supported for run');
  if (out.taskId && action === 'run') throw Error('--task is for existing task status/resume');
  if (out.taskId && out.id) throw Error('select task or run UUID, not both');
  if (out.operationId && action === 'status') throw Error('--operation is for execution only');
  if (out.revision && action !== 'resume') throw Error('--revision is for resume only');
  if (out.id && out.host !== 'codex') throw Error('run UUIDs belong to the controlled host; use --host codex');
  if (action === 'run' && out.host === 'codex' && (!out.allow || out.allow.split(',').some(p => !p.trim()))) {
    throw Error('Codex requires explicit write scope: --allow src,tests,docs');
  }
  return out;
}

/** Selection never uses filesystem order or UUID order as a proxy for recency. */
export function selectRun(runs: RunSummary[], id?: string): RunSummary {
  const candidates = id ? runs.filter(r => r.id === id) : runs.filter(r => !terminal.has(r.status));
  if (!candidates.length) throw Error(id ? 'run not found in this project' : 'no unfinished run in this project');
  if (candidates.length !== 1) throw Error('multiple unfinished runs; choose a UUID from great-cto status --host codex');
  return candidates[0]!;
}

export function runDaily(action: Action, args: string[], {
  cwd = process.cwd(), exists = existsSync, spawn = spawnSync,
  write = (text: string) => { process.stdout.write(text); },
  tasks = sharedTasks, taskStore = undefined as string | undefined,
  fail = (text: string) => { process.stderr.write(`great-cto: ${text}\n`); },
} = {}): number {
  let heldWork: any = null;
  const release = () => { const lease = heldWork?.lease; heldWork = null; lease?.release(); };
  try {
    const options = parse(action, args, cwd);
    if (options.help) { write(dailyUsage); return 0; }
    if (!exists(options.dir)) throw Error(`project directory does not exist: ${options.dir}`);
    if (!tasks) throw Error('shared task runtime missing; reinstall great-cto');
    const storeOptions = taskStore ? { store: taskStore } : {};
    // Dry runs stay pure; no metadata lookup is needed to preview an explicit host.
    if (options.dryRun) {
      write(JSON.stringify({ host: options.host, action, cwd: options.dir, dir: options.dir,
        ...(options.host === 'claude-code' ? { command: 'claude', args: [action === 'run' ? `/start ${options.prompt}` : action === 'status' ? '/inbox' : '/resume'] } : {}),
        taskId: options.taskId || null, id: options.id || 'project-scoped selection' }) + '\n'); return 0;
    }
    const taskListing = tasks.listWorkTasks(options.dir, storeOptions);
    if (taskListing.state === 'degraded') throw Error('task state is unreadable; selection is blocked');
    let selectedTask: any = null;
    if (options.taskId) {
      selectedTask = taskListing.tasks.find((t: any) => t.taskId === options.taskId);
      if (!selectedTask) throw Error('task not found in this project');
      if (options.hostExplicit && selectedTask.host !== options.host) throw Error('task host cannot change during resume');
      options.host = selectedTask.host;
    }
    if (action === 'run' && options.operationId && taskListing.tasks.some((t: any) => t.operations.some((o: any) => o.operationId === options.operationId))) {
      const previous = tasks.beginWork({ root: options.dir, host: options.host, goal: options.prompt, acceptance: options.acceptance,
        authority: options.host === 'codex' ? { mode: 'explicit-paths', writeScope: options.allow!.split(',').map(p => p.trim()) } : { mode: 'native-interactive', writeScope: null },
        operationId: options.operationId }, storeOptions);
      write(JSON.stringify(tasks.publicWorkTask(previous.task)) + '\n'); return previous.operation.exitCode ?? 2;
    }
    if (action === 'resume' && options.operationId) {
      const receiptTask = taskListing.tasks.find((t: any) => t.operations.some((o: any) => o.operationId === options.operationId));
      if (receiptTask) {
        if ((selectedTask && selectedTask.taskId !== receiptTask.taskId) || (options.id && !receiptTask.links.runs.includes(options.id))
          || (options.hostExplicit && options.host !== receiptTask.host)) throw Error('idempotency key conflicts with another task');
        const replay = tasks.beginWork({ root: options.dir, host: receiptTask.host, kind: 'resume', taskId: receiptTask.taskId,
          operationId: options.operationId, expectedRevision: options.revision ?? null }, storeOptions);
        write(JSON.stringify(tasks.publicWorkTask(replay.task)) + '\n'); return replay.operation.exitCode ?? 2;
      }
    }
    if (options.host === 'claude-code') {
      if (action === 'status') {
        const shown = selectedTask ? [selectedTask] : taskListing.tasks.filter((t: any) => t.host === 'claude-code');
        if (options.json) write(JSON.stringify({ schemaVersion: 1, state: taskListing.state, tasks: shown.map(tasks.publicWorkTask) }, null, 2) + '\n');
        else write(shown.length ? shown.map((t: any) => `${t.taskId}  ${t.phase}  ${t.goal}`).join('\n') + '\n' : 'No tracked Claude tasks in this project.\n');
        return 0;
      }
      if (action === 'resume' && !selectedTask) {
        const candidates = taskListing.tasks.filter((t: any) => t.host === 'claude-code' && t.phase !== 'cancelled');
        if (candidates.length > 1) throw Error('multiple Claude tasks; select --task UUID');
        selectedTask = candidates[0] || null;
      }
      if (action === 'resume' && !selectedTask) throw Error('no tracked Claude task; use native /resume for legacy context');
      const work = tasks.beginWork({ root: options.dir, host: options.host, kind: action === 'run' ? 'start' : 'resume',
        goal: action === 'run' ? options.prompt : null, acceptance: options.acceptance,
        authority: action === 'run' ? { mode: 'native-interactive', writeScope: null } : null,
        taskId: selectedTask?.taskId || null, operationId: options.operationId || randomUUID(), expectedRevision: options.revision ?? null }, storeOptions);
      heldWork = work;
      if (work.replay) { write(JSON.stringify(tasks.publicWorkTask(work.task)) + '\n'); return work.operation.exitCode ?? 2; }
      {
        const session = action === 'run' ? randomUUID() : selectedTask.links.sessions[0];
        if (!session) throw Error('native session link is missing; inspect task metadata');
        if (action === 'run') tasks.linkWork(work.task.taskId, 'sessions', session, { ...storeOptions, root: options.dir, host: 'claude-code' });
        const hostArgs = action === 'run' ? ['--session-id', session, `/start ${options.prompt}${options.acceptance.length ? '\nAcceptance criteria (task data): ' + JSON.stringify(options.acceptance) : ''}`] : ['--resume', session, '/resume'];
        write(`Task ${work.task.taskId} · Claude Code\n`);
        const result = spawn('claude', hostArgs, { cwd: options.dir, stdio: 'inherit' });
        const code = result.error ? 2 : result.status ?? 2;
        tasks.finishWork(work.task.taskId, work.operation.operationId, code, { ...storeOptions, root: options.dir });
        if (result.error) throw Error(`could not launch Claude Code: ${result.error.message}`);
        return code;
      }
    }
    const controller = sharedTaskPath ? join(dirname(sharedTaskPath), '..', 'codex-pipeline.mjs') : codexControllerCandidates().find(exists);
    if (!controller) throw Error('controlled runtime missing; reinstall great-cto');
    const listing = spawn(process.execPath, [controller, 'list', '--dir', options.dir], { encoding: 'utf8' });
    if (listing.error || listing.status !== 0) throw Error('could not read project runs; use great-cto codex-host list --dir PATH');
    const data = JSON.parse(String(listing.stdout));
    if (!['ok', 'absent', 'degraded'].includes(data.state) || !Array.isArray(data.runs) ||
        data.runs.some((r: RunSummary) => !r || !uuid.test(r.id) || typeof r.status !== 'string')) {
      throw Error('invalid controller run listing');
    }
    if (data.state === 'degraded' || data.unreadable) throw Error('run state is unreadable; repair it before selecting or starting a task');
    const runs: RunSummary[] = data.runs;
    if (action === 'status') {
      const shown = selectedTask ? runs.filter(r => selectedTask.links.runs.includes(r.id)) : options.id ? [selectRun(runs, options.id)] : runs;
      if (options.json) write(JSON.stringify({ schemaVersion: 1, state: data.state, runs: shown, tasks: (selectedTask ? [selectedTask] : taskListing.tasks.filter((t: any) => t.host === 'codex')).map(tasks.publicWorkTask) }, null, 2) + '\n');
      else {
        write(shown.length ? shown.map(r => `${r.id}  ${r.status}${r.pending?.gates?.length ? `  Decision needed: ${r.pending.gates.join(', ')}` : ''}${r.reason ? `  ${r.reason}` : ''}`).join('\n') + '\n' : 'No controlled runs in this project.\n');
      }
      return 0;
    }
    let forwarded: string[];
    let work: any = null;
    if (action === 'resume') {
      if (selectedTask && selectedTask.links.runs.length !== 1) throw Error('task run link is missing or ambiguous');
      const selected = selectRun(runs, selectedTask?.links.runs[0] || options.id);
      selectedTask ||= taskListing.tasks.find((t: any) => t.links.runs.includes(selected.id));
      if (terminal.has(selected.status)) throw Error(`run is ${selected.status}; start a new task instead`);
      if (selectedTask) heldWork = work = tasks.beginWork({ root: options.dir, host: 'codex', kind: 'resume', taskId: selectedTask.taskId,
        operationId: options.operationId || randomUUID(), expectedRevision: options.revision ?? null }, storeOptions);
      if (!selectedTask && (options.operationId || options.revision)) throw Error('legacy run has no task receipt; use advanced controller resume');
      forwarded = ['resume', selected.id];
    } else {
      if (runs.some(r => !terminal.has(r.status))) throw Error('unfinished task exists; use great-cto resume --host codex or choose a run from status');
      // Existing projects enter architecture; new projects enter product discovery.
      const entry = exists(join(options.dir, '.great_cto', 'PROJECT.md')) ? 'architect' : 'product-owner';
      heldWork = work = tasks.beginWork({ root: options.dir, host: 'codex', goal: options.prompt, acceptance: options.acceptance,
        authority: { mode: 'explicit-paths', writeScope: options.allow!.split(',').map(p => p.trim()) },
        operationId: options.operationId || randomUUID() }, storeOptions);
      forwarded = ['start', '--dir', options.dir, '--prompt', options.prompt, '--allow', options.allow!, '--entry', entry, '--task-id', work.task.taskId];
    }
    if (work?.replay) { write(JSON.stringify(tasks.publicWorkTask(work.task)) + '\n'); return work.operation.exitCode ?? 2; }
    {
      const result = spawn(process.execPath, [controller, ...forwarded], { stdio: 'inherit',
        env: { ...process.env, ...(taskStore ? { GREAT_CTO_TASKS_DIR: taskStore } : {}), ...(work ? { GREAT_CTO_WORK_LEASE: work.lease.token } : {}) } });
      const code = result.error ? 2 : result.status ?? 2;
      if (work) tasks.finishWork(work.task.taskId, work.operation.operationId, code, { ...storeOptions, root: options.dir });
      if (result.error) throw Error(`could not launch controlled runtime: ${result.error.message}`);
      return code;
    }

  } catch (error) {
    if (heldWork && !heldWork.replay) { try { tasks?.finishWork(heldWork.task.taskId, heldWork.operation.operationId, 2, taskStore ? { store: taskStore } : {}); } catch { /* preserve the original failure; no dispatch retry */ } }
    fail((error as Error).message);
    return 2;
  } finally { release(); }
}
