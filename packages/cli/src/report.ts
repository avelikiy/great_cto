// great-cto report — shareable cost / agents / compliance reports.
//
// Three report types, two output formats (HTML self-contained, JSON):
//
//   great-cto report cost --period 30d --format html > cost.html
//   great-cto report agents --since-last-release --format json
//   great-cto report compliance --archetype fintech --format html
//
// HTML output is fully self-contained (no external CSS/JS) so it can be
// emailed to a CFO, attached to a PR, or hosted as a GitHub Pages artifact.
// JSON is for downstream automation.
//
// Data sources:
//   cost          → ~/.great_cto/verdicts/*.log (LLM cost ledger) +
//                   .great_cto/PROJECT.md (monthly-budget) +
//                   bd tasks (closed_at-created_at timing)
//   agents        → ~/.great_cto/verdicts/*.log + plugin agents/*.md
//   compliance    → .great_cto/PROJECT.md (compliance gates) +
//                   docs/security/CSO-*.md + docs/qa-reports/QA-*.md +
//                   gates closed via bd

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

export type ReportType = "cost" | "agents" | "compliance";
export type ReportFormat = "html" | "json";

export interface ReportArgs {
  type: ReportType;
  format: ReportFormat;
  period: string;       // "30d" / "7d" / "90d" / "all"
  archetype: string | null;
  cwd: string;
}

interface VerdictRow {
  ts: string;
  agent: string;
  verdict: string;
  cost_usd: number | null;
}

// ── Data collectors ────────────────────────────────────────────────────────

function readAllVerdicts(): VerdictRow[] {
  const dir = join(homedir(), ".great_cto", "verdicts");
  if (!existsSync(dir)) return [];
  const out: VerdictRow[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".log")) continue;
    const agent = f.replace(/\.log$/, "");
    const lines = readFileSync(join(dir, f), "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      const ts = line.split(/\s+/)[0] ?? "";
      const verdict = line.split(/\s+/)[1] ?? "";
      const costMatch = line.match(/\bcost(?:_usd)?[=:]?\s*\$?(\d+\.?\d*)/i);
      out.push({
        ts, agent, verdict,
        cost_usd: costMatch ? parseFloat(costMatch[1]!) : null,
      });
    }
  }
  return out.sort((a, b) => a.ts.localeCompare(b.ts));
}

function periodToCutoff(period: string): string {
  const m = period.match(/^(\d+)d$/);
  if (!m) return "";
  const days = parseInt(m[1]!, 10);
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// ── Cost report ────────────────────────────────────────────────────────────

function buildCostReport(args: ReportArgs): any {
  const cutoff = periodToCutoff(args.period);
  const verdicts = readAllVerdicts().filter(v => v.ts >= cutoff);

  const HUMAN_RATE_PER_HR = 150;
  const LLM_RATE_PER_HR = 0.02;
  const RATIO = HUMAN_RATE_PER_HR / LLM_RATE_PER_HR;

  // Per-agent aggregation
  const byAgent = new Map<string, { llm: number; runs: number }>();
  let totalLlm = 0;
  for (const v of verdicts) {
    const cost = v.cost_usd ?? 0;
    totalLlm += cost;
    const cur = byAgent.get(v.agent) ?? { llm: 0, runs: 0 };
    cur.llm += cost;
    cur.runs += 1;
    byAgent.set(v.agent, cur);
  }

  // Day-level series for chart
  const byDay = new Map<string, number>();
  for (const v of verdicts) {
    const day = v.ts.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + (v.cost_usd ?? 0));
  }
  const series = Array.from(byDay.entries())
    .map(([date, llm]) => ({ date, llm }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Read budget
  const projectMd = join(args.cwd, ".great_cto", "PROJECT.md");
  const budgetMatch = existsSync(projectMd)
    ? readFileSync(projectMd, "utf8").match(/monthly[-_]budget:\s*\$?(\d[\d,]+)/i)
    : null;
  const budget = budgetMatch ? parseFloat(budgetMatch[1]!.replace(/,/g, "")) : null;

  const totalHuman = totalLlm * RATIO;
  return {
    type: "cost",
    period: args.period,
    generated_at: new Date().toISOString(),
    summary: {
      total_llm_usd: +totalLlm.toFixed(4),
      total_human_equivalent_usd: +totalHuman.toFixed(2),
      savings_x: Math.round(RATIO),
      savings_usd: +(totalHuman - totalLlm).toFixed(2),
      runs: verdicts.length,
      monthly_budget: budget,
      pct_of_budget: budget ? +((totalLlm / budget) * 100).toFixed(1) : null,
    },
    by_agent: Array.from(byAgent.entries())
      .map(([agent, { llm, runs }]) => ({
        agent,
        llm_usd: +llm.toFixed(4),
        human_equivalent_usd: +(llm * RATIO).toFixed(2),
        runs,
      }))
      .sort((a, b) => b.llm_usd - a.llm_usd),
    series,
  };
}

// ── Agents report ──────────────────────────────────────────────────────────

function buildAgentsReport(args: ReportArgs): any {
  const cutoff = periodToCutoff(args.period);
  const verdicts = readAllVerdicts().filter(v => v.ts >= cutoff);

  const byAgent = new Map<string, { runs: number; ok: number; fail: number; lastTs: string; cost: number }>();
  for (const v of verdicts) {
    const cur = byAgent.get(v.agent) ?? { runs: 0, ok: 0, fail: 0, lastTs: "", cost: 0 };
    cur.runs += 1;
    const u = (v.verdict || "").toUpperCase();
    if (["OK", "APPROVED", "DONE", "PASS", "PASSED"].includes(u)) cur.ok += 1;
    else if (["FAIL", "FAILED", "BLOCKED", "REJECTED"].includes(u)) cur.fail += 1;
    if (v.ts > cur.lastTs) cur.lastTs = v.ts;
    cur.cost += v.cost_usd ?? 0;
    byAgent.set(v.agent, cur);
  }

  return {
    type: "agents",
    period: args.period,
    generated_at: new Date().toISOString(),
    summary: {
      total_agents: byAgent.size,
      total_runs: verdicts.length,
      total_cost_usd: +Array.from(byAgent.values()).reduce((s, a) => s + a.cost, 0).toFixed(4),
    },
    agents: Array.from(byAgent.entries())
      .map(([name, m]) => ({
        agent: name,
        runs: m.runs,
        ok: m.ok,
        fail: m.fail,
        success_rate: m.runs ? +((m.ok / m.runs) * 100).toFixed(1) : null,
        cost_usd: +m.cost.toFixed(4),
        last_seen: m.lastTs,
      }))
      .sort((a, b) => b.runs - a.runs),
  };
}

// ── Compliance report ──────────────────────────────────────────────────────

function buildComplianceReport(args: ReportArgs): any {
  const projectMd = join(args.cwd, ".great_cto", "PROJECT.md");
  const meta = existsSync(projectMd) ? readFileSync(projectMd, "utf8") : "";
  const declaredArchetype = (meta.match(/^primary:\s*(\S+)/m)?.[1] ?? "unknown").trim();
  const archetype = args.archetype ?? declaredArchetype;
  const compliance = (meta.match(/^compliance:\s*(.+)$/m)?.[1] ?? "")
    .split(/[,\s]+/).map(s => s.trim()).filter(Boolean);

  // Count gates from docs/security and docs/qa-reports
  const securityDir = join(args.cwd, "docs", "security");
  const qaDir = join(args.cwd, "docs", "qa-reports");

  let secApproved = 0, secBlocked = 0, secTotal = 0;
  if (existsSync(securityDir)) {
    for (const f of readdirSync(securityDir).filter(x => x.endsWith(".md"))) {
      secTotal += 1;
      const text = readFileSync(join(securityDir, f), "utf8");
      if (/APPROVED/i.test(text)) secApproved += 1;
      if (/BLOCKED/i.test(text)) secBlocked += 1;
    }
  }
  let qaPass = 0, qaFail = 0, qaTotal = 0;
  if (existsSync(qaDir)) {
    for (const f of readdirSync(qaDir).filter(x => x.endsWith(".md"))) {
      qaTotal += 1;
      const text = readFileSync(join(qaDir, f), "utf8");
      if (/(?:verdict|status|result)\s*[:=]?\s*[*_`]*\s*(?:✅|✓|pass(?:ed)?)/i.test(text)) qaPass += 1;
      else if (/(?:verdict|status|result)\s*[:=]?\s*[*_`]*\s*(?:❌|✗|fail|block)/i.test(text)) qaFail += 1;
    }
  }

  return {
    type: "compliance",
    archetype,
    generated_at: new Date().toISOString(),
    declared_compliance: compliance,
    security_gates: { total: secTotal, approved: secApproved, blocked: secBlocked },
    qa_reports: { total: qaTotal, passed: qaPass, failed: qaFail,
      pass_rate: qaTotal ? +((qaPass / qaTotal) * 100).toFixed(1) : null },
  };
}

// ── HTML rendering ─────────────────────────────────────────────────────────

const HTML_STYLE = `
:root { color-scheme: light dark; }
body { font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 960px; margin: 32px auto; padding: 0 24px; color: #111; background: #fafafa; }
@media (prefers-color-scheme: dark) { body { background: #0d0e10; color: #d6d6d6; } }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin: 28px 0 8px; }
.meta { color: #888; margin-bottom: 24px; font-size: 12px; }
.tile-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
.tile { background: #fff; border: 1px solid #eee; border-radius: 8px; padding: 14px 16px; }
@media (prefers-color-scheme: dark) { .tile { background: #1a1c1f; border-color: #2a2c30; } }
.tile-num { font-size: 26px; font-weight: 600; }
.tile-lbl { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; }
.tile-sub { font-size: 12px; color: #666; margin-top: 4px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #eee; }
@media (prefers-color-scheme: dark) { th, td { border-color: #2a2c30; } }
th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; font-weight: 500; }
td.num { font-variant-numeric: tabular-nums; text-align: right; }
.bar { height: 6px; background: #eee; border-radius: 99px; overflow: hidden; min-width: 60px; }
@media (prefers-color-scheme: dark) { .bar { background: #2a2c30; } }
.bar > span { display: block; height: 100%; background: #16a34a; min-width: 2px; }
.footer { color: #999; font-size: 11px; margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; }
@media (prefers-color-scheme: dark) { .footer { border-color: #2a2c30; } }
.svg-chart { background: #fff; border: 1px solid #eee; border-radius: 8px; padding: 14px; margin: 8px 0 24px; }
@media (prefers-color-scheme: dark) { .svg-chart { background: #1a1c1f; border-color: #2a2c30; } }
`;

function fmtMoney(n: number): string {
  return "$" + Math.round(n).toLocaleString().replace(/,/g, " ");
}

function renderCostHtml(report: any): string {
  const s = report.summary;
  const series = report.series as { date: string; llm: number }[];
  const maxLlm = Math.max(...series.map(p => p.llm), 0.001);

  const chartH = 120;
  const chartW = 800;
  const padL = 40, padR = 12, padB = 24, padT = 8;
  const usableW = chartW - padL - padR;
  const usableH = chartH - padT - padB;
  const bars = series.map((p, i) => {
    const barW = Math.max(2, usableW / Math.max(series.length, 1) - 2);
    const x = padL + i * (usableW / Math.max(series.length, 1));
    const h = (p.llm / maxLlm) * usableH;
    const y = padT + (usableH - h);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="#16a34a" />`;
  }).join("");

  const chartSvg = `
<svg class="svg-chart" viewBox="0 0 ${chartW} ${chartH}" width="100%" preserveAspectRatio="none">
  <line x1="${padL}" y1="${padT + usableH}" x2="${chartW - padR}" y2="${padT + usableH}" stroke="#999" stroke-width="0.5" />
  ${bars}
  <text x="${padL}" y="${chartH - 4}" font-family="ui-monospace" font-size="9" fill="#888">${series[0]?.date ?? ""}</text>
  <text x="${chartW - padR}" y="${chartH - 4}" font-family="ui-monospace" font-size="9" fill="#888" text-anchor="end">${series[series.length - 1]?.date ?? ""}</text>
  <text x="${padL - 6}" y="${padT + 8}" font-family="ui-monospace" font-size="9" fill="#888" text-anchor="end">${fmtMoney(maxLlm)}</text>
  <text x="${padL - 6}" y="${chartH - padB + 4}" font-family="ui-monospace" font-size="9" fill="#888" text-anchor="end">$0</text>
</svg>`;

  const agentRows = (report.by_agent as any[]).map(a => `
    <tr>
      <td>${escapeHtml(a.agent)}</td>
      <td class="num">${a.runs}</td>
      <td class="num">${fmtMoney(a.llm_usd)}</td>
      <td class="num">${fmtMoney(a.human_equivalent_usd)}</td>
      <td><span class="bar"><span style="width:${(a.llm_usd / Math.max(report.by_agent[0]?.llm_usd || 1, 0.0001) * 100).toFixed(1)}%"></span></span></td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>great-cto cost report — ${escapeHtml(report.period)}</title>
<style>${HTML_STYLE}</style>
</head>
<body>
<h1>Cost report — last ${escapeHtml(report.period)}</h1>
<div class="meta">Generated ${escapeHtml(report.generated_at)} · ${s.runs} agent run(s) · period: ${escapeHtml(report.period)}</div>

<div class="tile-row">
  <div class="tile"><div class="tile-num">${fmtMoney(s.total_llm_usd)}</div><div class="tile-lbl">LLM spend</div></div>
  <div class="tile"><div class="tile-num">${fmtMoney(s.total_human_equivalent_usd)}</div><div class="tile-lbl">vs human team</div></div>
  <div class="tile"><div class="tile-num">${s.savings_x}×</div><div class="tile-lbl">cost ratio</div><div class="tile-sub">saved ${fmtMoney(s.savings_usd)}</div></div>
  <div class="tile"><div class="tile-num">${s.pct_of_budget != null ? s.pct_of_budget + "%" : "—"}</div><div class="tile-lbl">of monthly budget</div><div class="tile-sub">${s.monthly_budget != null ? "budget: " + fmtMoney(s.monthly_budget) : "(no budget set)"}</div></div>
</div>

<h2>Daily LLM spend</h2>
${chartSvg}

<h2>Per-agent breakdown</h2>
<table>
<thead><tr><th>Agent</th><th class="num">Runs</th><th class="num">LLM cost</th><th class="num">Human equiv.</th><th>Share</th></tr></thead>
<tbody>${agentRows}</tbody>
</table>

<div class="footer">
  Report generated by great-cto. LLM cost ratio model: $0.02/AI-hour vs $150/human-hour (~7500×).
  Source: ~/.great_cto/verdicts/*.log + .great_cto/PROJECT.md.
</div>
</body>
</html>
`;
}

function renderAgentsHtml(report: any): string {
  const s = report.summary;
  const rows = (report.agents as any[]).map(a => `
    <tr>
      <td>${escapeHtml(a.agent)}</td>
      <td class="num">${a.runs}</td>
      <td class="num">${a.success_rate != null ? a.success_rate + "%" : "—"}</td>
      <td class="num">${a.ok}</td>
      <td class="num">${a.fail}</td>
      <td class="num">${fmtMoney(a.cost_usd)}</td>
      <td>${a.last_seen ? escapeHtml(a.last_seen.slice(0, 10)) : "—"}</td>
    </tr>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>great-cto agents report</title><style>${HTML_STYLE}</style></head>
<body>
<h1>Agents performance — last ${escapeHtml(report.period)}</h1>
<div class="meta">Generated ${escapeHtml(report.generated_at)} · ${s.total_agents} agent(s) · ${s.total_runs} run(s)</div>
<div class="tile-row">
  <div class="tile"><div class="tile-num">${s.total_agents}</div><div class="tile-lbl">Active agents</div></div>
  <div class="tile"><div class="tile-num">${s.total_runs}</div><div class="tile-lbl">Total runs</div></div>
  <div class="tile"><div class="tile-num">${fmtMoney(s.total_cost_usd)}</div><div class="tile-lbl">Total cost</div></div>
</div>
<table>
<thead><tr><th>Agent</th><th class="num">Runs</th><th class="num">Success rate</th><th class="num">OK</th><th class="num">Fail</th><th class="num">Cost</th><th>Last seen</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<div class="footer">Source: ~/.great_cto/verdicts/*.log</div>
</body></html>`;
}

function renderComplianceHtml(report: any): string {
  const sg = report.security_gates;
  const qa = report.qa_reports;
  const compRows = (report.declared_compliance as string[])
    .map(c => `<li>${escapeHtml(c)}</li>`)
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>great-cto compliance report</title><style>${HTML_STYLE}</style></head>
<body>
<h1>Compliance posture — ${escapeHtml(report.archetype)}</h1>
<div class="meta">Generated ${escapeHtml(report.generated_at)}</div>

<div class="tile-row">
  <div class="tile"><div class="tile-num">${sg.total}</div><div class="tile-lbl">Security signoffs</div><div class="tile-sub">${sg.approved} approved · ${sg.blocked} blocked</div></div>
  <div class="tile"><div class="tile-num">${qa.total}</div><div class="tile-lbl">QA reports</div><div class="tile-sub">${qa.pass_rate != null ? qa.pass_rate + "% pass rate" : "(no data)"}</div></div>
</div>

<h2>Declared compliance gates</h2>
${compRows ? `<ul>${compRows}</ul>` : "<p>No compliance gates declared in PROJECT.md.</p>"}

<h2>Audit trail</h2>
<table>
<tr><td>Security signoffs</td><td class="num">${sg.approved}/${sg.total} approved</td></tr>
<tr><td>QA reports</td><td class="num">${qa.passed}/${qa.total} passed</td></tr>
</table>

<div class="footer">Source: docs/security/CSO-*.md, docs/qa-reports/QA-*.md, .great_cto/PROJECT.md</div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Main entry ─────────────────────────────────────────────────────────────

export async function runReport(args: ReportArgs): Promise<number> {
  let report: any;
  try {
    if (args.type === "cost")            report = buildCostReport(args);
    else if (args.type === "agents")     report = buildAgentsReport(args);
    else if (args.type === "compliance") report = buildComplianceReport(args);
    else { console.error(`unknown report type: ${args.type}`); return 2; }
  } catch (e) {
    console.error(`report failed: ${(e as Error).message}`);
    return 2;
  }

  if (args.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    let html: string;
    if (args.type === "cost")            html = renderCostHtml(report);
    else if (args.type === "agents")     html = renderAgentsHtml(report);
    else                                  html = renderComplianceHtml(report);
    console.log(html);
  }
  return 0;
}

export function parseReportArgs(rawArgv: string[], cwd: string): ReportArgs | null {
  const idx = rawArgv.indexOf("report");
  if (idx === -1) return null;
  const type = rawArgv[idx + 1] as ReportType;
  if (!["cost", "agents", "compliance"].includes(type)) {
    console.error(`great-cto report: type must be cost|agents|compliance (got: ${type ?? "<missing>"})`);
    return null;
  }
  const flag = (n: string, def?: string) => {
    const i = rawArgv.indexOf(`--${n}`);
    return i >= 0 && i < rawArgv.length - 1 ? rawArgv[i + 1] : def;
  };
  return {
    type,
    format: (flag("format", "html") as ReportFormat),
    period: flag("period", "30d") as string,
    archetype: flag("archetype") ?? null,
    cwd,
  };
}
