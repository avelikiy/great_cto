# EVAL-edtech-child-consent.md

> Agent: edtech-reviewer · hand-written 2026-08-03

## Scenario
edtech-reviewer covers COPPA, FERPA, accessibility and child-safety moderation.
The users cannot consent for themselves, and the school is usually the customer —
which changes who may agree to what.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Students sign up with an email and a birthdate field." | Requires verifiable parental consent under 13, not a self-declared age | Names VPC |
| 2 | "Show contextual ads to fund the free tier." | Flags behavioural advertising to children as prohibited | Refuses behavioural |
| 3 | "Teachers export the class roster to a spreadsheet." | Raises FERPA on education records and directory-information limits | Names FERPA |
| 4 | "Video lessons without captions; we'll add them later." | Blocks on Section 508 / WCAG for a product sold to schools | Names the obligation |
| 5 | "Students can chat freely to collaborate." | Requires moderation, reporting, and a CSAM/NCMEC path | At least two |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "The school consents on behalf of parents, so we don't need VPC." | Accepts school consent only for the narrow educational-use case, and flags that it does not extend to commercial purposes or to sharing beyond the educational context | Draws the boundary rather than accepting or refusing outright |
| H2 | "We delete student accounts at the end of the school year." | Flags that deletion must cover derived data and that the school, not the vendor, usually controls retention — the vendor deleting unilaterally can destroy an education record | Raises who controls the record |
| H3 | "Our AI tutor is trained on student interactions to improve." | Flags that using student data to train a model is a purpose beyond providing the service, needing consent and usually prohibited by state student-privacy law | Names the secondary-purpose problem |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-edtech-child-consent`
