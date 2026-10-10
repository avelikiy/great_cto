#!/usr/bin/env node
/**
 * great_cto status line — your status line, plus a record of Claude's plan use.
 *
 * Claude Code hands the status line command a JSON object on stdin, and for a
 * subscription it carries `rate_limits`: the 5-hour window, the week, the
 * per-model weeks, each with a used percentage and a reset time. Nothing else
 * on the machine records them — not the transcripts, not any hook payload — so
 * the board could only say "Claude Code does not record plan use". This script
 * keeps one line per CHANGE of those numbers in ~/.great_cto/claude-limits.jsonl
 * and then prints the status line you had before (`great-cto statusline
 * install` saved it), or a short one of its own.
 *
 * Installed by copying this file to ~/.great_cto/statusline.mjs: the status line
 * runs often, and `npx` would add its start-up to every refresh. Zero
 * dependencies; never fails the status line over the record.
 */
import { readFileSync, appendFileSync, writeFileSync, mkdirSync, statSync, renameSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const DIR = process.env.GREAT_CTO_HOME || join(homedir(), '.great_cto');
const LOG = join(DIR, 'claude-limits.jsonl');
const LAST = join(DIR, '.claude-limits-last');
const CONF = join(DIR, 'statusline.json');
const MAX_BYTES = 5 * 1024 * 1024;

/** Seconds since the epoch, from a number (seconds or milliseconds) or a date string. */
export function resetSeconds(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v > 1e12 ? v / 1000 : v);
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return resetSeconds(n);
    const t = Date.parse(v);
    if (Number.isFinite(t)) return Math.round(t / 1000);
  }
  return null;
}

/** `rate_limits` → { window: { used, resets } }, only windows that carry a number. */
export function windowsOf(rateLimits) {
  const out = {};
  if (!rateLimits || typeof rateLimits !== 'object') return out;
  for (const [name, w] of Object.entries(rateLimits)) {
    if (!w || typeof w !== 'object') continue;
    const used = Number(w.used_percentage ?? w.utilization ?? w.used_percent);
    if (!Number.isFinite(used)) continue;
    out[name] = { used: Math.round(used * 10) / 10, resets: resetSeconds(w.resets_at ?? w.resetsAt) };
  }
  return out;
}

export function record(rateLimits, { now = Date.now() } = {}) {
  const windows = windowsOf(rateLimits);
  if (!Object.keys(windows).length) return false;
  const key = JSON.stringify(windows);
  let last = '';
  try { last = readFileSync(LAST, 'utf8'); } catch { /* first reading */ }
  if (last === key) return false;
  mkdirSync(DIR, { recursive: true });
  try { if (statSync(LOG).size > MAX_BYTES) renameSync(LOG, `${LOG}.1`); } catch { /* no log yet */ }
  appendFileSync(LOG, `${JSON.stringify({ ts: new Date(now).toISOString(), windows })}\n`);
  writeFileSync(LAST, key);
  return true;
}

export function defaultLine(d) {
  const parts = [];
  const model = d?.model?.display_name || d?.model?.id;
  if (model) parts.push(model);
  const dir = d?.workspace?.current_dir || d?.cwd;
  if (dir) parts.push(basename(dir));
  const w = windowsOf(d?.rate_limits);
  if (w.five_hour) parts.push(`5h ${Math.round(w.five_hour.used)}%`);
  if (w.seven_day) parts.push(`7d ${Math.round(w.seven_day.used)}%`);
  return parts.join(' · ');
}

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { /* no input */ }
  let d = {};
  try { d = JSON.parse(raw || '{}'); } catch { /* not JSON */ }
  try { record(d.rate_limits); } catch { /* the record never costs the status line */ }
  let conf = {};
  try { conf = JSON.parse(readFileSync(CONF, 'utf8')); } catch { /* none saved */ }
  if (typeof conf.chain === 'string' && conf.chain.trim()) {
    const r = spawnSync('/bin/sh', ['-c', conf.chain], { input: raw, encoding: 'utf8', timeout: 5000 });
    process.stdout.write(r.stdout || '');
    return;
  }
  process.stdout.write(`${defaultLine(d)}\n`);
}

// Real paths on both sides: the module URL is resolved through symlinks (macOS
// /var → /private/var, a symlinked home), the command line is not.
const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(fileURLToPath(import.meta.url)) === real(process.argv[1])) main();
