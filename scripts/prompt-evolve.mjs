#!/usr/bin/env node
// scripts/prompt-evolve.mjs — Closed prompt-evolution loop (SIA Meta→Target→Feedback).
//
// Ports SIA's run_generation cycle to great_cto's agent-prompt subsystem:
//   continuous-learner (lesson) → ai-prompt-architect (candidate prompt, gen N+1)
//   → runner.mjs --split holdout → eval-gate → PROMOTE or REJECT → crystallize.
//
// This module owns the GENERATION LEDGER — the deterministic record that makes the
// loop auditable and feeds Phase 3 (evolutionary memory). The prompt rewrite itself
// is done by the ai-prompt-architect agent; this script records each generation and
// decides promote/reject from held-out eval results via the gate.
//
// Ledger: .great_cto/prompt-evolution/<agent>.jsonl  (one generation per line)
//
// Usage:
//   node scripts/prompt-evolve.mjs record \
//     --agent security-officer --gen 2 \
//     --prompt-file agents/security-officer.md \
//     --lesson "Reduce false positives on TODO comments" \
//     --baseline tests/eval/baseline.holdout.jsonl \
//     --candidate tests/eval/candidate.holdout.jsonl \
//     [--epsilon 0.0]
//   node scripts/prompt-evolve.mjs log --agent security-officer
//
// Exit: 0 = PROMOTE (recorded, verdict=promoted) | 1 = REJECT | 2 = bad input.

import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { evaluateGate, parseResultsJsonl } from './eval-gate.mjs';

export const LEDGER_ROOT = join(process.env.GREAT_CTO_HOME || join(homedir(), '.great_cto'), 'prompt-evolution');

/** sha256 of a prompt text — the generation's identity (matches ADR-PROMPT pinning). */
export function computePromptHash(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

/**
 * Build a generation record from a lesson, a candidate prompt, and the gate verdict.
 * Pure — no I/O. `gate` is the result of evaluateGate(baseline, candidate).
 */
export function buildGeneration({ agent, gen, promptHash, parentHash = null, lesson = '', gate, ts }) {
  const verdict = gate.pass ? 'promoted' : 'rejected';
  return {
    agent,
    gen,
    ts: ts || null, // stamped by caller (Date.* is fine outside this pure fn)
    promptHash,
    parentHash,
    lesson,
    verdict,
    gate: {
      pass: gate.pass,
      regressions: gate.regressions,
      belowThreshold: gate.belowThreshold,
      improvements: gate.improvements,
      summary: gate.summary,
    },
  };
}

export function ledgerPath(agent, root = LEDGER_ROOT) {
  return join(root, `${agent}.jsonl`);
}

/** Read all generation records for an agent (oldest → newest). */
export function readLedger(agent, root = LEDGER_ROOT) {
  const p = ledgerPath(agent, root);
  if (!existsSync(p)) return [];
  const out = [];
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip */ }
  }
  return out;
}

/** Append a generation record to the agent's ledger (creates dirs as needed). */
export function appendGeneration(record, root = LEDGER_ROOT) {
  mkdirSync(root, { recursive: true });
  appendFileSync(ledgerPath(record.agent, root), JSON.stringify(record) + '\n');
  return record;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { epsilon: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--agent') out.agent = argv[++i];
    else if (a === '--gen') out.gen = parseInt(argv[++i], 10);
    else if (a === '--prompt-file') out.promptFile = argv[++i];
    else if (a === '--parent-hash') out.parentHash = argv[++i];
    else if (a === '--lesson') out.lesson = argv[++i];
    else if (a === '--baseline') out.baseline = argv[++i];
    else if (a === '--candidate') out.candidate = argv[++i];
    else if (a === '--epsilon') out.epsilon = parseFloat(argv[++i]);
    else if (a === '--root') out.root = argv[++i];
  }
  return out;
}

function cmdRecord(args) {
  if (!args.agent || !args.promptFile || !args.baseline || !args.candidate) {
    console.error('Usage: prompt-evolve record --agent X --gen N --prompt-file F --lesson "..." --baseline b.jsonl --candidate c.jsonl');
    process.exit(2);
  }
  const root = args.root || LEDGER_ROOT;
  const promptText = readFileSync(args.promptFile, 'utf8');
  const promptHash = computePromptHash(promptText);
  const baseline = parseResultsJsonl(readFileSync(args.baseline, 'utf8'));
  const candidate = parseResultsJsonl(readFileSync(args.candidate, 'utf8'));
  const gate = evaluateGate(baseline, candidate, { epsilon: args.epsilon, split: 'holdout' });

  // parent = hash of the most recent promoted generation, unless overridden
  const prior = readLedger(args.agent, root).filter(g => g.verdict === 'promoted').pop();
  const parentHash = args.parentHash ?? (prior ? prior.promptHash : null);

  const record = buildGeneration({
    agent: args.agent,
    gen: Number.isFinite(args.gen) ? args.gen : readLedger(args.agent, root).length + 1,
    promptHash,
    parentHash,
    lesson: args.lesson || '',
    gate,
    ts: new Date().toISOString(),
  });
  appendGeneration(record, root);

  console.log(`gen ${record.gen} · ${args.agent} · ${record.verdict.toUpperCase()}`);
  console.log(`  ${gate.summary}`);
  console.log(`  prompt ${promptHash.slice(0, 12)}${parentHash ? ` (parent ${parentHash.slice(0, 12)})` : ''}`);
  if (record.verdict === 'promoted') {
    console.log('  → next: /crystallize propose to promote the lesson to global-patterns');
    process.exit(0);
  } else {
    console.log('  → REJECTED: prompt regresses on holdout. Do NOT ship. Revise and re-run.');
    process.exit(1);
  }
}

function cmdLog(args) {
  if (!args.agent) { console.error('Usage: prompt-evolve log --agent X'); process.exit(2); }
  const gens = readLedger(args.agent, args.root || LEDGER_ROOT);
  if (gens.length === 0) { console.log(`No generations recorded for ${args.agent}.`); return; }
  for (const g of gens) {
    const icon = g.verdict === 'promoted' ? '✓' : '✗';
    console.log(`${icon} gen ${g.gen} [${g.ts || '—'}] ${g.promptHash.slice(0, 12)} — ${g.lesson || '(no lesson)'}`);
    console.log(`    ${g.gate?.summary || g.verdict}`);
  }
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (cmd === 'record') return cmdRecord(args);
  if (cmd === 'log') return cmdLog(args);
  console.error('Usage: prompt-evolve <record|log> [flags]');
  process.exit(2);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
