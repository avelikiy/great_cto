# Approval level — details

Read from `skills/great_cto/SKILL.md` § Approval Level, which keeps the level table.
This file holds why the levels are what they are, the checkpoint pattern, how agents
read the level, overrides and the safety floor.

### Levels

| Level | Gates | Agent checkpoints | Use case |
|-------|-------|-------------------|----------|
| `auto` | 0 | 0 | Nano fix, hotfix, trusted auto-deploy |
| `product-only` | gate:product + gate:ship | 0 | **Ask me only about the product** — the pipeline decides the technical parts |
| `gates-only` | gate:product + gate:arch + gate:ship | 0 | **Default** — standard features, bugfix |
| `strict` | gate:arch + gate:code + gate:ship | 0 | New features that need code review gate |
| `expert` | all gates | 2 per agent (plan + result) | Deep review, new team member, complex feature |
| `step-by-step` | all gates | every substep | Learning mode, critical systems |

**`product-only`** keeps exactly the two gates
[ADR-009](../../docs/adr/ADR-009-gates-follow-reversibility.md) calls expensive to
undo — **what to build** (a wrong answer wastes the whole build) and **shipping**
(it escapes the machine and reaches users) — and drops architecture. Everything
between them runs without asking.

**`gates-only` gained `gate:product` on 2026-08-19.** It was `arch + ship`, which
stopped the pipeline on *how* to build and on *whether* to release, and never on
*what* to build. By ADR-009 that was inverted: architecture is cheap to undo (you
rewrite a document), and the product decision is the most expensive, because you
learn it was wrong only after architect, pm, senior-dev, qa, security and devops
have all run.

It costs one pause per **product**, not per feature. `product-owner` is a pipeline
entry point — nothing transitions into it — so it runs only from `/start`;
`/audit` enters at `project-auditor`, and the request classifier routes both
SIMPLE and COMPLEX CODE straight to `senior-dev` or `architect`. Set `auto` if you
want the old unattended behaviour.

The gate set for a level is computed by `scripts/lib/approval-level.mjs`, not
re-derived per agent:

```bash
node scripts/lib/approval-level.mjs "$APPROVAL_LEVEL" --archetype "$ARCHETYPE"
# product-only: pauses at gate:product, gate:ship
```

**Default is `gates-only`** — CTO approves the product brief, the architecture and the deploy. Agents run without mid-stream checkpoints.

### Checkpoint Pattern (expert / step-by-step only)

**Before action (plan):**
```
<agent> planning...
PLAN: <bullet points>
Approve? [enter] approve | "<text>" comment | "cancel" abort
```

**After action (result):**
```
<agent> done.
Artifacts: <list>
Approve? [enter] next agent | "<text>" revise | "cancel" stop
```

Comment → agent revises → re-checkpoint. Max 3 rounds per checkpoint.

### How agents read approval-level

```bash
APPROVAL_LEVEL=$(grep "^approval-level:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}'); APPROVAL_LEVEL=${APPROVAL_LEVEL:-gates-only}
case "$APPROVAL_LEVEL" in
  auto)         SHOW_CHECKPOINTS=false; CREATE_GATES=false ;;
  product-only) SHOW_CHECKPOINTS=false; CREATE_GATES=true ;;
  gates-only)   SHOW_CHECKPOINTS=false; CREATE_GATES=true ;;
  strict)       SHOW_CHECKPOINTS=false; CREATE_GATES=true; GATE_CODE=true ;;
  expert)       SHOW_CHECKPOINTS=true;  CREATE_GATES=true ;;
  step-by-step) SHOW_CHECKPOINTS=true;  CREATE_GATES=true; SUBSTEPS=true ;;
esac

# WHICH gates, not just whether. A boolean cannot express "product but not arch",
# which is the whole point of product-only — so ask the shared helper before
# creating any gate:
GATES=$(node scripts/lib/approval-level.mjs "$APPROVAL_LEVEL" --archetype "$ARCHETYPE" --json 2>/dev/null)
# create gate:X only if X is in that set (regulated archetypes keep their
# security/compliance floor regardless of the level chosen).
```

### Overrides

- Regulated archetypes (`ai-system`, `agent-product`, `commerce`, `web3`, `iot-embedded`, `regulated`, `fintech`, `healthcare`, `insurance`, `legal`, `gov-public`, `defense-govcon`) keep gate:security + gate:compliance + gate:ship at every level, `auto` included. The floor adds no gate:code — choose `strict` for that. The set is `REGULATED_ARCHETYPES` in `scripts/lib/approval-level.mjs`; this line is held to it by a test. (The narrower mandatory-security list in ARCHETYPES.md sets the security-officer tier and size floor, not these gates.)
- `min-size: enterprise` types from TYPE_MAP.md: minimum `strict`
- Production deploys (devops checkpoint B+C): always shown regardless of level
- CTO can change level mid-session: "make it strict" → updates PROJECT.md

### Safety

No auto-proceed on timeouts. Human approval is always required when checkpoint is shown.


