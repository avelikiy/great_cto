# Task evidence panel

Date: 2026-10-11
Status: implemented candidate; independent review and rollout pending
Architecture: [review evidence and recovery](../adr/ADR-030-review-evidence-and-recovery.md)

## Problem and scope

The existing Work cockpit shows activity, role labels and publication records
in different places. Their presence can be mistaken for current-tree checks,
independent review or runtime health. This read-only panel separates those
claims using the existing project-scoped `/api/work` projection. It does not
scan additional directories, query GitHub, trigger a model or grant authority.

## Contract

Each projected entry has five `evidenceSections` records with `id`, `label`,
`state` (`recorded` or `unknown`) and a plain-text `detail`.

| Section | Available observation | What is not established |
| --- | --- | --- |
| Execution | Up to 20 events belonging to explicit run/session links | Liveness, acceptance, foreign-session attribution |
| Checks | Up to 200 task role verdicts, strictly boolean verifier reports | Actual test counts, current input binding, current-tree verification |
| Review | No task-bound digest/provenance in this projection yet | Reviewer independence or review approval |
| Publication | Existing prepared/pushed/pr-linked record and optional hexadecimal head | Merge, release, deployment |
| Runtime | No explicit runtime probe in this projection yet | Deployment health, including when a release record exists |

`recorded` describes an observation, never a PASS. Missing data remains
`unknown`; unreadable activity and incomplete windows retain their existing
inspector reason/warning. Role completion alone produces no checks. Titles and
role names do not create links. Review receipts from the separate CLI are not
joined by title or role; that requires a future explicit task-bound receipt.
The general role-verdict list is not a substitute for that receipt.

## Design and accessibility

The panel uses the existing card and native `details`/`summary` pattern rather
than a new modal or drawer framework. Its identity is
`data-work-detail="evidence"`, so existing repaint logic retains open state for
the same entry. Project resets discard the previous snapshot.

- Keyboard: focus summary with Tab; Enter/Space uses native disclosure behavior.
- Semantics: native disclosure plus a `dl` of labelled evidence categories.
- Tokens: existing `--text2` and `--fs-body`; no new palette or theme override.
- Layout: wrapping detail text, existing responsive card padding, no fixed width.
- Copy: English system labels; original user task/document content is unchanged.
- Safety: all projected strings are escaped; no evidence action buttons or
  publication links are added by this component.

Legacy snapshots without `evidenceSections` still render the existing cockpit.
The board's execution/publication capabilities are unchanged. Unknown sections
are useful information, not disabled controls and not an empty success state.
