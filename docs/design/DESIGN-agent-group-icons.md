---
date: 2026-10-22
stale_after: 2027-04-22
---

# Shared role-group symbols

## Design system and display contract

Nine monochrome outline symbols identify role groups: Plan, Architecture,
Build, Test & review, Security, Domain reviewers, Ops, Memory and Other.
They are not individual portraits, live execution status, measured quality,
pipeline transitions or evidence of expertise. All 72 shipped roles retain
their names, prompts, tools and lifecycle responsibilities. The inherited
coordinator frontmatter color is metadata, not a new authorization.

`packages/board/public/assets/agent-groups.js` owns the ordered groups,
classification rules and authored SVG paths. It is a pure classic script with
no DOM or network dependency. `scripts/lib/agent-groups.mjs` exposes that same
implementation to Node. Fleet classification delegates to it; the board loads
the exact asset before its inline application. The public site vendors both
files without rewriting them and copies the asset byte-for-byte to its public
assets. Clean site builds do not require an adjacent live plugin checkout.

Classification is presentation only. Test/eval specialists precede generic
builder matching; security and operations specialists precede domain reviewers.
Unknown roles use Other. This does not alter dispatch, mandatory reviewers,
gates, approval levels, budgets or host selection.

## Component inventory

- Board group headings, role rows and profile titles share the same symbols.
  Row status dots remain separate. Symbols are 14 px and inherit theme colors.
- The site renders symbols on its homepage, roster cards, main-path roles and
  context picker, including after changing a preset. Grouping in the lifecycle
  documentation is not replaced with UI classification.

## Accessibility and responsive behavior

- Board symbols retain their 14 px geometry at 390 px and 1440 px viewport
  widths in both light and dark themes. The site legend wraps rather than
  introducing horizontal scrolling; site glyphs follow adjacent type size.
- SVG output comes only from authored constants. Untrusted group keys are
  never interpolated into attributes or markup. Role names remain escaped.
- Symbols use `aria-hidden="true"` and `focusable="false"`; adjacent text
  preserves accessible names. They add no tab stops and no request per role.
- If the board asset fails, role names, groups and actions remain readable.
  The site renders its initial symbols on the server, even without JavaScript.
- Public asset and CSS URLs use content hashes on the site; board JavaScript
  follows its existing no-cache static-asset policy.

## Numeric contract and figure style

Symbols introduce no metrics. Existing Fleet runs, pass rate and cost columns
retain their tabular figures and their explicit missing-data states. A group
count describes roster membership, not execution success or measured quality.

## Destructive actions and cost of recovery

This change adds no action, permission or mutable data endpoint. Existing
profile actions, gate approval and their confirmations remain unchanged.
Recovery is replacing the UI asset with a prior build; a missing board asset
does not remove textual role names or actions. Release and installation remain
separately authorized operations.

## Verification boundary

The browser/Node parity test covers every shipped role, unknown input,
escaping invariants and status separation. The isolated board browser test
covers the roster, keyboard profile opening, both themes, mobile layout and a
failed asset request. Site tests cover all roster cards, repeatable homepage
generation and refusal to write through an out-of-root assets symlink.
The site browser runner additionally changes all three context presets and
checks each resulting role row. A build and package import prove only those
layers; release, deployment and installed-host activation are separate checks.
