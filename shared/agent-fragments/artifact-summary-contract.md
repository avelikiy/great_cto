# Artifact summary contract (token economy)

Every great_cto pipeline artifact has two files now:

```
docs/architecture/ARCH-billing.md           ← full document (3-10k tokens)
docs/architecture/ARCH-billing.summary.md   ← ≤ 250 tokens, structured
```

## Producer rules (architect, pm, qa-engineer, security-officer, devops)

When you write a primary artifact (`ARCH-*.md`, `PLAN-*.md`, `QA-*.md`,
`SEC-*.md`, `TM-*.md`, `RELEASE-*.md`, `PERF-*.md`, `ADR-*.md`,
`PHASE-*.md`), the `summary-enforce` PostToolUse hook automatically
generates the paired `.summary.md`. You don't need to write it yourself.

To regenerate manually (e.g. after major edits):
```bash
node scripts/generate-summary.mjs docs/architecture/ARCH-billing.md --force
```

The summary follows a strict structured format per artifact type. Cost ≈
$0.0005 per generation via Haiku; free with heuristic fallback when no API
key is configured.

## Consumer rules (every downstream agent)

**Read the `.summary.md` first.** Only Read the full document if the summary
is insufficient for your decision.

Example — `code-reviewer` checking architectural alignment of a senior-dev
PR:

```
GOOD:
1. Read ARCH-billing.summary.md            (~250 tokens)
2. Read the actual PR diff
3. If summary mentions a risk relevant to the diff → Read ARCH-billing.md

BAD:
1. Read ARCH-billing.md                    (~5000 tokens)
2. Read the PR diff
3. Realize 4500 of those tokens were irrelevant
```

## When to read the full doc

You MUST escalate from `.summary.md` to the full doc when:

- The summary's "Risks" or "Open questions" section flags something
  directly relevant to your decision
- You need to verify a specific design choice cited in the summary
- The summary says "see full doc for [X]" and X is in your scope
- You disagree with the summary's verdict and need to check the reasoning

In all other cases, the summary is enough.

## Why this exists

Before this contract: a typical pipeline had each artifact re-read in full
by 4-5 downstream agents → 15-50k wasted tokens per feature.

With this contract: artifacts are read in full once by their producer and
the immediate consumer; everyone else gets the summary. Expected pipeline
token reduction: 30-50%.

See `docs/plans/PLAN-token-economy-2026-q2.md` for the full token-economy
initiative.
