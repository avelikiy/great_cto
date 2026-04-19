# great-cto

> One command install for the [great_cto](https://github.com/avelikiy/great_cto) Claude Code plugin.

```bash
npx great-cto init
```

That's it. The CLI detects your stack, picks the right archetype, clones the plugin, enables it, and writes a pre-filled `PROJECT.md`.

## What it does

1. **Scans** your project for stack signals — `package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Chart.yaml`, `*.tf`, `hardhat.config.*`, etc.
2. **Picks** the matching great_cto archetype:
   - `web-service` · `mobile-app` · `ai-system` · `commerce` · `web3`
   - `data-platform` · `infra` · `library` · `iot-embedded` · `regulated` · `greenfield`
3. **Installs** the plugin into `~/.claude/plugins/cache/local/great_cto/<latest>/`
4. **Enables** it in `~/.claude/settings.json` (atomic merge — other keys preserved, backup taken)
5. **Bootstraps** `.great_cto/PROJECT.md` pre-filled with archetype, stack, suggested compliance frameworks

After install, restart Claude Code and run `/inbox` or `/audit`.

## Examples

### Commerce detection (Stripe + Next.js)

```
[1/5] scanning /path/to/saas
  stack: next.js, nodejs, prisma, react, stripe, supabase, typescript
  languages: javascript, typescript
  tests: yes  CI: yes
[2/5] picking archetype
  archetype: commerce (confidence: medium)
  rationale: payments SDK detected: Stripe — PCI-DSS gate mandatory
  suggested compliance: gdpr, pci-dss
```

### AI system (MCP + Anthropic SDK)

```
  archetype: ai-system (confidence: high)
  rationale: AI/LLM tooling detected (MCP SDK, Anthropic SDK, LangChain) —
             security gate mandatory for prompt injection + output sanitization
  suggested compliance: eu-ai-act
```

### Infra repo (Terraform + Helm)

```
  archetype: infra (confidence: high)
  rationale: infrastructure-as-code detected: Terraform, Helm
```

## Options

```
npx great-cto init [options]

  -y, --yes              Skip confirmation prompts (non-interactive)
      --dry-run          Show what would be done without doing it
      --force            Reinstall even if already present
      --archetype NAME   Override detected archetype
      --version-tag VER  Pin to specific great_cto version (default: latest)
      --dir PATH         Run against a different directory (default: cwd)
  -h, --help             Show help
  -v, --version          Show CLI version
```

## Safety

- **Atomic `settings.json` merge**: a timestamped `.bak` file is written before any change. Other `enabledPlugins` entries and unrelated keys are preserved.
- **Dry-run by default**: run `--dry-run` first to see exactly what will happen.
- **Idempotent**: running twice does nothing the second time (unless `--force`).
- **Never overwrites `PROJECT.md`**: if you already have one, the CLI leaves it untouched.

## Requirements

- **Node.js ≥ 18.17.0** (Node 18 / 20 / 22 all tested in CI)
- **Git** (to clone the plugin repo)
- [Claude Code](https://claude.com/claude-code)

## Trust signals

- Zero runtime dependencies — only Node built-ins (`node:fs`, `node:path`, etc.)
- 47 unit tests covering stack detection, archetype scoring, settings merge
- CI matrix: Node 18/20/22 × Ubuntu/macOS/Windows
- Source: [`packages/cli/src/`](https://github.com/avelikiy/great_cto/tree/main/packages/cli/src) — ~1.2k LOC TypeScript

## License

MIT — same as the plugin.

## Links

- Plugin: [github.com/avelikiy/great_cto](https://github.com/avelikiy/great_cto)
- Issues: [github.com/avelikiy/great_cto/issues](https://github.com/avelikiy/great_cto/issues)
- Author: [velykyi](https://www.linkedin.com/in/velykyi/)
