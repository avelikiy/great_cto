import fs from 'fs';
import path from 'path';
import { GREAT_CTO_DIR } from './config.mjs';
import { datePlans } from './plan-date.mjs';
import { parseVerdictLine } from '../../../scripts/lib/verdict-record.mjs';


/**
 * Verdicts, plus an account of what could not be read.
 *
 * This function feeds metrics, cost, the pipeline strip, the inbox, resume and
 * agent statistics — six surfaces from one read. It returned `[]` on every kind
 * of failure, so an unreadable verdict directory arrived at all six as "this
 * project has not run anything", which is a different claim and a confident one.
 *
 * Three things can go wrong and each is now named rather than absorbed: a
 * directory that cannot be listed, a file that cannot be read, and a line that
 * does not parse. The last is not a failure of this reader — a half-written
 * append is normal — so it is counted and only reported when it is the reason a
 * project looks empty.
 */
function readVerdictsWithHealth(cwd = null) {
  const problems = [];
  let unreadableLines = 0;
  const verdicts = readVerdicts(cwd, { problems, onBadLine: () => { unreadableLines += 1; } });
  return {
    verdicts,
    unreadableLines,
    // Only a real read failure degrades. Unparseable lines beside readable ones
    // are noise; unparseable lines and NOTHING else is the project looking empty
    // for a reason worth saying out loud.
    unread: problems.length
      ? problems.join('; ')
      : (unreadableLines && !verdicts.length
        ? `${unreadableLines} verdict line(s) could not be parsed and none could` : null),
  };
}

function readVerdicts(cwd = null, health = null) {
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
  // This listing happens before the main loop, to decide whether a project has
  // any local verdicts at all — and it threw where the loop's own read is
  // guarded, so an unreadable directory crashed the caller instead of being
  // reported. Same failure, one line earlier.
  let useProjectDir = false;
  if (projectVerdictDir && fs.existsSync(projectVerdictDir)) {
    try {
      useProjectDir = fs.readdirSync(projectVerdictDir).filter(f => f.endsWith('.log')).length > 0;
    } catch (e) {
      health?.problems?.push(`verdicts could not be listed in ${projectVerdictDir}: ${e.code || e.message}`);
    }
  }
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
    let files;
    try {
      files = fs.readdirSync(verdictDir);
    } catch (e) {
      // A directory that exists and cannot be listed is the case that made a
      // project look like it had never run.
      health?.problems?.push(`verdicts could not be listed in ${verdictDir}: ${e.code || e.message}`);
      continue;
    }
    for (const file of files) {
    const agent = file.replace('.log', '');
    let lines;
    try {
      lines = fs.readFileSync(path.join(verdictDir, file), 'utf8').split('\n').filter(Boolean);
    } catch (e) {
      health?.problems?.push(`${file} could not be read: ${e.code || e.message}`);
      continue;
    }
    for (const line of lines) {
      const parsed = parseVerdictLine(line);
      if (!parsed.ok) { health?.onBadLine?.(); continue; }  // counted, never shown as a verdict

      // When reading global with a project filter, only include records for this
      // project. Read from the parsed record, not from a `project=` substring:
      // that tag only exists in the legacy text form, so matching on it would
      // have dropped every new NDJSON record from the global view.
      if (projectTagFilter && parsed.rec.project !== projectTagFilter) continue;
      // Format handling lives in scripts/lib/verdict-record.mjs: v1 NDJSON for
      // anything written from 2026-08 on, plus both legacy text dialects so the
      // history keeps reading.
      const { ts, verdict } = parsed.rec;
      results.push({
        ts,
        agent,
        verdict,
        cost_usd: parsed.rec.cost_usd ?? null,
        raw: line.replace(/\s*\bcost=\$?\d+\.?\d*\b/i, ''),
      });
    }
  }
  }  // end verdictDirs loop

  // Fallback: enrich verdicts that lack cost_usd from cost-history.log.
  // Format: "<ISO-ts> <agent> <cost_usd>" per line. Both scripts/log-verdict.sh
  // and the SubagentStop measured-cost hook write it PROJECT-LOCAL
  // (<cwd>/.great_cto/cost-history.log) — reading only the global ~/.great_cto
  // copy (as this did before) meant the enrichment never fired for real
  // projects. Read project-local first, global second. Match by ts (minute
  // precision) + agent to avoid double-counting.
  const histPaths = [
    cwd ? path.join(cwd, '.great_cto', 'cost-history.log') : null,
    path.join(GREAT_CTO_DIR, 'cost-history.log'),
  ].filter(Boolean);
  {
    const costByKey = new Map();
    for (const histPath of histPaths) {
      if (!fs.existsSync(histPath)) continue;
      const lines = fs.readFileSync(histPath, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        const m = line.match(/^(\S+)\s+(\S+)\s+(\d+\.?\d*)/);
        if (!m) continue;
        const key = `${m[1].slice(0, 16)}|${m[2]}`;  // minute + agent
        if (!costByKey.has(key)) costByKey.set(key, parseFloat(m[3])); // project wins
      }
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
  const planFiles = fs.readdirSync(plansDir).filter(f => f.endsWith('.md')).map(f => path.join(plansDir, f));
  // Dated from the plan itself — front-matter, then the filename, then the
  // commit that added it — rather than from mtime. mtime is a fact about the
  // filesystem: `git clone` stamps every plan with the clone time, which
  // collapsed thirteen dates into one and made this 30-day window return the
  // project's entire history. See plan-date.mjs for the measurement.
  const dated = datePlans(planFiles, { root: cwd, dir: 'docs/plans' });
  let fromMtime = 0;
  for (const fp of planFiles) {
    const d = dated.dates.get(fp);
    if (cutoff != null) {
      if (!d?.date) continue;                                   // undatable: not in any window
      if (Date.parse(`${d.date}T23:59:59Z`) < cutoff) continue;  // outside it
    }
    // Counted after the window test, so the figure describes the plans that
    // actually went into these totals rather than everything in the directory.
    if (d && !d.reliable) fromMtime += 1;
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
    // How many of these plans could only be dated by their file timestamp. A
    // figure assembled partly from filesystem metadata says so rather than
    // presenting itself as measured.
    dated_by_mtime: fromMtime,
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
    // One report is one outcome. Testing for each word separately counted a
    // report that says "initially BLOCKED, now APPROVED" as both an approval
    // and a block — the two counters summed to more than the number of reports,
    // and a resolved finding kept inflating the blocked count forever. The LAST
    // verdict word in the file is the one that stands.
    const last = [...content.matchAll(/\b(APPROVED|BLOCKED)\b/gi)].pop();
    if (!last) continue;
    if (last[1].toUpperCase() === 'APPROVED') approved++; else blocked++;
  }
  return { approved, blocked };
}

export { readVerdicts, readVerdictsWithHealth, readPlanCosts, readQAStats, readSecStats };
