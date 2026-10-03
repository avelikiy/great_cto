# Isolated SessionEnd snapshot smoke

Related: [hook lifecycle contract](../HOOKS.md) and
[webhook smoke isolation](2026-10-03-webhook-smoke-isolation.md).

The former stock L3 check ran SessionEnd at the checkout cwd and asserted only
exit zero. It could register real project lessons, launch a background merge,
and launch a paid learner if ambient configuration enabled it. SessionEnd emits
no stdout directive; the old check name was inaccurate.

## Fixture boundary

`scripts/lib/session-end-smoke.mjs` now runs the actual trusted hook in a fresh
private temporary project. The child process's builtin home lookup is patched
before importing the hook; neither `HOME` nor `CODEX_HOME` is repurposed. A
fixture config enables auto-learning, but the child explicitly sets
`GREAT_CTO_AUTO_LEARN=0`. Parent environment and model credentials are not
inherited. The hook itself and its production defaults are unchanged.

Child-process APIs are intercepted before imports. Synchronous calls return a
fixture failure, not real git/Beads data. The expected lessons-merge launch is
recorded but not executed; any other launch is refused. Consequently there are
no detached descendants to race cleanup or mutate operator lessons. This is a
controlled fixture for the trusted hook, not a sandbox for malicious modules.

The verifier requires an actual single snapshot with the fixture session and
reason, empty hook stdout, the actual lessons symlink under the fixture home,
unchanged fixture lessons/config bytes, no auto-learn marker, and only the
expected intercepted command kinds. An exit-zero hook without a snapshot fails.

## Verification scope

- Source SessionEnd and the installed local 3.48.0 SessionEnd both produce the
  expected snapshot and isolated registration.
- Four new tests cover actual source snapshot, exit-zero/no-snapshot refusal,
  unexpected learner-process launch refusal, and honest stock summary with
  skipped checks. Together with the webhook harness tests: **9/9**, no skips.
- The stock L3 check invokes this verifier rather than the raw hook at checkout
  cwd. It separately counts actual git/Beads capture, actual lessons merge, and
  paid learner as three explicit **NOT CHECKED** skips.
- Shell syntax and diff whitespace checks succeed.
- The actual installed L3 run has **6 passed / 8 skipped**: five other levels
  were intentionally not run, and three SessionEnd paths are explicitly not
  checked. The summary no longer claims merge readiness on successful execution
  with skips; even a skip-free run leaves independent review and gates intact.

This proves fixture snapshot behavior and isolated registration only. It does
not prove real command capture, merge completion, learner results, installed
webhook parity, native admission, benchmark eligibility, security signoff or
full pipeline readiness. Full CI/delivery validation remains a separate task;
board probes and other ambient-state paths must be reviewed before that run.
No installed files, default settings, approvals, release or merge state changed.
