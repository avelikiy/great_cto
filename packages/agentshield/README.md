# @great-cto/agentshield

[![npm](https://img.shields.io/npm/v/@great-cto/agentshield)](https://www.npmjs.com/package/@great-cto/agentshield)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**AI-specific security scanner** for agent products. Detects the OWASP LLM Top 10 patterns that vendor-agnostic SAST tools miss: prompt injection vectors, secrets in prompts, SSRF in tool definitions, RAG poisoning, and cost-runaway loops.

Standalone — no agent harness required. Works with Claude / OpenAI / Anthropic / any LLM SDK.

## Install

```bash
# One-shot scan via npx
npx @great-cto/agentshield scan ./

# Or install
npm install -D @great-cto/agentshield
```

## Quick start

```bash
# Scan current directory
agentshield scan

# Filter by severity
agentshield scan --severity high

# One scanner only
agentshield scan --scanner ssrf-in-tools

# Output SARIF for GitHub Code Scanning
agentshield scan --sarif agentshield.sarif

# JSON for CI pipelines
agentshield scan --json > findings.json

# List the rule catalog
agentshield list-rules
```

Exit codes:
- `0` — no findings (or all below `--severity` threshold)
- `1` — findings at/above threshold (CI-friendly)
- `2` — scan failed

## What it catches

24 rules across 5 scanners. Sample (full catalogue: `agentshield list-rules`):

| Scanner | Rules | OWASP mapping |
|---|---|---|
| `prompt-injection` | 5 | LLM01:2025 |
| `secrets-in-prompts` | 4 | — |
| `ssrf-in-tools` | 4 | LLM07:2025 |
| `rag-poisoning` | 5 | LLM01:2025 (indirect) |
| `cost-runaway` | 6 | LLM06:2025 |

Examples of what we catch:

```typescript
// CRITICAL — PI-001: user input in system prompt
{ role: 'system', content: `You are a bot. User said: ${req.body.msg}` }

// CRITICAL — PI-005: eval on model output
eval(response.text);

// CRITICAL — SS-001: tool fetches URL without allowlist
async function fetchTool({ url }) { return fetch(url); }

// HIGH — CR-002: public LLM endpoint without rate-limit
app.post('/chat', async (req, res) => {
  const r = await openai.chat.completions.create({ messages: [...] });
});

// MEDIUM — RAG-001: retrieved chunks in system prompt
const messages = [{ role: 'system', content: `Context: ${retrieved.join('\n')}` }];
```

## Programmatic API

```typescript
import { scan } from '@great-cto/agentshield';

const report = scan('./src', {
  scanners: ['prompt-injection', 'ssrf-in-tools'],
  minSeverity: 'high',
});

console.log(`Found ${report.findings.length} issues`);
for (const f of report.findings) {
  console.log(`${f.rule.severity} ${f.rule.id} ${f.location.file}:${f.location.line}`);
}
```

SARIF for GitHub Code Scanning:

```typescript
import { scan } from '@great-cto/agentshield';
import { toSarif } from '@great-cto/agentshield/sarif';
import { writeFileSync } from 'fs';

const report = scan('./src');
writeFileSync('agentshield.sarif', JSON.stringify(toSarif(report)));
```

## GitHub Actions

```yaml
name: agentshield
on: [push, pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npx -y @great-cto/agentshield scan --sarif agentshield.sarif
        continue-on-error: true
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: agentshield.sarif
```

## Configuration

### Per-file opt-out

Add a comment anywhere in a file to skip the entire file:

```typescript
// agentshield:ignore
```

### Per-rule opt-out

Some rules support negation patterns — if your code has documented mitigation, the rule won't fire. Examples:

- `SS-001` (URL allowlist missing) — silenced if `ALLOWED_HOSTS` or `URL_ALLOWLIST` appears in the file
- `CR-002` (rate limit missing) — silenced if `rateLimit` / `express-rate-limit` is imported
- `CR-004` (max_tokens missing) — silenced if `max_tokens` / `maxTokens` is set on the call
- `CR-005` (no abort signal) — silenced if `signal:` or `AbortSignal` appears

### Custom rules

Drop additional `*.yaml` files into `node_modules/@great-cto/agentshield/rules/` (Phase 2: a `--rules-dir` flag is on the roadmap).

## Why agentshield, not Snyk / SonarQube / Semgrep?

- **AI-native:** focused on LLM Top 10 + agent-specific patterns. General SAST doesn't know what a "system prompt" is.
- **Zero deps:** pure regex over text. No AST, no language servers, no Docker. Boots in <1s.
- **Standalone:** works on any repo, with any LLM provider. No agent harness required.
- **MIT, free.** Forever.

For vendor-agnostic SAST, use both — they complement each other.

## Roadmap

- v0.2 — `--rules-dir` for custom rules + per-rule disable in config
- v0.3 — Pre-commit hook integration
- v1.0 — 100+ rules + GitHub App for repo-level dashboards
- v1.1 — Pro tier (cloud history, team analytics, JIRA/Linear integration)

## License

MIT — © 2026 Alexander Velikiy. Part of the [great_cto](https://greatcto.systems) ecosystem.
