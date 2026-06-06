# PLAN: NaCl-inspired governance

**Source:** [ITSalt/NaCl](https://github.com/ITSalt/NaCl) — see `docs/analysis/NACL-EVALUATION.md`.
**Goal:** close great_cto's governance gap — make gate bypasses **auditable and gated**, and
make gates refuse on missing evidence — borrowing NaCl's strict-mode + signed-exceptions
ideas, but staying lean (no Neo4j; traceability on beads).

## Phases

**Phase 1 — Signed-exceptions registry (P0, this PR)**
- `.great_cto/exceptions/EXC-*.yaml` — signed, expiring, scoped override of a specific gate.
- `scripts/lib/exceptions.mjs` — `create / sign / verify / list / find / isCovered`.
  sha256 tamper-evidence over canonical fields; expiry; status.
- `/exception` command — create + list signed exceptions.
- Replaces ad-hoc `--admin` / `--no-verify`: a bypass now leaves a who/why/scope/expiry record.

**Phase 2 — Strict-mode evidence-blocking gates (P0)**
- `scripts/lib/gate-check.mjs` — a gate fails if any in-scope beads task is in
  `{UNVERIFIED, BLOCKED, FAILED, NOT_RUN}` (terminal-fail), unless an active signed exception
  from Phase 1 covers it. Wire into `gate:ship` (security-officer) + `/inbox`.
- Removes silent downgrade-to-"explained"; the only sanctioned overrides are signed exceptions.

**Phase 3 — impl-brief handoff bundle (P1)**
- `skills/great_cto/templates/IMPL-BRIEF-template.md` — files-to-modify / **files NOT to
  modify** / step-by-step + paired `API-CONTRACT` + `TEST-SPEC` + `ACCEPTANCE`. Emitted per
  task by pm/architect; read by senior-dev to cut scope creep.

**Phase 4 — beads traceability (P2)**
- Model `requirement → use-case → task → test` as beads relationships + a `/trace <id>`
  command for impact analysis (`bd query`). NaCl's graph value, no Neo4j.

**Phase 5 — gap-closure waves (P1)**
- `skills/great_cto/templates/GAP-REGISTER-template.yaml` + `GAP-WAVE-PLAN-template.yaml`.
- `/audit` + `/migrate` emit a wave plan to close newly-introduced gate gaps incrementally,
  scheduling remediation across waves with signed exceptions for the interim.

## Acceptance
- A gate bypass is impossible without either passing or a **valid signed exception** (logged, expiring).
- `gate:ship` refuses on any terminal-fail task unless covered by an exception.
- Zero new hard dependencies (no Neo4j); traceability runs on beads.

## Do NOT
- ❌ Neo4j / Docker dependency. ❌ bilingual split. ❌ analyst-tool / Docmost / YouGile.
