#!/usr/bin/env node
/**
 * PostToolUse hook — auto-generate `.summary.md` for great_cto artifacts.
 *
 * Triggers after Edit/Write/MultiEdit on a file matching:
 *   docs/{architecture,plans,qa,security,release,performance}/<PREFIX>-*.md
 * where PREFIX ∈ {ARCH, PLAN, PHASE, ADR, QA, SEC, TM, RELEASE, PERF}.
 *
 * Skips:
 *   - Files already ending in .summary.md (don't summarize a summary)
 *   - GREAT_CTO_DISABLE_SUMMARY=1
 *   - Files that haven't changed since last summary generation
 *
 * Non-blocking: any failure is logged to .great_cto/summary.log, never blocks.
 *
 * Cost: per-call ~$0.0005 with Haiku, free with heuristic fallback.
 *
 * @see docs/HOOKS.md
 * @see scripts/generate-summary.mjs
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG_PATH = '.great_cto/summary.log';
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'generate-summary.mjs');

const ARTIFACT_DIRS = [
  'docs/architecture',
  'docs/plans',
  'docs/qa',
  'docs/security',
  'docs/release',
  'docs/performance',
];

const ARTIFACT_PREFIXES = /^(?:ARCH|PLAN|PHASE|ADR|QA|SEC|TM|RELEASE|PERF)-/;

function log(line) {
  try {
    mkdirSync('.great_cto', { recursive: true });
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`);
  } catch { /* swallow */ }
}

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

function extractFilePath(input) {
  try {
    const parsed = JSON.parse(input);
    return parsed.tool_input?.file_path || parsed.file_path || '';
  } catch { return ''; }
}

function shouldSummarize(filePath) {
  if (!filePath) return false;
  if (!filePath.endsWith('.md')) return false;
  if (filePath.endsWith('.summary.md')) return false;

  // Must be in one of the artifact dirs (relative or absolute path both ok)
  const inArtifactDir = ARTIFACT_DIRS.some((d) => filePath.includes(d + '/'));
  if (!inArtifactDir) return false;

  // Must match an artifact prefix
  return ARTIFACT_PREFIXES.test(basename(filePath));
}

function main() {
  if (process.env.GREAT_CTO_DISABLE_SUMMARY === '1') return;

  const input = readStdin();
  const filePath = extractFilePath(input);

  if (!shouldSummarize(filePath)) return;
  if (!existsSync(filePath)) return;
  if (!existsSync(SCRIPT)) {
    log(`SCRIPT_MISSING ${SCRIPT}`);
    return;
  }

  log(`TRIGGER ${filePath}`);

  // Fire-and-forget: spawn the generator detached, log result async.
  // Hooks must return fast — generator can take 2-15s with LLM call.
  const child = spawn('node', [SCRIPT, filePath], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d.toString(); });
  child.stderr.on('data', (d) => { stderr += d.toString(); });

  child.on('exit', (code) => {
    if (code === 0) {
      log(`OK ${filePath} ${stdout.trim().split('\n').pop() ?? ''}`);
    } else {
      log(`FAIL ${filePath} code=${code} stderr=${stderr.slice(0, 200).trim()}`);
    }
  });

  // Don't await — hook must return immediately
  child.unref();
}

main();
