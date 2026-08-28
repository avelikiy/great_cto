# ADR-016 — Learning loop privacy guardrails

**Status:** Accepted
**Date:** 2026-05-08
**Deciders:** great_cto core
**Related:** ADR-015 (learning loop architecture)

## Context

The continuous-learner agent reads session context (transcripts, git logs, agent outputs, file writes) and writes structured lessons to `.great_cto/lessons.md` (project-local) and ultimately `~/.great_cto/decisions.md` (cross-project).

Anything written to `decisions.md` becomes input to **every future project's agent context**. That's a one-way information flow that can leak business-confidential or personal data into unrelated projects.

We need explicit rules: what the learner may capture, what it must NOT.

## Decision

### Hard prohibitions (learner MUST refuse)

The learner agent's system prompt enumerates:

```
You MUST NOT include:
- API keys, tokens, passwords, JWTs (even partial fragments)
- Email addresses, phone numbers, names (unless project-public like git author)
- Internal project codenames or business-confidential terminology
- Customer/user IDs or any data from .env* files
- Source code beyond minimal reference (file:line, not contents)
- Stack traces containing user data
- Database connection strings, even with placeholder credentials
```

Enforcement is at three layers:

1. **Agent system prompt** — the learner is instructed to refuse; this is the soft layer
2. **Pattern allowlist** — lessons must match one of 5 shapes (A-E), each with explicit examples of acceptable content
3. **Post-write scrub (Phase 3+)** — `lessons-merge.mjs` could optionally strip patterns that match secret-scan regexes (currently not implemented; relies on layer 1+2)

### Default-local, opt-in-global

- `.great_cto/lessons.md` is **always project-local** and **never shared** unless the user explicitly publishes it
- `~/.great_cto/decisions.md` is **local to the user's machine**, never auto-synced anywhere
- We do NOT ship telemetry, do NOT call out to any service, do NOT phone home

### User controls

- **Per-session opt-out:** `GREAT_CTO_DISABLE_SESSION_LEARNING=1` (already in v1.1.0 hook)
- **Per-feature opt-out:** Skip the learner entirely; SessionEnd hook still writes the snapshot but skips merge
- **Manual review:** `lessons.md` and `decisions.md` are markdown files; CTO can review, edit, delete entries at any time
- **Hard reset:** `rm -rf ~/.great_cto/{decisions.md,projects/}` clears all cross-project memory

### Data minimization

The learner agent is **prompted to be terse**:
- Maximum 3 lessons per session
- Each lesson must be readable in 30 seconds
- Cite specific evidence (sha, file:line, cost number) but not full code
- Use **active voice, concrete nouns**, no narrative

### Symlink semantics for `~/.great_cto/projects/<slug>/lessons.md`

The SessionEnd hook creates symlinks from `~/.great_cto/projects/<slug>/lessons.md` → the project's `.great_cto/lessons.md`. This means:

- **Aggregation reads through the symlink** — no copies, no stale data
- **If the project is deleted/moved**, the symlink dangles; lessons-merge handles missing files gracefully
- **The `~/.great_cto/projects/` directory contains only metadata** (project slugs as directory names) — no project content is duplicated

If a user wants to truly delete a project's contribution to global memory:
```bash
rm -rf ~/.great_cto/projects/<slug>/
node scripts/lessons-merge.mjs --force   # rebuild decisions.md without that project
```

## Consequences

### Positive

- **No accidental leakage** of secrets, PII, or business data into cross-project memory.
- **Explicit user control** — every privacy decision is opt-in, reversible, and visible (markdown files, not opaque blobs).
- **Privacy-respecting by default** — opt-out is `=1`, not `=0`; the learner does nothing if you don't want it to.
- **Auditable** — `lessons.md` and `decisions.md` are git-trackable; you can review what got saved.

### Negative

- **No automatic enforcement** of "secret in lesson" detection at the agent layer (relies on prompt). Future work: integrate `secret-scan.mjs` patterns into `lessons-merge.mjs` to scrub PRE-promotion.
- **Symlink-based registration is OS-dependent.** On Windows without admin rights, symlinks fall back gracefully (try/catch in session-end.mjs) but cross-project promotion won't work for Windows-Home users without WSL.
- **Trust boundary on the learner.** If the learner agent malfunctions and writes a secret to lessons.md, it's stored unencrypted on disk. Mitigation: `secret-scan.mjs` runs on the *next* edit of lessons.md, blocking further leak; CTO must manually clean.

### Risks

- **A learner-extracted "pattern" reveals indirect business info.** E.g. "we use Stripe for payments" might be a pattern but also reveals payment processor. Mitigation: encourage CTOs to review `decisions.md` periodically; provide `--review` mode for `lessons-merge.mjs` (Phase 3).

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Encrypt `~/.great_cto/decisions.md` at rest | Adds key management; markdown readability is a feature, not bug |
| Phone-home telemetry to suggest lessons | Privacy-violating; defeats the purpose of local-first |
| Whitelist-only mode (only specific shapes captured) | Already implemented as 5-shape taxonomy; this IS the whitelist |
| Scrub all proper nouns with NER | Too aggressive (loses signal); regex patterns suffice for high-confidence secrets |

## References

- ADR-014 — Secret detection patterns (regex catalogue, can be reused for scrub)
- ADR-015 — Learning loop architecture
- `agents/continuous-learner.md` — privacy guardrails section
- `docs/LEARNING.md` — user-facing privacy explanation
