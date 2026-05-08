#!/usr/bin/env node
/**
 * PostToolUse hook for Edit | Write | MultiEdit.
 *
 * Auto-formats the file by extension if a known formatter is on PATH:
 *   .js .jsx .ts .tsx .mjs .cjs .json  → prettier
 *   .py                                → ruff format (or black)
 *   .go                                → gofmt -w
 *   .rs                                → rustfmt
 *
 * Non-blocking: any failure is logged but never blocks the tool result.
 *
 * Opt-out: GREAT_CTO_DISABLE_FORMAT=1 or .great_cto/config has format: false.
 *
 * @see docs/HOOKS.md
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { extname } from 'node:path';

const LOG_PATH = '.great_cto/format.log';

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

function extractFilePath(input) {
  try {
    const parsed = JSON.parse(input);
    return parsed.tool_input?.file_path || parsed.file_path || '';
  } catch { return ''; }
}

function which(cmd) {
  const r = spawnSync('which', [cmd], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim();
}

const FORMATTERS = [
  {
    exts: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml'],
    cmd: 'prettier',
    args: (file) => ['--write', '--log-level', 'error', file],
  },
  {
    exts: ['.py'],
    cmd: 'ruff',
    args: (file) => ['format', file],
    fallback: { cmd: 'black', args: (file) => ['--quiet', file] },
  },
  {
    exts: ['.go'],
    cmd: 'gofmt',
    args: (file) => ['-w', file],
  },
  {
    exts: ['.rs'],
    cmd: 'rustfmt',
    args: (file) => ['--quiet', file],
  },
];

function pickFormatter(file) {
  const ext = extname(file).toLowerCase();
  for (const f of FORMATTERS) {
    if (!f.exts.includes(ext)) continue;
    if (which(f.cmd)) return { cmd: f.cmd, args: f.args(file) };
    if (f.fallback && which(f.fallback.cmd)) return { cmd: f.fallback.cmd, args: f.fallback.args(file) };
  }
  return null;
}

function log(line) {
  try {
    mkdirSync('.great_cto', { recursive: true });
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`);
  } catch { /* never crash */ }
}

function main() {
  if (process.env.GREAT_CTO_DISABLE_FORMAT === '1') return process.exit(0);

  const file = extractFilePath(readStdin());
  if (!file) return process.exit(0);
  if (!existsSync(file)) return process.exit(0);

  const formatter = pickFormatter(file);
  if (!formatter) return process.exit(0);  // No formatter for this ext — silently skip.

  const { cmd, args } = formatter;
  const result = spawnSync(cmd, args, { encoding: 'utf8', timeout: 10_000 });

  if (result.status === 0) {
    log(`OK ${cmd} ${file}`);
  } else {
    log(`FAIL ${cmd} ${file} status=${result.status} ${(result.stderr || '').slice(0, 200)}`);
  }

  return process.exit(0);  // never block
}

main();
