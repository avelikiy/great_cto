#!/usr/bin/env node
// tests/eval/review-catch/run.mjs — seeded-defect catch rate for a reviewer role.
//
// Two ways to get findings, one scorer (scripts/lib/review-catch.mjs):
//
//   Offline (free, what CI exercises):
//     node tests/eval/review-catch/run.mjs --role code-reviewer --findings replies.jsonl
//   Each JSONL row is {"case": "<id>", "reply": "<the reviewer's text>"} or
//   {"case": "<id>", "findings": [...]}. Use it to score a review you ran yourself —
//   for example the real subagent in Claude Code, given cases/<id>/diff.patch.
//
//   Live (costs money; an operator action, never CI):
//     ANTHROPIC_API_KEY=… node tests/eval/review-catch/run.mjs --role security-officer --live --out run.jsonl
//   One call per case: system = agents/<role>.md with shared fragments expanded (the
//   same resolution tests/eval/runner.mjs uses), user = reviewPrompt(). A one-shot proxy
//   of the agent, not the full harness with tools.
//
// Flags: --split tuning|holdout|all (default tuning) · --tolerance N (default 3) ·
//   --show-holdout (per-case lines on the holdout; off, because the improver sees the
//   number, never the failures — scripts/lib/prompt-gate.mjs) · --json
// Exit: 0 passed · 1 failed · 2 bad input · 3 inconclusive or not run.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadSet, casesFor, scoreRun, formatReport, extractFindings, reviewPrompt, REVIEW_ROLES, DEFAULT_TOLERANCE,
} from '../../../scripts/lib/review-catch.mjs';
import { PROOF } from '../../../scripts/lib/proof-status.mjs';
import { isMainModule } from '../../../scripts/lib/is-main.mjs';

const SET_DIR = dirname(fileURLToPath(import.meta.url));
const MAX_TOKENS = 4000;

export function parseArgs(argv) {
  const a = { split: 'tuning', tolerance: DEFAULT_TOLERANCE, live: false, json: false, showHoldout: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${k} needs a value`); return v; };
    if (k === '--role') a.role = val();
    else if (k === '--split') a.split = val();
    else if (k === '--findings') a.findings = val();
    else if (k === '--out') a.out = val();
    else if (k === '--set') a.set = val();
    else if (k === '--tolerance') a.tolerance = Number(val());
    else if (k === '--live') a.live = true;
    else if (k === '--json') a.json = true;
    else if (k === '--show-holdout') a.showHoldout = true;
    else throw new Error(`unknown flag ${k}`);
  }
  if (!REVIEW_ROLES.includes(a.role)) throw new Error(`--role must be one of ${REVIEW_ROLES.join(', ')}`);
  if (!['tuning', 'holdout', 'all'].includes(a.split)) throw new Error('--split must be tuning, holdout or all');
  if (!Number.isInteger(a.tolerance) || a.tolerance < 0) throw new Error('--tolerance must be a non-negative integer');
  if (Boolean(a.live) === Boolean(a.findings)) throw new Error('give exactly one of --findings FILE or --live');
  return a;
}

/** Rows of a findings file → Map(case id → findings | null). */
export function readFindingsFile(path) {
  const out = new Map();
  for (const [n, line] of readFileSync(path, 'utf8').split('\n').entries()) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { throw new Error(`${path}:${n + 1}: not JSON`); }
    const id = row.case ?? row.caseId;
    if (typeof id !== 'string') throw new Error(`${path}:${n + 1}: no "case"`);
    out.set(id, Array.isArray(row.findings) ? row.findings : extractFindings(row.reply));
  }
  return out;
}

async function runLive(cases, role, outPath) {
  // A live run spends money. CI must never do it by accident: the workflows run the
  // scorer's tests, and this refuses when CI is set unless the operator says otherwise.
  if (process.env.CI && process.env.GREAT_CTO_EVAL_LIVE_IN_CI !== '1') {
    throw new Error('refusing a live run under CI (set GREAT_CTO_EVAL_LIVE_IN_CI=1 to mean it)');
  }
  const { callLlm, modelFor, pickProvider, resolveActorSystem } = await import('../runner.mjs');
  if (!pickProvider().provider) throw new Error('no ANTHROPIC_API_KEY or OPENROUTER_API_KEY — a live run needs one');
  const { system, source } = resolveActorSystem({ agentName: role });
  if (source !== `agent:${role}`) throw new Error(`agents/${role}.md not found`);
  const model = modelFor('actor');
  process.stderr.write(`review-catch: live, ${cases.length} call(s) to ${model} as ${role}\n`);
  const outputs = new Map();
  const rows = [];
  for (const c of cases) {
    let reply = null, usage = null, error = null;
    try {
      ({ text: reply, usage } = await callLlm({ model, system, user: reviewPrompt(c, role), maxTokens: MAX_TOKENS }));
    } catch (e) { error = String(e.message || e).slice(0, 300); }
    const findings = reply === null ? null : extractFindings(reply);
    outputs.set(c.id, findings);
    rows.push({ case: c.id, role, model, reply, usage, error });
    process.stderr.write(`  ${c.id}: ${error ? `error — ${error}` : findings ? `${findings.length} finding(s)` : 'no findings block'}\n`);
  }
  if (outPath) writeFileSync(outPath, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return outputs;
}

export async function main(argv = process.argv.slice(2)) {
  let args, loaded;
  try {
    args = parseArgs(argv);
    loaded = loadSet(args.set || SET_DIR);
  } catch (e) {
    process.stderr.write(`review-catch: ${e.message}\n`);
    return 2;
  }
  const cases = casesFor(loaded, args.split);
  let outputs;
  try {
    outputs = args.live ? await runLive(cases, args.role, args.out) : readFindingsFile(args.findings);
  } catch (e) {
    process.stderr.write(`review-catch: ${e.message}\n`);
    return 2;
  }
  const report = scoreRun({ cases, outputs, role: args.role, thresholds: loaded.set.thresholds, tolerance: args.tolerance });
  const showCases = args.split === 'tuning' || args.showHoldout;
  if (args.json) {
    const shown = showCases ? report : { ...report, perCase: undefined };
    process.stdout.write(JSON.stringify({ split: args.split, ...shown }, null, 2) + '\n');
  } else {
    process.stdout.write(`${formatReport(report, { showCases })}\n`);
  }
  return report.status === PROOF.PASSED ? 0 : report.status === PROOF.FAILED ? 1 : 3;
}

if (isMainModule(import.meta.url)) {
  main().then((code) => { process.exitCode = code; });
}
