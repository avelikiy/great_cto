// great-cto mcp — Model Context Protocol server.
//
// Exposes great_cto's core capabilities as MCP tools so any MCP-compatible
// host (Claude Desktop, Cursor, Continue, Codex CLI via MCP, custom agents)
// can call them. This is the single biggest cross-platform multiplier — one
// implementation, all clients.
//
// Modes:
//   stdio (default)  — Claude Desktop / Cursor / Continue spawn this as subprocess
//   sse              — long-running HTTP/SSE for remote / multi-client access
//
// Tools exposed:
//   detect_archetype  archetype + compliance for a path
//   estimate_cost     LLM/human time for a task
//   query_decisions   search ~/.great_cto/decisions.md
//   project_status    board project state
//   cost_summary      board cost rollup
//   pipeline_stages   board pipeline stage breakdown
//   recent_verdicts   board recent agent verdicts
//
// Protocol: minimal MCP 2024-11-05 implementation. We hand-roll because
// adding @modelcontextprotocol/sdk would balloon install size for what is
// fundamentally a few JSON messages over stdio.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = {
  name: "great-cto",
  version: "", // populated at startup
};

// ── Tool implementations ────────────────────────────────────────────────────

async function toolDetectArchetype(args: { path?: string }): Promise<any> {
  const { detect } = await import("./detect.js");
  const { pickArchetype, suggestCompliance } = await import("./archetypes.js");
  const cwd = resolve(args.path ?? ".");
  const detected = await detect(cwd);
  const result = pickArchetype(detected);
  const compliance = suggestCompliance(detected, result.primary as any);
  return {
    archetype: result.primary,
    confidence: result.confidence,
    rationale: result.rationale,
    alternatives: result.alternatives,
    compliance,
  };
}

async function toolEstimateCost(args: {
  task_description?: string;
  archetype?: string;
  scale?: "quick" | "standard" | "deep";
}): Promise<any> {
  // Rough heuristic — for production, agents call /cost feature directly.
  // This is the LLM-host-friendly summary.
  const scale = args.scale ?? "standard";
  const minutesByScale: Record<string, number> = {
    quick: 15,
    standard: 45,
    deep: 90,
  };
  const llmRatePerHr = 0.02;
  const humanRatePerHr = 150;
  const minutes = minutesByScale[scale] ?? 45;
  const llmUsd = +(minutes / 60 * llmRatePerHr).toFixed(4);
  const humanUsd = +(minutes / 60 * humanRatePerHr).toFixed(2);
  const humanDays = +(minutes / 60 / 6).toFixed(1); // 6 productive hrs / day
  return {
    task: args.task_description ?? "",
    archetype: args.archetype ?? "unknown",
    scale,
    llm_agent: { wall_clock_min: minutes, cost_usd: llmUsd },
    human_team: { working_days: humanDays, cost_usd: humanUsd },
    savings_x: Math.round(humanUsd / Math.max(llmUsd, 0.0001)),
  };
}

function toolQueryDecisions(args: { query?: string; limit?: number }): any {
  const decisionsPath = join(homedir(), ".great_cto", "decisions.md");
  if (!existsSync(decisionsPath)) {
    return { count: 0, results: [], note: "No ~/.great_cto/decisions.md found." };
  }
  const text = readFileSync(decisionsPath, "utf8");
  const entries = text.split(/\n---\n/).filter(s => s.trim());
  const q = (args.query ?? "").toLowerCase();
  const limit = args.limit ?? 10;
  const matches = q
    ? entries.filter(e => e.toLowerCase().includes(q))
    : entries.slice(-limit);
  return {
    count: matches.length,
    total_decisions: entries.length,
    results: matches.slice(0, limit).map(e => {
      const titleMatch = e.match(/^##\s+(.+)$/m);
      return {
        title: titleMatch?.[1] ?? "(untitled)",
        excerpt: e.slice(0, 400),
      };
    }),
  };
}

// ── Board tools — call the running board HTTP API ─────────────────────────
// Board port: $GREAT_CTO_PORT (default 3141).

const BOARD_PORT = parseInt(process.env.GREAT_CTO_PORT ?? "3141", 10);
const BOARD_BASE = `http://127.0.0.1:${BOARD_PORT}`;

async function boardFetch(path: string): Promise<any> {
  try {
    const res = await fetch(`${BOARD_BASE}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (e) {
    throw new Error(
      `Board unreachable at ${BOARD_BASE} — run \`great-cto board\` first. (${(e as Error).message})`
    );
  }
}

function boardPqs(project?: string): string {
  return project ? `?project=${encodeURIComponent(project)}` : "";
}

async function toolProjectStatus(args: { project?: string }): Promise<string> {
  const qs = boardPqs(args.project);
  const [inbox, metrics] = await Promise.all([
    boardFetch(`/api/inbox${qs}`),
    boardFetch(`/api/metrics${qs}`),
  ]);
  const s = inbox.summary ?? {};
  const lines = [
    `## Project status${args.project ? ` — ${args.project}` : ""}`,
    "",
    `**Open gates:** ${s.gates ?? 0}`,
    `**Blocked tasks:** ${s.blocked ?? 0}`,
    `**P0 incidents:** ${s.p0 ?? 0}`,
    `**Stale in-progress:** ${s.stale ?? 0}`,
  ];
  if ((inbox.pending_gates ?? []).length > 0) {
    lines.push("", "### Gates awaiting approval");
    for (const g of (inbox.pending_gates as any[]).slice(0, 5)) {
      lines.push(`- **${g.id}** ${g.title} _(${g.status})_`);
    }
  }
  if ((inbox.blocked ?? []).length > 0) {
    lines.push("", "### Blocked tasks");
    for (const b of (inbox.blocked as any[]).slice(0, 5)) {
      lines.push(`- **${b.id}** ${b.title}`);
    }
  }
  if (metrics) {
    lines.push("", `**Tasks:** ${metrics.done ?? 0}/${metrics.total ?? 0} done`);
  }
  return lines.join("\n");
}

async function toolCostSummary(args: { days?: number; project?: string }): Promise<string> {
  const days = Math.min(365, Math.max(1, args.days ?? 30));
  const qs = boardPqs(args.project);
  const d = await boardFetch(`/api/cost${qs}${qs ? "&" : "?"}days=${days}`);
  const lines = [
    `## Cost summary${args.project ? ` — ${args.project}` : ""} (last ${days} days)`,
    "",
    `**Total LLM spend:** $${(d.total_llm ?? 0).toFixed(2)}`,
    `**Daily burn:** $${(d.daily_avg ?? 0).toFixed(2)}/day`,
    `**Projected monthly:** $${(d.projected_monthly ?? 0).toFixed(0)}`,
  ];
  if (d.monthly_budget) {
    const status = d.over_budget ? "⚠️ OVER BUDGET" : "✅ within budget";
    lines.push(`**Budget:** $${d.monthly_budget}/month — ${status}`);
  }
  if (d.savings_x) lines.push(`**vs Human team:** ${d.savings_x}× cheaper`);
  if ((d.by_feature ?? []).length > 0) {
    lines.push("", "### Top features by AI spend");
    for (const f of (d.by_feature as any[]).slice(0, 8)) {
      lines.push(`- **${f.feature}**: $${f.llm.toFixed(2)} (${f.runs} runs)`);
    }
  }
  return lines.join("\n");
}

async function toolPipelineStages(args: { project?: string }): Promise<string> {
  const stages = await boardFetch(`/api/pipeline${boardPqs(args.project)}`);
  const lines = [
    `## Pipeline stages${args.project ? ` — ${args.project}` : ""}`,
    "",
    "| Stage | Status | Verdict | Last run |",
    "|---|---|---|---|",
  ];
  for (const s of stages ?? []) {
    lines.push(
      `| ${s.stage} | ${s.status ?? "idle"} | ${s.verdict ?? "—"} | ${(s.last_ts ?? "—").slice(0, 16)} |`
    );
  }
  return lines.join("\n");
}

async function toolRecentVerdicts(args: { limit?: number; project?: string }): Promise<string> {
  const limit = Math.min(50, Math.max(1, args.limit ?? 10));
  const data = await boardFetch(`/api/metrics${boardPqs(args.project)}`);
  const verdicts = ((data.verdicts ?? []) as any[]).slice(-limit).reverse();
  if (verdicts.length === 0) return "No recent verdicts found.";
  const lines = [
    `## Recent verdicts${args.project ? ` — ${args.project}` : ""} (last ${verdicts.length})`,
    "",
    "| Time | Agent | Verdict | Cost |",
    "|---|---|---|---|",
  ];
  for (const v of verdicts) {
    const cost = v.cost_usd != null ? `$${(v.cost_usd as number).toFixed(2)}` : "—";
    lines.push(`| ${(v.ts ?? "").slice(0, 16)} | ${v.agent ?? "—"} | ${v.verdict ?? "—"} | ${cost} |`);
  }
  return lines.join("\n");
}

// ── Tool dispatch table ────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "detect_archetype",
    description:
      "Detect the project archetype (one of 25: fintech, healthcare, commerce, agent-product, mlops, edtech, gov-public, insurance, ...) and the compliance gates that apply.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project root (default: cwd)" },
      },
    },
    handler: toolDetectArchetype,
  },
  {
    name: "estimate_cost",
    description:
      "Estimate LLM-agent wall-clock time and cost vs human-team equivalent for a task. Returns LLM/human cost and savings ratio (~7500×).",
    inputSchema: {
      type: "object",
      properties: {
        task_description: { type: "string" },
        archetype: { type: "string" },
        scale: { type: "string", enum: ["quick", "standard", "deep"] },
      },
    },
    handler: toolEstimateCost,
  },
  {
    name: "query_decisions",
    description:
      "Search the cross-project ADR log at ~/.great_cto/decisions.md. Returns matching decisions for the given query string.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search string (case-insensitive). Empty = recent decisions." },
        limit: { type: "number", description: "Max results (default 10)" },
      },
    },
    handler: toolQueryDecisions,
  },
  // ── Board tools (require running board at $GREAT_CTO_PORT / 3141) ────────
  {
    name: "project_status",
    description:
      "Get current pipeline status from the great_cto board: open gates awaiting approval, blocked tasks, P0 incidents, and in-progress work. " +
      "Use this before starting expensive agent tasks to check for blockers. Requires `great-cto board` running.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project slug (optional, defaults to board's active project)" },
      },
    },
    handler: toolProjectStatus,
  },
  {
    name: "cost_summary",
    description:
      "Get AI agent LLM spend from the board: total cost, daily burn rate, projected monthly cost, budget status, " +
      "and cost broken down by feature. Use to check budget before spawning resource-intensive agents. Requires `great-cto board` running.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Window in days: 1, 7, 30, 90, 365 (default: 30)" },
        project: { type: "string", description: "Project slug (optional)" },
      },
    },
    handler: toolCostSummary,
  },
  {
    name: "pipeline_stages",
    description:
      "Get full pipeline stage list with status (idle/done/failed) and last agent verdict. " +
      "Shows which stage the current feature is at and what each agent last decided. Requires `great-cto board` running.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project slug (optional)" },
      },
    },
    handler: toolPipelineStages,
  },
  {
    name: "recent_verdicts",
    description:
      "Get the most recent agent verdict lines from the board: timestamps, agent names, verdict values (APPROVED/DONE/BLOCKED), and costs. " +
      "Quick recap of what agents have done recently. Requires `great-cto board` running.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of verdicts to return (1–50, default: 10)" },
        project: { type: "string", description: "Project slug (optional)" },
      },
    },
    handler: toolRecentVerdicts,
  },
];

// ── JSON-RPC handler ───────────────────────────────────────────────────────

async function handle(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const { method, id = null, params } = req;

  // Notifications (no id) get no response
  const isNotification = id === null || id === undefined;
  const reply = (result: any): JsonRpcResponse | null =>
    isNotification ? null : { jsonrpc: "2.0", id: id!, result };
  const fail = (code: number, message: string, data?: any): JsonRpcResponse | null =>
    isNotification ? null : { jsonrpc: "2.0", id: id!, error: { code, message, data } };

  try {
    switch (method) {
      case "initialize":
        return reply({
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });

      case "initialized":
      case "notifications/initialized":
        return null;

      case "tools/list":
        return reply({
          tools: TOOLS.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });

      case "tools/call": {
        const name = params?.name;
        const args = params?.arguments ?? {};
        const tool = TOOLS.find(t => t.name === name);
        if (!tool) return fail(-32601, `Unknown tool: ${name}`);
        const result = await tool.handler(args);
        return reply({
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
          isError: false,
        });
      }

      case "ping":
        return reply({});

      default:
        return fail(-32601, `Method not found: ${method}`);
    }
  } catch (e) {
    return fail(-32603, `Internal error: ${(e as Error).message}`);
  }
}

// ── SSE transport ──────────────────────────────────────────────────────────

async function runSse(port: number, version: string): Promise<number> {
  const { createServer } = await import("node:http");

  // Each connection gets a unique session id and an open SSE stream.
  // Inbound JSON-RPC arrives via POST /message?sessionId=<id>; responses are
  // pushed back over the SSE stream. This matches the standard MCP SSE
  // transport (https://spec.modelcontextprotocol.io/specification/transports).
  const sessions = new Map<string, import("node:http").ServerResponse>();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    if (req.method === "GET" && url.pathname === "/sse") {
      const sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      // Initial endpoint event — tells client where to POST messages
      res.write(`event: endpoint\ndata: /message?sessionId=${sessionId}\n\n`);
      sessions.set(sessionId, res);
      req.on("close", () => sessions.delete(sessionId));
      return;
    }

    if (req.method === "POST" && url.pathname === "/message") {
      const sessionId = url.searchParams.get("sessionId") ?? "";
      const sse = sessions.get(sessionId);
      if (!sse) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unknown sessionId" }));
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", c => chunks.push(Buffer.from(c)));
      req.on("end", async () => {
        const body = Buffer.concat(chunks).toString("utf8");
        try {
          const reqJson = JSON.parse(body) as JsonRpcRequest;
          const reply = await handle(reqJson);
          if (reply) {
            sse.write(`event: message\ndata: ${JSON.stringify(reply)}\n\n`);
          }
          res.writeHead(202).end();
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, version, sessions: sessions.size, transport: "sse" }));
      return;
    }

    res.writeHead(404).end();
  });

  return new Promise<number>(resolve => {
    server.listen(port, "127.0.0.1", () => {
      process.stderr.write(`great-cto mcp v${version} (sse) → http://localhost:${port}/sse\n`);
      process.stderr.write(`  GET  /sse                       open event stream\n`);
      process.stderr.write(`  POST /message?sessionId=...     send JSON-RPC\n`);
      process.stderr.write(`  GET  /healthz                   liveness\n`);
    });
    process.on("SIGINT", () => { server.close(); resolve(0); });
    process.on("SIGTERM", () => { server.close(); resolve(0); });
  });
}

// ── stdio transport ────────────────────────────────────────────────────────

async function runStdio(): Promise<number> {
  // Read newline-delimited JSON from stdin, write to stdout. This is the
  // standard MCP stdio transport.
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", async chunk => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const req = JSON.parse(line) as JsonRpcRequest;
        const res = await handle(req);
        if (res) process.stdout.write(JSON.stringify(res) + "\n");
      } catch (e) {
        process.stderr.write(`mcp: parse error: ${(e as Error).message}\n`);
      }
    }
  });
  return new Promise<number>(resolve => {
    process.stdin.on("end", () => resolve(0));
    process.stdin.on("error", () => resolve(2));
  });
}

// ── Main entry ─────────────────────────────────────────────────────────────

export interface McpArgs {
  mode: "stdio" | "sse";
  port: number;
  version: string;
}

export async function runMcp(args: McpArgs): Promise<number> {
  SERVER_INFO.version = args.version;

  if (args.mode === "sse") {
    return runSse(args.port, args.version);
  }

  // Notify clients we're ready (some hosts log this)
  process.stderr.write(`great-cto mcp v${args.version} (stdio) — ${TOOLS.length} tools\n`);
  return runStdio();
}
