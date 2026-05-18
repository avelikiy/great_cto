# MCP integrations

[← back to README](../README.md)

great_cto has native support for [Model Context Protocol](https://modelcontextprotocol.io/). It works two ways: as an MCP **server** (so any MCP host can call great_cto's tools) and as an MCP **client** (great_cto agents call out to other MCP servers).

## Use great_cto from any MCP host

`great-cto mcp` exposes 9 tools to any compatible host:

| Tool | What it does |
|---|---|
| `scan` | Run AI-security scanner over the current repo (24 OWASP LLM rules) |
| `list_rules` | Print the rule catalog |
| `detect_archetype` | Heuristic + optional Haiku second-opinion archetype detector |
| `estimate_cost` | Pipeline cost estimate for a given task description |
| `query_decisions` | Search the global ADR log (`~/.great_cto/decisions.md`) |
| `project_status` | **Board** — open gates, blocked tasks, P0 incidents (requires running board) |
| `cost_summary` | **Board** — LLM spend, daily burn, top features by cost (requires running board) |
| `pipeline_stages` | **Board** — stage list with status + last verdict (requires running board) |
| `recent_verdicts` | **Board** — last N agent verdicts with timestamps and costs (requires running board) |

The board tools (`project_status`, `cost_summary`, `pipeline_stages`, `recent_verdicts`) require `great-cto board` to be running. They read from the board's HTTP API (default port 3141). Set `GREAT_CTO_PORT` env var to override.

**Typical agent usage:**
```
# Before spawning expensive work, check budget:
cost_summary(days=7)

# Before approving a task, check pipeline state:
project_status()
pipeline_stages()
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "great-cto": {
      "command": "npx",
      "args": ["-y", "great-cto@latest", "mcp"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "great-cto": {
      "command": "npx",
      "args": ["-y", "great-cto@latest", "mcp"]
    }
  }
}
```

### Continue / any other MCP host

Same shape as above — `command: npx`, `args: [-y, great-cto@latest, mcp]`.

### Multi-client / remote use

```bash
great-cto mcp --sse --port 8765    # HTTP+SSE transport for multiple clients
```

## Internal MCPs used by great_cto agents

| MCP | Used by | What it enables |
|---|---|---|
| Grafana | `l3-support` | LogQL via `query_loki`, `search_alerts`, `query_tempo`, `get_panel`. Pre-P0 alert detection |
| LLM router | `l3-support`, `qa-engineer` | Routes routine triage to Kimi K2. **60–80% LLM cost reduction** on log clustering |
| Beads | all agents | Git-native task tracker. Survives session restarts with dependencies + blockers |
| Your own | any agent | Add to `.claude-plugin/plugin.json` → `mcpServers` |

## Sub-agent catalog

Specialist sub-agents from [davila7/claude-code-templates](https://github.com/davila7/claude-code-templates) (419 agents + 336 commands) are callable via the `Agent` tool. Install:

```bash
/template install <name>
```
