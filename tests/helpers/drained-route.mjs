// Removing the last Playwright route can continue another in-flight route when
// the first callback completes. Keep a passthrough until page teardown, remove
// only the selected handler, and explicitly drain the callbacks it already owns.
const fallbackInstalled = new WeakSet();
export async function installDrainedRoute(page, matcher, handler) {
  if (!fallbackInstalled.has(page)) {
    await page.route('**/*', route => route.continue());
    fallbackInstalled.add(page);
  }
  const active = new Set();
  const tracked = route => {
    const pending = Promise.resolve().then(() => handler(route));
    active.add(pending);
    return pending.finally(() => active.delete(pending));
  };
  await page.route(matcher, tracked);
  return async () => {
    await page.unroute(matcher, tracked);
    await Promise.all(active);
  };
}
