---
description: "Requirement → use-case → task → test traceability (NaCl graph value, no Neo4j). Trace one bd node's rationale (upstream) + impact (downstream), or audit a whole feature's chain for coverage gaps. Reads beads relationships."
argument-hint: "<bd-id> | feature <slug> | <bd-id> --json"
user-invocable: true
allowed-tools: Read, Bash
model: haiku
---
<!-- great_cto-managed -->

You are the great_cto `/trace` command — **requirement → use-case → task → test**
traceability over beads relationships (governance Phase 4). This is NaCl's graph value —
impact analysis and coverage gaps — without a Neo4j dependency. The chain is modelled as bd
tasks classified by label and linked with `bd dep`:

```
◆ req  ──depended-upon-by──▶  ◇ uc  ──▶  ○ task  ──▶  ▷ test
```

Edge semantics follow `bd dep`: a downstream node **depends on** its upstream rationale
(`bd dep add <uc> <req>` ⇒ uc depends on req). So tracing **down** = rationale ("why does
this exist?"), tracing **up** = impact ("what breaks if I change this?").

## Step 0 — Resolve the engine + require bd

```bash
PD=$(ls -d ~/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||'); [ -z "$PD" ] && PD=.
TRACE() { node "$PD/scripts/lib/trace.mjs" "$@" 2>/dev/null || node scripts/lib/trace.mjs "$@"; }

bd --help >/dev/null 2>&1 || {
  echo "bd not installed — traceability requires Beads."
  echo "Fallback: the ARCH Requirements Checklist — grep '^- \\[ \\] REQ-' docs/architecture/ARCH-*.md"
  exit 1
}
```

## Step 1 — Dispatch on the argument

```bash
ARG="${ARGUMENTS%% *}"
REST="${ARGUMENTS#* }"

if [ -z "$ARG" ]; then
  echo "Usage:"
  echo "  /trace <bd-id>            # rationale (upstream) + impact (downstream) for one node"
  echo "  /trace feature <slug>     # coverage audit across feature-<slug> (exit 1 if gaps)"
  echo "  /trace <bd-id> --json     # machine-readable"
  exit 0
fi

if [ "$ARG" = "feature" ]; then
  TRACE feature "${REST%% *}"        # coverage audit; non-zero exit ⇒ open gaps
else
  TRACE $ARGUMENTS                   # node-centric trace (passes through --json if present)
fi
```

## How to read the output

- **Rationale (upstream)** — the req/uc this node traces back to. An impl task with an empty
  rationale is an *orphan*: it implements nothing anyone asked for (scope creep, or a missing
  `bd dep add <task> <uc>` link).
- **Impact (downstream)** — everything that depends on this node. Before changing a req or a
  shared task, read this list — those are the use-cases / tasks / tests to re-verify.
- **Coverage gaps** — a req with no use-case, a use-case with no task, a task with no test, or
  a req that never reaches any test (an untested requirement). Each gap is a hole in the chain;
  close it by adding the missing node + `bd dep` link, or explain it with a signed `/exception`.

## The label + edge convention (how the chain gets built)

The graph is only as good as the links agents create. The convention (architect Step 7,
qa-engineer test step):

| Layer | bd label | Linked by |
|---|---|---|
| requirement | `req` + `feature-<slug>` | architect mirrors the ARCH Requirements Checklist |
| use-case | `uc` + `feature-<slug>` | architect mirrors User Success Criteria (USC) |
| task | `feature-<slug>` | pm/architect — `bd dep add <task> <uc>` |
| test | `test` + `feature-<slug>` | qa-engineer — `bd dep add <test> <task>` |

`/trace` excludes epic `parent` edges (structural, not rationale) so the chain stays clean.
If bd is unavailable, the ARCH Requirements Checklist is the degraded-mode source of truth.
