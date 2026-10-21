import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { SHOTS, selectScreenshotPanel } from '../../scripts/capture-screenshots.mjs';

test('screenshot names stay stable while routes reach the five actual target panels', async () => {
  assert.deepEqual(SHOTS.map(({ file, route, panel }) => [file, route, panel]), [
    ['board.png', 'work', 'work'], ['ledger.png', 'insights/ledger', 'budgets'],
    ['fleet.png', 'settings/executors', 'agents'], ['harness.png', 'settings/runtime', 'harness'],
    ['settings.png', 'settings/general', 'settings'],
  ]);
  for (const shot of SHOTS) {
    const calls = [];
    const page = {
      async evaluate(fn, route) {
        vm.runInNewContext(`(${fn.toString()})(route)`, {
          route, window: { switchTab: value => calls.push(['route', value]) },
        });
      },
      async waitForSelector(selector, options) { calls.push(['panel', selector, options.state]); },
    };
    await selectScreenshotPanel(page, shot);
    assert.deepEqual(calls, [['route', shot.route], ['panel', `#panel-${shot.panel}.active`, 'visible']]);
  }
});

test('capture refuses a target panel that never becomes visible', async () => {
  const failure = new Error('target did not render');
  await assert.rejects(selectScreenshotPanel({
    async evaluate() {}, async waitForSelector() { throw failure; },
  }, SHOTS[0]), error => error === failure);
});
