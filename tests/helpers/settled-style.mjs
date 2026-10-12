/** Browser callback: force style resolution, then observe stable final values. */
export async function collectSettledStyle(el, property) {
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const active = () => el.getAnimations().filter(a => a.playState === 'running' || a.pending);
  let previous;
  for (let attempt = 0; attempt < 8; attempt++) {
    // A single animation snapshot can precede style materialization or a
    // replacement transition. A cancelled finished promise is not stability.
    void getComputedStyle(el)[property];
    await frame();
    await Promise.all(active().map(a => a.finished.catch(() => {})));
    await frame();
    const value = getComputedStyle(el)[property];
    if (!active().length && value === previous) return value;
    previous = value;
  }
  throw Error(`Computed ${property} did not settle across animation frames`);
}

export function settledStyle(locator, property) {
  return locator.evaluate(collectSettledStyle, property);
}
