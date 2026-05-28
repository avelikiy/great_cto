#!/usr/bin/env node
/**
 * orchestrator-check.mjs
 *
 * Runs at SubagentStart. Reads shared/orchestrator.toml and emits the active
 * rules in a concise block so every spawned agent starts with the same
 * machine-readable contract visible in its context.
 *
 * Also detects inline subagent anti-pattern (`claude -p "..."`) in Bash
 * commands passed via stdin (PreToolUse / Bash matcher).
 *
 * Zero external deps — Node.js 20+ built-ins only.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { cwd } from 'node:process';

// ─── Locate orchestrator.toml ────────────────────────────────────────────────
// Walk up from cwd() to find shared/orchestrator.toml (handles worktrees).
function findToml() {
  let dir = cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'shared', 'orchestrator.toml');
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ─── Minimal TOML parser (booleans + strings + integers only) ────────────────
function parseToml(text) {
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

// ─── Inline subagent detection (stdin JSON from PreToolUse/Bash) ──────────────
function checkInlineSubagent() {
  let input = '';
  try {
    // Non-blocking: only read if stdin has data (TTY check)
    if (process.stdin.isTTY) return false;
    // In hook context stdin is a pipe — read synchronously via fd 0
    const buf = readFileSync('/dev/stdin', { encoding: 'utf8' });
    input = buf;
  } catch {
    return false;
  }
  let cmd = '';
  try {
    const parsed = JSON.parse(input);
    cmd = parsed?.command ?? '';
  } catch {
    cmd = input;
  }
  // Detect: `claude -p`, `claude --print`, `claude -c -p`
  return /\bclaude\b.*\s(-p\b|--print\b)/.test(cmd);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const tomlPath = findToml();

if (!tomlPath) {
  // No toml = no contract enforced (e.g. non-great_cto project). Silent exit.
  process.exit(0);
}

let cfg;
try {
  cfg = parseToml(readFileSync(tomlPath, 'utf8'));
} catch {
  process.exit(0);
}

// Inline subagent anti-pattern check (PreToolUse / Bash context)
if (checkInlineSubagent()) {
  const allowed = cfg?.parallelism?.inline_subagents_allowed ?? true;
  if (!allowed) {
    console.error(
      'ORCHESTRATOR-BLOCK: inline subagent dispatch (claude -p) is forbidden by shared/orchestrator.toml.\n' +
      'Use the Agent tool with subagent_type specified instead.'
    );
    process.exit(2); // exit 2 → Claude Code blocks the tool call
  }
}

// SubagentStart context injection — print active rules
const p = cfg.parallelism ?? {};
const a = cfg.authorization ?? {};
const c = cfg.completion ?? {};
const o = cfg.ownership ?? {};

console.log('=== ORCHESTRATOR CONTRACT (shared/orchestrator.toml) ===');
console.log(`Decomposition matrix required : ${p.decomposition_matrix_required ?? '—'}`);
console.log(`Inline subagents allowed      : ${p.inline_subagents_allowed ?? '—'}`);
console.log(`Max parallel streams          : ${p.max_parallel_streams ?? '—'}`);
console.log(`Authorization phrase required : ${a.spawn_phrase_required ?? '—'}`);
if (a.spawn_phrase_required) {
  console.log(`Authorization phrase          : "${a.spawn_phrase ?? ''}"`);
}
console.log(`3-state completion required   : ${c.three_state_completion ?? '—'}`);
console.log(`Acceptance evidence required  : ${c.acceptance_evidence_required ?? '—'}`);
console.log(`Strict file ownership         : ${o.strict_file_ownership ?? '—'}`);
console.log(`Overlap check required        : ${o.overlap_check_required ?? '—'}`);
console.log('=== END ORCHESTRATOR CONTRACT ===');
