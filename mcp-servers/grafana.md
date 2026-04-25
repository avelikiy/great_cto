# Grafana MCP Setup

> Activates Grafana-native monitoring in `l3-support`: `query_loki`, `search_alerts`,
> `query_tempo`, `get_panel`, `list_dashboards` replace grep/tail on log files.
> Optional — pipeline works without this. File/Docker/journalctl fallback is automatic.

## What this enables

With Grafana MCP configured, `l3-support`:
- Checks **firing alerts** before scanning log files (proactive P0 detection)
- Queries **Loki logs** via LogQL instead of `tail -1000 app.log | grep error`
- Pulls **distributed traces** from Tempo to identify the slow span in a P0
- Reads **dashboard panels** for error rate + latency without curl/prometheus-cli
- Runs `gcx correlate --commit HEAD` to link an alert start to the responsible deploy in one command

## Installation

### Option A — mcp-grafana (full suite, recommended)

Gives access to all 5 MCP tools: `search_alerts`, `query_loki`, `query_tempo`, `get_panel`, `list_dashboards`.

```bash
npm install -g @grafana/mcp-grafana
# or run without installing:
npx @grafana/mcp-grafana
```

Source: [github.com/grafana/mcp-grafana](https://github.com/grafana/mcp-grafana) (⭐ 2,911)

### Option B — loki-mcp (LogQL only, lighter)

Gives `query_loki` only. Use when you only need log querying.

```bash
npm install -g @grafana/loki-mcp
```

Source: [github.com/grafana/loki-mcp](https://github.com/grafana/loki-mcp) (⭐ 128)

### Option C — gcx CLI (alert list + correlation, no MCP)

Complements MCP tools. Works standalone without MCP configuration.

```bash
# macOS
brew install grafana/grafana/gcx

# Go install
go install github.com/grafana/gcx@latest

# Verify
gcx --version
gcx alerts list --state firing
```

Source: [github.com/grafana/gcx](https://github.com/grafana/gcx) (⭐ 174, announced GrafanaCON 2026)

---

## Claude Code settings.json

Add to `~/.claude/settings.json` (user-global) for all projects,
or `.claude/settings.json` (project-local) for this repo only.

```json
{
  "mcpServers": {
    "grafana": {
      "command": "npx",
      "args": ["-y", "@grafana/mcp-grafana"],
      "env": {
        "GRAFANA_URL": "${GRAFANA_URL}",
        "GRAFANA_API_KEY": "${GRAFANA_API_KEY}"
      }
    }
  }
}
```

> **Note:** `${GRAFANA_URL}` and `${GRAFANA_API_KEY}` are resolved from your shell environment
> at the time Claude Code starts. Set them in `~/.zshrc` / `~/.bashrc`, or in `.great_cto/env.sh`
> (sourced automatically by all agents):
>
> ```bash
> # .great_cto/env.sh
> export GRAFANA_URL=https://grafana.example.com
> export GRAFANA_API_KEY=glsa_xxxxxxxxxxxxxxxxxxxx
> ```

---

## PROJECT.md fields

Add to the `## L3` section of `.great_cto/PROJECT.md` to activate Grafana monitoring:

```yaml
## L3
error-log: /var/log/app.log          # kept as fallback if Grafana is down
port: 3000
p0-threshold: error_rate > 5%/5min
p1-threshold: latency > 500ms
oncall: @alice
grafana-url: https://grafana.example.com
grafana-api-key-env: GRAFANA_API_KEY  # env var name (not the key itself)
loki-datasource: Loki                 # name as it appears in Grafana datasources
tempo-datasource: Tempo               # name as it appears in Grafana datasources
```

`l3-support` reads these at startup and sets `$GRAFANA_OK=true` when `grafana-url` and the
referenced env var are both present. Missing either → silent fallback to file-based monitoring.

---

## Required Grafana API Key Scopes

Generate at: **Grafana → Administration → API Keys → Add API Key**

| Scope | Required for |
|-------|-------------|
| `datasources:read` | Listing available datasources |
| `datasources:query` | `query_loki`, `query_tempo`, `get_panel` |
| `alert.rules:read` | `search_alerts` |
| `dashboards:read` | `list_dashboards`, `get_panel` |

Minimum: `datasources:query` + `alert.rules:read`. Use a **Viewer** service account with these scopes — l3-support never writes to Grafana.

---

## Tool-to-Workflow-Step Mapping

| MCP Tool | l3-support step | Replaces |
|----------|----------------|---------|
| `search_alerts` | Step 2 Priority 0 + Proactive Poll | Manual alert checking |
| `query_loki` | Step 2 Priority 0 (log scan) | `tail -1000 app.log \| grep error` |
| `get_panel` | Step 3 Quick diagnostics | `curl localhost:9090/api/v1/query` |
| `list_dashboards` | P0 Angle 1 (Scope) | Manual Grafana UI navigation |
| `query_tempo` | P0 Angle 4 (Proof) | No previous equivalent |

Full LogQL patterns and PromQL SLI queries: `skills/great_cto/references/grafana-ops.md`

---

## Verification

After setup, verify in a Claude Code session or terminal:

```bash
# 1. MCP tools reachable (run inside Claude Code session)
# Type: "list my MCP tools" — grafana tools should appear

# 2. gcx available and authenticated
which gcx && gcx alerts list --state firing

# 3. Grafana API connectivity
curl -s \
  -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "${GRAFANA_URL}/api/datasources" \
  | python3 -c "import json,sys; ds=json.load(sys.stdin); [print(d['name'],d['type']) for d in ds]"

# Expected output: one line per datasource, e.g.:
# Loki  loki
# Tempo tempo
# Prometheus  prometheus

# 4. Loki query works
curl -s \
  -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "${GRAFANA_URL}/api/datasources/proxy/uid/loki/loki/api/v1/labels" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('Loki labels:', d.get('data', [])[:5])"

# 5. PROJECT.md fields are read correctly by l3-support
grep "grafana-url\|grafana-api-key-env\|loki-datasource\|tempo-datasource" .great_cto/PROJECT.md
```
