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
