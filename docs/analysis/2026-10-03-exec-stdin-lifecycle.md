# Cross-host prompt transport failure lifecycle

Date: 2026-10-03. Scope: `great_cto-p4o9.6`. Discovered during the [bounded-import full regression](2026-10-03-bounded-import-benchmark.md).

## Reproduced failure

The full library suite launched the actual controller CLI with `/usr/bin/false` as an intentionally failing non-model Codex executable. A race between immediate child termination and prompt delivery caused an unhandled stdin `write EPIPE` in `codex-exec.mjs`. Node crashed before the controller stored its terminal blocked state; the saved run remained ready. This is a real execution-state bug, not evidence of a model/auth failure and not just a flaky assertion.

Claude already consumed stdin errors, but discarded them. A valid-looking stdout result could therefore be accepted after incomplete input delivery. Both runners now retain a generic transport error code, abort their own process group, wait for authoritative child close, and force unreadable/null answer semantics. Spawn failure, process exit, transport failure and timeout remain distinct diagnostics. Existing actual usage, if the child reported it, is preserved rather than fabricated as zero. Error text does not include the prompt.

The controller receives the failed execution result and persists its blocked state, attempt and dispatch evidence; no approval is created. The process-close code is retained (possibly null when the group was aborted). Stdin transport success alone does not attest that the CLI consumed or acted on the entire prompt, and this fix makes no such claim.

## Test plan and evidence

Eight new actual subprocess tests cover both runners: closed stdin with valid-looking answer and4MiB prompt, repeated immediate failures with1MiB prompt, missing executable with large input, and fully consumed large input as the positive control. POSIX shell/group tests explicitly skip Windows; they are exercised without skips on the current macOS host. No Codex/Claude model is invoked.

Combined stdin lifecycle, Codex runner and controller-bound collector regression passes44/44. The original controller CLI test now saves blocked state with its benchmark identity, one failed attempt, worker dispatch record and zero approvals. The synthetic executable supplies no provider provenance, sandbox parity or model-quality evidence.

## Remaining boundaries

This repairs subprocess lifecycle reliability; it does not confirm authenticated mixed-host dispatch, full native background/team/fork behavior, independently attested scoped reuse, eligible comparative trials or release/install parity. Those remain requirements of the parent epic. No installed plugin, defaults, human gates, merge or release are changed.
