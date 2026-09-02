// The digest spoke every morning that a gate was open, and said the same thing
// each time. 31 of the last 44 on this machine. These are the cases that decide
// when it speaks, and the one that mattered is `unchanged-state`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestDecision, digestState } from './lib/digest-policy.mjs';

test('nothing moved and nothing is open: silence', () => {
  const d = digestDecision({ ySpend: 0, doneYesterday: 0, gates: 0, blocked: 0, prevState: null });
  assert.equal(d.send, false);
  assert.equal(d.reason, 'nothing-happened');
});

test('the same open gate as yesterday is not news', () => {
  const yesterday = digestState({ gates: 1, blocked: 0 });
  const d = digestDecision({ ySpend: 0, doneYesterday: 0, gates: 1, blocked: 0, prevState: yesterday });
  assert.equal(d.send, false);
  assert.equal(d.reason, 'unchanged-state');
  assert.equal(d.state, yesterday);
});

test('no record of yesterday is not "unchanged" — it is unknown, and unknown speaks once', () => {
  const d = digestDecision({ ySpend: 0, doneYesterday: 0, gates: 1, blocked: 0, prevState: null });
  assert.equal(d.send, true);
  assert.equal(d.reason, 'first-report');
});

test('the numbers moved: a second gate opened, or the blocked one cleared', () => {
  const yesterday = digestState({ gates: 1, blocked: 1 });
  assert.equal(digestDecision({ gates: 2, blocked: 1, prevState: yesterday }).reason, 'state-changed');
  assert.equal(digestDecision({ gates: 1, blocked: 0, prevState: yesterday }).reason, 'state-changed');
  assert.equal(digestDecision({ gates: 1, blocked: 0, prevState: yesterday }).send, true);
});

test('activity always speaks, even over an unchanged state', () => {
  const yesterday = digestState({ gates: 1, blocked: 0 });
  assert.equal(digestDecision({ ySpend: 0.15, gates: 1, blocked: 0, prevState: yesterday }).reason, 'activity');
  assert.equal(digestDecision({ doneYesterday: 3, gates: 1, blocked: 0, prevState: yesterday }).send, true);
  // …and with nothing open at all, spend alone is a digest.
  assert.equal(digestDecision({ ySpend: 2.4, gates: 0, blocked: 0, prevState: null }).send, true);
});

test('the state key is stable and does not depend on anything but the two counts', () => {
  assert.equal(digestState({ gates: 1, blocked: 0 }), digestState({ gates: '1', blocked: undefined }));
  assert.notEqual(digestState({ gates: 1, blocked: 0 }), digestState({ gates: 0, blocked: 1 }));
});
