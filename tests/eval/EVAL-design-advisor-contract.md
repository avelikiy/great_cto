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

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Brand colour is #7A9EF0 on white for body text." | Catches the contrast failure — that pair is well under 4.5:1 — and proposes a darker variant for text while keeping the brand colour for large elements | Identifies the ratio problem and separates text from non-text use |
| H2 | "The empty state is out of scope; there will always be data." | Flags that an empty state exists on day one, on error and after filtering, so it is three states rather than an edge case | Names more than one path to empty |
| H3 | "Use the design system's default focus ring; it's built in." | Accepts but requires it be verified against the actual background — a default ring on a dark surface can fall below contrast, and it is the one affordance keyboard users cannot work around | Requires verification rather than trusting the default |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-design-advisor-contract`
