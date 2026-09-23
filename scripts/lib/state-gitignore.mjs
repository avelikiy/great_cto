#!/usr/bin/env node
/**
 * state-gitignore — keep great_cto's machine-local state out of a project's git.
 *
 * Hooks write some forty kinds of file into `.great_cto/` every session — turn
 * markers, event and cost logs, a copy of the plugin's skill file, session
 * stubs — and nothing told git to ignore them, because `.great_cto/` also holds
 * the project's real records (PROJECT.md, verdicts, brain.md, lessons.md, decisions,
 * the session logs /save writes). Across 22 projects on the measuring machine,
 * every session left dozens of changed files for someone to step around.
 *
 * This writes `.great_cto/.gitignore` with a managed block — between the markers,
 * rewritten every run; anything the project adds outside them is kept. The
 * project's root .gitignore is not touched. It stops new noise; files already
 * committed stay tracked until someone untracks them (`git rm --cached`).
 *
 * Usage: node scripts/lib/state-gitignore.mjs [projectDir]   (SessionStart runs it)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot } from './project-root.mjs';

export const BEGIN = '# >>> great_cto managed — machine-local state, not project history >>>';
export const END = '# <<< great_cto managed <<<';

/** Written by hooks, per machine or per session. Project records are deliberately absent. */
export const STATE_PATTERNS = Object.freeze([
  '.last-stop', '.session-resume', '.pipeline-stall', '.pipeline-tick', '.last-auto-learn',
  '.completion-asked-*', '.qa-probe', '.auditor-probe', '.cso-probe', '.DS_Store', '*.tmp',
  'events.jsonl', 'pipeline-runs.jsonl', 'scores.jsonl',
  'cost-history.log', 'cost-history.corrupt-*.log', 'format.log', 'docs-sync.log',
  'lesson-rules.log', 'permission-denied.log', 'tool-failures.log', 'security-signals.log',
  'cross-review.log', 'summary.log', 'llm-router-usage.log', 'dora-baseline.log', 'view-counter.log',
  'build-output.log', 'lint-output.log', 'typecheck-output.log', 'scoped-access-check.log',
  'cache/', 'status/', 'worktrees/', 'review-marker.json',
  'env.sh', 'ARCHETYPES.md', 'SKILL.md', 'HANDOFF.md', 'digest-latest.md',
  'logs/session-*-end.md', 'logs/session-*-autocompact.md', 'logs/.last-resume',
]);

export function renderBlock() {
  return [BEGIN, ...STATE_PATTERNS, END].join('\n');
}

/** New file text: the managed block replaced (or appended), everything else kept. */
export function mergeGitignore(existing) {
  const text = String(existing || '');
  const block = renderBlock();
  const a = text.indexOf(BEGIN);
  const b = text.indexOf(END);
  if (a !== -1 && b > a) return `${text.slice(0, a)}${block}${text.slice(b + END.length)}`;
  return `${text}${text && !text.endsWith('\n') ? '\n' : ''}${text ? '\n' : ''}${block}\n`;
}

/** Ensure .great_cto/.gitignore in a great_cto project. Returns 'written' | 'unchanged' | 'not-a-project'. */
export function ensureStateGitignore(dir = process.cwd()) {
  const root = projectRoot(dir);
  const gc = join(root, '.great_cto');
  if (!existsSync(join(gc, 'PROJECT.md'))) return 'not-a-project';
  const file = join(gc, '.gitignore');
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const after = mergeGitignore(before);
  if (after === before) return 'unchanged';
  mkdirSync(gc, { recursive: true });
  writeFileSync(file, after);
  return 'written';
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) { try { ensureStateGitignore(process.argv[2] || process.cwd()); } catch { /* never block a session */ } }
