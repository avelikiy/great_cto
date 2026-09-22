# Plan — skills reach the work

Status: done · Epic: `great_cto-98lw` · Started 2026-09-22

## The premise that did not survive

[The field-lessons plan](PLAN-2026-09-21-field-lessons.md) listed "35 of 41 skills never
invoked by the model" and proposed rewriting their descriptions. That count was of
`Skill` tool calls. It missed the path most great_cto skills take: an agent's `skills:`
frontmatter, which Claude Code preloads into the subagent at start. The docs do not
describe that field's semantics, so it was measured — 1,987 subagent transcripts on the
measuring machine, the preloaded skill appearing as a meta message before the first turn:

| Agent (runs) | Preloaded, from its `skills:` list |
|---|---|
| senior-dev (451) | done-blocked 120, ui-ux-pro-max 91, stack-baseline 91, superpowers ×3 108 |
| design-advisor (116) | done-blocked 33, anydesign 26, skeptical-triage 26, committed-aesthetic 16 |
| db-migration-reviewer (14) | archetype-review-base 14, prose-style 14 |

Bare names resolve (`done-blocked`, not `great-cto:done-blocked`). There is no count cap
(runs preloaded up to nine). So rewriting descriptions was the wrong fix. Three real
defects were underneath.

## What was wrong

1. **Names that resolve to nothing.** `beads` sat in 39 agents' lists and loaded zero
   times — there is no such skill. So did `anthropic-skills:*` (four names),
   `product-management:brainstorm`, and five names from another toolkit (`ship`,
   `canary`, `land-and-deploy`, `investigate`, `cso`). A dropped name gives no warning.
2. **Instructions to apply a skill no path reaches.** architect was told to "FIRST apply
   the matching `vertical-<industry>` skill", and pm/product-owner's skill descriptions
   name them as consumers — but none has the `Skill` tool, none preloads them, and the
   plugin's path does not exist in a user's project. Twelve vertical skills, plus
   product-economics, opportunity-solution-tree and outcome-roadmap, were reachable by
   no agent.
3. **The main session does not see descriptions.** On a machine with hundreds of skills,
   the listing the main model gets shows great_cto skills by name only. The main session
   does most deploys and commits.

## What shipped

| # | Item |
|---|---|
| K1 | Dead names removed from every agent. `tests/lib/agent-skills-resolve.test.mjs` fails on any listed name that is not a skill shipped here or a documented external prerequisite (`superpowers:*`). |
| K2 | architect, pm and product-owner get the `Skill` tool and load verticals and product skills on demand (`great-cto:vertical-<industry>`, `product-economics`, `opportunity-solution-tree`, `outcome-roadmap`) — preloading twelve verticals into every run would be ~60 KB of context for the one that applies. |
| K3 | Three skills from what went wrong on real projects: **deploy-landed** (revision, config in PID 1, business function, startup errors — the deploy command's exit code is not the deploy), **secrets-rotation** (an exposed key is spent; one tracked task, done when the old value is refused), **signing-preflight** (a bounded test signature before the first commit; one question up front). Preloaded into devops, l3-support, infra-provisioner, security-officer, senior-dev, mobile-app-builder, and named in the session operating rules so the main session loads them too. |

signing-preflight's check was run on this repository: `signs`.

## Measured after the fact (2026-09-22, signed-in CLI)

An agent with `tools: Skill` asked to load a vertical:

| Run | Result |
|---|---|
| `claude -p --agent probe` (Skill not pre-allowed) | every call `is_error`: "Execute skill: great-cto:vertical-retail" — the permission request, refused because nobody can answer it |
| same, `--allowedTools Skill` | both `great-cto:vertical-retail` and `vertical-retail` loaded; first heading returned verbatim |

So on-demand loading works and both name forms resolve. In an interactive session the
operator is asked once per skill; in an unattended run (`claude -p`, codex-host) `Skill`
must be in the allowed tools, or the architect runs without its vertical and says so.
