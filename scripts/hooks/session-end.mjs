#!/usr/bin/env node
/**
 * SessionEnd hook.
 *
 * Phase 1 (v1.1.0): captures session summary into .great_cto/logs/.
 * Phase 2 (v1.2.0): additionally registers this project in
 *                   ~/.great_cto/projects/<slug>/lessons.md (symlink) so
 *                   lessons-merge.mjs can consolidate cross-project patterns.
 * Phase 3 (v1.3.0): starts continuous-learner at session end when auto-learn
 *                   is on (GREAT_CTO_AUTO_LEARN=1 or "auto_learn": true in
 *                   ~/.great_cto/config.json). Off by default: each run is paid.
 *
 * Hook protocol:
 *   stdin:  { session_id, reason }    (Claude Code SessionEnd payload)
 *   stdout: nothing
 *   exit:   0 always (never block session shutdown)
 *
 * Opt-out: GREAT_CTO_DISABLE_SESSION_LEARNING=1
 * Auto-learn: GREAT_CTO_AUTO_LEARN=1 or config auto_learn (opt-in, default off)
 *
 * @see docs/HOOKS.md
 * @see docs/LEARNING.md
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync, symlinkSync, unlinkSync, readdirSync } from 'node:fs';
import { learnWorthIt, autoLearnEnabled } from '../lib/learn-worth-it.mjs';
import { spawnSync, spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCrystallizeHint } from '../crystallize-hint.mjs';

export { checkCrystallizeHint };

const LOG_DIR = '.great_cto/logs';
const HOME = homedir();
const GLOBAL_PROJECTS_DIR = join(HOME, '.great_cto', 'projects');

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

function nowParts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

function safeRun(cmd, args) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 5_000 });
    return r.status === 0 ? (r.stdout || '').trim() : '';
  } catch { return ''; }
}

function captureGitState() {
  return {
    branch: safeRun('git', ['branch', '--show-current']) || 'unknown',
    lastCommit: safeRun('git', ['log', '--oneline', '-1']) || 'none',
    uncommitted: (safeRun('git', ['status', '--short']) || '').split('\n').filter(Boolean).length,
    commitsToday: (safeRun('git', ['log', '--oneline', '--since=8 hours ago']) || '').split('\n').filter(Boolean).length,
  };
}

function captureBeadsState() {
  return {
    open: (safeRun('bd', ['list', '--status', 'open']) || '').split('\n').filter(Boolean).length,
    blocked: (safeRun('bd', ['list', '--status', 'blocked']) || '').split('\n').filter(Boolean).length,
  };
}

function captureCostHint() {
  // Tail .great_cto/cost-history.log if it exists
  try {
    const txt = readFileSync('.great_cto/cost-history.log', 'utf8');
    const lines = txt.trim().split('\n');
    return lines.slice(-5).join('\n');
  } catch { return ''; }
}

/**
 * Count current session-*-end.md files in .great_cto/logs/.
 * Returns 0 on any error (non-existent dir, permission denied, etc.).
 *
 * @returns {number}
 */
function countSessionLogs() {
  try {
    const files = readdirSync(LOG_DIR);
    return files.filter(f => /^session-.*-end\.md$/.test(f)).length;
  } catch { return 0; }
}

/**
 * Start continuous-learner for this session, detached and best-effort.
 * Never throws — session end must not be blocked.
 *
 * It starts scripts/lib/run-learner.mjs, which waits for the learner and writes
 * the outcome to .great_cto/.last-auto-learn (`done: lessons+N` / `failed: …`).
 * This function writes only `started:` — it used to write `ran` on spawn, for a
 * learner that exited 1 at once, and the marker was the only record anyone had.
 */
function spawnLearner(git, payload = {}) {
  if (!autoLearnEnabled()) return;

  // A paid agent run needs something to learn from. Spawning at EVERY session
  // end includes the thirty-second one that answered a question — and /save
  // already refuses to update brain.md for a trivial session. Same rule, applied
  // where it costs money. An unreadable git state RUNS it: skipping would deliver
  // "I could not tell" as "nothing to learn".
  const verdict = learnWorthIt(git);
  if (!verdict.run) {
    try {
      mkdirSync('.great_cto', { recursive: true });
      writeFileSync('.great_cto/.last-auto-learn',
        `${new Date().toISOString()} skipped: ${verdict.reason}\n`);
    } catch { /* never block */ }
    return;
  }

  try {
    const which = spawnSync('which', ['claude'], { encoding: 'utf8', timeout: 3_000 });
    if (which.status !== 0 || !which.stdout.trim()) {
      mkdirSync('.great_cto', { recursive: true });
      writeFileSync('.great_cto/.last-auto-learn', `${new Date().toISOString()} skipped: claude CLI not on PATH\n`);
      return;
    }
    const runner = resolve(import.meta.dirname || '.', '..', 'lib', 'run-learner.mjs');
    const child = spawn(process.execPath, [runner, JSON.stringify({
      cwd: process.cwd(), transcript: payload.transcript_path || null, reason: payload.reason || null,
    })], { detached: true, stdio: 'ignore' });
    child.unref();
    mkdirSync('.great_cto', { recursive: true });
    writeFileSync('.great_cto/.last-auto-learn',
      `${new Date().toISOString()} started: ${verdict.reason} (the runner rewrites this line with the outcome)\n`);
  } catch { /* never block session end */ }
}

function main() {
  if (process.env.GREAT_CTO_DISABLE_SESSION_LEARNING === '1') return process.exit(0);

  const raw = readStdin();
  let payload = {};
  try { payload = JSON.parse(raw); } catch { /* tolerate empty stdin */ }

  const sessionId = (payload.session_id || 'unknown').slice(0, 8);
  const reason = payload.reason || 'normal';

  const { date, time } = nowParts();
  const git = captureGitState();
  const beads = captureBeadsState();
  const costHint = captureCostHint();

  try { mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ok */ }

  const filename = `${LOG_DIR}/session-${date}-${time.replace(':', '')}-end.md`;
  const content = `---
date: ${date}
time: ${time}
session-id: ${sessionId}
reason: ${reason}
---

# Session ended (auto-capture)

## Git
- Branch: \`${git.branch}\`
- Last commit: \`${git.lastCommit}\`
- Uncommitted changes: ${git.uncommitted} files
- Commits in last 8h: ${git.commitsToday}

## Beads
- Open: ${beads.open}
- Blocked: ${beads.blocked}

## Cost (last 5 entries)
\`\`\`
${costHint || '(no cost log)'}
\`\`\`

## Auto-learning

continuous-learner runs at session end when auto-learn is on, and records its
outcome in .great_cto/.last-auto-learn. It reads a redacted digest of the session,
extracts evidence-backed lessons, and adds them to .great_cto/lessons.md.

To enable: "auto_learn": true in ~/.great_cto/config.json (or GREAT_CTO_AUTO_LEARN=1)
To disable: remove it, or GREAT_CTO_AUTO_LEARN=0
`;

  // Append crystallize hint if session count warrants it.
  // Count BEFORE writing this file so the threshold math is consistent.
  const sessionCount = countSessionLogs();
  const crystallizeHint = checkCrystallizeHint(sessionCount);

  // Don't overwrite if a /save log already exists for this session.
  if (!existsSync(filename)) {
    try { writeFileSync(filename, content + crystallizeHint); } catch { /* never block */ }
  }

  // --- Cross-project lessons registration (Phase 2) ---
  // Register this project in ~/.great_cto/projects/<slug>/ via symlink to
  // its lessons.md, so lessons-merge.mjs can consolidate across projects.
  try {
    if (existsSync('.great_cto/lessons.md')) {
      mkdirSync(GLOBAL_PROJECTS_DIR, { recursive: true });
      const projectSlug = basename(process.cwd()).replace(/[^a-zA-Z0-9_-]/g, '-');
      const projectDir = join(GLOBAL_PROJECTS_DIR, projectSlug);
      mkdirSync(projectDir, { recursive: true });

      const linkPath = join(projectDir, 'lessons.md');
      const target = resolve('.great_cto/lessons.md');

      // Refresh symlink (target may have moved across runs)
      try { unlinkSync(linkPath); } catch { /* ok if doesn't exist */ }
      try { symlinkSync(target, linkPath); } catch { /* ok if FS doesn't support */ }
    }

    // Trigger lessons-merge in background (best-effort; failures silenced)
    const mergeScript = resolve(import.meta.dirname || '.', '..', 'lessons-merge.mjs');
    if (existsSync(mergeScript)) {
      const child = spawn('node', [mergeScript], {
        detached: true,
        stdio: 'ignore',
        timeout: 5_000,
      });
      child.unref();
    }
  } catch { /* never block session end */ }

  // --- Auto-trigger continuous-learner (Phase 3) ---
  spawnLearner(git, payload);

  return process.exit(0);
}

main();
