#!/usr/bin/env node
/**
 * UserPromptSubmit hook — bill-shock protection for solo CTO.
 *
 * Reads two caps from ~/.great_cto/config.json:
 *   daily_max_usd          — hard ceiling on today's total LLM spend
 *   monthly_max_usd        — hard ceiling on this month's total LLM spend
 *   per_run_max_usd        — soft ceiling on a single pipeline (warning only)
 *   enforce                — "warn" (default) emits stderr only;
 *                          "block" exits 2 and prints a hard-stop msg
 *
 * Project-level cap in PROJECT.md (`cost-cap-usd-month: 500`) still works as
 * a per-project override.
 *
 * Hook protocol:
 *   stdin:  { prompt, session_id, ... }   (Claude Code UserPromptSubmit payload)
 *   stdout: nothing
 *   exit:   0 = proceed (with optional stderr warning)
 *           2 = block (only when enforce=block AND cap exceeded)
 *
 * Opt-outs:
 *   GREAT_CTO_DISABLE_COST_GUARD=1   silence everything
 *   GREAT_CTO_BUMP_CAP=10            one-shot bump today's cap by $10
 *
 * @see docs/HOOKS.md
 * @see docs/architecture/ADR-016-pay-what-you-want-cost-control.md (planned)
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ─── Cost estimates per operation ──────────────────────────────────────────
const ROUGH_COST_USD = {
  '/start':    { lo: 5,  hi: 15, est: 8  },
  '/audit':    { lo: 3,  hi: 10, est: 5  },
  'architect': { lo: 2,  hi: 6,  est: 3  },
  'security':  { lo: 1,  hi: 3,  est: 2  },
  'refactor':  { lo: 5,  hi: 25, est: 10 },
};

const EXPENSIVE_PATTERNS = [
  /\barchitect\s+(?:this|my|the)\b/i,
  /\bdesign\s+(?:the|a|an)\s+architecture\b/i,
  /\bfull\s+(?:audit|security\s+review|threat\s+model)\b/i,
  /(?:^|\s)\/start\b/,
  /(?:^|\s)\/audit\b/,
  /\brefactor\s+(?:the\s+)?(?:entire|whole)\b/i,
];

// ─── IO helpers ─────────────────────────────────────────────────────────────
function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

function extractPrompt(input) {
  try {
    const parsed = JSON.parse(input);
    return parsed.prompt || parsed.user_prompt || '';
  } catch { return ''; }
}

function matchOperation(prompt) {
  if (/\/start\b/.test(prompt))    return ['/start', '/start'];
  if (/\/audit\b/.test(prompt))    return ['/audit', '/audit'];
  if (/architect/i.test(prompt))   return ['architect', 'architect-level work'];
  if (/security|threat|audit/i.test(prompt)) return ['security', 'security audit'];
  if (/refactor/i.test(prompt))    return ['refactor', 'large refactor'];
  return null;
}

// ─── Config readers ────────────────────────────────────────────────────────
function readGlobalConfig() {
  try {
    const path = join(homedir(), '.great_cto', 'config.json');
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch { return {}; }
}

function readProjectCap() {
  try {
    const txt = readFileSync('.great_cto/PROJECT.md', 'utf8');
    const m = txt.match(/cost[-_]cap(?:[-_]usd[-_]month)?:\s*(\d+(?:\.\d+)?)/i);
    return m ? parseFloat(m[1]) : null;
  } catch { return null; }
}

// Parse cost-history.log entries. Returns { spentToday, spentMonth, spentAll }.
// Each line: "<iso-ts> agent=X feature=Y cost_usd=N ..."
function readCostHistory() {
  try {
    const txt = readFileSync('.great_cto/cost-history.log', 'utf8');
    const today = new Date().toISOString().slice(0, 10);          // YYYY-MM-DD
    const month = today.slice(0, 7);                              // YYYY-MM
    let spentToday = 0, spentMonth = 0, spentAll = 0;
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue;
      const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2})/);
      const costMatch = line.match(/cost[-_]?usd[=:]\s*(\d+(?:\.\d+)?)/i);
      if (!costMatch) continue;
      const cost = parseFloat(costMatch[1]);
      spentAll += cost;
      if (!tsMatch) continue;
      const date = tsMatch[1];
      if (date === today) spentToday += cost;
      if (date.startsWith(month)) spentMonth += cost;
    }
    return { spentToday, spentMonth, spentAll };
  } catch {
    return { spentToday: 0, spentMonth: 0, spentAll: 0 };
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────
function main() {
  if (process.env.GREAT_CTO_DISABLE_COST_GUARD === '1') return process.exit(0);

  const prompt = extractPrompt(readStdin());
  if (!prompt) return process.exit(0);

  const matched = EXPENSIVE_PATTERNS.some((re) => re.test(prompt));
  if (!matched) return process.exit(0);

  const op = matchOperation(prompt);
  if (!op) return process.exit(0);

  const [opKey, opLabel] = op;
  const cost = ROUGH_COST_USD[opKey] || { lo: 1, hi: 5, est: 2 };
  const config = readGlobalConfig();
  const projectCap = readProjectCap();   // per-project monthly cap (legacy)
  const { spentToday, spentMonth } = readCostHistory();

  // Resolve effective caps. Global config wins; project cap only fills gap.
  const dailyCap = config.daily_max_usd ?? null;
  const monthlyCap = config.monthly_max_usd ?? projectCap ?? null;
  const enforce = config.enforce ?? 'warn';   // 'warn' | 'block'

  // One-shot manual bump (e.g., dev exceeds cap intentionally for one run)
  const bump = parseFloat(process.env.GREAT_CTO_BUMP_CAP || '0') || 0;
  const effectiveDaily   = dailyCap   !== null ? dailyCap   + bump : null;
  const effectiveMonthly = monthlyCap !== null ? monthlyCap + bump : null;

  // Compute remaining + check overrun
  const dailyRemaining   = effectiveDaily   !== null ? effectiveDaily   - spentToday  : null;
  const monthlyRemaining = effectiveMonthly !== null ? effectiveMonthly - spentMonth  : null;

  const willExceedDaily   = dailyRemaining   !== null && cost.est > dailyRemaining;
  const willExceedMonthly = monthlyRemaining !== null && cost.est > monthlyRemaining;

  // ── Format informational message ──
  const lines = [`[great_cto:cost-guard] ${opLabel} ≈ $${cost.lo}–$${cost.hi} (est $${cost.est})`];

  if (effectiveDaily !== null) {
    const tag = willExceedDaily ? '⚠' : '✓';
    lines.push(`  ${tag} today:  $${spentToday.toFixed(2)} / $${effectiveDaily}  ($${dailyRemaining.toFixed(2)} left)`);
  }
  if (effectiveMonthly !== null) {
    const tag = willExceedMonthly ? '⚠' : '✓';
    lines.push(`  ${tag} month:  $${spentMonth.toFixed(2)} / $${effectiveMonthly}  ($${monthlyRemaining.toFixed(2)} left)`);
  }

  // ── Decide: proceed / warn / block ──
  const overrun = willExceedDaily || willExceedMonthly;

  if (overrun && enforce === 'block') {
    lines.push('');
    lines.push('  🛑 BLOCKED — this run would exceed your cap.');
    lines.push('     Options:');
    lines.push('       1. Run in cheap mode (routes routine triage to Kimi K2, ~−60% cost)');
    lines.push('       2. Bump cap once:   GREAT_CTO_BUMP_CAP=10 <retry your prompt>');
    lines.push('       3. Edit cap:        ~/.great_cto/config.json  daily_max_usd');
    lines.push('       4. Silence guard:   GREAT_CTO_DISABLE_COST_GUARD=1');
    process.stderr.write(lines.join('\n') + '\n');
    return process.exit(2);
  }

  if (overrun) {
    lines.push('  ⚠ may exceed cap — consider cheap mode or confirm before proceeding.');
  }

  // Silence guidance only when caps are configured (otherwise nag-free for new users)
  if (effectiveDaily === null && effectiveMonthly === null) {
    lines.push('  (no caps configured — set ~/.great_cto/config.json: { "daily_max_usd": 5 })');
  } else {
    lines.push('  (silence: GREAT_CTO_DISABLE_COST_GUARD=1)');
  }

  process.stderr.write(lines.join('\n') + '\n');
  return process.exit(0);
}

main();
