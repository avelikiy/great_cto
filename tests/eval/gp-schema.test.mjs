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
  bumpGpVersion,
} from '../../shared/gp-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARCHITECT = readFileSync(join(ROOT, 'agents', 'architect.md'), 'utf8');
// Recall greps were extracted from architect.md into this sourced script
// (prompt diet, great_cto-eyk6) — the recall contract now lives there.
const PATTERN_LOOKUP = readFileSync(join(ROOT, 'scripts', 'architect-pattern-lookup.sh'), 'utf8');
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

test('architect recall script greps for every recall-required key', () => {
  for (const key of RECALL_REQUIRED_KEYS) {
    const grepsit = new RegExp(`grep[^\\n]*${key}`).test(PATTERN_LOOKUP);
    assert.ok(grepsit, `architect-pattern-lookup.sh does not grep "${key}" — recall would miss it`);
  }
});

test('architect.md actually invokes the recall script', () => {
  assert.ok(
    ARCHITECT.includes('architect-pattern-lookup.sh'),
    'architect.md must reference scripts/architect-pattern-lookup.sh — otherwise the recall greps never run'
  );
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

// ── bumpGpVersion (AgentSpace #4 — knowledge versioning) ──────────────────────

const GP_V1 = `---
id: GP-0007
slug: demo
status: active
version: 1
created: 2026-06-01
last_validated: 2026-06-01
hits: 1
---

### GP-0007 — Demo
body
`;

test('bumpGpVersion: increments version, refreshes last_validated, appends history', () => {
  const { text, from, to } = bumpGpVersion(GP_V1, { date: '2026-06-28', source_ke: 'KE-9', reason: 'recurred on web-app' });
  assert.equal(from, 1);
  assert.equal(to, 2);
  assert.match(text, /^version: 2$/m);
  assert.match(text, /^last_validated: 2026-06-28$/m);
  assert.match(text, /^## Version history$/m);
  assert.match(text, /- v2 \(2026-06-28\) · KE-9 — recurred on web-app/);
});

test('bumpGpVersion: second bump appends, keeps one version line', () => {
  const once = bumpGpVersion(GP_V1, { date: '2026-06-28' }).text;
  const twice = bumpGpVersion(once, { date: '2026-06-29', reason: 'again' }).text;
  assert.match(twice, /^version: 3$/m);
  assert.equal((twice.match(/^version:/mg) || []).length, 1, 'exactly one version: line');
  assert.equal((twice.match(/^- v\d /mg) || []).length, 2, 'two history entries');
});

test('bumpGpVersion: missing version: line defaults from 1 → 2', () => {
  const noVer = `---\nid: GP-x\nstatus: active\n---\nbody\n`;
  const { to, text } = bumpGpVersion(noVer, { date: '2026-06-28' });
  assert.equal(to, 2);
  assert.match(text, /^version: 2$/m);
});
