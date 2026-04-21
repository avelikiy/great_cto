# DORA — reference

Four metrics that, taken together, predict engineering health better than any single dashboard. Read by `tech-lead` and `qa-engineer` whenever Change Failure Rate spikes.

## The four numbers

| Metric | Formula in great_cto |
|---|---|
| **Deployment Frequency** | count(`.great_cto/deploys.log` lines in window) / period |
| **Lead Time for Changes** | median(bd `closed_at - created_at`) for tasks labelled `feature` or `release` |
| **Change Failure Rate** | count(`docs/postmortems/PM-*.md` mtime in window) / count(deploys in window) |
| **MTTR** | median(`MTTR:` minutes from PM headers in window) |

Run: `/dora [period_days]` (default 30).
Weekly snapshot is included automatically in `/digest`.

## The Ostrovok pattern (read before acting on a CFR spike)

A team at Ostrovok (booking platform) saw incidents climbing and assumed the cause was code quality. They wrote more tests, slowed down reviews, and saw no improvement. When they finally measured DORA, the data showed Lead Time was 2 weeks — not a quality problem, a **release latency** problem. Long-lived branches were merging stale code that broke under newer assumptions. Automating the release pipeline cut Lead Time to 2 days, and incidents fell on their own.

**Rule for tech-lead and qa-engineer:** when CFR rises, **do not jump to "more tests" or "stricter review."** Look at Lead Time first.

| What you see | Likely cause | Action |
|---|---|---|
| CFR ↑, LT ↑ | Release latency producing stale merges | Automate release pipeline. Don't add gates. |
| CFR ↑, LT stable | Real code-quality regression | Tighten code-review or add specific tests for failing area. |
| CFR ↑, MTTR ↑ | Detection or rollback weakness | Improve observability + automate rollback. |
| CFR stable, MTTR ↑ | Incident response weakness | Improve runbooks and on-call coverage. |

## The loop, not the dashboard

Ostrovok's headline result was **−40 to −80% incidents in one year**. The metrics did not cause that — the loop did:

1. Measure (`/dora`)
2. Identify the bottleneck (one of the four)
3. Automate the bottleneck (not the symptom)
4. Re-measure to confirm

A dashboard nobody acts on is decoration. The CFR signal in `/inbox` exists so the loop fires automatically.

## Anti-patterns to refuse

- "We need stricter QA" — only valid if CFR ↑ and LT stable.
- "We need a release freeze" — valid as a short pause, never as a strategy.
- "Engineer X causes most incidents" — DORA is a system metric, not a person metric.
- "Let's not measure CFR because deploys are rare" — that *is* the measurement; low DF is itself the finding.

## Source artefacts

- `.great_cto/deploys.log` — appended by `devops` agent on every production deploy (since v1.0.87)
- `docs/postmortems/PM-*.md` — written by `l3-support` on every P0/P1
- `.great_cto/lessons.md` — one-liner crystallized lessons (since v1.0.86)
- `.great_cto/dora-baseline.log` — local trend log, appended on every `/dora` run

If `deploys.log` is empty, `/dora` reports `NO_DATA` and points at the source of truth, rather than fabricating numbers.
