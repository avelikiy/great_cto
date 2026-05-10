# MCP integrations

[← back to README](../README.md)

great_cto has native support for [Model Context Protocol](https://modelcontextprotocol.io/). It works two ways: as an MCP **server** (so any MCP host can call great_cto's tools) and as an MCP **client** (great_cto agents call out to other MCP servers).

## Use great_cto from any MCP host

`great-cto mcp` exposes 5 tools to any compatible host:

| Tool | What it does |
|---|---|
| `scan` | Run AI-security scanner over the current repo (24 OWASP LLM rules) |
| `list_rules` | Print the rule catalog |
| `detect_archetype` | Heuristic + optional Haiku second-opinion archetype detector |
| `estimate_cost` | Pipeline cost estimate for a given task description |
| `query_decisions` | Search the global ADR log (`~/.great_cto/decisions.md`) |

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
