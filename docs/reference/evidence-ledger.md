# Evidence Ledger v1

The Evidence Ledger is the canonical, append-only fact stream that will join
pipeline runs, hosts, agents, gates, reviews and release receipts. It is an
additive migration layer: `pipeline-runs.jsonl`, verdict logs and cross-review
logs keep their existing contracts until their adapters and readers have moved.

## Location and ownership

Each project owns one local file:

```text
.great_cto/evidence-ledger.jsonl
```

The controller writes it. Workers and model roles do not. A role proposes work;
the controller validates the effect and records the resulting fact. This keeps
prompt authority separate from evidence authority.

## Event envelope

```json
{
  "v": 1,
  "event_id": "evt_13cba8a29417c5ea09d14a6eabbc8daa",
  "event_type": "review.completed",
  "occurred_at": "2026-09-11T12:00:00.000Z",
  "project_id": "great_cto",
  "run_id": "run-42",
  "stage_id": "code-reviewer",
  "attempt": 1,
  "host": "codex",
  "agent": "code-reviewer",
  "gate_id": "gate:ship",
  "parent_event_id": null,
  "idempotency_key": "run-42:code-reviewer:1:completed",
  "state": "passed",
  "reason": null,
  "diff_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "artifact_sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "details": {
    "findings": 0,
    "verifier": "independent"
  }
}
```

`event_id` is derived from `project_id` and `idempotency_key`. A retry therefore
addresses the same fact without trusting a process-local UUID. `occurred_at` is
excluded from semantic duplicate comparison: when a caller retries without
remembering the first timestamp, the original recorded time remains authoritative.

## Invariants

1. **Append-only.** An accepted event is one fsynced JSON line. Existing lines
   are never updated or backfilled.
2. **One logical effect, one identity.** The same idempotency key and same
   semantic event returns `duplicate`. The same key with different semantics
   returns `conflict` and writes nothing.
3. **Inter-process serialization.** Writers use an exclusive project-local lock.
   A dead owner can be reclaimed only after the stale interval.
4. **Corruption is not emptiness.** If any existing line is malformed or fails
   the v1 schema, reads return `unreadable`; writes stop because deduplication can
   no longer be proven.
5. **Unknown stays unknown.** `not_run`, `unknown`, `unreadable` and `unmeasured`
   are separate states. None is converted to `false`, `0` or `passed`.
6. **Evidence references bytes.** `diff_sha` and `artifact_sha` are digests. The
   ledger never contains the diff, artifact, prompt, token or secret itself.
7. **Bounded details.** `details` is canonical JSON, at most 8192 bytes, with
   sensitive field names rejected recursively.

## Writer outcomes

| State | Meaning | May a caller claim the fact was recorded? |
|---|---|---|
| `appended` | A new line was fsynced | Yes |
| `duplicate` | The identical logical fact was already present | Yes, using the returned original event |
| `conflict` | The key already names different semantics | No; stop the transition |
| `unreadable` | The file or an existing row cannot be trusted | No; expose degraded evidence |
| `busy` | Another writer held the lock beyond the bounded wait | No; retry with the same key |

Validation errors throw. They are controller defects, not environmental states
that should be rendered as missing evidence.

## Reader contract

`readEvidence(projectRoot)` returns one of:

- `none`: the file is absent or contains no events;
- `some`: every non-empty line is a valid v1 event;
- `unreadable`: at least one line or the file itself cannot be trusted.

On `unreadable`, valid rows may be returned for diagnostics, but no projection
may use them to claim completeness or to satisfy a gate.

## Migration order

1. Ship this schema and writer without changing existing consumers.
2. Dual-write dispatcher, Codex lifecycle, gate, verdict and receipt events.
3. Compare ledger projections with legacy readers and record mismatches.
4. Move Board Decisions and Harness to ledger projections.
5. Retire a legacy reader only after a measured parity window. Historical files
   remain immutable evidence; they are not rewritten into synthetic v1 facts.

## Deliberate non-goals of v1

- No remote event bus or distributed consensus. Great CTO remains a local-first
  operator tool; the lock provides host-local serialization.
- No arbitrary model payloads. A digest plus bounded controller facts is enough
  to locate evidence without turning the ledger into a transcript database.
- No silent repair of torn lines. Repair needs an explicit operator action and a
  retained copy of the damaged bytes.
- No automatic policy change based on events. Outcome evaluation can recommend
  a versioned policy; a gate still decides whether it becomes active.
