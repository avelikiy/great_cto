# Owned MCP listener and captured stock smoke logs

Related: [phase lifecycle fixture](2026-10-03-phase-smoke-isolation.md) and
[hook lifecycle contract](../HOOKS.md).

Stock L1 no longer redirects into predictable `/tmp/gctest-l1-*` log files.
The checker captures command output; archetype/optional pytest summaries are
validated from captured text only after the underlying command succeeds.
No preexisting file or symlink at those former paths is opened.

Stock L2 runs `scripts/lib/mcp-smoke.mjs` against the actual selected CLI
artifact. A child-local HTTP wrapper requires port zero and loopback, captures
the actual server's listening event and sends the bound address over the owned
child IPC channel. Readiness is not inferred from a log line, a successful exit,
or a health response on a fixed port. Only after that event does the parent
request `/healthz`, open `/sse`, initialize MCP and list seven tools. No tools
are called. Protocol assertions retain the existing implementation's
`2024-11-05` version; this is not a latest-protocol compatibility claim.

The CLI has a fresh private cwd and child-local fixture home. Environment
values are allowlisted; update spawning and telemetry are off. The dedicated
state namespace is selected without changing HOME or CODEX_HOME. Child process
APIs and outbound fetch/http/https requests are intercepted and fail the smoke.
No model, Beads or git subprocess runs. This is a trusted-artifact fixture, not
an arbitrary-code OS sandbox or a proof of all production MCP tool behavior.

Stream/readiness/request waits are bounded. Cleanup aborts the SSE reader,
signals only the owned direct child and checks its close event. Forced cleanup
fails the result and retains the private root; it does not authorize killing
an unrelated port owner or claim an OS-level descendant cleanup certificate.
Normal root cleanup uses the same identity-checked exclusively allocated
directory as the phase fixture.

Regression coverage includes the actual source transport, exit-zero plus
printed readiness, fixed-port binding refusal with another owned test server
left untouched, unexpected model launch interception and stock script wiring.
Full CI, installed parity, security sign-off and real mixed-host execution
remain separate evidence requirements in great_cto-p4o9.5.9 and the parent epic.
