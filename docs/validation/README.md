# Validation strategy

Three levels of test coverage for the great_cto plugin:

## L1 — Structural (automated, <1s, CI every PR)

`tests/structural/validate.py` — parses plugin.json, command/agent frontmatter,
TYPE_MAP.md. Catches missing fields, broken CMD loop sync, unknown archetypes.

No plugin runtime required.

## L2 — E2E assert-only (automated, <5s per fixture, CI every PR)

`tests/e2e/run_pipeline.sh <fixture> --assert-only` — materialises a fixture in a
tmpdir, asserts manifest requirements. Does NOT execute agents.

Covers: fixture schema validity, manifest structure, harness plumbing.

## L3 — Full dogfood (manual, several minutes, pre-release)

Run `/audit` in a real Claude Code session on a fixture worktree:

```bash
cp -R tests/fixtures/trading-system-rust /tmp/dogfood-trading
cd /tmp/dogfood-trading
git init && git add -A && git commit -m init
# Open Claude Code, run /audit
# Verify: docs/audit/AUDIT-*.md written, verdict log has "project-auditor | DONE",
# Beads has P0-SEC for committed keys
```

**Not automated in CI** because:

- Agent runtime is non-deterministic (hard to assert exact artefact contents)
- Plugin loading mechanism in `claude -p` mode is not stable across versions
- Single full run is 5–10 min and consumes real tokens

## When to run which

| Change type | L1 | L2 | L3 |
|---|---|---|---|
| Command frontmatter / CMD loop | ✅ | — | — |
| New fixture | ✅ | ✅ | — |
| Agent behavior change | ✅ | ✅ | ✅ |
| Release (any version bump) | ✅ | ✅ | ✅ on ≥1 fixture |
