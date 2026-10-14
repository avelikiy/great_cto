import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSettledStyle, settledHoverStyle } from '../helpers/settled-style.mjs';

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

test('a non-hovered stable colour is not evidence of hover', async t => {
  browserGlobals(t, () => ({ backgroundColor: 'transparent' }), () => {});
  const el = { matches: () => false, getAnimations: () => [] };
  assert.equal(await collectSettledStyle(el, { property: 'backgroundColor', requireHover: true }), null);
});

test('responsive reflow re-establishes the real hover before reading its colour', async t => {
  let hovered = false, calls = 0;
  browserGlobals(t, () => ({ backgroundColor: hovered ? 'final' : 'transparent' }), () => {
    if (calls === 1) hovered = false; // reflow displaced the first pointer target
  });
  const el = { matches: () => hovered, getAnimations: () => [] };
  const locator = {
    hover: async ({ timeout }) => { assert.ok(timeout > 0 && timeout <= 5000); calls++; hovered = true; },
    evaluate: async (fn, input) => fn(el, input),
  };
  assert.equal(await settledHoverStyle(locator, 'backgroundColor'), 'final');
  assert.equal(calls, 2);
});

test('a permanently lost hover fails after three attempts, not a transparent pass', async t => {
  let calls = 0;
  browserGlobals(t, () => ({ backgroundColor: 'transparent' }), () => {});
  const el = { matches: () => false, getAnimations: () => [] };
  const locator = { hover: async () => { calls++; }, evaluate: async (fn, input) => fn(el, input) };
  await assert.rejects(settledHoverStyle(locator, 'backgroundColor'), /Hover target was lost/);
  assert.equal(calls, 3);
});

test('hover retries do not suppress an unsettled style failure', async t => {
  let calls = 0, frames = 0;
  browserGlobals(t, () => ({ backgroundColor: `frame-${frames}` }), () => { frames++; });
  const el = { matches: () => true, getAnimations: () => [] };
  const locator = { hover: async () => { calls++; }, evaluate: async (fn, input) => fn(el, input) };
  await assert.rejects(settledHoverStyle(locator, 'backgroundColor'), /did not settle/);
  assert.equal(calls, 1);
});

test('retargeting shares one deadline instead of renewing the hover budget', async t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const timeouts = [], el = { matches: () => false, getAnimations: () => [] };
  const locator = {
    hover: async ({ timeout }) => { timeouts.push(timeout); now += 3000; },
    evaluate: async (fn, input) => fn(el, input),
  };
  await assert.rejects(settledHoverStyle(locator, 'backgroundColor'), /deadline expired/);
  assert.deepEqual(timeouts, [5000, 2000]);
});

test('a refused pointer action is not retried or converted into style evidence', async () => {
  let calls = 0;
  const locator = {
    hover: async () => { calls++; throw Error('pointer action refused'); },
    evaluate: async () => { assert.fail('no observation after a refused action'); },
  };
  await assert.rejects(settledHoverStyle(locator, 'backgroundColor'), /pointer action refused/);
  assert.equal(calls, 1);
});
