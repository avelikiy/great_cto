/** Daily entry points. Adapters reuse host-owned state, checks and permissions. */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { codexControllerCandidates } from './codex-host.js';

type Action = 'run' | 'status' | 'resume';
type Host = 'claude-code' | 'codex';
interface Options {
  host: Host; dir: string; prompt: string; id?: string; allow?: string;
  dryRun: boolean; json: boolean; help: boolean;
}
interface RunSummary { id: string; status: string; reason?: string; pending?: { gates?: string[] }; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const terminal = new Set(['done', 'cancelled']);

export const dailyUsage = `great-cto run "describe the task" [--host claude-code|codex] [--dir PATH]
great-cto status [RUN_UUID] [--host codex] [--dir PATH] [--json]
great-cto resume [RUN_UUID] [--host codex] [--dir PATH]

Default host: Claude Code (interactive /start, /inbox, /resume).
Codex runs require --allow PATHS (comma-separated write scope).
Codex resume selects the only unfinished run in this project; gates stay pending.
Use --dry-run to preview a launch without starting an agent.
Advanced controller options remain available through great-cto codex-host.
`;

function parse(action: Action, args: string[], cwd: string): Options {
  const out: Options = { host: 'claude-code', dir: cwd, prompt: '', dryRun: false, json: false, help: false };
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
    if (['--host', '--dir', '--allow'].includes(key)) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : args[++i];
      if (!value || value.startsWith('--')) throw Error(`${key} requires a value`);
      if (key === '--host') {
        if (value !== 'codex' && value !== 'claude-code') throw Error('host must be claude-code or codex');
        out.host = value;
      } else if (key === '--dir') out.dir = resolve(cwd, value);
      else out.allow = value;
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
  if (out.json && (action !== 'status' || out.host !== 'codex')) throw Error('--json is only supported for status --host codex');
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
  fail = (text: string) => { process.stderr.write(`great-cto: ${text}\n`); },
} = {}): number {
  try {
    const options = parse(action, args, cwd);
    if (options.help) { write(dailyUsage); return 0; }
    if (!exists(options.dir)) throw Error(`project directory does not exist: ${options.dir}`);
    if (options.host === 'claude-code') {
      const prompt = action === 'run' ? `/start ${options.prompt}` : action === 'status' ? '/inbox' : '/resume';
      if (options.dryRun) { write(JSON.stringify({ host: options.host, cwd: options.dir, command: 'claude', args: [prompt] }) + '\n'); return 0; }
      const result = spawn('claude', [prompt], { cwd: options.dir, stdio: 'inherit' });
      if (result.error) throw Error(`could not launch Claude Code: ${result.error.message}; install/login and load great_cto first`);
      return result.status ?? 2;
    }
    const controller = codexControllerCandidates().find(exists);
    if (!controller) throw Error('controlled runtime missing; reinstall great-cto');
    // Preview is pure: no controller invocation, state-store creation or model calls.
    if (options.dryRun) {
      write(JSON.stringify({ host: options.host, action, dir: options.dir, id: options.id ?? 'project-scoped selection',
        ...(action === 'run' ? { prompt: options.prompt, allow: options.allow } : {}) }) + '\n');
      return 0;
    }
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
      const shown = options.id ? [selectRun(runs, options.id)] : runs;
      if (options.json) write(JSON.stringify({ state: data.state, runs: shown }, null, 2) + '\n');
      else {
        write(shown.length ? shown.map(r => `${r.id}  ${r.status}${r.pending?.gates?.length ? `  Decision needed: ${r.pending.gates.join(', ')}` : ''}${r.reason ? `  ${r.reason}` : ''}`).join('\n') + '\n' : 'No controlled runs in this project.\n');
      }
      return 0;
    }
    let forwarded: string[];
    if (action === 'resume') {
      const selected = selectRun(runs, options.id);
      if (terminal.has(selected.status)) throw Error(`run is ${selected.status}; start a new task instead`);
      forwarded = ['resume', selected.id];
    } else {
      if (runs.some(r => !terminal.has(r.status))) throw Error('unfinished task exists; use great-cto resume --host codex or choose a run from status');
      // Existing projects enter architecture; new projects enter product discovery.
      const entry = exists(join(options.dir, '.great_cto', 'PROJECT.md')) ? 'architect' : 'product-owner';
      forwarded = ['start', '--dir', options.dir, '--prompt', options.prompt, '--allow', options.allow!, '--entry', entry];
    }
    const result = spawn(process.execPath, [controller, ...forwarded], { stdio: 'inherit' });
    if (result.error) throw Error(`could not launch controlled runtime: ${result.error.message}`);
    return result.status ?? 2;
  } catch (error) {
    fail((error as Error).message);
    return 2;
  }
}
