#!/usr/bin/env node
// edit-impact — PreToolUse (Edit | Write | MultiEdit): before an existing code file is
// changed, tell the model who depends on it.
//
// The case it exists for: a parameter was added to an internal function; a background
// job called the public wrapper, which did not accept it; every mission run failed for
// a night while thousands of unit tests stayed green. Nothing told the editor, at the
// moment of the edit, that anything else called that file.
//
// So, once per file per session, it adds to the model's context:
//   - files that import this one (relative imports resolved exactly; an alias or bare
//     specifier that merely ends in the same name is marked "by name");
//   - tests that import it, or whose file name matches it;
//   - files git history shows are usually changed in the same commit.
// It never blocks, never reads file contents beyond import lines, and stays silent
// when it finds nothing. Opt out: GREAT_CTO_DISABLE_EDIT_IMPACT=1.
//
// Idea from agentlas-ai/Agentlas-OS (pretool impact context), rebuilt; see NOTICE.md.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendEvent } from '../lib/agent-events.mjs';

const JS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);
const PY = new Set(['.py']);
const CODE = new Set([...JS, ...PY, '.go', '.rs', '.rb', '.java', '.kt', '.swift', '.php', '.cs']);
const NOISE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|CHANGELOG\.md|Cargo\.lock|go\.sum)$|(^|\/)(dist|build|node_modules|\.beads)\//;
const TESTISH = /(^|\/)(tests?|__tests__|spec)\/|[._-](test|spec)\.[a-z]+$|(^|\/)test_[^/]+\.py$|_test\.(go|py)$/;
const LIMIT = { importers: 8, tests: 5, coEdited: 5, chars: 2500 };

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function git(root, args, timeout = 1500) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout, maxBuffer: 8 * 1024 * 1024 });
  } catch (e) {
    return typeof e?.stdout === 'string' ? e.stdout : ''; // git grep exits 1 on no match
  }
}

/** The module stem an import would name: `index` files are imported by their directory. */
function stemOf(rel) {
  const ext = extname(rel);
  const base = basename(rel, ext);
  return base === 'index' || base === '__init__' ? basename(dirname(rel)) : base;
}

/** Does a relative specifier written in `importer` point at `target` (both repo-relative)? */
export function resolvesTo(importer, spec, target) {
  if (!spec.startsWith('.')) return false;
  const abs = join(dirname(importer), spec).replace(/\\/g, '/');
  const t = target.replace(/\.[^./]+$/, '');
  const tIndexDir = /\/index$/.test(t) ? t.replace(/\/index$/, '') : null;
  const a = abs.replace(/\.(m|c)?[jt]sx?$/, '');
  return a === t || (tIndexDir !== null && a === tIndexDir);
}

/**
 * Who depends on `rel` (repo-relative) in the repository at `root`.
 * @returns {{importers:{file:string,exact:boolean}[], tests:{file:string,how:string}[], coEdited:{file:string,n:number,of:number}[]}}
 */
export function impactFor({ root, rel }) {
  const ext = extname(rel);
  const stem = stemOf(rel);
  const importers = [];
  if (stem && (JS.has(ext) || PY.has(ext))) {
    const pattern = JS.has(ext)
      ? `(from|require\\(|import\\()[[:space:]]*['"][^'"]*${escapeRe(stem)}(\\.(m|c)?[jt]sx?)?['"]`
      : `^[[:space:]]*(from[[:space:]]+[A-Za-z0-9_.]*\\b${escapeRe(stem)}\\b[[:space:]]+import|import[[:space:]]+[A-Za-z0-9_., ]*\\b${escapeRe(stem)}\\b)`;
    const out = git(root, ['grep', '-n', '-I', '-E', '-e', pattern, '--', ...(JS.has(ext) ? ['*.js', '*.mjs', '*.cjs', '*.jsx', '*.ts', '*.mts', '*.cts', '*.tsx'] : ['*.py'])]);
    const seen = new Map();
    for (const line of out.split('\n')) {
      const m = /^([^:]+):\d+:(.*)$/.exec(line);
      if (!m || m[1] === rel || NOISE.test(m[1])) continue;
      const [, file, text] = m;
      let exact = false;
      if (JS.has(ext)) {
        for (const s of text.matchAll(/['"]([^'"]+)['"]/g)) if (resolvesTo(file, s[1], rel)) exact = true;
      } else {
        exact = new RegExp(`\\b${escapeRe(stem)}\\b`).test(text);
      }
      seen.set(file, (seen.get(file) || false) || exact);
    }
    // Only an exact hit, or a by-name hit when nothing resolved exactly, is worth saying.
    const anyExact = [...seen.values()].some(Boolean);
    for (const [file, exact] of seen) if (exact || !anyExact || !JS.has(ext)) importers.push({ file, exact: JS.has(ext) ? exact : true });
  }

  const tests = [];
  for (const i of importers) if (TESTISH.test(i.file)) tests.push({ file: i.file, how: 'imports it' });
  if (stem) {
    const byName = new RegExp(`(^|/)(test_)?${escapeRe(stem)}([._-](test|spec))?\\.[a-z]+$`);
    for (const f of git(root, ['ls-files']).split('\n')) {
      if (f && f !== rel && TESTISH.test(f) && byName.test(f) && !tests.some((t) => t.file === f)) tests.push({ file: f, how: 'name match' });
    }
  }

  const counts = new Map();
  // --full-diff: with a pathspec, --name-only otherwise lists only that path.
  const log = git(root, ['log', '-n', '100', '--full-diff', '--format=%x00', '--name-only', '--', rel]);
  const commits = log.split('\0').map((c) => c.split('\n').filter(Boolean)).filter((c) => c.length);
  for (const files of commits) for (const f of new Set(files)) if (f !== rel && !NOISE.test(f)) counts.set(f, (counts.get(f) || 0) + 1);
  const coEdited = [...counts].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1])
    .map(([file, n]) => ({ file, n, of: commits.length }));

  return { importers: importers.filter((i) => !TESTISH.test(i.file)), tests, coEdited };
}

export function formatImpact(rel, imp) {
  const { importers, tests, coEdited } = imp;
  if (!importers.length && !tests.length && !coEdited.length) return '';
  const list = (xs, n, f) => xs.slice(0, n).map(f).join(', ') + (xs.length > n ? `, … +${xs.length - n} more` : '');
  const lines = [`great_cto edit-impact — ${rel} has dependents. If this edit changes a signature, a default or behaviour, they change too:`];
  const exact = importers.filter((i) => i.exact);
  const byName = importers.filter((i) => !i.exact);
  if (exact.length) lines.push(`- imported by (${exact.length}): ${list(exact, LIMIT.importers, (i) => i.file)}`);
  if (byName.length) lines.push(`- possibly imported by, same name via an alias (${byName.length}): ${list(byName, LIMIT.importers, (i) => i.file)}`);
  if (tests.length) lines.push(`- tests: ${list(tests, LIMIT.tests, (t) => `${t.file} (${t.how})`)}`);
  if (coEdited.length) lines.push(`- usually changed together with: ${list(coEdited, LIMIT.coEdited, (c) => `${c.file} (${c.n} of ${c.of} commits)`)}`);
  lines.push(tests.length
    ? 'Check each caller against the new version, not only the file you changed, and run these tests before calling it done.'
    : 'No test covers it by import or name — check each caller against the new version by hand, and say so if nothing exercises the path.');
  const text = lines.join('\n');
  return text.length > LIMIT.chars ? text.slice(0, LIMIT.chars - 1) + '…' : text;
}

/** Once per file per session: the second edit of the same file needs no reminder. */
function alreadyShown(session, abs) {
  if (!session) return false;
  const f = join(tmpdir(), `great_cto-edit-impact-${String(session).replace(/[^A-Za-z0-9_-]/g, '')}.json`);
  let seen = [];
  try { seen = JSON.parse(readFileSync(f, 'utf8')); } catch { /* first */ }
  if (seen.includes(abs)) return true;
  try { writeFileSync(f, JSON.stringify([...seen, abs].slice(-500))); } catch { /* best effort */ }
  return false;
}

function main() {
  if (process.env.GREAT_CTO_DISABLE_EDIT_IMPACT === '1') return;
  let payload;
  try { payload = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return; }
  const raw = payload?.tool_input?.file_path;
  if (!raw || !['Edit', 'Write', 'MultiEdit'].includes(payload?.tool_name)) return;
  const given = isAbsolute(raw) ? raw : resolve(payload.cwd || process.cwd(), raw);
  if (!CODE.has(extname(given)) || !existsSync(given)) return; // a new file has no dependents yet
  // git reports the real path (/private/var/… on macOS); compare like with like.
  const abs = realpathSync(given);
  const root = git(dirname(abs), ['rev-parse', '--show-toplevel']).trim();
  if (!root) return;
  const rel = relative(root, abs).replace(/\\/g, '/');
  if (rel.startsWith('..') || NOISE.test(rel)) return;
  const text = formatImpact(rel, impactFor({ root, rel }));
  if (!text || alreadyShown(payload.session_id, abs)) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } }));
  // Measured, not assumed: how often it speaks, on what, how much (never what it said).
  if (existsSync(join(root, '.great_cto'))) {
    appendEvent(join(root, '.great_cto'), { kind: 'hint', hook: 'edit-impact', session: payload.session_id, tool: payload.tool_name,
      paths: [rel], chars: text.length, host: process.env.GREAT_CTO_HOST === 'codex' ? 'codex' : 'claude' });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(); } catch { /* never block an edit on this hook's own failure */ }
  process.exit(0);
}
