import fs from 'fs';
import path from 'path';
import os from 'os';
import { GREAT_CTO_DIR } from './config.mjs';
import { readFileSafe } from './util.mjs';
import { log } from './log.mjs';
import { readVerdicts } from './verdicts.mjs';

// ── Agent fleet view (DESIGN-agents-fleet-view §3) ─────────────────────────
//
// Single source of truth for the /agents tab. Composes:
//   • canonical agent files at ~/.claude/agents/great_cto-*.md
//   • verdict log at ~/.great_cto/verdicts/<agent>.log
//   • retire sidecar at ~/.claude/agents/great_cto-<slug>.md.retired
//
// Domain taxonomy is slug-keyword based (founder Q#3 — picked: derived, not
// frontmatter, to avoid pipeline-wide migration). Founder may flip to
// frontmatter-driven later — encapsulated in this function only.

const AGENTS_DIR = path.join(os.homedir(), '.claude', 'agents');

function deriveDomain(slug) {
  const s = slug.toLowerCase();
  if (/architect|adr|design|prompt/.test(s)) return 'arch';
  if (/security|sec-|threat|pci|gdpr|hipaa/.test(s)) return 'security';
  if (/qa|test|eval|review/.test(s)) return 'qa';
  if (/devops|deploy|infra|l3|support|oncall/.test(s)) return 'ops';
  if (/reviewer$/.test(s)) return 'domain';
  if (/pm|plan|product/.test(s)) return 'pm';
  if (/learn|memory|continuous/.test(s)) return 'memory';
  return 'other';
}

// Founder Q#5 — picked: baked-in regex set (start small, expand later).
const FAILURE_PATTERNS = [
  { key: 'rate-limit',          re: /rate[ -]?limit|HTTP 429|too many requests/i },
  { key: 'precondition',        re: /BLOCKED:.*no\s+(ARCH|PLAN|PROJECT)/i },
  { key: 'timeout',             re: /timeout|timed out|exceeded.*window/i },
  { key: 'parse-fail',          re: /JSON\.parse|invalid_json|parse.*fail/i },
  { key: 'spawn-fail',          re: /spawn(Sync)?\b.*ENOENT|command not found/i },
];

function clusterFailureModes(verdicts) {
  const counts = new Map();
  for (const v of verdicts) {
    const text = v.raw || '';
    for (const p of FAILURE_PATTERNS) {
      if (p.re.test(text)) {
        const entry = counts.get(p.key) || { key: p.key, count: 0, last_seen: null };
        entry.count += 1;
        if (!entry.last_seen || v.ts > entry.last_seen) entry.last_seen = v.ts;
        counts.set(p.key, entry);
        break;
      }
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

function isRetired(slug) {
  return fs.existsSync(path.join(AGENTS_DIR, `great_cto-${slug}.md.retired`));
}

// Verdict status mapping — agents emit a mix of vocabularies:
//   APPROVED / OK / DONE / PASS → success
//   BLOCKED / FAIL / FAILED / REJECTED → failure
//   anything else → neutral
function isSuccess(verdict) {
  return /^(APPROVED|OK|DONE|PASS|PASSED)$/i.test(verdict || '');
}
function isFailure(verdict) {
  return /^(BLOCKED|FAIL|FAILED|REJECTED)$/i.test(verdict || '');
}

function getAgentsFleet(projectCwd) {
  const agents = [];
  let files = [];
  try {
    files = fs.readdirSync(AGENTS_DIR)
      .filter(f => f.startsWith('great_cto-') && f.endsWith('.md'))
      .sort();
  } catch { /* dir missing → empty fleet */ }

  const verdicts = readVerdicts(projectCwd);
  const now = Date.now();
  const day30Ms = 30 * 86400_000;
  const day7Ms = 7 * 86400_000;

  // Group verdicts by agent for one pass.
  const byAgent = new Map();
  for (const v of verdicts) {
    if (!v.agent) continue;
    if (!byAgent.has(v.agent)) byAgent.set(v.agent, []);
    byAgent.get(v.agent).push(v);
  }

  // Fleet metrics from getMetrics agents_cost (estimate-based).
  // Currently project-scoped; for fleet view we want global, so recompute
  // a quick aggregate. Time-based estimate using same rates as getMetrics.
  const HUMAN_RATE_PER_HR = parseFloat(process.env.GREATCTO_HUMAN_RATE_PER_HR || '150');
  const LLM_RATE_PER_HR   = parseFloat(process.env.GREATCTO_LLM_RATE_PER_HR || '0.30');
  const DEFAULT_TASK_MIN  = 30;

  for (const f of files) {
    const slug = f.replace(/^great_cto-/, '').replace(/\.md$/, '');
    const fp = path.join(AGENTS_DIR, f);
    const raw = readFileSafe(fp) || '';
    const descM = raw.match(/^description:\s*"?([^"\n]+)"?/m);
    const modelM = raw.match(/^model:\s*(\S+)/m);
    const colorM = raw.match(/^color:\s*(\S+)/m);

    const vs = byAgent.get(slug) || [];
    const vs30d = vs.filter(v => v.ts && (now - new Date(v.ts).getTime()) < day30Ms);
    const vs7d  = vs.filter(v => v.ts && (now - new Date(v.ts).getTime()) < day7Ms);

    const okCount30d   = vs30d.filter(v => isSuccess(v.verdict)).length;
    const failCount30d = vs30d.filter(v => isFailure(v.verdict)).length;
    const failCount7d  = vs7d.filter(v => isFailure(v.verdict)).length;
    const decided = okCount30d + failCount30d;
    const successRate = decided > 0 ? Math.round((okCount30d / decided) * 100) : null;

    const lastRun = vs[0]?.ts || null;  // verdicts already sorted by readVerdicts caller? if not, scan:
    let lastRunActual = null;
    for (const v of vs) {
      if (v.ts && (!lastRunActual || v.ts > lastRunActual)) lastRunActual = v.ts;
    }

    // Estimated cost — DEFAULT_TASK_MIN per verdict (no real timing data here).
    const estLlmUsd   = (vs30d.length * DEFAULT_TASK_MIN / 60) * LLM_RATE_PER_HR;
    const estHumanUsd = (vs30d.length * DEFAULT_TASK_MIN / 60) * HUMAN_RATE_PER_HR;
    const savingsX = estLlmUsd > 0 ? Math.round(estHumanUsd / estLlmUsd) : null;
    const realLlmUsd = vs30d.reduce((s, v) => s + (v.cost_usd || 0), 0);

    // Health classification.
    let health = 'ok';
    if (vs.length === 0) health = 'unused';
    else if (!lastRunActual || (now - new Date(lastRunActual).getTime()) > day30Ms) health = 'idle';
    if (failCount7d >= 3) health = 'failing';

    agents.push({
      slug,
      description: descM?.[1]?.trim() || '',
      model: modelM?.[1]?.trim() || 'sonnet',
      color: colorM?.[1]?.trim() || null,
      domain: deriveDomain(slug),
      runs_total: vs.length,
      runs_30d: vs30d.length,
      runs_7d: vs7d.length,
      fail_30d: failCount30d,
      fail_7d: failCount7d,
      ok_30d: okCount30d,
      success_rate: successRate,
      last_run: lastRunActual,
      llm_usd_30d_est: Math.round(estLlmUsd * 100) / 100,
      human_usd_30d_est: Math.round(estHumanUsd),
      llm_usd_30d_real: realLlmUsd > 0 ? Math.round(realLlmUsd * 100) / 100 : null,
      savings_x: savingsX,
      health,
      retired: isRetired(slug),
    });
  }

  // Summary tiles.
  const total = agents.length;
  const active30d = agents.filter(a => a.runs_30d > 0 && !a.retired).length;
  const retireCandidates = agents.filter(a => a.runs_30d === 0 && !a.retired).length;
  const failing = agents.filter(a => a.health === 'failing' && !a.retired).length;
  const totalLlm30d = agents.reduce((s, a) => s + (a.llm_usd_30d_est || 0), 0);

  return {
    agents,
    total,
    summary: {
      installed: total,
      active_30d: active30d,
      retire_candidates: retireCandidates,
      failing_7d: failing,
      llm_usd_30d: Math.round(totalLlm30d * 100) / 100,
    },
  };
}

function getAgentProfile(slug) {
  const fp = path.join(AGENTS_DIR, `great_cto-${slug}.md`);
  if (!fs.existsSync(fp)) return null;

  const raw = readFileSafe(fp) || '';
  const descM = raw.match(/^description:\s*"?([^"\n]+)"?/m);
  const modelM = raw.match(/^model:\s*(\S+)/m);
  const colorM = raw.match(/^color:\s*(\S+)/m);
  const appliesM = raw.match(/^applies_to:\s*\[([^\]]+)\]/m);
  const applies_to = appliesM
    ? appliesM[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean)
    : [];
  // tools: either an inline CSV (`tools: Read, Bash, Grep`) or a YAML list.
  const toolsM = raw.match(/^tools:\s*(.+)$/m);
  let tools = [];
  if (toolsM && toolsM[1].trim() && !toolsM[1].trim().startsWith('#')) {
    tools = toolsM[1].split(',').map(s => s.trim()).filter(Boolean)
      .map(t => /^Bash\(/.test(t) ? 'Bash' : t);   // collapse Bash(...) allowlist to one chip
    tools = [...new Set(tools)];
  } else {
    const listM = raw.match(/^tools:\s*\n((?:\s*-\s*.+\n?)+)/m);
    if (listM) tools = listM[1].split('\n').map(l => (l.match(/^\s*-\s*(.+)$/) || [])[1]).filter(Boolean).map(s => s.trim());
  }
  // skills: a YAML list under `skills:`. Stop before the closing `---` frontmatter delimiter
  // (otherwise `---` parses as a bogus `--` entry).
  const skills = [];
  const skillsM = raw.match(/^skills:\s*\n((?:[ \t]*-[ \t]*.+\n?)+)/m);
  if (skillsM) for (const line of skillsM[1].split('\n')) { const v = (line.match(/^[ \t]*-[ \t]*(.+)$/) || [])[1]; const t = v && v.trim(); if (t && !/^-+$/.test(t)) skills.push(t); }

  const verdicts = readVerdicts();
  const all = verdicts.filter(v => v.agent === slug);
  const now = Date.now();
  const day30Ms = 30 * 86400_000;
  const day7Ms = 7 * 86400_000;
  const vs30d = all.filter(v => v.ts && (now - new Date(v.ts).getTime()) < day30Ms);

  const okCount30d   = vs30d.filter(v => isSuccess(v.verdict)).length;
  const failCount30d = vs30d.filter(v => isFailure(v.verdict)).length;
  const failCount7d  = all.filter(v => v.ts
    && (now - new Date(v.ts).getTime()) < day7Ms
    && isFailure(v.verdict)).length;
  const decided = okCount30d + failCount30d;

  let lastRun = null;
  for (const v of all) {
    if (v.ts && (!lastRun || v.ts > lastRun)) lastRun = v.ts;
  }

  const HUMAN_RATE_PER_HR = parseFloat(process.env.GREATCTO_HUMAN_RATE_PER_HR || '150');
  const LLM_RATE_PER_HR   = parseFloat(process.env.GREATCTO_LLM_RATE_PER_HR || '0.30');
  const DEFAULT_TASK_MIN  = 30;
  const estLlmUsd   = (vs30d.length * DEFAULT_TASK_MIN / 60) * LLM_RATE_PER_HR;
  const estHumanUsd = (vs30d.length * DEFAULT_TASK_MIN / 60) * HUMAN_RATE_PER_HR;
  const realLlmUsd = vs30d.reduce((s, v) => s + (v.cost_usd || 0), 0);

  // Recent runs — last 20, newest first.
  const recent = [...all]
    .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
    .slice(0, 20)
    .map(v => ({
      ts: v.ts,
      verdict: v.verdict,
      cost_usd: v.cost_usd,
      raw: (v.raw || '').slice(0, 200),
    }));

  // Failure modes — regex-cluster verdicts that look like failures.
  const failures = all.filter(v => isFailure(v.verdict));
  const failure_modes = clusterFailureModes(failures);

  let health = 'ok';
  if (all.length === 0) health = 'unused';
  else if (!lastRun || (now - new Date(lastRun).getTime()) > day30Ms) health = 'idle';
  if (failCount7d >= 3) health = 'failing';

  return {
    slug,
    description: descM?.[1]?.trim() || '',
    model: modelM?.[1]?.trim() || 'sonnet',
    color: colorM?.[1]?.trim() || null,
    applies_to,
    tools,
    skills,
    domain: deriveDomain(slug),
    health,
    retired: isRetired(slug),
    runs_total: all.length,
    runs_30d: vs30d.length,
    ok_30d: okCount30d,
    fail_30d: failCount30d,
    success_rate: decided > 0 ? Math.round((okCount30d / decided) * 100) : null,
    last_run: lastRun,
    llm_usd_30d_est: Math.round(estLlmUsd * 100) / 100,
    human_usd_30d_est: Math.round(estHumanUsd),
    llm_usd_30d_real: realLlmUsd > 0 ? Math.round(realLlmUsd * 100) / 100 : null,
    savings_x: estLlmUsd > 0 ? Math.round(estHumanUsd / estLlmUsd) : null,
    recent_runs: recent,
    failure_modes,
    file_path: fp,
  };
}

function retireAgent(slug) {
  const fp = path.join(AGENTS_DIR, `great_cto-${slug}.md`);
  if (!fs.existsSync(fp)) return { ok: false, error: 'agent_not_found' };
  const marker = `${fp}.retired`;
  fs.writeFileSync(marker, new Date().toISOString() + '\n');
  return { ok: true, slug, retired_at: new Date().toISOString() };
}

function restoreAgent(slug) {
  const fp = path.join(AGENTS_DIR, `great_cto-${slug}.md`);
  if (!fs.existsSync(fp)) return { ok: false, error: 'agent_not_found' };
  const marker = `${fp}.retired`;
  if (fs.existsSync(marker)) fs.unlinkSync(marker);
  return { ok: true, slug, restored_at: new Date().toISOString() };
}

// ── decisions.md (per-project ADR log) ─────────────────────────────────────
// Append-only architectural decisions log. Triggered on gate approve/reject.
// One line per decision; pure markdown so users can `cat` / `grep` / view in
// their editor without tooling.
//
// SCOPED PER PROJECT (ADR-008). A gate title carries the project's own words —
// feature names, client names, internal slugs — so writing it to a file under
// ~/.great_cto made it readable by agents working on *every other* project.
// That is a real cross-tenant bleed, and it fired: a private client name reached
// the global log via this exact path. New writes always go project-local; the
// legacy global file is read-only history and is never appended to again.
function decisionsLogPath(cwd) {
  return cwd
    ? path.join(cwd, '.great_cto', 'decisions.md')
    : path.join(GREAT_CTO_DIR, 'decisions.md');
}

function appendDecisionLog({ ts, project, action, id, title, reason, cwd }) {
  // No project scope → refuse rather than fall back to the global file. Losing
  // one log line is strictly better than leaking a project's vocabulary into
  // every other project's agent context.
  if (!cwd) {
    log.warn('[decisions] skipped: no project cwd — refusing to write the global log');
    return;
  }
  const file = decisionsLogPath(cwd);
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch {}
  // Initialize header if file doesn't exist
  if (!fs.existsSync(file)) {
    const header =
`# great_cto — decisions log

Append-only architectural decisions for THIS project. One line per
gate approve/reject. Agents and humans can grep this for "have we decided
this before?" lookups.

Format: \`- [TIMESTAMP] [PROJECT] [APPROVED|REJECTED] gate-id — title — reason\`

`;
    fs.writeFileSync(file, header);
  }
  const verdict = action === 'approve' ? 'APPROVED' : 'REJECTED';
  // " — " is the field separator, so it must not survive inside a field. Gate
  // titles are literally shaped `gate:plan — decompose X`, which used to make the
  // reader split the title in half and mislabel its tail as the reason. Demote
  // any in-field separator to a plain hyphen and the separator stays unique.
  const clean = (s) => (s || '').replace(/\n/g, ' ').replace(/\s+—\s+/g, ' - ');
  const safeTitle = clean(title).slice(0, 120);
  const safeReason = clean(reason).slice(0, 200);
  const line = `- [${ts}] [${project}] [${verdict}] ${id} — ${safeTitle}${safeReason ? ` — ${safeReason}` : ''}\n`;
  fs.appendFileSync(file, line);
}

// Reads are scoped the same way writes are: project X's board shows project X's
// decisions. The legacy global file is deliberately NOT merged in — surfacing it
// everywhere is the bleed this change removes.
function readDecisionsLog(limit = 20, cwd) {
  const file = decisionsLogPath(cwd);
  if (!fs.existsSync(file)) return [];
  try {
    const text = fs.readFileSync(file, 'utf-8');
    const lines = text.split('\n').filter(l => l.startsWith('- ['));
    // Newest last → reverse and take last `limit`
    return lines.slice(-limit).reverse().map(line => {
      // Parse: - [TS] [PROJECT] [VERDICT] id — title — reason
      const m = line.match(/^- \[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] ([^\s]+)\s+—\s+(.+?)(?:\s+—\s+(.+))?$/);
      if (!m) return null;
      return { ts: m[1], project: m[2], verdict: m[3], id: m[4], title: m[5], reason: m[6] || '' };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

export {
  deriveDomain,
  clusterFailureModes,
  isRetired,
  isSuccess,
  isFailure,
  getAgentsFleet,
  getAgentProfile,
  retireAgent,
  restoreAgent,
  decisionsLogPath,
  appendDecisionLog,
  readDecisionsLog,
};
