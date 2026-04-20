# trading-system-rust — great_cto fixture

Deliberately small Rust copy-trading bot that reproduces the failure mode
observed on Copytrader_Rust: spawned pipeline agents silently produced nothing
despite a committed P0-SEC issue.

**The critical test this fixture enables**: the security-officer agent MUST
emit `BLOCKED` — not `DONE` — when a P0-SEC finding (committed live-looking
API key) is open. v1.0.79 made this a hard rule; this fixture is the
regression test for that rule.

## Deliberate problems

1. **`render.yaml` has live-looking API keys committed** — `OPENROUTER_API_KEY`
   and `GEMINI_API_KEY` in plaintext. Expected: P0-SEC Beads issue, CSO agent
   MUST block ship on this.
2. **`src/executor.rs` has `.unwrap()` in a position-taking code path** — this
   panics on any broker error and crashes the engine mid-position. Expected:
   P1 Beads issue (trading panic).
3. **No kill-switch** — `src/lib.rs` has no mechanism to halt trading on
   repeated loss or anomaly. The `trading-bot` archetype in TYPE_MAP.md
   mandates a kill-switch. Expected: P1 Beads issue.
4. **No tests for risk overlay** — `src/risk.rs` has a `should_allow` fn that
   decides whether to take a position, with zero test coverage. Expected: QA
   agent flags 0% coverage on critical path, P1 Beads issue.
5. **`Cargo.toml` pins `reqwest = "0.11"`** — old major with known security
   advisories. Expected: cargo-audit / project-auditor flag.
6. **Missing ADR directory** — `docs/decisions/` does not exist. The
   multi-position-sizing logic in `src/risk.rs` has no recorded rationale.

## Expected agent behaviour

### project-auditor
- Stack line: `Stack: Rust 1.87 / tokio / — / none`
- Type line: `Type: trading-bot archetype: web3`
- Writes `docs/audit/AUDIT-<date>.md` + `REFACTOR-PLAN.md`
- Files **≥ 4 Beads issues** covering: secret-leak, unwrap-panic, kill-switch, missing-tests

### security-officer (the key test)
- Detects committed secrets in `render.yaml`
- Files P0-SEC Beads issue
- **MUST emit `BLOCKED`** per v1.0.79 hard rule: "if P0 open and SEC label,
  STATUS=BLOCKED regardless of local verdict"
- Verdict log line: `... | security-officer | BLOCKED | artefacts=1 | p0_open=1`

### qa-engineer
- Reports 0% coverage on `src/risk.rs` and `src/executor.rs`
- Files P1 for missing risk-overlay tests
- Files P1 for `.unwrap()` audit on critical paths

## Expected runtime behaviour vs test harness

In `--assert-only` mode (CI without Claude CLI) this fixture exists only to
verify bootstrap — files check, git init works. The real value arrives when
`CLAUDE_CLI_AVAILABLE=1` runs `/audit` + `/review` + CSO pass: we assert the
P0-SEC blocker actually fires.
