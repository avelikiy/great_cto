import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSettledStyle } from '../helpers/settled-style.mjs';

function browserGlobals(t, style, onFrame) {
  const before = { style: globalThis.getComputedStyle, frame: globalThis.requestAnimationFrame };
  globalThis.getComputedStyle = style;
  globalThis.requestAnimationFrame = callback => queueMicrotask(() => { onFrame(); callback(); });
  t.after(() => {
    if (before.style === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = before.style;
    if (before.frame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = before.frame;
  });
}

test('late frame materialization is observed instead of an intermediate colour', async t => {
  let colour = 'intermediate', frames = 0;
  const el = { getAnimations: () => [] };
  browserGlobals(t, () => ({ backgroundColor: colour }), () => { frames++; colour = 'final'; });
  // The old one-shot animation wait sees no animation and reads too early.
  await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {})));
  assert.equal(getComputedStyle(el).backgroundColor, 'intermediate');
  assert.equal(await collectSettledStyle(el, 'backgroundColor'), 'final');
  assert.ok(frames >= 4, 'two observations across frames, not a single early read');
});

test('an unsettled style fails rather than accepting a transient value', async t => {
  let frame = 0;
  browserGlobals(t, () => ({ backgroundColor: `frame-${frame}` }), () => { frame++; });
  await assert.rejects(collectSettledStyle({ getAnimations: () => [] }, 'backgroundColor'), /did not settle/);
});
