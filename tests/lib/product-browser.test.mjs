// tests/lib/product-browser.test.mjs — QUALITY-DEEPEN #6 headless browser signals
// (F6a a11y + F6b Web Vitals). No browser download happens in this file: the pure
// scoring helpers are tested directly, and the na-path (graceful degradation) is
// tested via runBrowserChecks against fixture dirs that lack a preview script /
// don't have playwright available — the exact same code path a CI box without
// `npx playwright install` would hit.
// Run: node --test tests/lib/product-browser.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  pickPreviewScript, scoreA11y, scoreVitals, runBrowserChecks,
} from '../../scripts/lib/product-browser.mjs';

// ── pure: pickPreviewScript ─────────────────────────────────────────────────

test('pickPreviewScript: prefers preview > dev > start', () => {
  assert.equal(pickPreviewScript({ scripts: { preview: 'x', dev: 'y', start: 'z' } }), 'preview');
  assert.equal(pickPreviewScript({ scripts: { dev: 'y', start: 'z' } }), 'dev');
  assert.equal(pickPreviewScript({ scripts: { start: 'z' } }), 'start');
});

test('pickPreviewScript: no matching script → null', () => {
  assert.equal(pickPreviewScript({ scripts: { build: 'tsc', test: 'node --test' } }), null);
  assert.equal(pickPreviewScript({}), null);
  assert.equal(pickPreviewScript(null), null);
});

// ── pure: scoreA11y (F6a) ────────────────────────────────────────────────────

test('scoreA11y: null violations (scan did not run) → na, not 0', () => {
  const r = scoreA11y(null);
  assert.equal(r.signal, 'na');
});

test('scoreA11y: zero violations → full credit', () => {
  const r = scoreA11y([]);
  assert.equal(r.signal, 1);
  assert.equal(r.violations, 0);
});

test('scoreA11y: critical/serious violations reduce the signal', () => {
  const r = scoreA11y([{ impact: 'critical' }, { impact: 'serious' }, { impact: 'minor' }]);
  assert.equal(r.critical, 2);
  assert.equal(r.violations, 3);
  assert.ok(r.signal < 1);
});

test('scoreA11y: signal floors at 0, never negative', () => {
  const many = Array.from({ length: 20 }, () => ({ impact: 'critical' }));
  assert.equal(scoreA11y(many).signal, 0);
});

// ── pure: scoreVitals (F6b) ──────────────────────────────────────────────────

test('scoreVitals: null vitals (scan did not run) → na', () => {
  assert.equal(scoreVitals(null).signal, 'na');
});

test('scoreVitals: good LCP/CLS/INP → signal near 1', () => {
  const r = scoreVitals({ lcp: 1200, cls: 0.02, inp: 80 });
  assert.equal(r.signal, 1);
});

test('scoreVitals: poor LCP degrades the signal', () => {
  const r = scoreVitals({ lcp: 8000, cls: 0.02, inp: 80 });
  assert.ok(r.signal < 1);
});

test('scoreVitals: poor CLS degrades the signal', () => {
  const r = scoreVitals({ lcp: 1200, cls: 0.5, inp: 80 });
  assert.ok(r.signal < 1);
});

test('scoreVitals: signal clamps to [0,1]', () => {
  const r = scoreVitals({ lcp: 999999, cls: 999, inp: 999999 });
  assert.ok(r.signal >= 0 && r.signal <= 1);
});

// ── na-path integration: runBrowserChecks graceful degradation ──────────────
// These exercise the real function but never reach a browser launch — either
// because there's no preview script (fails before playwright is even imported)
// or because playwright isn't installed in the test environment (this repo's root
// node_modules is not populated in CI's unit-test job — --browser is opt-in and
// only exercised in fleet runs where the devDependency is actually installed).

test('runBrowserChecks: no package.json → na with a reason, does not throw', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'browser-nopkg-'));
  const r = await runBrowserChecks(dir, { timeoutMs: 500 });
  assert.equal(r.a11y.signal, 'na');
  assert.equal(r.vitals.signal, 'na');
  assert.equal(r.reason, 'no package.json');
  rmSync(dir, { recursive: true, force: true });
});

test('runBrowserChecks: package.json with no dev/preview/start script → na, no server spawned', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'browser-noscript-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { build: 'tsc' } }));
  const r = await runBrowserChecks(dir, { timeoutMs: 500 });
  assert.equal(r.a11y.signal, 'na');
  assert.equal(r.vitals.signal, 'na');
  assert.equal(r.reason, 'no dev/preview/start script');
  rmSync(dir, { recursive: true, force: true });
});

test('runBrowserChecks: has a preview script but playwright is unavailable → na, never crashes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'browser-nopw-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { dev: 'echo up' } }));
  const r = await runBrowserChecks(dir, { timeoutMs: 500 });
  assert.equal(r.a11y.signal, 'na');
  assert.equal(r.vitals.signal, 'na');
  // Either playwright genuinely isn't installed in this environment (most CI/unit-test
  // boxes) or it is but the fake server never comes up in 500ms — both are legitimate
  // na outcomes and neither should ever throw.
  assert.ok(['playwright not installed', 'preview server did not respond within timeout'].includes(r.reason), r.reason);
  rmSync(dir, { recursive: true, force: true });
});
