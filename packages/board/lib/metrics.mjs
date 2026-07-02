import fs from 'fs';
import os from 'os';
import path from 'path';
import { sseClients, bdCache } from './state.mjs';
import { getTasks } from './beads.mjs';
// NOTE: readVerdicts / readPlanCosts / readQAStats / readSecStats have not
// been extracted from server.mjs yet at this point in the module split
// (they move to lib/verdicts.mjs in a later step). ESM supports this
// circular import because these are only invoked inside function bodies
// here, never at module-evaluation time. Once verdicts.mjs exists, this
// import is repointed there instead of server.mjs (done in that step).
import { readVerdicts, readPlanCosts, readQAStats, readSecStats } from '../server.mjs';

// ── Metrics ────────────────────────────────────────────────────────────────────
function getMetrics(cwd = process.cwd(), days = 30) {
  // `days` controls the window for cost/agents_cost and for "shipped in window".
  // Tasks shipped within the window are returned in `tasks.done_in_window`.
  // Full lifetime `tasks.done` is still returned for backwards compatibility.
  const tasks = getTasks(cwd);
  // BH-28: resolved gates (approve→closed, reject→blocked) get mapped to
  // status='done' by mapStatus(). Those are governance decisions, not shipped
  // features — counting them inflates velocity / tasks-shipped on the report.
  const done = tasks.filter(t => t.status === 'done' && !t.is_gate);
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const backlog = tasks.filter(t => t.status === 'backlog');

  // Velocity: features closed per week
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const doneThisWeek = done.filter(t => t.closed_at && (now - new Date(t.closed_at).getTime()) < week);
  const doneThisMonth = done.filter(t => t.closed_at && (now - new Date(t.closed_at).getTime()) < 30 * 24 * 60 * 60 * 1000);

  // Cycle time (median, last 30 days, cap individual cycles at 30 days).
  // Previously: arithmetic mean over ALL tasks ever, no cap — stuck tasks
  // (created months earlier, finally closed) pulled the average into the
  // tens of thousands of minutes. Median + 30d cap matches how the cost
  // tile bounds cycles ([server.mjs:816](server.mjs:816)).
  const cycleCap = 30 * 86400_000;
  const completionTimes = done
    .filter(t => t.created_at && t.closed_at && (now - new Date(t.closed_at).getTime()) < cycleCap)
    .map(t => new Date(t.closed_at).getTime() - new Date(t.created_at).getTime())
    .filter(ms => ms > 0 && ms < cycleCap)
    .sort((a, b) => a - b);
  const medianCompletionMs = completionTimes.length
    ? completionTimes[Math.floor(completionTimes.length / 2)]
    : 0;

  // Verdicts (global verdicts log lives in ~/.great_cto/verdicts/)
  const verdicts = readVerdicts(cwd);

  // Cost from plans (per-project) — filter to the same window as task/verdict
  // loops below so /api/metrics and /api/cost agree on the headline AI spend.
  const costData = readPlanCosts(cwd, days * 86400_000);

  // QA/Security (per-project)
  const qaStats = readQAStats(cwd);
  const secStats = readSecStats(cwd);

  // Agent utilization from verdicts.
  // Filter against canonical list of installed agents (~/.claude/agents/great_cto-*.md)
  // so a typo in a verdict line does not produce a phantom agent in the dashboard.
  //
  // Previously: non-canonical agents bucketed into `unknown` — which became
  // the TOP agent in production dashboards because legacy verdict log files
  // (backend.log, frontend.log, docs.log, ops.log, qa.log, security.log,
  // test-agent.log) from older great_cto versions were all aggregated there.
  // That hid real agent activity under a misleading label.
  //
  // Now: non-canonical agents are tracked separately (legacy_agent_runs)
  // and surfaced as a single summary count, NOT individually polluting the
  // agent-runs map. Users see honest specialist metrics + a cleanup hint.
  const canonicalAgents = getCanonicalAgents();
  const agentRuns = {};
  const legacyAgentRuns = {};
  for (const v of verdicts) {
    if (!v.agent) continue;
    if (canonicalAgents.has(v.agent)) {
      agentRuns[v.agent] = (agentRuns[v.agent] || 0) + 1;
    } else {
      legacyAgentRuns[v.agent] = (legacyAgentRuns[v.agent] || 0) + 1;
    }
  }
  const legacyAgentCount = Object.values(legacyAgentRuns).reduce((a, b) => a + b, 0);

  // Agent cost + time breakdown.
  //
  // Cost model derivation (LLM_RATE_PER_HR):
  //   Sonnet 4.6:  input $3/1M, output $15/1M.
  //     Typical agent task: ~30K in + 5K out → ~$0.165 per task.
  //     At 30 min/task → ~$0.33/hour.
  //   Haiku 4.5:   input $1/1M, output $5/1M.
  //     Same task shape → ~$0.055 → ~$0.11/hour.
  //   Mixed pipeline (architect Sonnet, qa Haiku, ...): ~$0.30/hour avg.
  //
  // Previous default of $0.02/hour produced an unbelievable 7500× ratio in
  // the UI. v2.5.9: realistic default $0.30/hour gives ~500× — still a
  // huge advantage, but defensible.
  //
  // Override via env var:
  //   GREATCTO_LLM_RATE_PER_HR=0.50   (e.g. all-Sonnet pipeline)
  //   GREATCTO_HUMAN_RATE_PER_HR=200  (e.g. SF senior engineer fully-loaded)
  //
  // When verdict logs contain real `cost=$X` tags, those override the
  // time-based estimate per agent (see "real cost overlay" loop below).
  const HUMAN_RATE_PER_HR = parseFloat(process.env.GREATCTO_HUMAN_RATE_PER_HR || '150');
  const LLM_RATE_PER_HR   = parseFloat(process.env.GREATCTO_LLM_RATE_PER_HR || '0.30');
  const DEFAULT_TASK_MIN  = 30;  // fallback when no timing data
  // Window: count only tasks closed in the last `days` (or still in progress).
  // Previously: lifetime — produced LLM-spend tile ($1749) wildly out of step
  // with the "Last 30 days" panel ($6.42) shown directly below it. Now both
  // sit on the same N-day window so the dashboard numbers reconcile.
  const costWindowMs = days * 86400_000;
  // AI active time per task: use estimated_minutes if set, else DEFAULT_TASK_MIN (30m).
  // We deliberately DO NOT use wall-clock (closed_at - created_at) because that
  // includes idle time — tasks that sit in backlog for days before being closed
  // in a single commit would inflate "AI time" to weeks/months. This is the only
  // honest model without per-agent-run timing data from verdicts.
  const agentCostMap = {};
  for (const t of tasks) {
    if (!t.agent) continue;
    // Only count completed tasks — in-progress tasks have no closed_at and
    // should not inflate the LLM cost estimate (they match the old
    //   `if (t.closed_at && outside_window) continue`  guard which
    // inadvertently passed through !closed_at tasks). Mirrors getCostHistory.
    if (!t.closed_at) continue;
    if ((now - new Date(t.closed_at).getTime()) > costWindowMs) continue;
    const mins = t.estimated_minutes || DEFAULT_TASK_MIN;
    const llmCost   = mins / 60 * LLM_RATE_PER_HR;
    const humanCost = mins / 60 * HUMAN_RATE_PER_HR;
    if (!agentCostMap[t.agent]) agentCostMap[t.agent] = { agent: t.agent, llm_usd: 0, human_usd: 0, time_min: 0, tasks_total: 0, tasks_done: 0, real_llm_usd: 0 };
    agentCostMap[t.agent].llm_usd   += llmCost;
    agentCostMap[t.agent].human_usd += humanCost;
    agentCostMap[t.agent].time_min  += mins;
    agentCostMap[t.agent].tasks_total += 1;
    if (t.status === 'done') agentCostMap[t.agent].tasks_done += 1;
  }
  // Real cost overlay — sum verdict cost=$X tags per agent. We expose this
  // as a separate field (`real_llm_usd`) for transparency, but DON'T
  // overwrite the time-based estimate. Reason: verdict data is often
  // synthetic test fixtures or partial (only some agents log cost), which
  // would distort the savings ratio with implausibly low numbers.
  //
  // Heuristic for trusted production verdicts (future): require >= 50%
  // of agent runs to have cost_usd, AND sum/time hourly rate >= $0.05/hr.
  // Until that's implemented, time-based estimate is the canonical number.
  // Window verdicts by timestamp — same window as agents_cost / tasks.
  // Without this, "AI spend" stayed at lifetime $93 even when period=7D
  // showed only 12 tasks worth ~$0.30 — making savings ratios nonsensical.
  for (const v of verdicts) {
    if (v.cost_usd == null) continue;
    if (!agentCostMap[v.agent]) continue;
    if (v.ts && (now - new Date(v.ts).getTime()) > costWindowMs) continue;
    agentCostMap[v.agent].real_llm_usd += v.cost_usd;
  }
  for (const a of Object.values(agentCostMap)) {
    a.cost_source = 'estimate';   // time-based is canonical
    if (a.real_llm_usd > 0) {
      a.real_llm_usd = Math.round(a.real_llm_usd * 10000) / 10000;
    } else {
      delete a.real_llm_usd;
    }
  }
  const agentsCost = Object.values(agentCostMap)
    .map(a => ({
      ...a,
      llm_usd:   Math.round(a.llm_usd   * 100) / 100,
      human_usd: Math.round(a.human_usd * 100) / 100,
      time_min:  Math.round(a.time_min),
    }))
    .sort((a, b) => b.time_min - a.time_min);

  // Cost source priority (v2.5.9 — flipped to put time-based estimate
  // before verdict-totals; verdict cost data is often synthetic test
  // fixtures or partial coverage, which produced unbelievable 25,000×
  // ratios in earlier versions):
  //
  //   1) PLAN-*.md files (real planned cost figures) — costData
  //   2) Task-based estimation (canonical — uses realistic $0.30/$150 rates)
  //   3) Verdict totals expose as `real_llm_usd` for transparency, NOT
  //      used as the headline number unless plans / tasks are absent
  const taskLlmTotal   = agentsCost.reduce((s, a) => s + a.llm_usd, 0);
  const taskHumanTotal = agentsCost.reduce((s, a) => s + a.human_usd, 0);
  // Filter verdicts to the same window for consistent total
  const verdictLlmTotal = verdicts.reduce((s, v) => {
    if (v.cost_usd == null) return s;
    if (v.ts && (now - new Date(v.ts).getTime()) > costWindowMs) return s;
    return s + v.cost_usd;
  }, 0);

  let cost;
  if (costData.llm_usd > 0 || costData.human_usd > 0) {
    cost = { ...costData, real_llm_usd: verdictLlmTotal > 0 ? Math.round(verdictLlmTotal * 10000) / 10000 : null };
  } else if (taskLlmTotal > 0) {
    // savings_x intentionally NULL for source='tasks': it would always equal
    // HUMAN_RATE_PER_HR / LLM_RATE_PER_HR (e.g. 500) because both legs share
    // the same task-minute base. That's the rate ratio, not measured savings —
    // putting it on a dashboard tile misleads. Only plans/verdicts have an
    // independent human number worth comparing.
    cost = {
      llm_usd:   Math.round(taskLlmTotal   * 100) / 100,
      human_usd: Math.round(taskHumanTotal),
      savings_x: null,
      rate_ratio: Math.round(HUMAN_RATE_PER_HR / LLM_RATE_PER_HR),
      window_days: 30,
      count:     0,
      source:    'tasks',
      real_llm_usd: verdictLlmTotal > 0 ? Math.round(verdictLlmTotal * 10000) / 10000 : null,
    };
  } else if (verdictLlmTotal > 0) {
    // Last-resort: no tasks, only verdict data. Pair with a token human
    // baseline (verdict count × DEFAULT_TASK_MIN × $150/hr) so the ratio
    // stays meaningful.
    const verdictHuman = verdicts.length * (30 / 60) * HUMAN_RATE_PER_HR;
    cost = {
      llm_usd:   Math.round(verdictLlmTotal * 100) / 100,
      human_usd: Math.round(verdictHuman),
      savings_x: Math.round(verdictHuman / verdictLlmTotal),
      count:     verdicts.filter(v => v.cost_usd != null).length,
      source:    'verdicts',
      real_llm_usd: Math.round(verdictLlmTotal * 10000) / 10000,
    };
  } else {
    cost = { llm_usd: 0, human_usd: 0, savings_x: 0, count: 0, source: 'none', real_llm_usd: null };
  }

  // Count tasks completed in selected window (for period-scoped reports)
  const doneInWindow = done.filter(t => t.closed_at && (now - new Date(t.closed_at).getTime()) <= costWindowMs);

  return {
    window_days: days,
    tasks: {
      total: tasks.length,
      done: done.length,
      done_in_window: doneInWindow.length,
      in_progress: inProgress.length,
      backlog: backlog.length,
    },
    // BH-22 fix: these are ROLLING windows (last 7 days, last 30 days from
    // 'now') — not calendar week/month. Old keys this_week/this_month are
    // kept for backward compat but the canonical names are last_7d/last_30d.
    velocity: {
      last_7d: doneThisWeek.length,
      last_30d: doneThisMonth.length,
      this_week: doneThisWeek.length,    // alias, deprecated — remove in v3.0
      this_month: doneThisMonth.length,  // alias, deprecated — remove in v3.0
    },
    avg_completion_min: Math.round(medianCompletionMs / 60000),
    cycle_time_stat: 'median_30d',
    cost,
    qa: qaStats,
    security: secStats,
    agents: agentRuns,
    agents_cost: agentsCost,
    legacy_agent_runs: legacyAgentRuns,
    legacy_agent_count: legacyAgentCount,
    verdicts: verdicts.slice(-20),
    recent_done: done.slice(-10).reverse(),
    // Observability counters (BH-13, 2026-05-15): surface internal queues
    // so users + monitoring can spot leaks / runaway state.
    server: {
      sse_clients: sseClients.size,
      bd_cache_entries: bdCache.size,
    },
  };
}

// Canonical list of installed agents from ~/.claude/agents/great_cto-*.md.
// Cached with a 30s TTL to avoid stat'ing on every metrics request.
let _canonicalAgentsCache = { agents: null, ts: 0 };
function getCanonicalAgents() {
  const now = Date.now();
  if (_canonicalAgentsCache.agents && now - _canonicalAgentsCache.ts < 30_000) {
    return _canonicalAgentsCache.agents;
  }
  const agentsDir = path.join(os.homedir(), '.claude', 'agents');
  const set = new Set();
  try {
    for (const f of fs.readdirSync(agentsDir)) {
      if (f.startsWith('great_cto-') && f.endsWith('.md')) {
        set.add(f.replace(/^great_cto-/, '').replace(/\.md$/, ''));
      }
    }
  } catch { /* dir missing — empty set is fine */ }
  _canonicalAgentsCache = { agents: set, ts: now };
  return set;
}

export { getMetrics, getCanonicalAgents };
