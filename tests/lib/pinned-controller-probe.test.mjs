import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeControllerAssets } from '../../scripts/lib/pinned-controller-probe.mjs';

test('trusted probe exercises actual graph, domain selection and fail-closed boundaries without dispatch', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'great-cto-controller-probe-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = await probeControllerAssets({ pluginRoot: fileURLToPath(new URL('../../', import.meta.url)), fixtureRoot: root });
  assert.equal(result.cases.length, 12); assert.equal(result.refusals.length, 8);
  assert.equal(result.dispatchAttempts, 0); assert.equal(result.approvalsRecorded, 0);
  assert.equal(result.executionArtifactProvenanceVerified, false); assert.equal(result.benchmarkEligible, false);
  assert.equal(result.providerCalls, null);
});

test('probe refuses a preexisting fixture collection before loading candidate modules', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'great-cto-controller-probe-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'operator-file'), 'preserve');
  await assert.rejects(probeControllerAssets({ pluginRoot: root, fixtureRoot: root }), /private empty fixture root required/);
});
