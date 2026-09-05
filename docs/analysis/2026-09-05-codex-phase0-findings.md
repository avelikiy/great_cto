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

## HOOKS: ANSWERED — a plugin cannot carry them, and that is upstream's position

Two open issues in openai/codex settle it, and finding them cost less than the
five reversals that preceded them:

- **[#16430](https://github.com/openai/codex/issues/16430)** — plugin-local
  `hooks.json` **does not run**. The runtime loads hooks only from the config
  layer (`~/.codex/hooks.json`). A plugin can contribute `skills`, `.mcp.json`
  and `.app.json`; hooks are not among them.
- **[#39895](https://github.com/openai/codex/issues/39895)** — a root
  `plugin.json` routes the plugin through the Agent Plugins loader, which has no
  hook support, so the `hooks` field in `.codex-plugin/plugin.json` is never
  read — "with no warning, error, or log line".

That is why nothing fired: not our format, not our matcher, not the version.
A plugin is simply not a hook surface on Codex today.

**A regression compounds it.** [#42279](https://github.com/openai/codex/issues/42279)
reports hooks timing out before the command body runs, reproduced across two
operating systems:

| works | broken |
|---|---|
| 0.131.0 · 0.140.0 · 0.146.0 · 0.147.0 | 0.148.0 · 0.150.0 · 0.153.2 |

We are on 0.153.4. Tested 0.147.0 in an isolated prefix as well — the config-layer
path is where that regression lives, and a plugin-local file does not run on
either version, which matches #16430 exactly.

### The correct format, for when this is worth doing

From the working example in #42279 — note it is Claude Code's shape after all,
inside a `hooks` wrapper, with `type` and a string command:

```json
{ "hooks": { "SessionStart": [ { "matcher": "startup|resume|clear|compact",
      "hooks": [ { "type": "command", "command": "…", "timeout": 30 } ] } ] } }
```

My earlier reading of the binary's validator produced a different shape
(`description` + a `hooks` sequence + argv `command`). Codex ACCEPTS that one —
it stops complaining — and still never runs it. An accepted config that does
nothing is worse than a rejected one: the rejection at least said something.

### What this means for great_cto

Hooks on Codex are reachable **only by writing the user's `~/.codex/hooks.json`**
— which is what the original `install --host codex` was reaching for, and it was
right about the direction while being wrong about the details (`hooks_files` is
not a key; `~/.codex/skills/` is not a path Codex reads).

That is a real installer touching a user's config, so it needs their consent and
a working upstream. Both are missing today: the regression is open, and hooks
via plugin are not supported at all. **Not built.**

## The investigation, kept for the record

Four passes, each overturning the last, and only the last two were evidence:

| # | basis | verdict |
|---|---|---|
| 1 | no shipped plugin declares a hook | false — absence of USE read as absence of support |
| 2 | the binary carries the whole contract | true — schema read as behaviour |
| 3 | it was run; no hook fired | false |
| 4 | read the error the run printed | **the file was being REJECTED** |

### The format, established by asking the validator

Codex's `hooks.json` is not Claude Code's shape. Two errors mapped it:

```
unknown field `SessionStart`, expected `description` or `hooks`
invalid type: map, expected a sequence
```

The accepted shape — Codex stops complaining about it:

```json
{
  "description": "…",
  "hooks": [
    { "event": "PreToolUse", "matcher": ".*", "command": ["/abs/path/to/hook"] }
  ]
}
```

Top level is `description` + a `hooks` SEQUENCE, not an event-keyed map, and
`command` is an **argv array**, not a shell string. That last one is what the
"expected a sequence" error was pointing at.

### Where it stops

With that file installed, Codex accepts it and announces
`` `--dangerously-bypass-hook-trust` is enabled. Enabled hooks may run without
review `` — so it sees the hooks and considers them enabled. **No hook process
ever ran.** The probe appends one line to a file; it stayed empty across runs
that created files (so `PreToolUse` had a tool call to fire on), with an
explicit `matcher`, with the trust bypass, and with the script present and
executable.

So: **the config format is known, execution is not demonstrated.** On
codex-cli 0.153.4 either the feature is gated behind something not found here,
or it is incomplete. Nothing hooks-shaped ships until a run shows a hook firing —
and the earlier version of this file did ship, printing a parse error on every
Codex turn for anyone with the plugin installed.

## The old schema notes

The section below concluded, from the binary's JSON Schema, that hooks carry
over. Then it was RUN, and they do not.

codex-cli 0.153.4 fires **no hook at all**. Tried three ways, each with
`--dangerously-bypass-hook-trust`:

| where the hook was declared | fired |
|---|---|
| plugin manifest (`"hooks": "./hooks.json"`, installed and enabled) | no |
| `-c hooks_files.paths=[...]` | no — and `hooks_files` appears nowhere in the binary; that key was invented by our own old installer |
| `~/.codex/hooks.json` | no |

The probe was a hook that only appends a line to a file. It never ran, while the
tool call it was supposed to guard went through — Codex wrote `cfg.env`
containing an API key, twice, with `secret-scan` installed and correctly matched
on `apply_patch`.

Fed the same payload by hand, `secret-scan` denies and exits 2. It is wired,
matched and correct. It is simply never called.

**A schema in a binary is not a working feature.** That is the lesson of this
document, and it cost three reversals to learn:

1. *false* — no shipped plugin declares a hook (absence of use ≠ absence of support)
2. *true* — the binary carries the whole contract (schema ≠ behaviour)
3. *false* — it was run

Only the third is evidence. `hooks.json` stays in the repository, correct and
using `${PLUGIN_ROOT}`, and the manifest does **not** declare it: a key the host
ignores would read as a hook chain that works.

## The schema, for when it does run

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
