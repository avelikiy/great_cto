# EVAL-design-advisor-contract.md

> Agent: design-advisor · hand-written 2026-08-03

## Scenario
design-advisor picks a design system, enumerates components and locks the a11y
and responsive contract at plan altitude. It must never write implementation
code, and its output is what a builder follows precisely — so vagueness there
becomes improvisation downstream.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Make the dashboard look modern and clean." | Refuses the brief as unactionable; asks for or proposes a concrete direction — named palette, type scale, spacing | Produces specifics, not adjectives |
| 2 | "Write the React component for the data table." | Refuses: plan altitude only, produces the component inventory and contract instead | Declines to write code |
| 3 | "Accessibility can be a follow-up ticket." | Rejects: the contract is set now — contrast, focus order, keyboard paths | Names concrete a11y items |
| 4 | "Mobile is just the desktop layout, narrower." | Requires breakpoints and what changes at each, not a scale-down | Names the breakpoint behaviour |
| 5 | "Use whatever component library the dev prefers." | Requires one system chosen and justified; mixing produces inconsistency | Picks and justifies |
| 6 | "The amounts column and the invoice-number column can share one number style." | Separates them: amounts are summable so they take tabular figures and right alignment; invoice numbers are not summable, so they take neither | Applies the summable / not-summable criterion rather than styling both alike |
| 7 | "Deleting a saved view and deleting a client account can use the same confirm dialog." | Tiers them by cost of recovery: the view is trivially recreated, the account is not and cascades — so the rituals differ, and the second names its blast radius | Distinguishes by cost of undo, not by importance |
| 8 | "Hide the salary field from anyone who can't edit it." | Separates read-only from hidden: hidden is for a role that can never gain access; a reader who needs the value but cannot edit it gets read-only, which stays announced to a screen reader | Chooses by what the role may know, not by what it may do |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Brand colour is #7A9EF0 on white for body text." | Catches the contrast failure — that pair is well under 4.5:1 — and proposes a darker variant for text while keeping the brand colour for large elements | Identifies the ratio problem and separates text from non-text use |
| H2 | "The empty state is out of scope; there will always be data." | Flags that an empty state exists on day one, on error and after filtering, so it is three states rather than an edge case | Names more than one path to empty |
| H3 | "Use the design system's default focus ring; it's built in." | Accepts but requires it be verified against the actual background — a default ring on a dark surface can fall below contrast, and it is the one affordance keyboard users cannot work around | Requires verification rather than trusting the default |
| H4 | "An empty cell in the totals column obviously means zero." | Refuses the conflation: a blank cannot distinguish a true zero from a value rounded to zero, from data not obtained, from a field that cannot apply to this row, from one withheld for permission. Requires each to render distinguishably and forbids the empty cell | Names at least three distinct causes of a blank and requires them to differ visually |
| H5 | "Select-all is just the checkbox in the header." | Requires the selection scope to be named — this page, the current filter, or everything matching — and shown with its count before any bulk action, because the destructive confirmation has to state a blast radius the user is otherwise guessing at | Treats selection scope as a decision, and connects it to the confirmation text |
| H6 | "The dashboard shows skeleton rows while the figures load." | Accepts for lists, but not for a figure someone will act on: a skeleton promises data exists and has that shape. Requires an explicit loading state or the last known value with its timestamp | Distinguishes a decorative skeleton from one that makes a promise about a number |

## Pass threshold
6/8 tuning · 4/6 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-design-advisor-contract`
