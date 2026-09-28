#!/usr/bin/env node
// codex-adapter — run great_cto's Claude Code guards on Codex tool calls.
//
// Codex runs plugin hooks (verified on codex-cli 0.153.4, 2026-09-28: SessionStart,
// PreToolUse and PostToolUse fire; a PreToolUse deny — hookSpecificOutput
// permissionDecision "deny" + exit 2 — stops the call) and sends a payload in
// Claude Code's shape. Shell calls arrive as `Bash` with `tool_input.command`, the
// same as Claude Code, so the Bash guards need nothing. File edits do not: Codex
// edits through `apply_patch`, one patch text in `tool_input.command`, where the
// guards expect Edit/Write/MultiEdit with `file_path`, `new_string`, `content`.
//
// This translates a patch into the payloads the guards already understand — one
// per file — and runs each named guard on each. The first deny wins and is passed
// through unchanged. Anything the adapter cannot parse is let through: a guard that
// fails closed on its own bug would stop every edit in every Codex session.
//
// Usage (from .codex-plugin/hooks.json):
//   node codex-adapter.mjs secret-scan frozen-gates-guard gate-weakening-guard

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Parse Codex's apply_patch text into per-file operations.
 *   *** Add File: p      — every following `+` line is content
 *   *** Delete File: p
 *   *** Update File: p   — `@@` hunks of ` `/`-`/`+` lines; optional `*** Move to: q`
 * @returns {{op:'add'|'delete'|'update', path:string, moveTo?:string, content?:string, hunks?:{old:string,new:string}[]}[]}
 */
export function parsePatch(text) {
  const out = [];
  let cur = null;
  let hunk = null;
  const flushHunk = () => {
    if (cur?.op === 'update' && hunk && (hunk.old.length || hunk.new.length)) {
      cur.hunks.push({ old: hunk.old.join('\n'), new: hunk.new.join('\n') });
    }
    hunk = null;
  };
  const flush = () => { flushHunk(); if (cur) { if (cur.op === 'add') cur.content = cur.lines.join('\n'); delete cur.lines; out.push(cur); } cur = null; };
  for (const line of String(text ?? '').split('\n')) {
    let m;
    if ((m = /^\*\*\* (Add|Delete|Update) File: (.+)$/.exec(line))) {
      flush();
      const op = m[1].toLowerCase();
      cur = { op, path: m[2].trim(), lines: [], hunks: [] };
      continue;
    }
    if (!cur) continue;
    if ((m = /^\*\*\* Move to: (.+)$/.exec(line))) { cur.moveTo = m[1].trim(); continue; }
    if (/^\*\*\* (End Patch|Begin Patch|End of File)/.test(line)) continue;
    if (cur.op === 'add') { if (line.startsWith('+')) cur.lines.push(line.slice(1)); continue; }
    if (cur.op !== 'update') continue;
    if (line.startsWith('@@')) { flushHunk(); hunk = { old: [], new: [] }; continue; }
    hunk ??= { old: [], new: [] };
    if (line.startsWith('-')) hunk.old.push(line.slice(1));
    else if (line.startsWith('+')) hunk.new.push(line.slice(1));
    else if (line.startsWith(' ')) { hunk.old.push(line.slice(1)); hunk.new.push(line.slice(1)); }
  }
  flush();
  return out;
}

/** The Claude Code payloads one patch amounts to — the shapes the guards read. */
export function payloadsForPatch(payload) {
  const cwd = payload?.cwd || process.cwd();
  const abs = (p) => (isAbsolute(p) ? p : resolve(cwd, p));
  const base = { ...payload };
  delete base.tool_input;
  const out = [];
  for (const f of parsePatch(payload?.tool_input?.command ?? payload?.tool_input?.patch ?? '')) {
    if (f.op === 'add') out.push({ ...base, tool_name: 'Write', tool_input: { file_path: abs(f.path), content: f.content } });
    else if (f.op === 'delete') out.push({ ...base, tool_name: 'Edit', tool_input: { file_path: abs(f.path), old_string: '', new_string: '' } });
    else {
      const edits = f.hunks.map((h) => ({ old_string: h.old, new_string: h.new }));
      out.push({ ...base, tool_name: 'MultiEdit', tool_input: { file_path: abs(f.path), edits } });
      // A move writes the new path too: guard it as that file's content.
      if (f.moveTo) out.push({ ...base, tool_name: 'MultiEdit', tool_input: { file_path: abs(f.moveTo), edits } });
    }
  }
  return out;
}

function runGuard(name, payload) {
  const file = join(HERE, `${name}.mjs`);
  const r = spawnSync(process.execPath, [file], { input: JSON.stringify(payload), encoding: 'utf8', timeout: 10_000 });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function main() {
  const guards = process.argv.slice(2).filter((g) => /^[a-z0-9-]+$/.test(g));
  let payload;
  try { payload = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
  const tool = payload?.tool_name;
  const payloads = tool === 'apply_patch' ? payloadsForPatch(payload) : [payload];
  for (const p of payloads) {
    for (const g of guards) {
      const r = runGuard(g, p);
      if (r.code === 2) {
        process.stdout.write(r.stdout);
        process.stderr.write(r.stderr);
        process.exit(2);
      }
    }
  }
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
