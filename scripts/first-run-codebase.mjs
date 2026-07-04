#!/usr/bin/env node
/**
 * first-run-codebase.mjs — generate a starter .great_cto/CODEBASE.md on the
 * FIRST session in a project, so the board's Memory view populates without the
 * CTO having to run /audit manually.
 *
 * Spawned in the background by the SessionStart hook. Self-guards, fail-silent,
 * fast (bounded scan). A later /audit enriches this file — the "> Generated"
 * first line marks it auto-generated, so project-auditor regenerates it rather
 * than treating it as a hand-edit.
 *
 * Skips entirely when:
 *   - .great_cto/PROJECT.md is absent (project not onboarded), OR
 *   - .great_cto/CODEBASE.md already exists (don't clobber), OR
 *   - GREAT_CTO_NO_FIRST_RUN=1.
 *
 * Zero deps, node: built-ins only.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, basename, extname } from 'node:path';

const CWD = process.cwd();
const GC = join(CWD, '.great_cto');

// ── guards ───────────────────────────────────────────────────────────────
if (process.env.GREAT_CTO_NO_FIRST_RUN === '1') process.exit(0);
if (!existsSync(join(GC, 'PROJECT.md'))) process.exit(0);
if (existsSync(join(GC, 'CODEBASE.md'))) process.exit(0);

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', 'out', 'vendor', 'target',
  '.venv', 'venv', '__pycache__', 'coverage', '.turbo', '.cache', 'tmp',
  '.great_cto', '.claude', '.worktrees', 'site-packages',
]);
const SRC_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.rb',
  '.java', '.kt', '.swift', '.php', '.cs', '.vue', '.svelte', '.c', '.cpp', '.h',
]);
const MAX_FILES = 6000;      // stop walking after this many files
const MAX_LOC_BYTES = 800_000; // don't line-count files bigger than this

let scanned = 0;
const files = []; // { rel, loc, ext }

function walk(dir) {
  if (scanned >= MAX_FILES) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (scanned >= MAX_FILES) return;
    if (e.name.startsWith('.') && e.name !== '.') {
      if (SKIP_DIRS.has(e.name)) continue;
    }
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full);
    } else if (e.isFile()) {
      const ext = extname(e.name).toLowerCase();
      if (!SRC_EXT.has(ext)) continue;
      scanned++;
      let loc = 0;
      try {
        const st = statSync(full);
        if (st.size <= MAX_LOC_BYTES) {
          loc = readFileSync(full, 'utf8').split('\n').length;
        }
      } catch { /* skip */ }
      files.push({ rel: relative(CWD, full), loc, ext });
    }
  }
}

try { walk(CWD); } catch { /* fail-silent */ }
if (files.length === 0) process.exit(0);

// ── stack detection (from manifests) ───────────────────────────────────────
function readJson(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }
const stack = [];
const pkg = readJson(join(CWD, 'package.json'));
if (pkg) {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const has = (n) => Object.prototype.hasOwnProperty.call(deps, n);
  if (has('next')) stack.push('Next.js');
  else if (has('react')) stack.push('React');
  else if (has('vue') || has('nuxt')) stack.push('Vue');
  else if (has('svelte')) stack.push('Svelte');
  if (has('express')) stack.push('Express');
  if (has('fastify')) stack.push('Fastify');
  if (has('@nestjs/core')) stack.push('NestJS');
  if (has('typescript')) stack.push('TypeScript');
  if (has('vitest') || has('jest')) stack.push('tests');
  if (stack.length === 0) stack.push('Node.js');
}
if (existsSync(join(CWD, 'pyproject.toml')) || existsSync(join(CWD, 'requirements.txt'))) {
  const t = (() => { try { return readFileSync(join(CWD, 'pyproject.toml'), 'utf8'); } catch { return ''; } })();
  if (/fastapi/i.test(t)) stack.push('FastAPI');
  else if (/django/i.test(t)) stack.push('Django');
  else if (/flask/i.test(t)) stack.push('Flask');
  stack.push('Python');
}
if (existsSync(join(CWD, 'go.mod'))) stack.push('Go');
if (existsSync(join(CWD, 'Cargo.toml'))) stack.push('Rust');

// ── entry points ────────────────────────────────────────────────────────
const entryCandidates = [];
if (pkg?.main) entryCandidates.push(pkg.main);
if (pkg?.bin) {
  for (const v of typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin)) entryCandidates.push(v);
}
for (const f of files) {
  const b = basename(f.rel);
  if (/^(index|main|app|server|cli|__main__|mod)\.(ts|tsx|js|mjs|py|go|rs)$/.test(b)) entryCandidates.push(f.rel);
}
const entries = [...new Set(entryCandidates.map(e => e.replace(/^\.\//, '')))].filter(e => existsSync(join(CWD, e))).slice(0, 8);

// ── routes (light heuristic) ────────────────────────────────────────────
const routeHints = files
  .map(f => f.rel)
  .filter(r => /(^|\/)(routes?|api|pages\/api|controllers?)(\/|\.)/i.test(r) || /\.(route|controller)\.(ts|js|py)$/i.test(r))
  .slice(0, 12);

// ── god nodes (largest source files by LOC) ──────────────────────────────
const gods = [...files].filter(f => f.loc > 0).sort((a, b) => b.loc - a.loc).slice(0, 10);

// ── top-level source dirs ────────────────────────────────────────────────
const dirCounts = {};
for (const f of files) {
  const top = f.rel.split('/')[0];
  if (top && top !== f.rel) dirCounts[top] = (dirCounts[top] || 0) + 1;
}
const topDirs = Object.entries(dirCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

const totalLoc = files.reduce((s, f) => s + f.loc, 0);
const now = new Date().toISOString().slice(0, 10);

// ── render ────────────────────────────────────────────────────────────────
const L = [];
L.push(`> Generated by great_cto first-run scan on ${now} — a starter map; run \`/audit\` to enrich, or hand-edit (delete this line to stop auto-regen).`);
L.push('');
L.push('# CODEBASE');
L.push('');
L.push(`**Stack:** ${stack.length ? stack.join(' · ') : 'unknown'}  `);
L.push(`**Size:** ${files.length} source files · ~${totalLoc.toLocaleString()} LOC${scanned >= MAX_FILES ? ' (scan capped)' : ''}`);
L.push('');
L.push('## Entry points');
L.push(entries.length ? entries.map(e => `- \`${e}\``).join('\n') : '- _none detected_');
L.push('');
L.push('## God nodes (largest files)');
L.push(gods.length ? gods.map(g => `- \`${g.rel}\` — ${g.loc.toLocaleString()} LOC`).join('\n') : '- _none_');
L.push('');
if (routeHints.length) {
  L.push('## Routes / API surface');
  L.push(routeHints.map(r => `- \`${r}\``).join('\n'));
  L.push('');
}
L.push('## Top source directories');
L.push(topDirs.length ? topDirs.map(([d, n]) => `- \`${d}/\` — ${n} files`).join('\n') : '- _flat layout_');
L.push('');
L.push('---');
L.push('_This is a mechanical first-run map (no semantic analysis). `/audit` adds public API, dependency risk, and architectural debt._');

try {
  mkdirSync(GC, { recursive: true });
  writeFileSync(join(GC, 'CODEBASE.md'), L.join('\n') + '\n');
} catch { /* never block */ }
