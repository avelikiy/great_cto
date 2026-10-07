/**
 * The orchestrator contract's one PreToolUse rule: no inline subagents
 * (`claude -p …` from a Bash call) when shared/orchestrator.toml forbids them.
 *
 * It lived inside orchestrator-check.mjs, which ran the whole SubagentStart
 * routine on every Bash call — read the contract, print it, and record an
 * `agent-start` whenever the payload named an agent, which inside a subagent it
 * always does: one project logged 1109 agent starts against 140 stops. And it
 * read the command from `payload.command`, where Claude Code never puts it — the
 * rule could not fire on a real call. Here it reads `tool_input.command`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { contractPath } from './contract-path.mjs';
import { PASS } from './guard-result.mjs';

export function findToml() {
  const p = contractPath('orchestrator.toml');
  return existsSync(p) ? p : null;
}

/** Minimal TOML: booleans, strings, integers. */
export function parseToml(text) {
  const result = {};
  let section = '_root';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) { section = sectionMatch[1]; result[section] = result[section] || {}; continue; }
    const kvMatch = line.match(/^([^=]+)=(.+)$/);
    if (!kvMatch) continue;
    const key = kvMatch[1].trim();
    const rawVal = kvMatch[2].trim().replace(/#.*$/, '').trim();
    let val;
    if (rawVal === 'true') val = true;
    else if (rawVal === 'false') val = false;
    else if (/^\d+$/.test(rawVal)) val = parseInt(rawVal, 10);
    else val = rawVal.replace(/^["']|["']$/g, '');
    if (section === '_root') result[key] = val;
    else result[section][key] = val;
  }
  return result;
}

/** The Bash command a PreToolUse payload carries — or the raw text, for a hand-run check. */
export function commandOf(raw) {
  try {
    const p = JSON.parse(raw || '{}');
    if (p && typeof p === 'object') return String(p.tool_input?.command ?? p.command ?? '');
  } catch { /* not JSON: the text is the command */ }
  return String(raw || '');
}

/**
 * `claude -p`, `claude --print`, `claude -c -p` — the CLI invoked as a command.
 *
 * The old test was "the word claude, then ` -p` anywhere", and it could not fire
 * (it read the wrong field). Turned on as it was, it would have refused
 * `ls ~/.claude && mkdir -p x` and every `grep -p` near a `.claude` path. So the
 * command is split into simple commands and each is judged by its own program:
 * `claude` (or a path ending in /claude), after env assignments and wrappers.
 */
const WRAPPERS = new Set(['sudo', 'exec', 'env', 'nohup', 'time', 'npx', 'command', 'xargs']);
export function isInlineSubagent(cmd) {
  for (const part of String(cmd || '').split(/&&|\|\||[;|&\n(){}]/)) {
    const words = part.trim().split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || WRAPPERS.has(words[i]))) i++;
    const prog = (words[i] || '').replace(/^["']|["']$/g, '');
    if (prog !== 'claude' && !prog.endsWith('/claude')) continue;
    const args = words.slice(i + 1);
    if (args.some((a) => a === '-p' || a === '--print' || /^-[a-z]*p[a-z]*$/.test(a))) return true;
  }
  return false;
}

export function run(raw, env = process.env, { toml = findToml() } = {}) {
  if (!isInlineSubagent(commandOf(raw))) return PASS;
  if (!toml) return PASS;
  let cfg;
  try { cfg = parseToml(readFileSync(toml, 'utf8')); } catch { return PASS; }
  if ((cfg?.parallelism?.inline_subagents_allowed ?? true) !== false) return PASS;
  return {
    code: 2,
    stdout: '',
    stderr: 'ORCHESTRATOR-BLOCK: inline subagent dispatch (claude -p) is forbidden by shared/orchestrator.toml.\n'
      + 'Use the Agent tool with subagent_type specified instead.\n',
  };
}
