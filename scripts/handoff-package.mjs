#!/usr/bin/env node
// handoff-package.mjs — when an agent stops (budget hit, attempt limit, spec
// objection, blocked), emit ONE reviewable evidence bundle for the human instead
// of a bare status flip.
//
// The clean-up-agents shift: a stopped agent should hand over a verified,
// minimal package — the diff, what was run and how it came out, the attempt
// history, what it cost, and why it stopped — not silently mark itself blocked
// and leave the human to reconstruct all of that. great_cto already had every
// input on disk (agent-writes.log, cost-history.log, verdict logs, git); nothing
// assembled them. This does, reading only local files — no new tracking, no ADR.
//
// Usage:
//   node scripts/handoff-package.mjs <reason> <feature-slug> [--json]
//     reason: blocked | spec-objection | cost-cap | attempt-limit | time-cap
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Assemble the handoff markdown from already-gathered, structured inputs.
 * Pure — no fs, no git — so the shape is testable without a repo.
 * @returns {string} markdown
 */
export function buildHandoff({
  reason, feature, at,
  changedFiles = [], diffStat = '',
  tests = null,           // { ran:bool, passed, total, failed } | null
  verdicts = [],          // [{ ts, agent, verdict, note }]
  costUsd = null, costState = 'absent', attempts = null,
}) {
  const L = [];
  L.push(`# HANDOFF — ${feature || '(unknown feature)'}`);
  L.push('');
  L.push(`**Stopped:** ${reason || 'unspecified'}${at ? ` · ${at}` : ''}`);
  L.push(`**Why a human is needed:** the agent reached a stop condition and is handing over a reviewable package rather than continuing to spend against it.`);
  L.push('');

  L.push('## Changed files');
  if (changedFiles.length) {
    for (const f of changedFiles) L.push(`- \`${f}\``);
    if (diffStat.trim()) { L.push(''); L.push('```'); L.push(diffStat.trim()); L.push('```'); }
  } else {
    L.push('_No file changes recorded — the stop happened before any write, or nothing was committed to the working tree._');
  }
  L.push('');

  L.push('## What ran, and how it came out');
  if (tests && tests.ran) {
    const fail = tests.failed ?? 0;
    L.push(`- Tests: **${tests.passed ?? (tests.total - fail)}/${tests.total}** passing${fail ? ` (${fail} failing)` : ''}.`);
  } else if (tests && !tests.ran) {
    L.push(`- Tests: **not measured** (${tests.reason || 'suite did not report'}) — treat correctness as unverified.`);
  } else {
    L.push('- Tests: no run captured for this attempt.');
  }
  L.push('');

  L.push('## Attempt history');
  if (verdicts.length) {
    for (const v of verdicts.slice(-12)) {
      L.push(`- \`${v.ts || '?'}\` **${v.agent || '?'}** → ${v.verdict || '?'}${v.note ? ` — ${String(v.note).slice(0, 120)}` : ''}`);
    }
  } else {
    L.push('_No verdicts recorded for this feature yet._');
  }
  if (typeof attempts === 'number') L.push(`\nSelf-fix attempts before stopping: **${attempts}**.`);
  L.push('');

  L.push('## Spend');
  if (costUsd != null) {
    L.push(`- Spent on this project so far: **$${Number(costUsd).toFixed(2)}** (API-equivalent, from cost-history). `
      + 'The log records spend per agent, not per feature, so this is the project total.');
  } else if (costState === 'unreadable') {
    L.push('- Cost: `.great_cto/cost-history.log` is present but no line in it could be read as a cost. '
      + 'That is a broken writer, not a project that spent nothing.');
  } else {
    L.push('- Cost: not recorded — there is no `.great_cto/cost-history.log`.');
  }
  L.push('');

  L.push('## For the reviewer');
  L.push('1. Read the diff above against the acceptance criteria in the IMPL-BRIEF / ARCH.');
  L.push('2. Decide: approve as-is, request a narrower change, or re-scope with pm.');
  L.push('3. The agent will NOT proceed until a human resolves the stop — this is a handoff, not a failure to hide.');
  L.push('');
  return L.join('\n');
}

// ── gathering (side effects) ────────────────────────────────────────────────

function sh(cmd, args) { try { return spawnSync(cmd, args, { encoding: 'utf8' }); } catch { return { status: 1, stdout: '', stderr: '' }; } }

function readLines(p) { try { return existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean) : []; } catch { return []; } }

/** Verdict lines for a feature across .great_cto/verdicts/*.log. */
function gatherVerdicts(cwd, feature) {
  const dir = join(cwd, '.great_cto', 'verdicts');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.log'))) {
    for (const line of readLines(join(dir, f))) {
      if (feature && !line.includes(feature)) continue;
      const parts = line.split('|').map((s) => s.trim());
      if (parts.length >= 3) out.push({ ts: parts[0], agent: parts[1], verdict: parts[2], note: parts.slice(3).join(' | ') });
    }
  }
  return out.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}

/**
 * What this project has spent, from cost-history.log.
 *
 * This matched `cost_usd=([0-9.]+)`. The file has been
 * `<ts> <agent> <usd> [turns=N]` for its whole life, so the pattern matched zero
 * lines — here and in the global log — and every handoff package ever written
 * said "Cost: not recorded". That is a different statement from "I could not
 * read this file", and it is the one a reader believes.
 *
 * Three states, named rather than collapsed: `measured` with a figure, `absent`
 * when there is no file, `unreadable` when the file is there and yields nothing.
 *
 * Rows tagged `turns=` are the SESSION's running total, not one run's cost, so
 * they count by their increment — see sumCostHistory in scripts/bench-collect.mjs
 * for the same rule and the 23x over-count that made it necessary.
 *
 * No feature filter: the file records a timestamp, an agent and an amount, and
 * nothing about which feature the spend belongs to. Filtering on a substring
 * that is never present returned nothing and looked like a feature that cost
 * nothing. The figure is the PROJECT's, and it says so.
 *
 * @returns {{ state: 'measured'|'absent'|'unreadable', usd: number|null }}
 */
export function gatherCost(cwd) {
  const path = join(cwd, '.great_cto', 'cost-history.log');
  if (!existsSync(path)) return { state: 'absent', usd: null };

  let sum = 0, rows = 0;
  const running = new Map();
  for (const line of readLines(path)) {
    const parts = line.trim().split(/\s+/);
    const usd = Number(parts[2]);
    if (parts.length < 3 || !Number.isFinite(usd)) continue;
    rows++;
    if (!parts.slice(3).some((p) => p.startsWith('turns='))) { sum += usd; continue; }
    const prev = running.get(parts[1]);
    sum += prev === undefined || usd < prev ? usd : usd - prev;
    running.set(parts[1], usd);
  }
  if (!rows) return { state: 'unreadable', usd: null };
  return { state: 'measured', usd: Math.round(sum * 100) / 100 };
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const [reason, feature] = argv.filter((a) => !a.startsWith('--'));
  if (!reason) { console.error('usage: handoff-package.mjs <reason> <feature-slug> [--json]'); process.exit(2); }
  const cwd = process.cwd();

  const diff = sh('git', ['diff', '--stat']);
  const names = sh('git', ['diff', '--name-only']);
  const changedFiles = (names.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);

  const pkg = {
    reason, feature, at: new Date().toISOString(),
    changedFiles, diffStat: diff.stdout || '',
    tests: null,
    verdicts: gatherVerdicts(cwd, feature),
    // gatherCost returns a state now, not a bare number: `measured` carries a
    // figure, `absent` and `unreadable` do not and must not be rendered as one.
    ...(({ state, usd }) => ({ costUsd: usd, costState: state }))(gatherCost(cwd)),
  };

  const md = buildHandoff(pkg);
  const outDir = join(cwd, '.great_cto', 'handoffs');
  try { mkdirSync(outDir, { recursive: true }); } catch { /* ignore */ }
  const stamp = pkg.at.replace(/[:.]/g, '-');
  const outPath = join(outDir, `HANDOFF-${feature || 'task'}-${stamp}.md`);
  try { writeFileSync(outPath, md); } catch { /* ignore */ }

  if (asJson) process.stdout.write(JSON.stringify({ ...pkg, path: outPath }, null, 2) + '\n');
  else { process.stdout.write(md + '\n'); console.error(`\n[handoff] written → ${outPath}`); }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
