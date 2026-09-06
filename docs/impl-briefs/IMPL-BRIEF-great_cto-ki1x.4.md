# IMPL-BRIEF-great_cto-ki1x.4.md — Foundation: tokens, primitives, focus, theme toggle

## Task
- **bd task:** `great_cto-ki1x.4` — Foundation: tokens + StatusDot/GateChip/PostureStrip primitives + two-ring focus + SVG theme toggle
- **Feature:** `board-redesign-2026-09` · PLAN: `docs/plans/PLAN-board-redesign-2026-09.md`
- **Source:** `docs/design/DESIGN-board-redesign-2026-09.md` §6.2 (GateChip), §6.3 (StatusDot), §6.5 (PostureStrip), §7.1 (focus), §6.11 (theme toggle), §8 (tokens)
- **Implements:** DESIGN §6.2/6.3/6.5/6.11/7.1/8 — foundation for every screen built after this task.
- **First Lane-A task.** No dependency; runs in parallel with Lane B (BRD-R1/R2, different files).

## Files to modify
| File / glob | Why it changes |
|---|---|
| `packages/board/public/index.html` | `:root` (~L45) and `[data-theme="light"]` (~L136): add `--absent-warn-fg/-bg`, `--posture-expensive-bg/-fg`; `ABSENCE` dict (~L7075): add `unreadable:'!'`, `unjudged:'?'`; new `StatusDot`, `GateChip`, `PostureStrip` functions in the script section; migrate the `outline`-based focus rule at ~L2631 and `.agent-drawer-close` to the two-ring `box-shadow` form; replace the `☀️`/`🌙` toggle (L16 area / ~L1161) with inline SVG |
| `packages/board/design-contract.test.mjs` | extend required-`ABSENCE`-keys assertion from 3 to 5 |

## Files NOT to modify
| File / glob | Why it's off-limits | Who owns it |
|---|---|---|
| `packages/board/lib/routes.mjs` | No API change needed for this design (per DESIGN §13 handoff) | n/a |
| `scripts/lib/cross-model-review.mjs`, `scripts/lib/gate-reversibility.mjs`, `scripts/lib/agent-posture.mjs` | Read-only consumers — this task calls their exports, does not edit them | Lane B / existing owners |
| any `docs/**` file | doc updates are `great_cto-ki1x.26` (T-D01), not this task | senior-dev (T-D01) |

## Step-by-step
1. Add the 4 tokens to `:root` AND `[data-theme="light"]` — both blocks in the same commit (the file's own comment documents a bug where a token was added to only one).
2. Extend `ABSENCE` with `unreadable`/`unjudged`; extend `design-contract.test.mjs`'s key-count assertion; run RED before, GREEN after.
3. Build `StatusDot(state)` as the single status primitive (positive/negative/in-flight/unloaded/none/unreadable/unjudged) — route one existing status render through it as proof it composes.
4. Build `GateChip(gate)` on `reversibilityOf(gate)` (3 states, typed-name gate in front of existing `approveConsequence` for expensive/unclassified).
5. Build `PostureStrip(toolsLine)` on `postureOf(toolsLine)` incl. the `scopedInNameOnly` full-width row strip (not a chip).
6. Two-ring focus: `box-shadow: 0 0 0 2px var(--bg-card), 0 0 0 4px var(--focus-ring)` (adjust inner-ring token per the container surface) on `:focus-visible`; migrate the two existing `outline`-based rules.
7. Replace emoji toggle with inline SVG (sun/moon paths, `currentColor`, 16px, 1.5px stroke), `aria-label` states the destination theme.
8. Run `node --test packages/board/*.test.mjs tests/lib/contrast.test.mjs` green.

## API-CONTRACT
- **Surface:** `StatusDot(state: string): string` (HTML fragment), `GateChip(gate: {id, ...}): string`, `PostureStrip(toolsLine: string): string` — all pure DOM-string-builder functions, no network I/O.
- **Input:** `GateChip` takes whatever `reversibilityOf()` already returns (`{state, categories[], why}`); `PostureStrip` takes whatever `postureOf()` already returns (`{postures[], expensive[], unknownTools[], fullShellVia[], scopedInNameOnly[]}`). No new shape invented.
- **Output (success):** HTML string with the correct bed/border/glyph/text per the state tables in DESIGN §6.2/§6.3/§6.5; every glyph carries `title` + `aria-label` with the specific `why` (never generic — `why.length > 10` per the existing test convention).
- **Errors:** an unrecognised `state`/`category` renders `unjudged`/`unclassified`, never silently drops to a default "safe" rendering.
- **Invariants:** one hue per meaning (violet = gates only, p0 = expensive posture only); no new hue introduced.

## TEST-SPEC
| # | Case | Expected |
|---|---|---|
| 1 | `ABSENCE.unreadable` / `ABSENCE.unjudged` | glyphs `!` / `?`, unique across all 5 keys |
| 2 | `GateChip` on an `expensive` gate | solid bed, `▲`, Approve disabled until typed name matches |
| 3 | `GateChip` on an `unclassified` gate | dashed border, `?`, SAME typed-name ritual as expensive (not the cheap one) |
| 4 | `PostureStrip` with `scopedInNameOnly` present | full-width strip with the lib's own `why` string, not a chip |
| 5 | two-ring focus on a solid `--accent` button | ring visibly separated from the button (contrast measured against the inner-ring surface, not the button) |
| 6 | theme toggle | no emoji character remains in the control; `aria-label` names the destination theme |

- Coverage target: ≥80%.
- Run: `node --test packages/board/*.test.mjs tests/lib/contrast.test.mjs tests/lib/gate-reversibility.test.mjs`

## ACCEPTANCE
- [ ] Every row in **TEST-SPEC** has a passing test
- [ ] `contrast.test.mjs` green in BOTH themes
- [ ] `design-contract.test.mjs` glyph-uniqueness passes with 5 keys
- [ ] No emoji remains in any control
- [ ] `gate-affordances.test.mjs` still green (unmodified expectations, new typed-name behavior additive)
- [ ] No `:focus` rule sets `outline: none` without a `box-shadow` replacement
- [ ] No file outside **Files to modify** changed; no file in **Files NOT to modify** touched

## Out of scope / deferred
- Wiring these primitives into the actual Decisions/Fleet/Harness screens — separate downstream tasks (`great_cto-ki1x.6/.8/.10`).
- Spacing/radius token cleanup — explicitly out of scope per DESIGN §11 ("own finding, own change").

## Revision history
| Date | Author | Change |
|---|---|---|
| 2026-09-06 | pm | Initial brief |
