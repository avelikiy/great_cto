#!/usr/bin/env node
/**
 * PostToolUse hook — captures tool failures to .great_cto/tool-failures.log
 *
 * Fires after every tool use via the "*" matcher.
 * Silent on success — only logs when the tool result indicates an error.
 *
 * Log format (one JSON line per failure):
 *   {"ts":"...","tool":"Bash","input":"...","error":"...","session":"..."}
 *
 * Used by continuous-learner to detect recurring failure patterns
 * and crystallize them into procedural memory in brain.md.
 *
 * Zero external deps — Node.js 20+ built-ins only.
 * Never throws — hook must never block the agent.
 */

import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { appendEvent } from '../lib/agent-events.mjs';

const LOG = '.great_cto/tool-failures.log';

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

function isFailure(payload) {
  // Claude Code PostToolUse payload shapes (varies by tool type):
  // { tool_name, tool_input, tool_response, is_error }   — standard
  // { tool_name, tool_input, output, error }              — some tools
  // { tool_name, tool_input, result: { error: ... } }    — nested

  if (payload.is_error === true) return true;
  if (payload.error) return true;
  if (payload.result?.error) return true;

  // Bash-specific: check if output contains common failure signals
  const output = String(payload.tool_response || payload.output || payload.result || '');
  if (output.includes('PermissionDenied') || output.includes('permission denied')) return true;
  if (output.includes('BLOCKED:') && !output.includes('BLOCKED: 0')) return true;
  if (/Exit code [1-9]/.test(output)) return true;

  return false;
}

function extractError(payload) {
  if (typeof payload.error === 'string') return payload.error.slice(0, 300);
  if (typeof payload.result?.error === 'string') return payload.result.error.slice(0, 300);
  const out = String(payload.tool_response || payload.output || payload.result || '');
  return out.slice(0, 300);
}

function extractInput(payload) {
  const inp = payload.tool_input || {};
  // Bash: show command. Others: show first 120 chars of serialised input.
  if (inp.command) return String(inp.command).slice(0, 200);
  return JSON.stringify(inp).slice(0, 200);
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) return;

  let payload;
  try { payload = JSON.parse(raw); } catch { return; }

  // ADR-021: every tool call is an agent event — the tool, the paths it touched,
  // whether it failed. Facts only; the command and the content stay out. Recorded
  // before the early return below, which exists for the failure log.
  const inp = payload.tool_input || {};
  appendEvent(process.env.GREAT_CTO_DIR || '.great_cto', {
    kind: 'tool',
    tool: String(payload.tool_name || payload.tool || ''),
    session: payload.session_id,
    paths: [inp.file_path, inp.path, inp.notebook_path].filter((x) => typeof x === 'string'),
    ok: !isFailure(payload),
  });

  if (!isFailure(payload)) return; // success — nothing to log

  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    tool: String(payload.tool_name || payload.tool || 'unknown'),
    input: extractInput(payload),
    error: extractError(payload),
  });

  try {
    mkdirSync('.great_cto', { recursive: true });
    appendFileSync(LOG, entry + '\n');
  } catch { /* never block */ }
}

main();
