# PM Planning Reference

> Used by the `pm` agent. Estimation models, parallelism rules, agent allocation, Gantt templates.

---

## Project modes

| Mode | Trigger | Depth | Timeline |
|------|---------|-------|----------|
| **PoC** | `project_size: nano` or `/poc` invocation | 3–10 tasks, 1 agent pool | 0.5–3 days |
| **MVP** | `project_size: small` or `phase: planning` + deadline ≤ 4 weeks | 10–30 tasks, 2–4 agent pools | 1–4 weeks |
| **Full** | `project_size: medium|large|enterprise` | 30+ tasks, N agent pools | weeks–months |

---

## Estimation model

### Task cost by type (wall-clock, single senior-dev agent)

| Task type | Signal | PoC | MVP | Full |
|-----------|--------|-----|-----|------|
| Schema / data model | new tables, migrations | 30 min | 1 h | 2–4 h |
| API endpoint (CRUD) | REST/GraphQL, no auth | 20 min | 45 min | 2 h |
| API endpoint (auth/billing) | payment, IAM path | 1 h | 3 h | 6 h |
| Frontend component | React/Vue, no API | 15 min | 30 min | 1.5 h |
| Frontend page (with API) | full data flow | 45 min | 2 h | 4 h |
| Background job / worker | queue, retry logic | 30 min | 2 h | 4 h |
| LLM integration (simple) | single prompt, no tools | 30 min | 1.5 h | 3 h |
| LLM agent (tool-using) | multi-tool, eval harness | 2 h | 6 h | 12 h |
| Infrastructure (basic) | Docker, CI, env | 20 min | 1 h | 3 h |
| Infrastructure (cloud) | Terraform, IAM, VPC | 1 h | 4 h | 8 h |
| Test suite (unit) | per-module | 15 min | 30 min | 1 h |
| Test suite (integration) | multi-service | 30 min | 1.5 h | 3 h |
| Security review / CSO | per archetype tier | 20 min | 45 min | 2 h |
| QA report | per feature | 15 min | 30 min | 1 h |

**Buffer rules:**
- PoC: no buffer (speed over accuracy)
- MVP: +25% (integration surprises)
- Full: +40% (coordination, review cycles, debt)

**Mandatory gates add flat time:**
- `gate:arch` waiting for human: +0.5 h (async)
- `gate:plan` waiting for human: +0.5 h (async)
- `gate:ship` waiting for human: +0.5 h (async)

---

## Parallelism rules

### Can run in parallel (independent)
- Tasks that own disjoint files (no shared modules)
- Test writing after implementation of the same component (different files)
- Documentation and implementation
- Multiple API endpoints with no shared state
- Multiple frontend components with no shared context/store
- Infrastructure provisioning and application code (when no circular dep)

### Must be sequential (dependent)
- Schema migration → API layer (API reads schema)
- API layer → frontend (frontend calls API)
- Auth system → any endpoint behind auth
- CI pipeline → deploy (CI must pass first)
- `gate:plan` → senior-dev tasks (human must approve plan)
- `gate:arch` → PM plan (plan reads approved ARCH)
- LLM prompt → eval harness (harness tests the prompt)
- Any P0 security fix → next feature work

### Parallel signal in ARCH doc
Look for these patterns in ARCH doc to identify parallel-safe tasks:
```
"independent modules", "separate service", "separate route",
"no shared state", "stateless", "orthogonal"
```

---

## Agent allocation matrix

| Concurrency | When to use | Example |
|-------------|-------------|---------|
| 1 agent | PoC / sequential chain / nano project | Single senior-dev, one task at a time |
| 2–3 agents | MVP with 2+ independent modules | Frontend + backend in parallel |
| 4–6 agents | Full project with multiple services | API + worker + auth + frontend + tests |
| 7+ agents | Large enterprise / monorepo | Rare — coordination overhead exceeds benefit |

**Per-task agent recommendation:**
- Simple CRUD endpoint: 1 senior-dev
- Complex feature (auth + API + frontend): 1 senior-dev (sequential) or 2 (split by layer)
- Service-level work: 1 dedicated senior-dev per service
- Test suite: 1 qa-engineer (after all impls complete for a module)
- Security pass: 1 security-officer (after QA, before gate:ship)
- Each `gate:*`: 0 agents (human decision point)

---

## Gantt diagram format (Mermaid)

```
gantt
    title <Project Name> — <Mode> Plan
    dateFormat  YYYY-MM-DD
    axisFormat  %m/%d

    section Architecture
    gate:arch (human approval)    :crit, milestone, gate_arch, 2024-01-01, 0d
    
    section Foundation
    DB schema migration           :done,  t1, after gate_arch, 2h
    Auth service scaffold         :       t2, after gate_arch, 3h

    section API Layer
    POST /api/users               :       t3, after t1, 2h
    GET  /api/users               :       t4, after t1, 1h

    section Frontend
    Login page                    :       t5, after t3, 3h
    Dashboard page                :       t6, after t4, 4h

    section QA + Security
    QA report                     :       qa, after t5 t6, 1h
    Security review (CSO)         :       cso, after qa, 45m
    gate:ship (human approval)    :crit, milestone, gate_ship, after cso, 0d
```

**Rendering:** Mermaid renders in GitHub, Notion, and Claude Code preview. Always generate mermaid block + ASCII fallback table.

---

## ASCII Gantt fallback (when Mermaid can't render)

```
TASK                          │ D1  │ D2  │ D3  │ D4  │ D5  │
──────────────────────────────┼─────┼─────┼─────┼─────┼─────┤
[GATE] gate:arch              │ ●   │     │     │     │     │
DB schema                     │ ███ │     │     │     │     │
Auth scaffold                 │ ███ │     │     │     │     │
POST /api/users               │     │ ██  │     │     │     │
GET  /api/users               │     │ █   │     │     │     │
Login page         (parallel) │     │ ███ │     │     │     │
Dashboard page     (parallel) │     │     │ ████│     │     │
QA report                     │     │     │     │ ██  │     │
Security CSO                  │     │     │     │  ██ │     │
[GATE] gate:ship              │     │     │     │     │ ●   │
```

`●` = human gate (wait for approval)  
`███` = agent work  
`(parallel)` = multiple agents active simultaneously

---

## PLAN-*.md artefact schema

```markdown
# PLAN-<feature-slug>.md

## Mode
poc | mvp | full

## Summary
Total tasks: N  |  Parallel pools: N  |  Max concurrent agents: N
Estimated duration: Xh (excluding human gate wait times)
Gate wait budget: ~1.5h (3 gates × 0.5h async)
Total elapsed: ~Xh

## Dependency graph
task-1 → task-2 → task-4
task-1 → task-3 (parallel with task-2) → task-4

## Gantt
<mermaid gantt block>

## Task breakdown

| ID | Task | Type | Agent | Deps | Est | Parallel-safe? |
|----|------|------|-------|------|-----|----------------|
| T1 | DB schema | impl | senior-dev | gate:arch | 1h | No (foundation) |
| T2 | Auth service | impl | senior-dev | T1 | 2h | No |
| T3 | POST /users | impl | senior-dev | T1 | 1h | Yes (with T4) |
| T4 | GET /users | impl | senior-dev | T1 | 30m | Yes (with T3) |
| T5 | QA | qa | qa-engineer | T3 T4 | 30m | No |

## Agent pools

**Pool A** (sequential chain): T1 → T2 → T5  ← 1 senior-dev
**Pool B** (parallel): T3 ∥ T4              ← 1–2 senior-devs

Minimum agents needed: 2 senior-dev + 1 qa-engineer

## Gates

| Gate | After | Blocks |
|------|-------|--------|
| gate:arch | Architecture approval | All implementation |
| gate:plan | Plan approval | senior-dev Pool A + B |
| gate:ship | QA + security pass | Deploy |

## Risks
- T2 (auth) may expand if OAuth provider API changes → +50% buffer on T2
- T5 (QA) may find regressions in T3/T4 → loop back estimated 30m

## Revision history
v1 — <date> — initial plan
```
