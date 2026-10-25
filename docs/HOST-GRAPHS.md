# Execution graphs across hosts

This source candidate extends controller-recorded graphs with opt-in local host
observations. It does not establish full native-session coverage or live-provider
acceptance. See [ADR-044](adr/ADR-044-host-graph-coverage.md).

## Authority and coverage

The controller trace owns dispatch, joins, checks, verifier, validated gate
outcomes and release observations. Host metadata never grants those powers.
Declared workflow snapshots, recorded execution and evidence retain separate
provenance. A successful tool result is not task acceptance or a passed gate.

Native graphs contain observed session/tool/child events only. `observed-parent`
means explicit session membership; it is not a tool-call scheduling frontier.
`same-call` connects start/outcome with the same host/session/attempt/call identity.
Event order and timestamps never create a dependency. Valid prose, reasoning and
explicitly supported progress/advisory frames are intentionally excluded without
being labelled as loss. Unknown structural content, including unknown blocks next
to valid tool blocks, retains a gap diagnostic. Unknown identities,
unsupported source formats and interrupted delivery remain partial.

For controlled Claude Code 2.1.292 streams, the audited five-field
`system/ui_invalidate` frame with `event: "ui.render"` and UUID identities is an
internal UI refresh notification and is excluded. Other versions, additional
fields (including instance variants), malformed identities and native input
retain an explicit gap until separately classified.

No old transcript is scanned or imported. Lifecycle hooks without replay-safe
source IDs retain distinct collector deliveries and a persistent missing-identity
warning. This permits inspection without claiming exact source replay coverage.
Native verification, gate and artifact dimensions remain unsupported; consult
bound controller/evidence records for those authorities.

Native Codex `PostToolUse` confirms completion, not tool success: it also fires
for failed calls, without an authoritative outcome field. These observations
retain an unknown outcome, regardless of text or nested values in `tool_response`.
Controlled Codex stream events retain their explicit status/exit-code semantics.
For native Codex prompt/stop events, a valid explicit `turn_id` can identify source
replays; it creates no causal edge and does not replace project/session bindings.
Absent or malformed source identities retain the gap warning.

## Audit without model calls

```sh
great-cto task work graph-audit
```

The audit executes version/help commands only. Stream support is CLI surface
evidence; native hook delivery and live execution remain not checked until an
actual admitted run provides evidence. No key is read or uploaded by the audit.

## Controlled runs

Add `--observe-graph` to `great-cto codex-host start` to collect supplemental
structured host events. The choice is stored with the run. The existing
controller graph is retained when supplemental observation is absent or fails.
Claude streaming preserves its safe/restricted mode, schema and read-only tools.
No native hooks are enabled inside the restricted controlled worker. Each
controller action refreshes a provider-free version/help audit of the configured
executables; built-in runner events retain that version provenance. Custom
executors remain unverified. A version/help audit does not establish complete
event delivery or successful model execution.

Supplementary journals are bounded independently of the existing controller
trace. Work shows the latest eight attempt journals and explicitly reports older
omissions. The page endpoint can read a bound older invocation using its run,
host and invocation identity; it cannot select another project by path.
Frozen wave bindings also expose in-flight worker observations before prepared
attempts are applied. Once an attempt is materialized, its membership is deduplicated;
both projection and pagination retain the same project, host and invocation checks.

## Native sessions

Enable observation for new sessions in one exact project and host before launch:

```sh
great-cto task work graph-enable --dir "$PWD" --host claude-code --source-version 2.1.292
great-cto task work graph-enable --dir "$PWD" --host codex --source-version 0.164.0-alpha.11.1
```

The version argument records the operator's source version; it is not a
capability attestation. On an actual supported SessionStart hook, enrollment
binds that session to the opted-in canonical project. Installed plugin hooks
must actually be loaded by the host. The source change does not update an
already installed plugin or guarantee delivery of a host's unsupported hooks.

For an already known session, enroll explicitly instead:

```sh
great-cto task work graph-bind --dir "$PWD" --host codex --session SESSION_ID
```

Events before enrollment remain unavailable. For a supported external local
bridge, `graph-ingest --dir "$PWD" --host HOST` accepts one bounded JSON event
from stdin and only writes it if the event's session is enrolled. The bridge
must provide the real structural host event; this command cannot prove that an
operator-supplied event originated from a live host.

Inspect pages:

```sh
great-cto task work graph-read --dir "$PWD"
great-cto task work graph-read --dir "$PWD" --host codex --session SESSION_ID --limit 200
great-cto task work graph-read --dir "$PWD" --host codex --session SESSION_ID --cursor CURSOR
```

The admin Execution view labels host provenance, six coverage dimensions,
known gaps and bounded pagination. Declared workflow is a separate disclosure
from immutable snapshots, never proof that those transitions executed. Visual
host lanes do not add dependencies. Supplementary observations collapse by
attempt/session, and expansion is scoped to the current project and task. Local
node search and latest-recorded focus controls never filter causal edges or
issue mutation requests. Missing worker provenance stays Host not recorded. Next observation page is a read-only GET.
Unknown projects and unbound sessions cannot fall back to another graph.

Revoke collection:

```sh
great-cto task work graph-unbind --dir "$PWD" --host codex --session SESSION_ID
great-cto task work graph-disable --dir "$PWD" --host claude-code
```

Project disable revokes its enrolled sessions for that host too. Recorded
journals remain private history; revocation does not delete them.

## Storage and failure

Local operator stores default to `~/.great_cto/host-graphs/` and
`~/.great_cto/graph-bindings/`, outside worker projects. Files require 0600,
directories 0700, and symlinks are rejected. The journal caps 4096 events, 4 MiB
and 4 KiB per normalized record; pages cap 200 events. Damage, writer contention,
quota and missing parents cannot turn into a complete graph.

Only classified metadata is retained. Prompts, commands, tool arguments/results,
raw output, credentials and file paths never enter event records. Enrollment
stores a canonical root privately for membership validation. See
[Privacy](PRIVACY.md#local-execution-graph-observations).

Graph collection does not authorize model spending, native session takeover,
merge, package publication, plugin installation or deployment. Live acceptance
must record exact versions, scenario results and remaining unsupported surfaces;
offline fixtures alone cannot establish full cross-host readiness.
