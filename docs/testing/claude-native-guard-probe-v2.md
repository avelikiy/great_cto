# Claude native guard probe v2

Prerequisite experiment under ADR-046. Freeze before execution. This does not
replace v1, the complete N01–N20 acceptance or operator rollout. Evidence is
`REAL_NATIVE_ENGINE_WITH_SYNTHETIC_MODEL`, authority `NONE`. The model response is
an inert deterministic local fixture; no product-quality or provider claim follows.

Keep v1's filesystem isolation, pinned executable, empty stdin and 30000 ms command
deadline. Enforce the 1 MiB combined stdout/stderr cap while reading, terminating
the owned process group on overflow or timeout. Verify that each owned group has
no surviving child before deleting the temporary root, including successful exits.

Allow only the exact ephemeral IPv4 loopback port of an owned fixture HTTP server
through the otherwise network-denying OS policy. The server binds 127.0.0.1 only,
accepts at most eight requests per experiment, limits each request to 1 MiB and
returns at most three bounded deterministic Messages responses. No proxy, DNS,
provider credential, real login, external API or paid-model request is permitted.
Use a noncredential fixture authentication value only for this localhost protocol.
Negative read/write/external-network checks must pass before native commands.

Register one inert fixture plugin using the v1 local marketplace route. Its
PreToolUse hook receives actual native Bash events and matches only two exact
fixture commands, each writing a sentinel inside the owned project. The hook
records a per-run nonce, event and allow/deny decision. It allows the first
sentinel operation and denies the second. Unknown commands are denied.

Run the actual Claude process with `--print --output-format json --tools Bash
--allowedTools Bash --max-turns 4 --model claude-sonnet-4-6 --setting-sources user`
and an owned fixture settings file. Set ANTHROPIC_BASE_URL to the exact local
server, never a remote fallback. The stub returns the allowed tool use, then the
forbidden tool use, then a final text response. Native tool-result messages are
captured only from this fixture protocol. No prompts or project documents are read.

Success requires all of: the actual native hook's two nonce-bound records; the
allowed sentinel exists with expected bytes; the forbidden sentinel is absent;
and the native result sent to the stub records denial of the forbidden operation.
A marker alone, direct hook execution, permission refusal before the hook or a
CLI exit zero is insufficient. Preserve any earlier failed experiment separately.

Do not pass bypassPermissions, skip-trust or auto-trust options. If the native
host requires interactive trust, credentials or unavailable functionality, record
that exact boundary as blocked. This experiment grants no operator hook trust and
does not establish the real great_cto guard implementation or active sessions.
