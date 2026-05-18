#!/usr/bin/env node
/**
 * great_cto MCP server — exposes board metrics as MCP tools.
 *
 * Implements the Model Context Protocol over stdio (JSON-RPC 2.0).
 * Zero external dependencies — pure Node.js built-ins only.
 *
 * Tools exposed:
 *   project_status   — pipeline stages, open gates, blocked tasks
 *   cost_summary     — LLM spend, budget burn, top features
 *   pipeline_stages  — detailed stage list with verdicts
 *   recent_verdicts  — last N agent verdicts (default 10)
 *
 * Usage:
 *   # Start as MCP server (board must be running on --port)
 *   node packages/board/mcp-server.mjs --port 3141
 *
 *   # Or via great-cto CLI:
 *   great-cto mcp [--port 3141]
 *
 * .mcp.json (Claude Code / Cursor):
 *   {
 *     "mcpServers": {
 *       "great_cto": {
 *         "command": "node",
 *         "args": ["/path/to/great_cto/packages/board/mcp-server.mjs"],
 *         "env": { "GREAT_CTO_PORT": "3141" }
 *       }
 *     }
 *   }
 */

import { createInterface } from 'node:readline';

const PORT = parseInt(process.env.GREAT_CTO_PORT || '3141', 10);
const BASE_URL = `http://127.0.0.1:${PORT}`;

// ── MCP protocol constants ─────────────────────────────────────────────────
const PROTO_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'great_cto', version: '1.0.0' };

// ── Tool definitions ───────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'project_status',
    description:
      'Returns the current pipeline status for the great_cto project: ' +
      'open gates awaiting approval, blocked tasks, P0 incidents, and ' +
      'in-progress work. Use this before starting expensive agent tasks to ' +
      'check if there are blockers that need resolution first.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project slug (optional). Defaults to the board\'s active project.',
        },
      },
    },
  },
  {
    name: 'cost_summary',
    description:
      'Returns AI agent LLM spend for the project: total cost over a period, ' +
      'daily burn rate, projected monthly cost, budget status, and cost ' +
      'broken down by feature. Use this to check budget before spawning ' +
      'resource-intensive agent runs.',
    inputSchema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Window in days (1, 7, 30, 90, 365). Default: 30.',
        },
        project: {
          type: 'string',
          description: 'Project slug (optional).',
        },
      },
    },
  },
  {
    name: 'pipeline_stages',
    description:
      'Returns the full pipeline stage list with status (idle/done/failed) ' +
      'and the last verdict for each agent. Useful for understanding which ' +
      'stage the current feature is at and what the last agent decided.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project slug (optional).',
        },
      },
    },
  },
  {
    name: 'recent_verdicts',
    description:
      'Returns the most recent agent verdict lines — timestamps, agent names, ' +
      'verdict values (APPROVED/DONE/BLOCKED), and costs. Useful for a quick ' +
      'recap of what agents have done recently.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of verdicts to return (1–50). Default: 10.',
        },
        project: {
          type: 'string',
          description: 'Project slug (optional).',
        },
      },
    },
  },
];

// ── HTTP helpers ───────────────────────────────────────────────────────────
async function boardFetch(path) {
  try {
    const res = await fetch(`${BASE_URL}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (e) {
    throw new Error(`Board unreachable at ${BASE_URL} — is great-cto board running? (${e.message})`);
  }
}

function pqs(project) {
  return project ? `?project=${encodeURIComponent(project)}` : '';
}

// ── Tool handlers ──────────────────────────────────────────────────────────
async function callTool(name, args = {}) {
  const proj = args.project;
  const qs = pqs(proj);

  if (name === 'project_status') {
    const [inbox, metrics] = await Promise.all([
      boardFetch(`/api/inbox${qs}`),
      boardFetch(`/api/metrics${qs}`),
    ]);
    const summary = inbox.summary || {};
    const lines = [
      `## Project status${proj ? ` — ${proj}` : ''}`,
      '',
      `**Open gates:** ${summary.gates ?? 0}`,
      `**Blocked tasks:** ${summary.blocked ?? 0}`,
      `**P0 incidents:** ${summary.p0 ?? 0}`,
      `**Stale in-progress:** ${summary.stale ?? 0}`,
    ];
    if ((inbox.pending_gates || []).length > 0) {
      lines.push('', '### Gates awaiting approval');
      for (const g of inbox.pending_gates.slice(0, 5)) {
        lines.push(`- **${g.id}** ${g.title} _(${g.status})_`);
      }
    }
    if ((inbox.blocked || []).length > 0) {
      lines.push('', '### Blocked tasks');
      for (const b of inbox.blocked.slice(0, 5)) {
        lines.push(`- **${b.id}** ${b.title}`);
      }
    }
    if (metrics) {
      const done = metrics.done ?? 0;
      const total = metrics.total ?? 0;
      lines.push('', `**Tasks:** ${done}/${total} done`);
    }
    return lines.join('\n');
  }

  if (name === 'cost_summary') {
    const days = Math.min(365, Math.max(1, args.days || 30));
    const d = await boardFetch(`/api/cost${pqs(proj)}&days=${days}`);
    const lines = [
      `## Cost summary${proj ? ` — ${proj}` : ''} (last ${days} days)`,
      '',
      `**Total LLM spend:** $${(d.total_llm || 0).toFixed(2)}`,
      `**Daily burn (active days):** $${(d.daily_avg || 0).toFixed(2)}/day`,
      `**Projected monthly:** $${(d.projected_monthly || 0).toFixed(0)}`,
    ];
    if (d.monthly_budget) {
      const status = d.over_budget ? '⚠️ OVER BUDGET' : '✅ within budget';
      lines.push(`**Budget:** $${d.monthly_budget}/month — ${status}`);
    }
    if (d.savings_x) {
      lines.push(`**vs Human team:** ${d.savings_x}× cheaper`);
    }
    if ((d.by_feature || []).length > 0) {
      lines.push('', '### Top features by AI spend');
      for (const f of d.by_feature.slice(0, 8)) {
        lines.push(`- **${f.feature}**: $${f.llm.toFixed(2)} (${f.runs} agent runs)`);
      }
    }
    return lines.join('\n');
  }

  if (name === 'pipeline_stages') {
    const stages = await boardFetch(`/api/pipeline${qs}`);
    const lines = [
      `## Pipeline stages${proj ? ` — ${proj}` : ''}`,
      '',
      '| Stage | Status | Verdict | Last run |',
      '|---|---|---|---|',
    ];
    for (const s of stages || []) {
      const status = s.status || 'idle';
      const verdict = s.verdict || '—';
      const ts = s.last_ts ? s.last_ts.slice(0, 16) : '—';
      lines.push(`| ${s.stage} | ${status} | ${verdict} | ${ts} |`);
    }
    return lines.join('\n');
  }

  if (name === 'recent_verdicts') {
    const limit = Math.min(50, Math.max(1, args.limit || 10));
    const data = await boardFetch(`/api/metrics${qs}`);
    const verdicts = (data.verdicts || []).slice(-limit).reverse();
    if (verdicts.length === 0) return 'No recent verdicts found.';
    const lines = [
      `## Recent verdicts${proj ? ` — ${proj}` : ''} (last ${verdicts.length})`,
      '',
      '| Time | Agent | Verdict | Cost |',
      '|---|---|---|---|',
    ];
    for (const v of verdicts) {
      const ts = (v.ts || '').slice(0, 16);
      const cost = v.cost_usd != null ? `$${v.cost_usd.toFixed(2)}` : '—';
      lines.push(`| ${ts} | ${v.agent || '—'} | ${v.verdict || '—'} | ${cost} |`);
    }
    return lines.join('\n');
  }

  throw new Error(`Unknown tool: ${name}`);
}

// ── MCP JSON-RPC dispatcher ────────────────────────────────────────────────
async function handleRequest(req) {
  const id = req.id ?? null;

  function ok(result) {
    return { jsonrpc: '2.0', id, result };
  }
  function err(code, message, data) {
    return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
  }

  try {
    const method = req.method;

    if (method === 'initialize') {
      return ok({
        protocolVersion: PROTO_VERSION,
        serverInfo: SERVER_INFO,
        capabilities: { tools: {} },
      });
    }

    if (method === 'initialized') return null; // notification, no response

    if (method === 'tools/list') {
      return ok({ tools: TOOLS });
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = req.params || {};
      if (!name) return err(-32602, 'Missing tool name');
      try {
        const text = await callTool(name, args || {});
        return ok({ content: [{ type: 'text', text }] });
      } catch (e) {
        return ok({
          content: [{ type: 'text', text: `Error: ${e.message}` }],
          isError: true,
        });
      }
    }

    if (method === 'ping') return ok({});

    return err(-32601, `Method not found: ${method}`);
  } catch (e) {
    return err(-32603, e.message);
  }
}

// ── stdio transport ────────────────────────────────────────────────────────
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    const resp = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } };
    process.stdout.write(JSON.stringify(resp) + '\n');
    return;
  }
  const resp = await handleRequest(req);
  if (resp !== null) {
    process.stdout.write(JSON.stringify(resp) + '\n');
  }
});

rl.on('close', () => process.exit(0));
process.stderr.write(`great_cto MCP server ready (board: ${BASE_URL})\n`);
