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
//   scan              OWASP LLM Top 10 + 24 rules → findings
//   list_rules        full rule catalogue
//   detect_archetype  archetype + compliance for a path
//   estimate_cost     LLM/human time for a task
//   query_decisions   search ~/.great_cto/decisions.md
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

async function toolScan(args: { path?: string; severity?: string; scanner?: string[] }): Promise<any> {
  const { scan } = await import("./agentshield/scanner.js");
  const path = args.path ?? ".";
  const report = scan(resolve(path), {
    minSeverity: (args.severity ?? "info") as any,
    scanners: args.scanner as any,
  } as any);
  return {
    files_scanned: report.filesScanned,
    duration_ms: report.durationMs,
    findings: report.findings.map((f: any) => ({
      rule_id: f.rule.id,
      severity: f.rule.severity,
      title: f.rule.title,
      owasp: f.rule.owasp,
      file: f.location.file,
      line: f.location.line,
      snippet: f.location.snippet,
    })),
  };
}

async function toolListRules(): Promise<any> {
  const { loadRules } = await import("./agentshield/rules-loader.js");
  const rules = loadRules();
  return {
    count: rules.length,
    rules: rules.map((r: any) => ({
      id: r.id,
      severity: r.severity,
      scanner: r.scanner,
      title: r.title,
      owasp: r.owasp ?? null,
    })),
  };
}

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

// ── Tool dispatch table ────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "scan",
    description:
      "Scan code for AI/LLM-specific security issues (OWASP LLM Top 10, 24 rules). Returns findings with severity, file, line, OWASP mapping.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File or directory to scan (default: cwd)" },
        severity: {
          type: "string",
          enum: ["info", "low", "medium", "high", "critical"],
          description: "Minimum severity to report",
        },
        scanner: {
          type: "array",
          items: {
            type: "string",
            enum: ["prompt-injection", "secrets-in-prompts", "ssrf-in-tools", "rag-poisoning", "cost-runaway"],
          },
          description: "Limit to specific scanner categories",
        },
      },
    },
    handler: toolScan,
  },
  {
    name: "list_rules",
    description: "List all 24 AgentShield security rules with severity and OWASP LLM Top 10 mapping.",
    inputSchema: { type: "object", properties: {} },
    handler: toolListRules,
  },
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
