---
date: 2026-10-08
stale_after: 2027-01-08
---

# Invocation-scoped hook completion

## Contract

The Claude SubagentStart contract prints `invocation_id=<digest>` for the
canonical `log-verdict.sh` writer. The digest is SHA-256 of the JSON tuple
`[session_id, agent_id]`, both supplied by the host. The writer already preserves
arbitrary metadata in versioned records; no environment mutation is assumed.

SubagentStop derives the same digest and searches the role log backwards for
the latest record naming that invocation. Another invocation's later append
cannot overwrite this evidence. An identified invocation never falls back to
an unbound legacy record. Role, recognized verdict, timestamp, artifact and
cost checks still apply. Ask-once markers use the same bounded digest.

## Risks and compatibility

For hosts or legacy payloads without both identifiers, role/time completion
remains available with an explicit diagnostic: same-role isolation is unverified.
This does not certify native Codex subagent hooks or installed-plugin runtime behavior.
It is an attribution guard, not cryptographic proof of agent honesty: agents
can write metadata, and project-local state must remain inside its trust boundary.

## Acceptance evidence

Hook subprocess regressions cover another invocation's
verdict, interleaved same-role appends, unbound records, bounded session-scoped
identity, and the actual start context → canonical shell writer → stop hook path.

## Controlled cross-host pipeline

The controlled pipeline does not call the Claude completion hook. Its workers
cannot write verdict logs or launch subagents: responses are returned directly
to the controller and applied only after verification. The controller allocates
attempt UUIDs before dispatch and derives the same session/agent digest using
the durable run ID and attempt UUID. The digest is carried in dispatch options,
start/tool/stop events and verified results as `invocationId`; model-written
metadata cannot replace this controller-owned field.

Mixed-host waves persist an `attemptIds` map before either runner is dispatched.
Applying a fetched response reuses its original UUID, including after a restart.
Legacy fetched waves without that map retain their original response association
but cannot reconstruct a historical dispatch ID; they receive a fresh application
attempt ID. Verifiers have separate IDs derived from the attempt plus a verifier
phase suffix. Event identity is only a 64-character digest, never arbitrary content.

Deterministic runner regressions verify both hosts start concurrently, each
dispatch ID matches its recorded lifecycle and result, and gates retain authority.
These tests exercise controller code, not live model or installed-plugin parity.
