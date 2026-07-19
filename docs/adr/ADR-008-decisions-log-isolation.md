# ADR-008: The decisions log is per-project, not global

**Status:** Accepted (v2.86.0)
**Date:** 2026-07-19
**Supersedes:** the "global ADR log" behaviour introduced with the gate approve/reject flow

## Context

Approving or rejecting a gate on the board appended one line to
`~/.great_cto/decisions.md`:

```
- [TIMESTAMP] [PROJECT] [APPROVED] gate-id — title — reason
```

The intent was a cross-project memory: *"have we decided this before?"*. The
problem is **what a gate title actually contains**. Titles are generated from the
work itself — `gate:plan — <feature> decomposition`, `gate:ship — <component>` —
so they carry the project's own vocabulary: feature names, internal slugs, and
the names of whoever the project is for.

That file is read by agents on *every* project (`agents/senior-dev.md`,
`agents/architect.md`, `agents/knowledge-extractor.md`), and the memory filter
injects its top-k lines straight into the agent's context. So one project's gate
title became readable material inside another project's run.

This is not hypothetical: an audit found a private client name in
`~/.great_cto/decisions.md`, written through this path — not through the
learning loop, which had never fired. There was no per-project isolation of
this log anywhere in the system.

The public repository was never at risk (the file lives outside any repo, and
`scripts/hooks/pre-push.sh` scans pushed content). The exposure is **cross-tenant
context bleed on the operator's own machine**, which is the failure mode that
matters when one operator runs work for several clients.

## Decision

**Gate decisions are project-scoped. Cross-project patterns stay global.** The
two were conflated in one file; they are different kinds of record.

1. `appendDecisionLog()` writes to `<project>/.great_cto/decisions.md`.
2. Called without a project scope it **refuses to write** and warns, rather than
   falling back to the global file. Losing one log line beats leaking a
   project's vocabulary into every other project's context.
3. `readDecisionsLog()` is scoped the same way. The legacy global file is
   deliberately **not merged into** project views — surfacing it everywhere is
   exactly the bleed being removed.
4. `~/.great_cto/decisions.md` keeps its cross-project role for **promoted
   `## pattern:` entries only** (`continuous-learner`'s ≥3-occurrence
   promotions), which are written as generalised patterns, not raw project text.
5. Agent prompts read both, labelled distinctly: *this project's decisions* from
   the local file, *cross-project patterns* from the global one.

### Field separator

`" — "` separates fields on a log line, but gate titles contain it by
construction (`gate:plan — …`), so the reader used to split a title in half and
mislabel its tail as the reason. Field values now have any embedded separator
demoted to a plain hyphen on write, keeping the separator unique per line.

## Consequences

- **Isolation is structural, not conventional.** A project's gate vocabulary
  cannot reach another project's agent context, because the write refuses to go
  anywhere but the project's own directory.
- **Existing global content stays** as read-only history. It has been redacted
  (the private name replaced with `<private-project>`, timestamped backup beside
  it) and receives no further appends. Operators may delete it; nothing reads it
  except the cross-project pattern lookup, which tolerates its absence.
- **Per-project history starts empty.** Decisions recorded before this change
  live only in the legacy global file and are not migrated — attributing old
  lines to projects is guesswork, and guessing is how vocabulary crosses
  boundaries in the first place.
- Regression coverage: `packages/board/decisions-scope.test.mjs` asserts a
  project-scoped write, a refused scope-less write, read isolation between two
  projects, and that a client-shaped token never appears in the global file.
