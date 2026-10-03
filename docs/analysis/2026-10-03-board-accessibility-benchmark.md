# Board accessibility comparative corpus

Subsequent preparation: [frozen corpus registration](2026-10-03-corpus-registration.md).

Scope: `great_cto-p4o9.4.1.8`, UI contract regression `great_cto-p4o9.1.3`. Related: [protocol](2026-10-02-adaptive-benchmark-contract.md), [migration corpus](2026-10-03-migration-safety-benchmark.md).

The eighth representative task repairs actual `web/board.html` markup and CSS. It is not a class-name scanner or synthetic layout policy. Source initially has an unreachable navigation link, div-based controls with no native key activation, suppressed focus,960px minimum layout and wrong decision targets. An external resource creates an actual browser console error under operator CSP. Reference repair uses native buttons, reachable destination, visible focus, responsive wrapping and the protected decision target; it removes the failing resource.

## Actual browser test plan

Chromium runs at320x640,375x720 and1280x800 CSS pixels, with a fresh context per viewport. Hidden checks retain exactly the four preregistered criterion strings. Tab reaches navigation; Enter moves focus to decisions; Tab reaches Approve then Reject; both Enter and Space produce the expected native action sequence; Shift+Tab returns to Approve. Computed outline must remain visible. Browser scroll widths and control rectangles must fit the viewport, not merely be clipped by overflow:hidden. Accessible button names and exact native-click action/target records must preserve both protected controls. Console errors and pageerror are collected rather than silently ignored.

Only the operator's fixed in-memory listener observes isTrusted native clicks. Records never approve tasks or reach provider/backend endpoints. Protected decision.json and random target are byte-bound; reports withhold identifiers. Exact inventory, all protected names, target/viewport semantics and private scorer/browser-entry SHA256 pins are verified. Missing or changed hidden coverage, protected drift, extra code, links, oversized files and tool-pin drift refuse scoring.

Candidate scripts, meta refresh, frames, forms and other active/navigation surfaces are refused. Operator CSP denies all candidate script execution and external resources; requests additionally abort, service workers and downloads are disabled. Inline handlers and foreign href (including namespaced href) are refused before interaction. A real resource-denial probe produced a console failure while zero routed network requests occurred. This is not formal host isolation: Playwright entry pin does not attest dependency closure or Chromium binary, and same-user/operator authority requires independent review under `.5.8`. Forced observer death/browser cleanup is not certified by these normal-completion tests. No eligible model-produced HTML is admitted yet; `benchmarkEligible=false` remains.

Initial tests caught two observer/fixture mistakes: disabling the JavaScript engine also disabled the trusted recorder, so CSP now blocks candidate code while operator instrumentation executes; flex shrinking meant nowrap alone did not overflow, so the defective fixture explicitly preserves control width. Acceptance was not weakened. A contract controller fixture initially used a forbidden report directory and correctly blocked; it was repaired to use docs/specialist-contracts, preserving write constraints.

## Pipeline selection regression

Actual HTML repair exposed missing design/a11y specialist selection. Advisory selection now conservatively includes design-advisor for HTML/CSS/SCSS/Sass/JSX/TSX/Vue/Svelte changes, without mislabeling archetype. Ordinary TS helper changes retain the existing mandatory-only behavior. Unknown evidence includes this contract in conservative advice. Existing-change refuses unsupported design contract execution; phased-change schedules design-advisor-prebuild **before** senior-dev and stops at the actual plan gate. Tests use a local fake execute/verifier callback to inspect controller behavior, not real model dispatch or independent sign-off. Mandatory code/QA/security and security/compliance/ship boundaries remain. Path extensions are not complete semantic UI classification; independent matched domain floors/native evidence remain open.

## Accessibility audit: representative fixture

Standard reference: WCAG2.1, partial automated/keyboard audit, not full AA conformance. [Keyboard events](https://playwright.dev/docs/api/class-keyboard) are actual browser input; [W3C reflow guidance](https://www.w3.org/WAI/WCAG21/Understanding/reflow) motivates the320px case.

| Finding in defective source | Area | Severity | Reference repair |
| --- | --- | --- | --- |
| Navigation/controls unavailable from keyboard | Operable2.1.1/2.4.3 | Critical | Reachable navigation and native buttons |
| No visible keyboard focus | Operable2.4.7 | Major | Visible computed outline |
| Narrow layout spills horizontally | Perceivable1.4.10 | Major | Responsive width/wrap, actual rectangles checked |
| Wrong action target | Decision integrity, not WCAG criterion | Critical | Exact protected metadata and local native click records |
| Blocked external icon console error | Runtime reliability | Minor | Remove unavailable resource |

Static declared body contrast #111/#fff calculates18.883:1; declared focus #0968ff/#fff calculates4.734:1. These are palette arithmetic, not a rendered whole-page contrast audit. Native controls are48px high in the fixture; whole-page target sizing/non-text contrast,200% zoom, screen readers VoiceOver/NVDA, live ARIA announcements, localization and installed admin/API authentication are NOT CHECKED. No compliance certification follows from four benchmark criteria.

Corpus preparation reaches8 of8 only after final verification; corpus completeness does not prove matched trials, independent attested graph/host/package provenance, installed artifact delivery or product quality uplift. No live models, approvals, defaults, installation, merge or release occur.

Final evidence:24 browser-corpus tests pass; expanded205/205 without skips includes controller floor, eight UI extension families and seven earlier recipe/scorer groups. Quick CI exits0: root1255, libraries2889 passed/6 skipped, eval238, docs76, browser9 and L1–L2 executed22 passed/5 skipped. Eleven explicitly NOT CHECKED; full CLI/pack and L3–L5 were not executed this turn. Final HOL scanner83, zero Critical, unchanged35 reviewed High; no new exceptions or baseline changes. Claude auth remains loggedIn=false/authMethod=none. Corpus registration/frozen manifest is tracked as `.4.1.9`; readiness/eligibility flags remain false.
