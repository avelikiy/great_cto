#!/usr/bin/env node
/**
 * PostToolUse hook for Edit | Write | MultiEdit.
 *
 * Regenerates docs/reference/ when a file the reference is DERIVED FROM changes.
 *
 * ci-local has a `docs-reference in sync` gate, and it works — it caught a stale
 * page twice in one session, once after editing a command and once after editing
 * an agent. The complaint was never that the gate is wrong. It is that the only
 * feedback is a red gate minutes later, on work that was finished and correct,
 * for a file the author never touched by hand. That is the shape that teaches
 * people to reach for --no-verify.
 *
 * Which files count is NOT listed here. `GROUPS` in scripts/lib/system-map.mjs is
 * what the generator actually reads, so this asks it. Hardcoding a copy would
 * mean a group added there is silently not watched here — the same
 * declared-in-one-place, enforced-in-another defect this repository keeps
 * closing. A test asserts this hook fires for every directory GROUPS names.
 *
 * Non-blocking: any failure is logged and swallowed. A generator that cannot run
 * must not stop an edit from completing — the gate still has the last word, and
 * this hook is a convenience in front of it, never a replacement for it.
 *
 * Opt-out: GREAT_CTO_DISABLE_DOCS_SYNC=1
 *
 * @see docs/HOOKS.md
 */

import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const LOG_PATH = '.great_cto/docs-sync.log';

function log(line) {
  try {
    mkdirSync('.great_cto', { recursive: true });
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`);
  } catch { /* the log is a convenience; losing it must not fail the hook */ }
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

/**
 * Does this path feed docs/reference/?
 *
 * Asks GROUPS rather than restating it. Exported so the test can drive it with
 * every directory GROUPS names, instead of a list written twice.
 *
 * @returns {boolean}
 */
export function feedsReference(filePath, groups) {
  if (!filePath) return false;
  const rel = relative(ROOT, resolve(filePath));
  // Outside the repository, or escaping it — not ours.
  if (!rel || rel.startsWith('..') || rel.startsWith(sep)) return false;
  const parts = rel.split(sep);
  // Mirrors system-map's own SKIP: a generated or vendored tree is not a source.
  if (parts.some((p) => ['node_modules', 'dist', 'build', '.git', 'coverage', 'vendor'].includes(p))) return false;
  return groups.some((g) =>
    g.dirs.some((d) => rel === d || rel.startsWith(d + sep)) &&
    g.ext.some((x) => rel.endsWith(x)));
}

async function main() {
  if (process.env.GREAT_CTO_DISABLE_DOCS_SYNC === '1') return;

  const file = extractFilePath(readStdin());
  if (!file) return;

  let GROUPS;
  try {
    ({ GROUPS } = await import(join(ROOT, 'scripts', 'lib', 'system-map.mjs')));
  } catch (err) {
    log(`skip ${file}: cannot read GROUPS (${err?.code || err?.message})`);
    return;
  }

  if (!feedsReference(file, GROUPS)) return;

  const gen = join(ROOT, 'scripts', 'gen-docs-reference.mjs');
  if (!existsSync(gen)) { log(`skip ${file}: generator missing at ${gen}`); return; }

  const r = spawnSync(process.execPath, [gen], { cwd: ROOT, encoding: 'utf8', timeout: 20_000 });
  if (r.status === 0) log(`regenerated after ${file}`);
  else log(`FAILED after ${file}: status=${r.status}${r.signal ? ` signal=${r.signal}` : ''} ${(r.stderr || '').trim().slice(0, 200)}`);
}

// Only run when invoked as the hook, so the test can import feedsReference.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => { log(`unhandled: ${err?.message}`); });
}
