---
date: 2026-10-11
status: draft
---

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

## Design system and accessibility

DESIGN_VARIANCE: 2/10 - Reuse existing Work cards and native disclosure instead of introducing a new visual pattern.
MOTION_INTENSITY: 1/10 - Add no animation; disclosure uses native behavior and existing focus treatment.
VISUAL_DENSITY: 5/10 - Five short evidence categories remain collapsed by default, with details on demand.

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

## Component inventory

One native disclosure inside each existing Work card, one summary, one
description paragraph and one definition list with five sections. Existing
activity inspector, technical details and publication controls remain separate.
No modal, new navigation destination, tooltip or notification is added.

## Responsive behavior

The component inherits the Work card width and existing mobile padding. Details
wrap with `overflow-wrap: anywhere`; there are no fixed-width tables. It must
remain readable on mobile and in both existing themes without horizontal scroll.

## Numeric contract

Counts describe records in the bounded read window, not a quality score or test
pass count. Zero verifier-success reports is a count of explicit boolean claims,
not proof that no check ran. Unknown data never becomes zero. There is no new
monetary, tabular numeric or percentage output in this component.

## Destructive actions and cost of recovery

The component has no destructive action, confirmation token, execution command
or write request. Opening or closing it only changes local disclosure state.
On refresh its existing entry identity retains open state; switching projects
discards the old projection. Rendering failure cannot authorize publication or
change the host run. Reverting this additive UI field leaves legacy snapshots
renderable without changing stored task data.
