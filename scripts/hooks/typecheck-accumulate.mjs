#!/usr/bin/env node
/**
 * typecheck-accumulate — PostToolUse (Edit | Write | MultiEdit) half of the
 * Stop-time typecheck.
 *
 * A typecheck per edit is too slow and too noisy: mid-change a file is
 * legitimately broken between the first edit and the third. So this hook only
 * remembers WHICH typed files the turn touched; `stop-typecheck.mjs` checks them
 * once, when the model tries to end the turn.
 *
 * Records .ts/.tsx/.mts/.cts and .py paths (absolute, deduplicated) into a
 * per-session list under the OS tmpdir. Silent, fail-open, always exit 0.
 *
 * Opt-in — see stop-typecheck.mjs: GREAT_CTO_TYPECHECK_AT_STOP=1 or
 * `typecheck_at_stop: true` in .great_cto/PROJECT.md;
 * GREAT_CTO_DISABLE_STOP_TYPECHECK=1 always wins.
 */

import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, extname, sep } from 'node:path';

export const TYPED_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.py']);

/** Session key: the payload's session_id, else CLAUDE_SESSION_ID, else a hash of cwd. */
export function sessionKey(payload, cwd) {
  const raw = payload?.session_id || process.env.CLAUDE_SESSION_ID
    || createHash('sha1').update(cwd || process.cwd()).digest('hex').slice(0, 12);
  return String(raw).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'default';
}

export function stateDir() {
  return join(tmpdir(), 'great-cto-typecheck');
}

export function listPath(key) {
  return join(stateDir(), `${key}.list`);
}

/** Nearest ancestor (inclusive) of `start` holding .great_cto/PROJECT.md, or null. */
function findProjectMd(start) {
  let dir = resolve(start || process.cwd());
  for (let i = 0; i < 40; i++) {
    const p = join(dir, '.great_cto', 'PROJECT.md');
    if (existsSync(p)) return p;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  return null;
}

/** Opt-in gate shared by both halves. The disable flag beats every enable. */
export function isActive(cwd) {
  if (process.env.GREAT_CTO_DISABLE_STOP_TYPECHECK === '1') return false;
  if (process.env.GREAT_CTO_TYPECHECK_AT_STOP === '1') return true;
  const md = findProjectMd(cwd);
  if (!md) return false;
  try {
    return /^\s*typecheck_at_stop:\s*true\s*$/m.test(readFileSync(md, 'utf8'));
  } catch { return false; }
}

export function readList(key) {
  try {
    return [...new Set(readFileSync(listPath(key), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean))];
  } catch { return []; }
}

export function main() {
  let payload;
  try { payload = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return 0; }
  const cwd = payload.cwd || process.cwd();
  const raw = payload.tool_input?.file_path || payload.tool_response?.filePath;
  if (!raw || typeof raw !== 'string') return 0;
  if (!TYPED_EXTS.has(extname(raw).toLowerCase())) return 0;
  if (!isActive(cwd)) return 0;

  const file = resolve(cwd, raw);
  // Dependencies are not the turn's code.
  if (file.includes(`${sep}node_modules${sep}`)) return 0;

  const key = sessionKey(payload, cwd);
  if (readList(key).includes(file)) return 0;
  try {
    mkdirSync(stateDir(), { recursive: true });
    appendFileSync(listPath(key), `${file}\n`);
  } catch { /* fail-open: an unwritable tmpdir means no check, never a broken edit */ }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { process.exitCode = main(); } catch { process.exitCode = 0; }
}
