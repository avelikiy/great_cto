# Agent model override

Pin a single Claude model across **every** great_cto agent and command,
overriding the per-agent model tiers shipped in frontmatter.

## When you need this

great_cto assigns models per agent on purpose — `opus` for architecture,
`sonnet`/`haiku` for cheaper work. That is the right default for cost.

But Claude Code 2.1.76 introduced skill-model promotion: when the **session**
runs a 1M-context model, a `model: sonnet` agent is auto-promoted to
`sonnet[1m]`, and the API rejects it with HTTP 429 unless the account holds
long-context billing entitlement (see
[anthropics/claude-code#34296](https://github.com/anthropics/claude-code/issues/34296)).

Pinning every agent to the session's model (e.g. `opus`) sidesteps the
promotion entirely.

## How to use it

Create `~/.great_cto/config` with one line:

```
agent-model: opus
```

Valid values: `opus`, `sonnet`, `haiku`. Trailing `# comments` are allowed.

On the next session start the override is applied automatically. To revert,
delete the line (or the file) — stock per-agent tiers come back.

## How it works

Claude Code reads `model:` from **static** YAML frontmatter; it cannot be a
runtime variable. So the override is applied at copy time:

1. The SessionStart hook copies great_cto's agents/commands into
   `~/.claude/{agents,commands}/` (it already did this).
2. Immediately after, the hook runs `scripts/apply-model-override.sh`.
3. That script reads `agent-model` from `~/.great_cto/config` and rewrites
   the first frontmatter `model:` line of every great_cto-managed file in
   `~/.claude/` to the configured model.

Only the copies in `~/.claude/` are rewritten — the plugin source stays
pristine, so upstream updates remain clean. `advisor-model:` and files with
no `model:` line are left untouched. An absent config file is a no-op.
