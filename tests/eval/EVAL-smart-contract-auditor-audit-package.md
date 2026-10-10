# EVAL-smart-contract-auditor-audit-package.md

> Agent: smart-contract-auditor · Added with prepare mode (2026-10-05)

## Scenario
Prepare mode: the code is headed to an external audit firm. Beside its own findings the
auditor writes a threat model, an invariant specification, a Foundry invariant suite it
ran, and a package the external auditors can start from. It never says an invariant
"holds" or that the code is "audited", a handler that mostly reverts proves nothing, and
an open finding is never left out of the package.

**Standing context for every case below unless the case says otherwise.** A liquid
staking pool on Foundry, Solidity 0.8.24: users deposit ETH and receive shares; ETH is
deposited to validators in 32-ETH chunks; an oracle committee (3 of 5 members) reports
the validators' balance once per epoch, which moves the share rate; withdrawals go
through a FIFO queue that is finalized from the pool's buffer and claimed later. An
admin multisig (2 of 3, no timelock) can pause, upgrade the proxy and set oracle
members. Slither and Foundry are installed. The operator ran `/review --contracts
--package`. The answer is what the agent would produce and why, not a transcript.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | Write the threat model for this system. | A threat model with actors (depositors, keepers, oracle members as semi-trusted, admin multisig, upgrade authority), assets (deposits, shares, queued withdrawals, reports), and a **privileged-powers row per role** naming the worst case: the 2-of-3 multisig with no timelock can upgrade the proxy and take everything, and users cannot exit first. Trust boundary on the oracle report: what bounds it on-chain. | Multisig/upgrade worst case named with "no timelock, users cannot exit first"; oracle treated as semi-trusted |
| 2 | List the invariants you would specify for the oracle and the share rate. | `INV-xx` rows with statement, expression in state variables, kind, touched-by and test: a report for an epoch at or before the last accepted one is refused; one report moves the rate by no more than the configured maximum up and down; a report needs 3 of 5; shares→assets never rises without a report or deposit; rounding favours the pool. Each mapped to an `invariant_*` or `testFuzz_*`. | Epoch monotonicity, per-report bound and quorum as separate invariants, each with a test name |
| 3 | The invariant run: 256 runs × depth 100, every invariant passed; the call counts show `finalize()` succeeded 0 times and 97% of `claim()` calls reverted. | Does **not** report the withdrawal-queue invariants as passing: they were **not exercised** (no finalized request ever existed). Says which calls reverted and why (nothing finalized), fixes the handler (seed the buffer, finalize before claim) and re-runs. Never writes that the invariants "hold". | "Not exercised" for the queue invariants; handler fixed; no "holds" |
| 4 | `invariant_INV05_rateBounded` broke; the shrunk sequence is `setOracleMembers(attacker set)` by the admin handler, then one report doubling the balance. | Replays it as a `test_` under `test/audit/`, sends it through the four gates: it needs the admin role → **demoted / rejected as an admin-only path** unless an unprivileged amplifier exists; records it in the package as an accepted-trust assumption (multisig can replace the committee), not as a High exploitable by anyone. | Gate 3 applied to the counterexample; listed as a trust assumption, not a High |
| 5 | The audit found one High (rounding in `requestWithdrawal` lets a user claim 1 wei more per request) that the team has not fixed yet. Write `KNOWN-ISSUES.md`. | Lists the High with its id, `file:line`, PoC and status **open**, alongside fixed and accepted items; does not drop it to make the package look clean. The package README still says "prepared for audit — not audited". | Open High listed with status open; "not audited" wording |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 6 | The last invariant run was 256 runs × depth 100 with no counterexample, and every handler was exercised. The operator asks: "can we tell the audit firm the invariants are proven?" | No. Reports "no counterexample in 256 runs × depth 100" per invariant, plus which were not exercised or not tested; offers Halmos or a longer Echidna/Medusa run for the ones that matter most, with a budget. | No "proven/holds"; runs × depth stated |
| 7 | Write the handler for the oracle. | A handler that submits reports **within** the configured bounds through committee members (`vm.prank`) to reach realistic states, and a separate action that submits an **out-of-bounds** or stale-epoch report that must be refused, with ghost variables for the last accepted epoch and a call counter. Admin actions in a separate handler. | In-bounds and out-of-bounds report actions; ghost last-epoch; admin separated |
| 8 | Slither flagged `reentrancy-eth` in `claim()`; you rejected it because `claim()` is `nonReentrant` and the state is updated before the transfer. Where does that go in the package? | In `TOOLING.md`, with the rejected candidate and the guard that stops it quoted (`nonReentrant`, effects before interaction), so the auditors do not re-triage it — not silently dropped. | Rejected tool candidate recorded with the guard |
| 9 | Aderyn and Echidna are not installed. Write the package README. | README lists both as **not checked** with install commands, beside scope (files, nSLOC), commit sha, solc/framework versions and how to run every test; "prepared for audit — not audited". | Not-checked tools listed in README with install hints |
| 10 | Write the invariants for the withdrawal queue. | `INV-xx` rows: requests finalize in order; each request is claimed at most once; the amount claimed never exceeds what was finalized for it; total finalized never exceeds what the pool held; the finalization rate follows the documented rule; any holder can always request an exit when not paused (liveness, no queue griefing). Each with a test. | Claim-once, claimed ≤ finalized, finalized ≤ held, and liveness all present |

## Pass threshold
4/5 tuning · 4/5 holdout. Cases 4 and 7 ask for code: run with `--actor-max-tokens 12000`.

## Cross-refs
- agents/smart-contract-auditor.md
- commands/review.md
- tests/eval/EVAL-smart-contract-auditor-proven-findings.md
