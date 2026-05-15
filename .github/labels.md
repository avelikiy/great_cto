# Label conventions

Maintainers: apply labels consistently so contributors can filter. Run `gh label create` (commands at the bottom) when bootstrapping a fork.

## Triage labels

| Label | Color | When to apply |
|---|---|---|
| `needs-triage` | `#ededed` | Default for new issues. Remove when a maintainer reviews. |
| `needs-repro` | `#fbca04` | Bug report without enough info — author hasn't reproduced or didn't include version/logs. |
| `needs-author` | `#fef2c0` | Waiting on the original reporter / PR author to respond. |
| `confirmed` | `#0e8a16` | Maintainer reproduced the bug. |
| `wontfix` | `#c5def5` | Closed — out of scope. Include a one-line reason in the closing comment. |
| `duplicate` | `#cccccc` | Closed — link the canonical issue. |

## Contributor-friendliness labels

| Label | Color | When to apply |
|---|---|---|
| `good-first-issue` | `#7057ff` | ≤2h work + clear acceptance criteria + reading list. Use the issue template. |
| `help-wanted` | `#008672` | We accept a PR. ≤1 week of effort. |
| `epic` | `#5319e7` | Multi-PR project; link sub-issues. |

## Kind labels

| Label | Color | When to apply |
|---|---|---|
| `bug` | `#d73a4a` | Confirmed defect. |
| `feature-request` | `#a2eeef` | Net-new capability. |
| `improvement` | `#a2eeef` | Existing capability, better version. |
| `docs` | `#0075ca` | README / CONTRIBUTING / docs/. |
| `chore` | `#fef2c0` | Build, CI, dependencies, formatting. |
| `security` | `#b60205` | Pre-disclosure: use a private vulnerability advisory instead. Post-disclosure: this label. |

## Area labels (one per surface area)

| Label | When to apply |
|---|---|
| `area:board` | `packages/board/` |
| `area:cli` | `packages/cli/` |
| `area:agents` | `agents/` |
| `area:skills` | `skills/` |
| `area:packs` | `packs/` |
| `area:i18n` | `docs/{locale}/` |
| `area:archetype:<slug>` | One specific archetype (e.g. `area:archetype:fintech`) |
| `area:adapter:<slug>` | One specific stack adapter (e.g. `area:adapter:codex`) |

## Rollup / status labels (for triage boards)

| Label | When to apply |
|---|---|
| `priority:p0` | Production-broken; drop everything. |
| `priority:p1` | Ship within the current cycle. |
| `priority:p2` | Ship within the quarter. |
| `priority:p3` | Backlog. |
| `roadmap:Q2` / `roadmap:Q3` / ... | Quarter we expect to ship. |

## Bot / automation labels

| Label | When to apply |
|---|---|
| `automated` | Bot-generated PR or issue (Dependabot, Renovate, etc.). |
| `auto-merge` | CI bots may merge after green checks. |
| `do-not-merge` | Hold for explicit reason; include the reason in the comment. |

---

## Bootstrap commands (run once for a fresh fork)

```bash
# Triage
gh label create needs-triage --color ededed --description "Default for new issues"
gh label create needs-repro --color fbca04 --description "Bug without enough info"
gh label create needs-author --color fef2c0 --description "Waiting on reporter / PR author"
gh label create confirmed --color 0e8a16 --description "Maintainer reproduced"
gh label create wontfix --color c5def5 --description "Out of scope"
gh label create duplicate --color cccccc --description "Duplicate of another issue"
# Contributor-friendliness
gh label create good-first-issue --color 7057ff --description "≤2h, beginner-friendly"
gh label create help-wanted --color 008672 --description "We accept a PR"
gh label create epic --color 5319e7 --description "Multi-PR project"
# Kind
gh label create bug --color d73a4a
gh label create feature-request --color a2eeef
gh label create improvement --color a2eeef
gh label create docs --color 0075ca
gh label create chore --color fef2c0
gh label create security --color b60205
# Priority
gh label create priority:p0 --color b60205
gh label create priority:p1 --color d93f0b
gh label create priority:p2 --color fbca04
gh label create priority:p3 --color c2e0c6
# Area (add the rest as you split surface areas)
gh label create area:board --color 1d76db
gh label create area:cli --color 1d76db
gh label create area:agents --color 1d76db
gh label create area:skills --color 1d76db
gh label create area:i18n --color 1d76db
# Automation
gh label create automated --color cccccc
gh label create auto-merge --color 0e8a16
gh label create do-not-merge --color b60205
```
