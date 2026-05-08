#!/usr/bin/env node
/**
 * SessionEnd hook.
 *
 * Phase 1 (v1.1.0): captures session summary into .great_cto/logs/.
 * Phase 2 (v1.2.0): additionally registers this project in
 *                   ~/.great_cto/projects/<slug>/lessons.md (symlink) so
 *                   lessons-merge.mjs can consolidate cross-project patterns.
 *                   Continuous-learner is triggered by the user via /learn
 *                   or by the next /save (since SessionEnd hook runs in a
 *                   sandbox without access to the agent fleet).
 *
 * Hook protocol:
 *   stdin:  { session_id, reason }    (Claude Code SessionEnd payload)
 *   stdout: nothing
 *   exit:   0 always (never block session shutdown)
 *
 * Opt-out: GREAT_CTO_DISABLE_SESSION_LEARNING=1
 *
 * @see docs/HOOKS.md
 * @see docs/LEARNING.md
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync, symlinkSync, unlinkSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve, basename } from 'node:path';

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

## Phase 2 placeholder

When v1.2.0 ships with continuous-learner, this hook will additionally:
- Read the session transcript
- Extract repeated patterns / decisions / cost outliers
- Append structured entries to .great_cto/lessons.md
- Promote skill-candidates after ≥3 occurrences to ~/.great_cto/decisions.md

For now, this is just a snapshot.
`;

  // Don't overwrite if a /save log already exists for this session.
  if (!existsSync(filename)) {
    try { writeFileSync(filename, content); } catch { /* never block */ }
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

  return process.exit(0);
}

main();
