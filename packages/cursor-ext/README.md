# great_cto for Cursor

Native Cursor / VS Code extension that surfaces great_cto commands inside the
editor — scan, CI gate, config generation, cost reports.

## What it gives you

| Command | What it does |
|---|---|
| `great_cto: Generate Cursor config` | Runs `great-cto adapt --platform cursor` → writes `.cursorrules` + `AGENTS.md` |
| `great_cto: Scan workspace` | Runs `great-cto scan` against open folder, results in terminal |
| `great_cto: Run pre-merge CI gate` | Runs `great-cto ci` (scan + archetype check + budget) |
| `great_cto: Generate cost report` | Runs `great-cto report cost`, opens HTML in editor |

A status-bar shield icon (bottom-right) is a one-click shortcut to scan.

## Install

### From VSIX (local)

```bash
cd packages/cursor-ext
npm install
npm run compile
npx vsce package          # produces great-cto-cursor-2.5.0.vsix
# Then in Cursor: Extensions → ... menu → Install from VSIX → pick the file
```

### From marketplace (when published)

Search "great_cto" in the Cursor / VS Code extensions panel.

## Configuration

```jsonc
// settings.json
{
  // Override if you want a pinned version instead of npx@latest
  "greatCto.npmCommand": "npx great-cto@2.5.0",
  // Minimum severity reported by the Scan command
  "greatCto.scanSeverity": "high"
}
```

## How it works

The extension is a thin wrapper — every command shells out to the npm package
(`npx great-cto@latest`). This keeps the extension small and version-fresh:
you don't need to update the extension to get newer scan rules. Updates ship
through npm, the extension just calls the latest version.

For deep MCP integration with Cursor's chat panel, configure
`great-cto mcp` separately:

```jsonc
// .cursor/mcp.json
{
  "mcpServers": {
    "great-cto": {
      "command": "npx",
      "args": ["great-cto@latest", "mcp"]
    }
  }
}
```

This exposes `scan`, `list_rules`, `detect_archetype`, `estimate_cost`, and
`query_decisions` directly to Cursor chat as tools.
