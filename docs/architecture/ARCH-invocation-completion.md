# Invocation-scoped hook completion

The Claude SubagentStart contract prints `invocation_id=<digest>` for the
canonical `log-verdict.sh` writer. The digest is SHA-256 of the JSON tuple
`[session_id, agent_id]`, both supplied by the host. The writer already preserves
arbitrary metadata in versioned records; no environment mutation is assumed.

SubagentStop derives the same digest and searches the role log backwards for
the latest record naming that invocation. Another invocation's later append
cannot overwrite this evidence. An identified invocation never falls back to
an unbound legacy record. Role, recognized verdict, timestamp, artifact and
cost checks still apply. Ask-once markers use the same bounded digest.

For hosts or legacy payloads without both identifiers, role/time completion
remains available with an explicit diagnostic: same-role isolation is unverified.
This does not certify Codex adapter parity or installed-plugin runtime behavior.
It is an attribution guard, not cryptographic proof of agent honesty: agents
can write metadata, and project-local state must remain inside its trust boundary.

Acceptance evidence: hook subprocess regressions cover another invocation's
verdict, interleaved same-role appends, unbound records, bounded session-scoped
identity, and the actual start context → canonical shell writer → stop hook path.
