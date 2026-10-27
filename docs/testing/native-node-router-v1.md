# Native Node router v1

Frozen before implementation under ADR-046. This introduces an inactive,
plugin-relative Node entrypoint. Existing Python runtime and manifests remain
unchanged. No operator activation, signing, publication or paid provider calls.

Preserve MCP2024-11-05, ask_kimi/router_status names and valid input schemas,
non-critical cheap-lane purpose, default model moonshotai/kimi-k2-0905,
max_tokens4096, temperature0 and timeout60seconds. This is not the K3.1 Pro
independent reviewer and does not grant stage approval or USD budget authority.

The new native profile accepts only explicitly supplied process environment.
Do not read project .env.local, home secrets.env, expose key tails or append
usage to an inferred filesystem path. Those legacy conveniences remain in the
unchanged Python profile. Native status identifies native-env-only mode; missing
credentials produce the structured native-reasoning fallback. Metadata/evidence
must exclude credentials, task/context, provider error bodies and private paths.

Only a deliberate ask_kimi call may contact the fixed HTTPS OpenRouter endpoint.
Initialize/list/status perform no provider request. No retry, model fallback,
package acquisition, shell execution or external dependency. Tests may inject a
transport function from the trusted test constructor, never through RPC/env URL.

Bound input lines, serialized request body and response body at1048576bytes.
Reject invalid config without leaking values; token limit must be a positive
safe integer <=1048576, temperature finite0..2, timeout integer1..180seconds.
Defaults stay unchanged; these are transport/config bounds, not spending caps.
AbortSignal reaches the real HTTP request/body. Check monotonic deadline after
response and any explicit usage callback; a late callback may finish late but
must not return successful content. Preserve known usage in timeout/refusal
metadata; absent usage stays unknown. A callback completion is not durable
accounting proof. No implicit callback or journal is installed by stdio mode.

Serialize stdio processing, ignore notifications, support id0, bound malformed
input, drain stdout without immediate process.exit, and stop owned request work
on SIGINT/SIGTERM. No hard wall-clock response guarantee during a trusted slow
accounting callback or blocked output; late-result refusal is the contract.

Acceptance: compare names/input schemas with a frozen legacy-wire fixture; real
stdio init/list/status/fallback and >8192byte output; prove process/home dotenv
files are not read or changed. Local dummy-key HTTP stub covers request shape,
success, HTTP refusal without error-body leakage, invalid JSON/content/usage,
oversize response, actual AbortSignal/socket closure, external cancellation,
late post-accounting deadline and accounting failure with known usage. No real
provider/model, secret file, global plugin, manifest or operator process touched.
Source/compiled packaging, canonical gate and independent review remain required
before any future manifest migration. Full native activation stays unsupported.
