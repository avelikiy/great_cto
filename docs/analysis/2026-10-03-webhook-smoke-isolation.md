# Stock webhook smoke isolation

This change migrates both stock L2 HMAC probes to
`scripts/lib/webhook-smoke.mjs`. The earlier namespace prerequisite is recorded
in `2026-10-03-webhook-state-namespace.md`; its remaining-boundary statement
describes that earlier commit, not this migration.

## Execution boundary

The harness allocates its own fresh temporary root and dedicated
`GREAT_CTO_HOME`. Before invoking a mutating CLI command, a separate read-only
preflight imports the target artifact's config, dispatch and serve modules and
requires all three path getters to select the fixture namespace. Missing or
inconsistent support raises `WEBHOOK_SMOKE_ISOLATION_UNSUPPORTED`, reported as
`NOT CHECKED` with exit 77. Stock `check` treats this as a failed check, not a
passing compatibility fallback. Imports are of the trusted artifact under test;
this is not a sandbox for arbitrary malicious module initialization.

Once admitted, the real CLI registers one incoming fixture hook. The harness
requires an empty outgoing list, starts the real CLI receiver on an ephemeral
loopback port, and sends either an invalid or valid HMAC. It requires 401/200
respectively, zero outgoing deliveries for the accepted request, the matching
isolated event count, and an empty DLQ. Node's HMAC implementation avoids
platform-specific OpenSSL output parsing.

The child environment is allowlisted; inherited insecure mode, Node options,
and update settings are absent. No `HOME` or `CODEX_HOME` override is used.
Cleanup targets only the fresh fixture root and the child the harness launched.
Forced child termination makes the smoke fail rather than pass. Existing
operator config, backup files and fixed-port owners are not mutated or killed.

## Verified evidence

- TypeScript build succeeds.
- Five existing namespace cases and five new harness cases pass: **10/10**, no
  skips. The harness exercises the real CLI serve entrypoint, not just the
  exported receiver function.
- Three incompatible synthetic artifacts are refused before their CLI
  entrypoint runs: missing event path getter, ambient config path, ambient DLQ
  path. The fixture sentinel remains byte-identical.
- The installed artifact selected by the stock script is
  `~/.claude/plugins/cache/local/great_cto/3.48.0`. Its valid-signature smoke
  refuses with exit **77** before registration or server launch. This is evidence
  of a delivery compatibility gap, not a successful installed HMAC check.
- Shell syntax and diff whitespace checks succeed. The old config backup/restore
  code and fixed HMAC ports are removed from the stock script.

## Still unverified

Full stock CI has not run: SessionEnd still needs an isolated snapshot fixture
that cannot register real lessons, launch an actual merge, or spend on learning.
After that migration, unsupported installed probes must remain visible as
failures/NOT CHECKED. Do not substitute source-only green results for installed
readiness. No plugin install, release, default enablement, merge, human approval,
or security exception occurred.
