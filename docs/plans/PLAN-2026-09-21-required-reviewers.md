# Plan — domain reviewers are required, not suggested

Status: done · Epic: `great_cto-g7hs` · Started 2026-09-21

## Why

great_cto says it wires the right domain reviewers and compliance gates for a project
automatically. Counting real dispatches in this machine's session logs (30.06–21.09) against
the 22 registered projects' `PROJECT.md`:

| Reviewer | Projects whose archetype or compliance needs it | Dispatches |
|---|---|---|
| pci-reviewer | 7 | 1 |
| enterprise-saas-reviewer | 5 | 0 |
| us-privacy-reviewer | 3 | 0 |
| voice-ai-reviewer | 3 | 0 |
| ai-security-reviewer | 3 | 1 |
| gdpr-reviewer | 3 | 1 |
| healthcare-reviewer | 2 | 1 |
| devtools / library / cms reviewer | 1 each | 0 |

The agents are fine — every one passes its evals. Nothing calls them. Three facts from the
code explain it:

- `pipeline-state.mjs` has `MANDATORY = ['qa-engineer', 'security-officer']`. No domain
  reviewer is ever required, whatever the archetype.
- `auto-attach-reviewers.mjs` matches **changed file paths** at session start and prints a
  suggestion. It never reads the archetype, packs or compliance in `PROJECT.md`.
- The archetype → reviewer registry (`REVIEWERS_BY_ARCHETYPE`, `PACK_REVIEWERS`) lives in the
  CLI's TypeScript, which the plugin's scripts do not read. `PROJECT.md` records the
  archetype, packs and compliance, never the reviewers they imply.

## Items

| # | Item | Beads |
|---|---|---|
| R1 | `scripts/lib/required-reviewers.mjs`: `PROJECT.md` → required reviewers, each with its reason; a test keeps the registry equal to the CLI's | `great_cto-g7hs.1` |
| R2 | `gate-check gate:ship` refuses while a required reviewer has no verdict in `.great_cto/verdicts/`, unless a signed `/exception` names it | `great_cto-g7hs.2` |
| R3 | `pipeline-state` lists missing required reviewers beside QA and security | `great_cto-g7hs.3` |
| R4 | Board Fleet: agents this project requires, and whether each has a verdict | `great_cto-g7hs.4` |

## Rules

- Required comes from three places, each named in the reason: the archetype
  (`primary:` / `archetype:`), a pack in `packs:` that brings a reviewer, and a compliance
  token (`pci`, `hipaa`, `tcpa`, `gdpr`, `ccpa`/`cpra`/`us-privacy`, `dpdpa`, `cmmc`).
  `secondary:` archetypes are recommended, not required — a secondary label is not a
  commitment the project made.
- A verdict is evidence the reviewer ran: a line in `.great_cto/verdicts/<agent>.log`. It
  says nothing about which feature; the first version checks that the reviewer ran for
  this project at all, which is what the logs show is missing.
- The gate check runs without Beads. The reviewer check reads files; a missing `bd` no longer
  turns the whole check into a pass.
- The override is the one that already exists: a signed exception for `gate:ship` whose scope
  names `reviewer:<agent>`.
- Behaviour change: a project whose archetype implies a reviewer that never ran will have
  `gate:ship` refused where it passed before. That is the point, and it goes in the
  CHANGELOG under "Changed behaviour".

## What shipped

- **R1** `scripts/lib/required-reviewers.mjs` — 13 tests, including two that fail if the
  registry drifts from the CLI's TypeScript. Found on great_cto itself: `primary:` can be a
  display label (`developer-tools`) beside the registry key in `archetype:` (`devtools`); the
  first value the registry knows decides.
- **R2** `gate-check gate:ship` refuses while a required reviewer has no verdict, unless a
  signed exception scoped `reviewer:<agent>` covers it. The reviewer check runs without
  Beads; a missing `bd` now skips only the task check.
- **R3** `pipeline-state` names missing required reviewers and exits 3, as for QA/security.
- **R4** Board Fleet: "✓ required" / "⚠ required · not run" with the reason on hover; a
  required reviewer with no verdict is in *Needs attention*. Checked live on the board.

## Effect, measured on this machine

15 of the 22 registered projects require at least one domain reviewer, and **all 15 would
have `gate:ship` refused today** — none has a verdict from a reviewer it requires. Missing:
pci-reviewer 7, us-privacy 3, voice-ai 3, gdpr 3, ai-security 2, ai-prompt-architect 2,
ai-eval-engineer 2, devtools 1, cms 1, oracle 1. great_cto itself is one of them
(devtools-reviewer).

**CHANGELOG, next release, "Changed behaviour":** `gate:ship` now requires a verdict from
every domain reviewer the project's archetype, packs or compliance imply. Run the reviewer,
or sign `/exception create --gate gate:ship --scope reviewer:<agent>`.
