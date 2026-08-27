import fs from 'fs';
import path from 'path';
import os from 'os';
import { GREAT_CTO_DIR } from './config.mjs';
import { readFileSafe } from './util.mjs';
import { getTasks } from './beads.mjs';
import { readVerdicts, readSecStats } from './verdicts.mjs';
import { datePlans } from './plan-date.mjs';

// ── Memory: 4-layer file contents ─────────────────────────────────────────────
function getMemory(cwd = process.cwd()) {
  const home = os.homedir();
  const layers = [
    // Project-local (.great_cto/) — L1 archetype + L2 codebase + L3 retros
    { id: 'project',     scope: 'project', layer: 'L1', name: 'PROJECT.md',    desc: 'Archetype, size, compliance, owners',           path: path.join(cwd, '.great_cto', 'PROJECT.md') },
    { id: 'archetypes',  scope: 'project', layer: 'L1', name: 'ARCHETYPES.md', desc: 'Archetype catalogue used by /start + agents',   path: path.join(cwd, '.great_cto', 'ARCHETYPES.md') },
    { id: 'skill',       scope: 'project', layer: 'L1', name: 'SKILL.md',      desc: 'Pipeline skill — synced from plugin',           path: path.join(cwd, '.great_cto', 'SKILL.md') },
    { id: 'codebase',    scope: 'project', layer: 'L2', name: 'CODEBASE.md',   desc: 'God nodes, entry points, public API, routes',   path: path.join(cwd, '.great_cto', 'CODEBASE.md') },
    { id: 'brain',       scope: 'project', layer: 'L3', name: 'brain.md',      desc: 'Patterns in use, what failed, team patterns',   path: path.join(cwd, '.great_cto', 'brain.md') },
    { id: 'lessons',     scope: 'project', layer: 'L3', name: 'lessons.md',    desc: 'Per-project lessons (extracted by /learn)',     path: path.join(cwd, '.great_cto', 'lessons.md') },
    { id: 'handoff',     scope: 'project', layer: 'L3', name: 'HANDOFF.md',    desc: 'Auto-written on context compaction',            path: path.join(cwd, '.great_cto', 'HANDOFF.md') },
    { id: 'local',       scope: 'project', layer: 'L3', name: 'local.md',      desc: 'Project-local notes (gitignored)',              path: path.join(cwd, '.great_cto', 'local.md') },
    // Cross-project (~/.great_cto/) — L4 global memory shared across all projects
    { id: 'g-decisions', scope: 'global',  layer: 'L4', name: 'decisions.md',  desc: 'Append-only ADR log — every gate approval',     path: path.join(home, '.great_cto', 'decisions.md') },
    { id: 'g-prefs',     scope: 'global',  layer: 'L4', name: 'preferences.md',desc: 'User-level CTO preferences (style, defaults)',  path: path.join(home, '.great_cto', 'preferences.md') },
    { id: 'g-lessons',   scope: 'global',  layer: 'L4', name: 'lessons.md',    desc: 'Cross-project lessons promoted from L3',        path: path.join(home, '.great_cto', 'lessons.md') },
  ];
  const result = layers.map(l => ({
    ...l,
    content: readFileSafe(l.path),
    exists: fs.existsSync(l.path),
    size: fs.existsSync(l.path) ? fs.statSync(l.path).size : 0,
  }));

  // Cross-project global patterns (~/.great_cto/global-patterns/)
  const gpDir = path.join(GREAT_CTO_DIR, 'global-patterns');
  let patterns = [];
  if (fs.existsSync(gpDir)) {
    patterns = fs.readdirSync(gpDir)
      .filter(f => f.startsWith('GP-') && f.endsWith('.md'))
      .map(f => {
        const fp = path.join(gpDir, f);
        const content = readFileSafe(fp) || '';
        const titleMatch = content.match(/^#\s+(.+)$/m);
        return {
          id: f.replace(/\.md$/, ''),
          name: f,
          title: titleMatch ? titleMatch[1] : f,
          path: fp,
          size: fs.statSync(fp).size,
        };
      });
  }
  return { layers: result, patterns, cwd };
}

// ── Pipeline state ────────────────────────────────────────────────────────────
function getPipeline(cwd = process.cwd()) {
  const stages = ['product-owner', 'architect', 'pm', 'senior-dev', 'reviewers', 'qa-engineer', 'security-officer', 'devops', 'l3-support'];
  const verdicts = readVerdicts(cwd);
  const now = Date.now();
  const ACTIVE_WINDOW = 30 * 60 * 1000;  // 30 min

  // Map agents → most recent verdict
  const lastByAgent = {};
  for (const v of verdicts) {
    const a = (v.agent || '').toLowerCase();
    if (!lastByAgent[a] || lastByAgent[a].ts < v.ts) lastByAgent[a] = v;
  }

  // Tasks in_progress give us "active" agents
  const tasks = getTasks(cwd);
  const activeAgents = new Set(
    tasks.filter(t => t.status === 'in_progress').map(t => (t.agent || '').toLowerCase()).filter(Boolean)
  );

  const agentStages = stages.map(stage => {
    // agent log file naming convention: shortened agent name
    const aliases = {
      'product-owner': ['product-owner', 'product_owner', 'product-manager', 'po'],
      'architect': ['architect'],
      'pm': ['pm', 'product-manager', 'project-manager', 'planner'],
      'senior-dev': ['senior-dev', 'senior_dev', 'backend', 'frontend'],
      'reviewers': ['reviewer', 'review', 'code-reviewer'],
      'qa-engineer': ['qa-engineer', 'qa'],
      'security-officer': ['security-officer', 'security'],
      'devops': ['devops', 'ops'],
      'l3-support': ['l3-support', 'l3', 'support'],
    };
    const cands = aliases[stage] || [stage];
    let last = null;
    for (const c of cands) {
      if (lastByAgent[c] && (!last || last.ts < lastByAgent[c].ts)) last = lastByAgent[c];
    }
    const isActive = cands.some(c => activeAgents.has(c));
    const ageMs = last ? (now - new Date(last.ts).getTime()) : null;
    const recent = ageMs != null && ageMs < ACTIVE_WINDOW;
    let status = 'idle';
    if (isActive || (recent && (last?.verdict || '').toUpperCase() === 'DONE' === false && recent)) status = 'active';
    if (last && (last.verdict || '').toUpperCase().match(/BLOCKED|FAIL/)) status = 'failed';
    if (last && !isActive && (last.verdict || '').toUpperCase().match(/APPROVED|DONE|PASS/)) status = 'done';
    return {
      stage,
      status,
      verdict: last?.verdict || null,
      last_message: last ? (last.raw || '').slice(last.ts.length + 1).split(' ').slice(1).join(' ').slice(0, 80) : null,
      ts: last?.ts || null,
      age_min: ageMs != null ? Math.round(ageMs / 60000) : null,
    };
  });

  // ── Human gate ──────────────────────────────────────────────────────────
  // The product's whole premise: no irreversible action ships without a human
  // signature. Surface that checkpoint AS A STAGE in the pipeline, sitting just
  // before the irreversible steps (devops/ship). It lights up when a gate is
  // awaiting a human — so the operator always sees where the rails are.
  const openGates = tasks.filter(t => t.is_gate && t.status !== 'done' && t.status !== 'closed' && t.raw_status !== 'closed');
  const pending = openGates.length;
  const newestGate = openGates.reduce((acc, t) => {
    const ts = t.updated_at || t.created_at; return (!acc || (ts && ts > acc)) ? ts : acc;
  }, null);
  const gateAgeMs = newestGate ? (now - new Date(newestGate).getTime()) : null;
  const gateNode = {
    stage: 'human-gate',
    is_human_gate: true,
    status: pending > 0 ? 'active' : 'idle',
    pending,
    last_message: pending > 0
      ? `${pending} gate${pending > 1 ? 's' : ''} awaiting signature`
      : 'no gate pending',
    verdict: null,
    ts: newestGate,
    age_min: gateAgeMs != null ? Math.round(gateAgeMs / 60000) : null,
  };

  // Insert the gate immediately before the first irreversible stage (devops).
  const out = [];
  for (const s of agentStages) {
    if (s.stage === 'devops') out.push(gateNode);
    out.push(s);
  }
  if (!out.includes(gateNode)) out.push(gateNode); // fallback if devops absent
  return out;
}

// ── Cost history (daily LLM burn) ────────────────────────────────────────────
function getCostHistory(cwd = process.cwd(), days = 30) {
  // Build a map<dateISO, { llm, human, plans, verdictCost }>.
  // Inclusive window: `days=30` means [today-30 ... today] = 31 buckets.
  // Previous behaviour (days buckets only) created a one-day gap on the
  // far edge — tasks closed exactly on `today - days` fell out of the
  // history while still being valid "last 30 days" data per user expectation.
  const buckets = new Map();
  const now = Date.now();
  for (let i = 0; i <= days; i++) {
    const d = new Date(now - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    // `runs` was one field incremented in two places for two different things:
  // once per verdict that carried a cost, and once per closed task on a day that
  // happened to have no cost data. Its meaning therefore changed from day to day
  // depending on whether anything had been measured, and the two sums were
  // indistinguishable once added.
  //
  // Measured against the verdict logs on disk, it was wrong in BOTH directions —
  // +18 on one project over 90 days (closed tasks counted as agent runs) and −3
  // on two others (verdicts with no cost contributing nothing). Split into the
  // two facts, with `runs` kept as their sum so every existing reader keeps
  // working and no chart silently changes shape.
  buckets.set(key, { date: key, llm: 0, human: 0, plans: 0, runs: 0, agent_runs: 0, task_estimates: 0 });
  }

  // Plans: file mtime as date
  // Cost extraction from LLM-written plan docs is intentionally lenient about
  // shape — agents emit "LLM time: ~5 min · ~$0.30" as often as the old
  // "LLM cost: 5–10 min" range form. We match a $-amount near the word
  // "LLM" and another near "Human", and FIRE the sanity check below to
  // reject pathological pairs (the 7,638× regression — total_human present
  // but total_llm fell to zero because the LLM regex was too strict).
  // Whether a plan carried a cost at all, kept apart from what that cost was.
  //
  // The pair of regexes below reads a format nothing writes: measured across
  // this repository's 41 plans, ZERO carry an LLM figure at the start of a line
  // and one carries a Human figure — which the guard then subtracts back out. So
  // `total_human` was $0 on every window, beside a plan count in the dozens, and
  // read as "these plans cost nothing" rather than "no plan states a cost".
  //
  // There is no plan template to blame the plans for: the only template shipped
  // is GAP-WAVE-PLAN-template.yaml, so no cost line was ever specified. Counted
  // rather than parsed harder — the dollar figures that DO appear in plans are
  // prose ("10 × ~$0.15", "assert total < $5") and reading them as this plan's
  // cost would be inventing a number.
  let planCostParsed = 0, planCostAbsent = 0, planHumanSuppressed = 0;
  const plansDir = path.join(cwd, 'docs/plans');
  if (fs.existsSync(plansDir)) {
    const planFiles = fs.readdirSync(plansDir).filter(x => x.endsWith('.md')).map(x => path.join(plansDir, x));
    // The day a plan lands on is read from the plan, not from its mtime. The
    // twin of the same defect in readPlanCosts: on a fresh clone every file
    // carries the clone time, so the whole history stacked onto one bar of this
    // chart — today's — and every earlier day read as zero spend.
    const dated = datePlans(planFiles, { root: cwd, dir: 'docs/plans' });
    for (const fp of planFiles) {
      const dayKey = dated.dates.get(fp)?.date;
      if (!dayKey || !buckets.has(dayKey)) continue;
      const content = fs.readFileSync(fp, 'utf8');
      // Anchor LLM/Human at START of line (with optional markdown emphasis)
      // so we never mis-match cases like:
      //   "**Cost**: $0.50 LLM | $240 human"  ← would have grabbed $240 as LLM
      // The label MUST be the first non-emphasis token on the line. Examples
      // that correctly match:
      //   "**LLM**: $0.50–1.20"
      //   "LLM time: ~$0.30"
      //   "- **LLM cost:** $0.75 – $1.85"
      // Examples correctly skipped:
      //   "**Cost**: $0.50–1.20 LLM | $240–360 human" (LLM mid-line)
      //   "Savings = Human/LLM"                       (LLM mid-line)
      const llmMatch   = content.match(/^[\s*_>\-]*LLM[^\n]*?\$(\d+\.?\d*)/im);
      const humanMatch = content.match(/^[\s*_>\-]*Human[^\n]*?\$(\d[\d,]*\.?\d*)/im);
      const b = buckets.get(dayKey);
      if (llmMatch) b.llm += parseFloat(llmMatch[1]);
      if (humanMatch) b.human += parseFloat(humanMatch[1].replace(/,/g, ''));
      // SANITY GUARD: if Human matched but LLM regex missed, suppress Human
      // for THIS plan rather than emit an implausible ratio. This is the
      // production safety net for the 7,638× bug class.
      if (humanMatch && !llmMatch && b.human > 0) {
        // Reverse the suppression — drop the bogus single-sided Human entry.
        b.human -= parseFloat(humanMatch[1].replace(/,/g, ''));
        planHumanSuppressed += 1;
      }
      b.plans++;
      if (llmMatch || humanMatch) planCostParsed += 1; else planCostAbsent += 1;
    }
  }

  // hasRealCostData: true only when actual dollar figures exist — from plan
  // files with parseable $ amounts OR from verdicts with cost_usd tags.
  // A plan FILE existing (b.plans > 0) without a $ match does NOT count —
  // that was the original BH-26 bug: plans without $ data blocked task
  // estimates, causing /api/cost and /api/metrics to diverge.
  let hasRealCostData = false;
  for (const b of buckets.values()) { if (b.llm > 0) { hasRealCostData = true; break; } }

  // Verdicts: cost=$X tag (from ~/.great_cto/verdicts/)
  const verdicts = readVerdicts(cwd);
  // feature=X aggregation — answers "how much did stripe-webhook cost?"
  const featureMap = new Map(); // feature → { llm, runs }
  for (const v of verdicts) {
    const dayKey = (v.ts || '').slice(0, 10);
    if (!buckets.has(dayKey)) continue;
    const b = buckets.get(dayKey);
    // A run that was never priced is still a run.
    //
    // This began `if (v.cost_usd == null) continue`, so a verdict carrying no
    // cost contributed nothing at all — not even its own existence. Measured
    // against the logs: one project had four verdicts and reported ZERO agent
    // runs, because none of the four had been priced. "We do not know what it
    // cost" was being rendered as "it did not happen", which is the confusion
    // this codebase keeps having to unpick.
    //
    // Cost is added only when there is one; the run is counted either way.
    if (v.cost_usd != null) b.llm += v.cost_usd;
    b.agent_runs++;
    b.runs++;
    // Extract feature= tag from raw verdict line
    const featMatch = v.raw && v.raw.match(/\bfeature=([^\s|]+)/);
    if (featMatch) {
      const feat = featMatch[1];
      const f = featureMap.get(feat) || { llm: 0, runs: 0 };
      if (v.cost_usd != null) f.llm += v.cost_usd;
      f.runs++;
      featureMap.set(feat, f);
    }
  }

  // Human cost: ALWAYS compute as `closed_tasks_per_day × 4h × $150/hr`.
  // This is the industry-baseline per-feature estimate and is INDEPENDENT
  // of LLM cost source — so even when AI cost comes from real verdict data,
  // human comparison is meaningful. Fallback LLM estimate engages only when
  // no real cost data exists anywhere (verdicts or PLAN files).
  const HUMAN_PER_TASK_USD = 4 * 150;  // 4 hours × $150/hr
  const LLM_RATE_PER_HR   = parseFloat(process.env.GREATCTO_LLM_RATE_PER_HR || '0.30');
  const DEFAULT_TASK_MIN  = 30;
  try {
    const tasks = getTasks(cwd);
    for (const t of tasks) {
      if (!t.closed_at) continue;
      if (!t.agent) continue;
      const dayKey = new Date(t.closed_at).toISOString().slice(0, 10);
      if (!buckets.has(dayKey)) continue;
      const b = buckets.get(dayKey);
      b.human += HUMAN_PER_TASK_USD;
      // Add LLM estimate only for days that have no real cost data (plans or
      // verdicts). Using a per-bucket check rather than a global flag so that
      // days WITH plan/verdict data keep their real numbers while days without
      // still get an estimate — consistent with /api/metrics behaviour.
      if (b.llm === 0) {
        const mins = t.estimated_minutes || DEFAULT_TASK_MIN;
        b.llm += mins / 60 * LLM_RATE_PER_HR;
        // A closed task is not an agent run. It is counted, and counted
        // separately, so a caller asking "how many times did agents run" is not
        // handed a number that is partly something else.
        b.task_estimates++;
        b.runs++;
      }
    }
  } catch { /* getTasks failure is non-fatal */ }

  const series = Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
  let totalLlm = series.reduce((a, b) => a + b.llm, 0);
  let totalHuman = series.reduce((a, b) => a + b.human, 0);
  const totalPlans = series.reduce((a, b) => a + b.plans, 0);
  // Reported alongside the sum rather than instead of it: `total_runs` keeps its
  // meaning for every existing caller, and the two facts it was made of are now
  // separately answerable.
  const totalAgentRuns = series.reduce((a, b) => a + b.agent_runs, 0);
  const totalTaskEstimates = series.reduce((a, b) => a + b.task_estimates, 0);

  // SANITY GUARD — anti-7,638× regression. If ratio > 1000×, one of the
  // numbers is wrong. Almost always: total_llm collapsed to ~0 because plan
  // parsing missed the LLM value, while total_human matched a "$7,500 saved"
  // marketing line. Better to under-report than show an implausible 7,500×
  // savings on the dashboard. Caller can still see the raw `series`.
  if (totalLlm > 0 && totalHuman > 0 && totalPlans > 0 && (totalHuman / totalLlm) > 1000) {
    totalHuman = 0;
    for (const b of series) b.human = 0;
  }

  // Read budget from PROJECT.md (monthly-budget: $X)
  const projMd = readFileSafe(path.join(cwd, '.great_cto', 'PROJECT.md')) || '';
  const budgetMatch = projMd.match(/monthly[-_]budget:\s*\$?(\d[\d,]+)/i);
  const budget = budgetMatch ? parseFloat(budgetMatch[1].replace(/,/g, '')) : null;
  // Burn projection: assume same daily rate, project to 30-day month
  const dayRate = totalLlm / Math.max(1, days);
  const projectedMonthly = Math.round(dayRate * 30 * 100) / 100;
  return {
    days,
    series,
    total_llm: Math.round(totalLlm * 100) / 100,
    total_human: Math.round(totalHuman),
    total_plans: totalPlans,
    total_agent_runs: totalAgentRuns,
    total_task_estimates: totalTaskEstimates,
    // Three states, not a number and a silence: a plan that states a cost, a
    // plan that states none, and a plan whose Human figure was suppressed
    // because its LLM counterpart could not be read.
    plans_with_cost: planCostParsed,
    plans_without_cost: planCostAbsent,
    plans_human_suppressed: planHumanSuppressed,
    daily_avg: Math.round(dayRate * 100) / 100,
    projected_monthly: projectedMonthly,
    monthly_budget: budget,
    over_budget: budget != null && projectedMonthly > budget,
    // savings_x semantics:
    //   null  → cannot compute (no human estimate available — distinct from "no savings")
    //   0+    → real ratio, total_human / total_llm
    // Pre-fix this returned 0 in both cases, conflating "no human estimate"
    // with "human cost is identical to LLM cost" — misleading on dashboards.
    savings_x: (totalLlm > 0 && totalHuman > 0)
      ? Math.round(totalHuman / totalLlm)
      : null,
    // Top features by LLM spend — sorted desc, top 10
    by_feature: Array.from(featureMap.entries())
      .map(([feature, f]) => ({ feature, llm: Math.round(f.llm * 100) / 100, runs: f.runs }))
      .sort((a, b) => b.llm - a.llm)
      .slice(0, 10),
  };
}

// ── Inbox: what needs the user's decision right now ──────────────────────────
function getInbox(cwd = process.cwd()) {
  const tasks = getTasks(cwd);
  // Use raw_status here: mapStatus() rewrites status to 'gate' for any task with the
  // 'gate' label, regardless of bd-native state. Filtering on the mapped value would
  // leave closed/blocked gates in the inbox forever.
  const pendingGates = tasks.filter(t => t.is_gate && t.raw_status !== 'closed' && t.raw_status !== 'blocked');
  const blocked = tasks.filter(t => t.status === 'blocked');
  const p0 = tasks.filter(t => t.priority === 0 && t.status !== 'done' && t.status !== 'closed');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const stale = inProgress.filter(t => {
    if (!t.updated_at) return false;
    const ageH = (Date.now() - new Date(t.updated_at).getTime()) / 3600_000;
    return ageH > 48;
  });
  const sec = readSecStats(cwd);

  // One object, one section.
  //
  // These four filters overlap — a P0 that is also blocked matched two of them,
  // so it rendered as two rows and the nav badge (gates + p0 + blocked) counted
  // it twice. "Two things need you" when one thing does is a small lie that
  // costs real attention, and it is the same defect as any other count that
  // measures the query rather than the world.
  //
  // Each task lands in its strongest section only, strongest first: a gate is
  // waiting on a signature, a P0 is an emergency, blocked is a state, stale is
  // an observation. The other states it is in are kept on the row as `also`, so
  // deduplicating loses nothing — the row can still say "and it is blocked".
  const ORDER = [
    ['gate', pendingGates],
    ['p0', p0],
    ['blocked', blocked],
    ['stale', stale],
  ];
  const homeOf = new Map();      // task id → the section that owns it
  const alsoOf = new Map();      // task id → the other sections it matched
  for (const [name, list] of ORDER) {
    for (const t of list) {
      const id = t?.id ?? t?.title;
      if (id === undefined) continue;
      if (homeOf.has(id)) { alsoOf.set(id, [...(alsoOf.get(id) || []), name]); continue; }
      homeOf.set(id, name);
    }
  }
  const own = (name, list, limit) => list
    .filter((t) => homeOf.get(t?.id ?? t?.title) === name)
    .map((t) => ({ ...t, also: alsoOf.get(t?.id ?? t?.title) || [] }))
    .slice(0, limit);

  const ownedGates = own('gate', pendingGates, 20);
  const ownedP0 = own('p0', p0, 10);
  const ownedBlocked = own('blocked', blocked, 10);
  const ownedStale = own('stale', stale, 10);

  return {
    pending_gates: ownedGates,
    blocked: ownedBlocked,
    p0_open: ownedP0,
    stale_in_progress: ownedStale,
    security: { blocked: sec.blocked, approved: sec.approved },
    summary: {
      // Counts of distinct objects, so gates + p0 + blocked is a real total
      // rather than a sum over overlapping sets.
      gates: [...homeOf.values()].filter((s) => s === 'gate').length,
      blocked: [...homeOf.values()].filter((s) => s === 'blocked').length,
      p0: [...homeOf.values()].filter((s) => s === 'p0').length,
      stale: [...homeOf.values()].filter((s) => s === 'stale').length,
      // How many distinct things want attention at all — the number the nav
      // badge means, stated once here rather than re-derived by every caller
      // that might re-derive it wrongly.
      needs_you: [...homeOf.values()].filter((s) => s !== 'stale').length,
    },
  };
}

export { getMemory, getPipeline, getCostHistory, getInbox };
