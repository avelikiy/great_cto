#!/usr/bin/env node
// turn-snapshot — the Stop / SubagentStop hook that records what the turn changed (ADR-023).
//
// Registered `async` in .claude-plugin/plugin.json (ADR-019): a snapshot costs about
// 300 ms on a real repository, and the turn must never wait on it. Retention runs in
// the same call — the newest 50 turns per session, and whole sessions whose newest
// turn is older than 14 days — so refs do not pile up in a project that runs for
// months.
//
// This hook cannot fail the turn it runs after: any input, any git state, it prints
// nothing and exits 0. GREAT_CTO_DISABLE_TURNS=1 turns it off.
//
//   stdin: { hook_event_name, session_id, cwd?, ... }

import { readFileSync } from 'node:fs';
import { snapshotTurn, pruneTurns, pruneStaleSessions } from '../lib/turn-snapshot.mjs';

export const KEEP_TURNS = 50;
export const MAX_AGE_DAYS = 14;

function main() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8') || '{}') || {}; } catch { return; }
  const session = typeof payload.session_id === 'string' ? payload.session_id : '';
  if (!session) return;
  const cwd = (typeof payload.cwd === 'string' && payload.cwd) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const r = snapshotTurn(cwd, { session });
  if (r.state !== 'recorded') return;
  pruneTurns(cwd, { session, keep: KEEP_TURNS });
  pruneStaleSessions(cwd, { maxAgeDays: MAX_AGE_DAYS });
}

try { main(); } catch { /* a snapshot is never worth a failed turn */ }
process.exit(0);
