# Plan — Cache Discipline (v1.0.69)

> Source of principles: the Anthropic/OpenAI prompt-caching mechanism.
> KV-cache keys off an **exact token prefix**; any edit in the middle invalidates
> everything after it. Our job is to make sure what we put into the model's
> context follows a stable-prefix → volatile-suffix order.

**Guiding principles:**
- Surgical changes only — ~35 LOC across ≤7 files
- No new commands, no new agents
- Zero semantic change (same data, same agents, same gates)
- Each item can ship independently and roll back in one edit

---

## What we're NOT doing

- ❌ No raw-API breakpoint management — we run through Claude Code
- ❌ No hit-rate telemetry — platform doesn't expose it
- ❌ No chunking / re-splitting of agent docs
- ❌ No TTL tuning — sequential pipelines fit comfortably in 5–10 min

---

## Item 1 — SessionStart hook: immutable prefix first, volatile suffix last

### Problem

The SessionStart hook (`.claude-plugin/plugin.json`) emits `=== PREFERENCES ===`,
`=== LOCAL ===`, `=== PROJECT ===`, `=== PHASE ===`, `=== BRAIN ===`, `=== CODEBASE ===`,
`=== HANDOFF ===`, then phase-specific QA/CSO/perf and finally `=== STATUS ===`.

`HANDOFF.md` is written on every PreCompact (session-end auto-save). `STATUS` is
computed fresh each run. If these volatile blocks mix with stable content
(PROJECT.md, brain.md, CODEBASE.md) non-monotonically, the KV-cache prefix
breaks on the first volatile byte.

### Target order (most stable → most volatile)

```
=== PREFERENCES ===     (user global prefs — rarely change)
=== PROJECT ===         (phase + archetype + approval-level — changes on deliberate switch)
=== PHASE ===           (echo of phase from PROJECT — same ttl)
=== BRAIN ===           (compiled truth — digest-synthesized, stable between runs)
=== CODEBASE ===        (code map — regenerated on /audit only)
=== LOCAL ===           (CTO-local notes)
=== HANDOFF ===         (rewritten every PreCompact — volatile)
=== LATEST QA/CSO/PERF  (new reports append — volatile)
=== STATUS ===          (bd counts, branch, last_verdict — computed every hook run)
```

### Change

One block-reorder in `.claude-plugin/plugin.json` SessionStart hook. `LOCAL` moves
after `CODEBASE`, `STATUS` stays at the end. Total: ~3 segment swaps.

### Rollback

Revert the hook bash block. Semantics unchanged.

---

## Item 2 — Document phase as stable cache key

### Problem

Phases already give us cache-friendly prefixes (each phase loads a different
stable set). But this is undocumented, so a CTO might switch phase mid-pipeline
thinking it's free — it isn't.

### Change

Two sentences appended to `skills/great_cto/references/phases.md` under
**## Semantics**:

> ### Cache implication
> Each phase produces a cache-stable SessionStart prefix. Switching phase in the
> middle of an active pipeline invalidates the KV-cache for the rest of the run.
> Switch **between** pipelines (after gate:ship closes, before next feature),
> not during one.

### Rollback

Remove the two-sentence block.

---

## Item 3 — Deterministic sort on every file glob that feeds context

### Problem

Bare `ls docs/postmortems/PM-*.md` relies on filesystem order. On case-insensitive
macOS HFS+ it's alphabetical; on case-sensitive APFS or Linux ext4 it's insertion
order. Different order → different token prefix → cache miss. Already fixed in
several places (`| sort | tail -1`) but inconsistent.

### Files to touch

Explicit `| sort` on every `ls`/`find` that produces a list ingested by the model.
Skipped: `find` used purely for counting (`wc -l`) or for pattern filtering where
order is discarded.

| File | Lines |
|---|---|
| `commands/inbox.md` | line 42 (`find docs/ -name "*.md" -mtime -1`), 58 (`ls docs/rfcs/RFC-*.md`) |
| `commands/digest.md` | lines 65, 87, 162, 181, 182, 319 |
| `commands/release.md` | lines 149, 151, 154 |
| `commands/rfc.md` | line 135 |
| `commands/oncall.md` | line 106 |
| `commands/audit.md` | line 19 |
| `commands/start.md` | line 347 |

Pattern: `ls X 2>/dev/null` → `ls X 2>/dev/null | sort` (before downstream
pipe). `find ... | head -N` → `find ... | sort | head -N`.

### Rollback

Strip `| sort` additions. Behaviour degrades to filesystem order — functional,
just less cache-friendly.

---

## Item 4 — Read-only policy for agents/*.md

### Problem

Agent documents are the largest stable chunks we ship into context. If any
command or hook mutates them at runtime (e.g. to inject task-specific state),
we pay a full cache miss every pipeline turn.

### Change

Add one line to `skills/great_cto/SKILL.md` § "File Layout Invariant" (from v1.0.68):

> - `agents/*.md` and `commands/*.md` are **immutable at runtime**. Anything
>   task-specific flows through `$ARGUMENTS`, `bd` queries, or sibling files in
>   `.great_cto/`. Writing into an agent doc breaks cache and voids handoff
>   determinism.

### Rollback

Delete the line.

---

## Item 5 — `/review` angle structure: diff-first, angle-last

### Problem

`/review` runs 12 angles. Each angle, as a separate evaluation, shares: system
prelude, archetype detection, the full DIFF, and design-system detection. Only
the angle-specific instructions differ.

Currently the 12 angle sections live **after** Setup. That's correct. But each
angle starts with its `**Focus**:` line immediately, and the diff-reading
instructions precede it in Setup — which is fine.

The concern: if each angle invocation re-reads `$DIFF` through a separate tool
call rather than receiving it in-prompt, we don't benefit from prefix caching.

### Change (lightweight)

Add a short "Cache discipline" note at the top of `commands/review.md` right
after Setup block:

> ## Cache discipline
> The diff and archetype detection above are the stable prefix across all 12
> angles. When running angles as separate tool calls, **pass the diff and
> archetype in the same position every time** — do not reorder, do not
> re-detect. The angle-specific focus line is the only varying suffix.

This is documentation, not restructuring. The review.md file already puts
shared data up top. We're codifying the invariant so future edits don't break it.

### Rollback

Remove the note block.

---

## Implementation order

1. **Item 4** — one-line invariant (zero risk, enables future checks)
2. **Item 2** — two-sentence doc (zero risk)
3. **Item 3** — sort additions (pure functional enhancement, low risk)
4. **Item 1** — SessionStart reorder (medium risk — bash block, verify with hook dry-run)
5. **Item 5** — `/review` cache note (low risk)

Each item ships in the same patch — v1.0.69.

---

## Estimated size

| Item | LOC | Files | Risk |
|---|---|---|---|
| 1. Hook reorder | ~6 | 1 | medium |
| 2. Phase doc | ~3 | 1 | 0 |
| 3. Sort additions | ~15 | 7 | low |
| 4. Read-only rule | ~1 | 1 | 0 |
| 5. Review note | ~5 | 1 | 0 |
| **Total** | **~30** | **10 unique (mostly one-line edits)** | — |

---

## Success criteria

- [ ] `grep -n '| sort' commands/inbox.md commands/digest.md commands/release.md` — every `ls X-*.md` line is piped through sort
- [ ] SessionStart hook: PROJECT block emitted **before** HANDOFF in `.claude-plugin/plugin.json`
- [ ] `skills/great_cto/references/phases.md` contains "Cache implication" subsection
- [ ] `skills/great_cto/SKILL.md` File Layout Invariant mentions `agents/*.md` and `commands/*.md` immutability
- [ ] `commands/review.md` contains "## Cache discipline" note
- [ ] `plugin.json` version bumped to 1.0.69
- [ ] `CHANGELOG.md` has v1.0.69 entry

## Rollback (entire patch)

Every item is a one-place edit. Revert the single commit. SessionStart goes back
to previous order; docs lose the cache-discipline sections; sort pipes disappear.
No data migration needed.
