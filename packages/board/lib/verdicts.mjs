import fs from 'fs';
import path from 'path';
import { GREAT_CTO_DIR } from './config.mjs';

function readVerdicts(cwd = null) {
  // Verdict attribution model:
  //   1. cwd given → read project-local <cwd>/.great_cto/verdicts/
  //      PLUS any global verdict line tagged `project=<slug>` matching cwd
  //   2. cwd absent (cron jobs, fleet view) → read ALL global verdicts
  //
  // Project slug resolution: PROJECT.md `slug:` field, else basename(cwd).
  let projectSlug = null;
  if (cwd) {
    try {
      const md = fs.readFileSync(path.join(cwd, '.great_cto', 'PROJECT.md'), 'utf8');
      const m = md.match(/^slug:\s*(.+)$/m);
      projectSlug = m ? m[1].trim() : path.basename(cwd);
    } catch { projectSlug = path.basename(cwd); }
  }
  // First read project-local verdicts when scoped
  const projectVerdictDir = cwd ? path.join(cwd, '.great_cto', 'verdicts') : null;
  const useProjectDir = projectVerdictDir
    && fs.existsSync(projectVerdictDir)
    && fs.readdirSync(projectVerdictDir).filter(f => f.endsWith('.log')).length > 0;
  // For cwd-scoped reads, we collect from BOTH local AND tagged global lines
  const verdictDirs = [];
  if (useProjectDir) verdictDirs.push(projectVerdictDir);
  if (!cwd) {
    // Unscoped: read everything global
    verdictDirs.push(path.join(GREAT_CTO_DIR, 'verdicts'));
  }
  const results = [];
  // For scoped reads, also iterate global and filter by project= tag
  const globalDir = path.join(GREAT_CTO_DIR, 'verdicts');
  if (cwd && projectSlug && fs.existsSync(globalDir)) {
    verdictDirs.push({ dir: globalDir, filterByProjectTag: projectSlug });
  }
  for (const entry of verdictDirs) {
    const verdictDir = typeof entry === 'string' ? entry : entry.dir;
    const projectTagFilter = typeof entry === 'string' ? null : entry.filterByProjectTag;
    if (!fs.existsSync(verdictDir)) continue;
    for (const file of fs.readdirSync(verdictDir)) {
    const agent = file.replace('.log', '');
    const lines = fs.readFileSync(path.join(verdictDir, file), 'utf8')
      .split('\n').filter(Boolean);
    for (const line of lines) {
      // When reading global with a project filter, only include lines tagged
      // with this project's slug.
      if (projectTagFilter) {
        const tagMatch = line.match(/\bproject=([^\s|]+)/);
        if (!tagMatch || tagMatch[1] !== projectTagFilter) continue;
      }
      // Two formats agents emit in the wild:
      //   space-separated:  "<ts> <verdict> <details> cost=$X"
      //   pipe-separated:   "<ts> | <agent> | <verdict> | <details> | cost=$X"
      // Pre-2026-05: parts[1] always took the 2nd whitespace token, which
      // for the pipe form is "|", breaking /api/pipeline status mapping
      // (verdicts displayed as "|" instead of APPROVED/DONE/BLOCKED).
      // Now we detect the pipe form and parse it differently.
      let ts, verdict;
      if (line.includes(' | ')) {
        const pipeParts = line.split('|').map(s => s.trim());
        ts = pipeParts[0].trim();
        // Pipe form: [ts, agent, verdict, details, cost]
        // Verdict is at index 2 (after ts and agent name).
        verdict = pipeParts[2] || '';
      } else {
        const parts = line.split(' ');
        ts = parts[0];
        verdict = parts[1] || '';
      }
      const costMatch = line.match(/\bcost=\$?(\d+\.?\d*)\b/i);
      results.push({
        ts,
        agent,
        verdict,
        cost_usd: costMatch ? parseFloat(costMatch[1]) : null,
        raw: line.replace(/\s*\bcost=\$?\d+\.?\d*\b/i, ''),
      });
    }
  }
  }  // end verdictDirs loop

  // Fallback: enrich verdicts that lack cost_usd from .great_cto/cost-history.log.
  // Format: "<ISO-ts> <agent> <cost_usd>" per line (written by scripts/log-verdict.sh).
  // Match by ts (minute precision) + agent to avoid double-counting.
  const histPath = path.join(GREAT_CTO_DIR, 'cost-history.log');
  if (fs.existsSync(histPath)) {
    const costByKey = new Map();
    const lines = fs.readFileSync(histPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      const m = line.match(/^(\S+)\s+(\S+)\s+(\d+\.?\d*)/);
      if (!m) continue;
      const key = `${m[1].slice(0, 16)}|${m[2]}`;  // minute + agent
      costByKey.set(key, parseFloat(m[3]));
    }
    for (const v of results) {
      if (v.cost_usd != null) continue;
      const key = `${(v.ts || '').slice(0, 16)}|${v.agent}`;
      if (costByKey.has(key)) v.cost_usd = costByKey.get(key);
    }
  }

  return results.sort((a, b) => a.ts.localeCompare(b.ts));
}

function readPlanCosts(cwd = process.cwd(), sinceMsAgo = null) {
  const plansDir = path.join(cwd, 'docs/plans');
  let totalLlmMin = 0, totalLlmUsd = 0, totalHumanUsd = 0, count = 0;
  if (!fs.existsSync(plansDir)) return { llm_usd: 0, human_usd: 0, savings_x: 0, count: 0 };
  const cutoff = sinceMsAgo != null ? Date.now() - sinceMsAgo : null;
  for (const file of fs.readdirSync(plansDir).filter(f => f.endsWith('.md'))) {
    const fp = path.join(plansDir, file);
    // Skip plans outside the requested time window (use file mtime, same as
    // getCostHistory — fixes BH-26 where readPlanCosts had no date filter and
    // included all-time plans while getCostHistory only looked at the window).
    if (cutoff != null && fs.statSync(fp).mtimeMs < cutoff) continue;
    const content = fs.readFileSync(fp, 'utf8');
    // Parse cost lines from PLAN-*.md.
    // Use the SAME anchored regex as getCostHistory() so both endpoints agree
    // on what constitutes a valid LLM/Human line. The old regex required a
    // range ("0.5 – $2.30") and silently returned 0 for single-value plans
    // ("LLM: ~$0.30"), causing /api/metrics to fall back to task-estimate and
    // show a different number than /api/cost (BH-26: metrics ≠ cost tile).
    const llmMatch   = content.match(/^[\s*_>\-]*LLM[^\n]*?\$(\d+\.?\d*)/im);
    const humanMatch = content.match(/^[\s*_>\-]*Human[^\n]*?\$(\d[\d,]*\.?\d*)/im);
    if (llmMatch) totalLlmUsd += parseFloat(llmMatch[1]);
    // BH-25: /g — replace() with a string only strips the FIRST comma, so
    // "$1,234,567" was silently truncated to 1234. getCostHistory at :413
    // already uses /,/g; this was the divergent twin.
    if (humanMatch) totalHumanUsd += parseFloat(humanMatch[1].replace(/,/g, ''));
    count++;
  }
  return {
    llm_usd: Math.round(totalLlmUsd * 100) / 100,
    human_usd: Math.round(totalHumanUsd),
    savings_x: totalLlmUsd > 0 ? Math.round(totalHumanUsd / totalLlmUsd) : 0,
    count,
  };
}

function readQAStats(cwd = process.cwd()) {
  const qaDir = path.join(cwd, 'docs/qa-reports');
  let passed = 0, failed = 0;
  if (!fs.existsSync(qaDir)) return { pass_rate: null, passed: 0, failed: 0 };
  for (const file of fs.readdirSync(qaDir).filter(f => f.endsWith('.md'))) {
    const content = fs.readFileSync(path.join(qaDir, file), 'utf8');
    // Accept any of:  "verdict: pass" / "**Verdict:** PASS" / "Status: PASSED" / "✅ pass" / "result: ✓"
    if (/(?:verdict|status|result)\s*[:=]?\s*[*_`]*\s*(?:✅|✓|pass(?:ed)?)/i.test(content)) passed++;
    else if (/(?:verdict|status|result)\s*[:=]?\s*[*_`]*\s*(?:❌|✗|fail(?:ed)?|block(?:ed)?)/i.test(content)) failed++;
  }
  const total = passed + failed;
  return { pass_rate: total ? Math.round((passed / total) * 100) : null, passed, failed };
}

function readSecStats(cwd = process.cwd()) {
  const secDir = path.join(cwd, 'docs/security');
  let approved = 0, blocked = 0;
  if (!fs.existsSync(secDir)) return { approved: 0, blocked: 0 };
  for (const file of fs.readdirSync(secDir).filter(f => f.endsWith('.md'))) {
    const content = fs.readFileSync(path.join(secDir, file), 'utf8');
    if (/APPROVED/i.test(content)) approved++;
    if (/BLOCKED/i.test(content)) blocked++;
  }
  return { approved, blocked };
}

export { readVerdicts, readPlanCosts, readQAStats, readSecStats };
