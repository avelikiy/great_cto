// tests/eval/gp-schema.test.mjs — anti-drift conformance for the recall loop.
//
// Pins three things to ONE contract (shared/gp-schema.mjs):
//   1. the schema renders every key architect needs
//   2. agents/architect.md actually greps for those keys (recall side)
//   3. commands/crystallize.md actually writes those keys (crystallize side)
// If any side drifts, recall silently breaks again — this test makes that loud.
//
// Run: node --test tests/eval/gp-schema.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RECALL_REQUIRED_KEYS,
  renderGpFrontmatter,
  validateGpFrontmatter,
} from '../../shared/gp-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARCHITECT = readFileSync(join(ROOT, 'agents', 'architect.md'), 'utf8');
const CRYSTALLIZE = readFileSync(join(ROOT, 'commands', 'crystallize.md'), 'utf8');

// ── schema renders a valid GP ─────────────────────────────────────────────────

test('renderGpFrontmatter emits every recall-required key', () => {
  const fm = renderGpFrontmatter({
    id: 'GP-0001', slug: 'demo', source_ke: 'KE-1',
    target_agents: ['security-officer'], applies_to: ['devtools', 'node'],
    stack_fingerprint: 'node', symptom: 'token leaked in logs',
    detection_order: ['grep secrets', 'check config'], confidence: 'high',
    hits: 3, mttr_reduction: '40%', created: '2026-06-27',
  });
  const { ok, missing } = validateGpFrontmatter(fm);
  assert.ok(ok, `frontmatter missing keys: ${missing.join(', ')}`);
});

test('validateGpFrontmatter flags a key-dead frontmatter (the OLD bug)', () => {
  const old = [
    'id: GP-0001', 'status: active', 'target_agents: [x]',
    'applicable_archetypes: []', 'mttr_reduction_estimate: 40%', 'hits: 1',
  ].join('\n');
  const { ok, missing } = validateGpFrontmatter(old);
  assert.equal(ok, false);
  // The pre-fix file was missing exactly these recall keys:
  assert.ok(missing.includes('applies_to'));
  assert.ok(missing.includes('stack_fingerprint'));
  assert.ok(missing.includes('symptom'));
  assert.ok(missing.includes('detection_order'));
  assert.ok(missing.includes('mttr_reduction'));
});

// ── architect recall side actually greps the keys ─────────────────────────────

test('architect.md greps for every recall-required key', () => {
  for (const key of RECALL_REQUIRED_KEYS) {
    const grepsit = new RegExp(`grep[^\\n]*${key}`).test(ARCHITECT);
    assert.ok(grepsit, `architect.md does not grep "${key}" — recall would miss it`);
  }
});

// ── crystallize writer side actually emits the keys ───────────────────────────

/** Extract the GP-writer heredoc body (between `<<GPEOF` and `GPEOF`). */
function extractGpWriterBlock(md) {
  const m = md.match(/<<GPEOF\n([\s\S]*?)\nGPEOF/);
  return m ? m[1] : '';
}

test('crystallize.md GP-writer emits every recall-required key', () => {
  const block = extractGpWriterBlock(CRYSTALLIZE);
  assert.ok(block.length > 0, 'could not locate the GP-writer heredoc');
  const { ok, missing } = validateGpFrontmatter(block);
  assert.ok(ok, `crystallize GP-writer missing keys: ${missing.join(', ')}`);
});

test('crystallize.md no longer writes the dead applicable_archetypes key', () => {
  const block = extractGpWriterBlock(CRYSTALLIZE);
  assert.ok(!/^applicable_archetypes:/m.test(block), 'dead key still emitted');
});
