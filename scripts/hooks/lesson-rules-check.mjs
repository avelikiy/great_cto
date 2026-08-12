#!/usr/bin/env node
/**
 * PostToolUse hook for Edit | Write | MultiEdit — the self-correction loop.
 *
 * Runs the lesson-rules pack over the file the agent just wrote and hands any
 * findings straight back as additionalContext. The agent that introduced the
 * defect fixes it in the next turn, while the context is still its own — which
 * is cheaper than every alternative: a reviewer finding it costs a round-trip,
 * a human finding it costs a debugging session, and the pipeline-wake incident
 * (the rule pack's founding member) cost exactly that.
 *
 * The fifteen-months writeup this borrows from counted 203 agent
 * self-corrections in two weeks, all pre-commit. That number is the value, so
 * every firing here is logged to `.great_cto/lesson-rules.log` — "how often
 * does this save us" should be a number we read, not an impression.
 *
 * Never blocks: findings are advice to the author, and a hook that blocks on a
 * heuristic teaches people to disable the hook. The rules earn attention by
 * being right, and the sweep (`node scripts/lib/lesson-rules.mjs --sweep`)
 * holds them at zero findings across the whole repository.
 *
 * Opt-out: GREAT_CTO_DISABLE_LESSON_RULES=1
 *
 * I/O (PostToolUse): stdin {tool_input:{file_path}}; stdout
 * {hookSpecificOutput:{additionalContext}} when there are findings, silence
 * otherwise. Always exit 0 — a broken checker must never break an edit.
 */

import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { relative } from 'node:path';
import { runRules, brief } from '../lib/lesson-rules.mjs';

function main() {
  if (process.env.GREAT_CTO_DISABLE_LESSON_RULES === '1') return;

  let payload;
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { return; /* no payload, nothing to check */ }
  const fp = payload?.tool_input?.file_path || payload?.file_path || '';
  if (!fp) return;

  const rel = relative(process.cwd(), fp);
  if (rel.startsWith('..')) return;               // outside the project — not ours to judge
  if (/(^|\/)tests?\//.test(rel) || /\.test\./.test(rel)) return;  // fixtures legitimately contain the shapes the rules hunt

  let text;
  try { text = readFileSync(fp, 'utf8'); } catch { return; /* deleted or unreadable — the edit tool already reported that */ }

  const findings = runRules(text, rel);
  if (!findings.length) return;

  // The count is the point of the log: one line per firing, greppable.
  try {
    mkdirSync('.great_cto', { recursive: true });
    for (const f of findings) {
      appendFileSync('.great_cto/lesson-rules.log',
        `${new Date().toISOString()} ${rel}:${f.line} ${f.rule}\n`);
    }
  } catch { /* an unwritable log must not mute the finding itself */ }

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: brief(findings, rel),
    },
  }));
}

// A session must never fail an edit over its own tooling.
try { main(); } catch { /* swallowing here is the design: advice, not a gate */ }
process.exit(0);
