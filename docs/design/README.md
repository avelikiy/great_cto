# Direction ① — the spec canvas

Working sources for the design canvas at
https://claude.ai/code/artifact/165e7378-dfa6-4fae-a7cf-abc4d081d811

Each `*.dc.html` is one artboard; `canvas.json` places them. To change the
canvas, edit these files and re-seed — never edit `direction-one-spec.html`,
which is generated.

Every number in the canvas is measured, and here is where each came from, so a
later reader can re-run rather than trust:

| Claim | How to re-measure |
|---|---|
| contrast ratios | `scripts/lib/contrast.mjs` — `ratio(parseColor(ink), parseColor(bed))` |
| the rendered pairs | `node --test tests/lib/rendered-contrast.test.mjs` |
| ink pixels per weight | draw the string in a canvas at 32px, count pixels with alpha > 10 |
| radius / shadow counts | grep the shipped `packages/board/public/index.html` |
| unused selectors | `node scripts/lib/css-unused-selectors.mjs <css> --root <dir>` |

The canvas is drawn under the rules it documents. If a change to it needs a
radius, a shadow or a weight above the family's axis, the change is wrong.

## Where it sits

The direction is the answer to reviews that came before it, and those reviews
are the evidence for it:

- [DESIGN-board-review.md](DESIGN-board-review.md) — the interface review that
  found the board carrying 116 radii and 15 decorative shadows
- [DESIGN-inbox-redesign.md](DESIGN-inbox-redesign.md) — the panel where the
  headline and the stale rows were reworked under these constraints
- [DESIGN-agents-fleet-view.md](DESIGN-agents-fleet-view.md) and
  [DESIGN-readme-landing-review.md](DESIGN-readme-landing-review.md) — the other
  two surfaces the same tokens have to serve

A new document under `docs/design/` should link back to at least one of these,
or be linked from one. The orphan ratchet in `tests/lib/doc-links.test.mjs`
enforces it, and this README was itself a finding of that check.
