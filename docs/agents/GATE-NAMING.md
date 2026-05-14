# Gate naming convention

great_cto's pipeline opens human-in-the-loop gates as `bd` tasks with
the `gate` label and a `gate:<name>` title prefix. The board's
`getInbox()` surfaces them in `pending_gates`.

## Canonical gate names

### Universal gates (every archetype)

| Gate | When opened | Closed by |
|---|---|---|
| `gate:plan` | After architect produces ARCH-*.md, before pm decomposes | CTO approves architecture |
| `gate:ship` | After all reviewers/QA/security approve, before devops deploys | CTO approves shipping |

### Conditional gates

| Gate | Fires for | Trigger |
|---|---|---|
| `gate:qa` | medium+ project_size | After qa-engineer publishes QA report |
| `gate:security` | every archetype with `security-officer` in REVIEWERS_BY_ARCHETYPE | After security-officer publishes threat model |
| `gate:compliance` | regulated, fintech, healthcare, marketplace, enterprise-saas, edtech, gov-public, insurance | After domain reviewer signs off |

### Archetype-specific gates

| Gate | Fires for | Owner agent |
|---|---|---|
| `gate:oracle-review` | `web3` | `oracle-reviewer` |
| `gate:edtech-review` | `edtech` | `edtech-reviewer` |
| `gate:gov-review` | `gov-public` | `gov-reviewer` |
| `gate:insurance-review` | `insurance` | `insurance-reviewer` |
| `gate:cost` | `ai-system`, `agent-product`, `mlops` | `architect` posts forecast; CTO approves projected burn |

## Naming rules

1. **Lowercase, hyphen-separated.** `gate:plan` ✅. `Gate:Plan` ❌.
2. **No archetype prefix on universal gates.** It's `gate:plan`, never `gate:fintech-plan`.
3. **Archetype prefix only when the gate is exclusive to that archetype.**
   `gate:edtech-review` is only opened for the `edtech` archetype, so the
   prefix carries information. `gate:qa` fires for many archetypes, so
   no prefix.
4. **Single colon separator.** `gate:cost` ✅. `gate-cost` or `gate::cost` ❌.

## Why this matters

The board's parser splits on `gate:` to extract the gate type for
filtering. Inconsistent naming breaks the kanban "Waiting on gates"
column and the `/api/inbox.summary.gates` counter.

## Source of truth

The actual gate set per archetype lives in
`packages/cli/src/archetypes.ts → GATES_BY_ARCHETYPE` and the filter
function `gatesFor(archetype, projectSize)`. If this doc disagrees with
those, the code wins. Reconcile by editing this doc.

## Historic naming we don't change

- `gate:arch` — early naming for `gate:plan` in strict mode. Both still
  exist; agents emit one or the other. Don't rename in v2.x (would
  break existing audit logs).
- `gate:code` — rarely used; documented but no archetype currently
  fires it. Reserved for future "approve before merge" workflows.

Closes gap G3 from docs/analysis/2026-05-14-pipeline-gaps.md.
