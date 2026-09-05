---
title: Codex host support — Phase 0 findings
date: 2026-09-05
stale_after: 2026-12-05
status: verified-against-live-install
---

# Codex host support — Phase 0 findings

[`PLAN-2026-06-04-codex-host-support.md`](../plans/PLAN-2026-06-04-codex-host-support.md) opens with a verification gate: five
unknowns, "do FIRST, no build before". Phases 1–3 of that plan were built. The
gate was never run, and no findings document existed until this one.

Verified against a real install: **codex-cli 0.153.4**, macOS, 2026-09-05.

Getting there was itself a finding: the installed CLI was **0.130.0 with an
empty vendor directory** — `codex --version` failed with ENOENT on a binary that
had been deleted on 31 July while the rest of the package dated from 9 May. And
`npm i -g` could not repair it, because the active npm prefix is `/usr/local`
(EACCES) while the package lives under nvm. It installs with an explicit
prefix:

```bash
~/.nvm/versions/node/v22.19.0/bin/npm i -g \
  --prefix ~/.nvm/versions/node/v22.19.0 @openai/codex
```

## What the live install contradicts

| our code says | the install says |
|---|---|
| `harness-router.mjs`: Codex `subagents: false` | `codex doctor` reports `subagent:thread_spawn=3`, and `~/.codex/config.toml` carries `[features] multi_agent = true` |
| `install --host codex` writes `~/.codex/skills/great_cto/` | **`~/.codex/skills` does not exist** on a working install |
| the plan maps our primitives by hand-writing config | Codex ships `codex plugin` with a **marketplace** — the supported path, and the one our own Claude Code distribution already mirrors |

## The plugin surface — the discovery that reframes the work

`codex plugin marketplace add` accepts a **local or Git** source, and
`codex plugin add` installs from it. Three marketplaces are configured out of the
box (`openai-primary-runtime`, `openai-bundled`, `openai-curated`).

A Codex plugin is a directory with `.codex-plugin/plugin.json`. Read from a
shipped one (`notion`), the manifest keys are:

```
name · version · description · author · homepage · repository · license
keywords · skills · mcpServers · apps · interface
```

`skills` points at a `skills/` directory. `mcpServers` declares MCP servers.
That is **the same shape as our `.claude-plugin/plugin.json`**, which already
points at the same `skills/` tree.

What the manifest does NOT carry, checked across every shipped plugin:

| key | manifests using it |
|---|---|
| `skills` | all |
| `mcpServers` | some |
| `hooks` | **0** |
| `commands` | **0** |
| `prompts` | **0** |

`agents/` exists as a directory in some plugins, but it holds
`openai.yaml` — display name, icons, a default prompt. It is **interface
metadata, not agent roles**. Our 71 role agents have no counterpart here.

## CORRECTION — hooks DO carry over

The first pass of this document concluded hooks had no plugin surface, on the
evidence that no shipped plugin declares one. That was reading absence of use as
absence of support, which is the mistake this repository exists to catch.

Reading the binary's own JSON Schema says otherwise. Codex implements the
**same hook contract as Claude Code**, with a wider event set:

```
PreToolUse · PermissionRequest · PostToolUse · PreCompact · PostCompact
SessionStart · SessionEnd · UserPromptSubmit · SubagentStart · SubagentStop · Stop
```

Ours are a subset — Codex adds `PermissionRequest` and `PostCompact`, and has no
`PermissionDenied`. The wire format matches: `hook_event_name`,
`hookSpecificOutput`, `stop_hook_active`, and per-event
`…HookSpecificOutputWire` definitions. `"hooks": "./hooks.json"` is a manifest
key.

**One difference, and it is the one that matters for secret-scan.** The
PreToolUse decision enum is:

```json
"PreToolUseDecisionWire": { "enum": ["approve", "block"] }
```

Claude Code writes `permissionDecision: "allow" | "deny"`. Same idea, different
words — so our blocking hooks need a small output shim, not a rewrite. Whether
`exit 2` alone blocks (as it does on Claude Code) is still unverified; the JSON
decision is the documented path and the one to use.

## The five unknowns

| # | question | answer |
|---|---|---|
| 1 | hook stdin payload shape | **still open** — hooks are not a plugin surface; the config key is accepted (`-c 'hooks.PreToolUse=[]'` parses) but nothing shipped uses it |
| 2 | does Codex honour exit 2 + `permissionDecision` | **still open**, and it gates `secret-scan` — our blocking guard |
| 3 | custom-prompt format for commands | **no plugin surface**: `commands` appears in no manifest |
| 4 | plugin path resolution | **answered**: the marketplace resolves it. Our hand-written `~/.codex/skills/…` path is not where a working install looks |
| 5 | `[features].hooks` stability | `[features]` is real and carries `multi_agent = true`; no `hooks` flag is set in a stock config |

Two of five are answered, one is dissolved (there is a supported path instead),
and **two remain open — both about hooks**, which is where our blocking guard
lives.

## What this means for "full Codex support"

It splits cleanly, and pretending otherwise is what would produce a support
claim we cannot honour:

- **Carries over as-is** — skills and the MCP server, through a plugin manifest
  that mirrors the one we already ship.
- **Carries over with a shim** — hooks. Same events, same wire format, and
  `hooks.json` is a manifest key. The one change is the PreToolUse decision
  vocabulary: `approve`/`block` where we write `allow`/`deny`.
- **Has no plugin surface** — slash commands and role agents. Checked across
  every shipped plugin: no manifest declares `commands` or `prompts`, and the
  `agents/` directory holds interface metadata, not roles.

The first version of this section put hooks in the last row. It was wrong, and
wrong in the direction that costs most: we would have shipped "hooks do not work
on Codex" while the host implements our own contract.
