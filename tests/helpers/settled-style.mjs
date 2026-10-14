/** Browser callback: force style resolution, then observe stable final values. */
export async function collectSettledStyle(el, input) {
  const property = typeof input === 'string' ? input : input.property;
  const requireHover = typeof input === 'object' && input.requireHover === true;
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const active = () => el.getAnimations().filter(a => a.playState === 'running' || a.pending);
  let previous;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (requireHover && !el.matches(':hover')) return null;
    // A single animation snapshot can precede style materialization or a
    // replacement transition. A cancelled finished promise is not stability.
    void getComputedStyle(el)[property];
    await frame();
    await Promise.all(active().map(a => a.finished.catch(() => {})));
    await frame();
    const value = getComputedStyle(el)[property];
    if (requireHover && !el.matches(':hover')) return null;
    if (!active().length && value === previous) return value;
    previous = value;
  }
  throw Error(`Computed ${property} did not settle across animation frames`);
}

export function settledStyle(locator, property) {
  return locator.evaluate(collectSettledStyle, property);
}

/** A responsive reflow can move the row after Playwright establishes hover.
 * Re-establish the real pointer target, never synthesize a class or style.
 * One absolute 5s window and at most three attempts; the E2E case cap is unchanged.
 * Unsettled styles and hover/action errors still fail, rather than being retried.
 */
export async function settledHoverStyle(locator, property) {
  const deadline = performance.now() + 5000;
  for (let attempt = 0; attempt < 3; attempt++) {
    const remaining = Math.ceil(deadline - performance.now());
    if (remaining <= 0) throw Error('Hover establishment deadline expired');
    await locator.hover({ timeout: remaining });
    const value = await locator.evaluate(collectSettledStyle, { property, requireHover: true });
    if (performance.now() >= deadline) throw Error('Hover establishment deadline expired');
    if (value !== null) return value;
  }
  throw Error('Hover target was lost after bounded pointer establishment');
}
