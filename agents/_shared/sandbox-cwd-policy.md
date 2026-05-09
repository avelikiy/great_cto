# Sub-agent sandbox / cwd policy

**Read this before writing prompts that spawn sub-agents to bootstrap a new
project at an arbitrary path.** The constraint described here is part of
Claude Code's design — it cannot be worked around in plugin code alone.

## The constraint

Sub-agents launched via the `Agent` tool inherit the parent session's
**permission grants**, but Claude Code subagents are **isolated** —
`additionalDirectories` granted at runtime in the parent do **not** propagate
to the sub-agent.

What this means in practice:

- Parent session running in `/Users/me/code/proj/` spawns `architect` → architect
  can Write/Bash inside `/Users/me/code/proj/` ✅
- Parent session in `/Users/me/code/proj/` spawns `architect` and asks it to
  Write to `/tmp/new-project/` → **denied**, even if the parent has
  `additionalDirectories: ["/tmp/new-project"]` set ❌

Source: [code.claude.com/docs/en/permissions](https://code.claude.com/docs/en/permissions.md)
("additional directories grant file access, not configuration. Most
`.claude/` configuration is not discovered from additional directories").

## What this means for the great_cto pipeline

The pipeline assumes you are running `claude` **from inside the project root**
(or about to be — see `/start` guard). When that holds, every agent in the
chain (architect → pm → senior-dev → qa → security) writes to `cwd`, which
is the project root, and everything works.

The constraint shows up only when:

1. You are running an orchestrator/harness/QA-test that spawns sub-agents to
   bootstrap a project at a path **outside** the current cwd.
2. You ran `claude` from one repo and want to use `/start` against a
   different external path passed as an argument.

## How to do it right

### Normal user flow (recommended)

```bash
mkdir ~/code/my-new-saas
cd ~/code/my-new-saas
claude
# inside Claude Code:
/start "B2B billing platform"
```

`cwd === project root`. All sub-agents work without per-path grants.

### When you must bootstrap an external path

Two options, neither perfect:

**A. Inline-mode + parent-side persistence.** Tell each sub-agent:
> "Bash and Write may be denied for `<target>`. Return all artefact bodies
> inline in your final text response. The harness will persist them."

Parent session reads sub-agent text output and uses its own Write tool to
persist files. This is what the great_cto QA harness does (see
`docs/qa/runs/2026-05-09/E2E-SAAS-PIPELINE.md`).

**B. Pre-grant via `.claude/settings.local.json`.** Run from inside the target:

```bash
cd /tmp/new-project
mkdir -p .claude
cat > .claude/settings.local.json <<'EOF'
{
  "permissions": {
    "additionalDirectories": ["./"]
  }
}
EOF
claude
/start "..."
```

Even this is not guaranteed to propagate to all sub-agents (Claude Code
subagent isolation is intentional). Approach A is the safer default.

## What plugins / agents MUST NOT assume

- Do not assume sub-agents can Write outside cwd, even if the plugin
  declares wide permissions.
- Do not silently swallow Write/Bash failures from sub-agents — report them
  loudly, ideally with the artefact body inline so the parent can persist.
- Do not invent `--cwd` parameters for the Agent tool — the public API
  doesn't expose one (as of 2026-05).

## Open issue

`great_cto-j5f` (QA-010) tracks the underlying limitation. It will stay
open until either (a) Claude Code adds a propagation mechanism for
`additionalDirectories` to subagents, or (b) we ship a built-in "harness
mode" wrapper that automates option A above for the standard pipeline.
