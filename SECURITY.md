# Security Policy

great_cto is a Claude Code plugin that operates on your repository through file writes, git commits, and shell commands via Claude Code's tool framework. Security issues in the plugin can lead to unwanted modifications of user code, exposure of secrets through agent context, or privilege escalation via prompt injection.

## Supported versions

Only the latest minor release line receives security fixes. `great_cto` versioning tracks a single-track `v1.0.x` series at present — when `v1.1.0` ships, the `v1.0.x` line enters a 30-day end-of-life window.

| Version | Status |
|---|---|
| `v1.0.x` (current) | ✅ Supported — security + functional fixes |
| `< v1.0` | ❌ Not supported — pre-release, upgrade to latest |

Check your installed version: `grep version .claude/plugins/cache/local/great_cto/*/\.claude-plugin/plugin.json`

## Reporting a vulnerability

**Preferred channel:** email **o.velikiy@wnb.com.ua** with subject `[great_cto security]`.

For GitHub users, you may alternatively open a [private security advisory](https://github.com/avelikiy/great_cto/security/advisories/new). Do **not** open a public issue for vulnerabilities.

### What to include

- Affected component (`agents/<name>.md`, `commands/<name>.md`, `skills/…`, `packages/cli/…`, or plugin hooks in `.claude-plugin/plugin.json`)
- Affected versions (or `main` branch commit SHA)
- Reproduction steps — ideally a minimal repository or a scripted fixture
- Observed impact — what the attacker can achieve (file write, secret exfiltration, command execution, agent privilege escalation)

### Response SLA

| Stage | Target |
|---|---|
| Initial acknowledgement | 72 hours |
| Triage + severity assessment | 7 days |
| Fix + disclosed advisory (High/Critical) | 30 days |
| Fix for Medium/Low | next scheduled release |

If you do not receive an acknowledgement within 72 hours, resend with `[URGENT]` in the subject.

### Coordinated disclosure

Please allow a reasonable embargo window (default 30 days after fix is merged) before public disclosure. Credit will be given in `CHANGELOG.md` unless you request anonymity.

## Threat model — what great_cto does and doesn't protect against

great_cto is opinionated infrastructure that runs Claude Code agents on your code. The following are **out of scope** for this policy — they are properties of Claude Code itself or the underlying LLM, not of great_cto:

- Prompt injection attacks against Claude (use Claude Code's built-in safeguards — `PreToolUse` hooks, permission prompts)
- LLM hallucinations producing incorrect code or ADRs
- Anthropic API availability or rate limits
- The safety of third-party dependencies listed in `.claude-plugin/plugin.json` (`superpowers`, `beads`)

great_cto **does** include defence-in-depth hooks for the most common risks:

- `PreToolUse.Bash` hook blocks `rm -rf /`, `git push --force`, `DROP TABLE`, and similar destructive patterns before they reach the shell
- `PermissionDenied` hook logs all denied tool calls to `.great_cto/permission-denied.log` for forensics
- Agents declare narrow `tools:` frontmatter — e.g. `qa-engineer` has no `Write` access

If you find a way to bypass these hooks, that **is** in scope. Report it.

## Security-relevant components

When assessing a finding, note which layer it applies to:

1. **Plugin hooks** (`.claude-plugin/plugin.json`) — run unconditionally on session events. Highest blast radius.
2. **Agent frontmatter** (`agents/*.md`) — controls which tools each agent can use. Over-broad `tools:` is a misconfiguration bug.
3. **Command skills** (`commands/*.md`) — shell commands embedded in markdown. Shell-injection through argument expansion is possible if `$1` is not quoted.
4. **CLI installer** (`packages/cli/`) — pure Node, no network calls during `init` except `npm` resolution. Runs with user's permissions.

## Changelog

Security-relevant releases are marked with a 🛡 emoji in `CHANGELOG.md` and cross-referenced here:

_No security advisories published yet. This section is updated on first published advisory._
