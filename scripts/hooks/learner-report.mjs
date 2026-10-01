#!/usr/bin/env node
/**
 * learner-report — SessionStart hook: one line on what the session learner did
 * last time, shown to the operator.
 *
 * The learner runs detached at session end (and per window with learn_every_n)
 * and records its outcome in .great_cto/.last-auto-learn. Nobody read that file:
 * on 2026-10-01 it had said "lessons+0" for days while the sessions held several
 * lessons. A result you never see is a result you cannot act on. Idea from
 * autoharness, which prints its previous run's landed/rejected line at start.
 *
 * Silent when there is no record, when the record is older than a week, or when
 * a run is still in progress. Never blocks a session; always exits 0.
 *
 * I/O (Claude Code SessionStart): stdout {"systemMessage":"<line>"} or nothing.
 * Opt out: GREAT_CTO_DISABLE_LEARNER_REPORT=1
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEEK_MS = 7 * 24 * 3600_000;

/** The line to show, or null. */
export function reportLine(cwd, now = Date.now()) {
  let raw;
  try { raw = readFileSync(join(cwd, '.great_cto', '.last-auto-learn'), 'utf8').trim().split('\n').pop(); } catch { return null; }
  const m = /^(\S+)\s+(done|failed|skipped|started):?\s*(.*)$/.exec(raw || '');
  if (!m) return null;
  const at = Date.parse(m[1]);
  if (!Number.isFinite(at) || now - at > WEEK_MS) return null;
  const [, , state, rest] = m;
  if (state === 'started') return null;
  const when = new Date(at).toISOString().slice(0, 16).replace('T', ' ');
  if (state === 'done') {
    const n = Number(/lessons\+(\d+)/.exec(rest)?.[1] ?? 0);
    return `great_cto learner, last run ${when} UTC: ${n ? `added ${n} lesson${n === 1 ? '' : 's'} to .great_cto/lessons.md` : 'added no lesson'}.`;
  }
  const why = rest.replace(/\s*digest=\S+/, '').slice(0, 120);
  return `great_cto learner, last run ${when} UTC: ${state} — ${why}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (process.env.GREAT_CTO_DISABLE_LEARNER_REPORT !== '1') {
      const line = reportLine(process.cwd());
      if (line) process.stdout.write(JSON.stringify({ systemMessage: line }));
    }
  } catch { /* never block a session */ }
  process.exitCode = 0;
}
