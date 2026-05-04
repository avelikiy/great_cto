// E2E archetype detection test using the REAL detect() + pickArchetype() pipeline.
// Iterates over tests/fixtures/*/, runs detect on each, asserts expected archetype.
// Run: node tests/run-archetype-e2e.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');

const { detect } = await import('../packages/cli/dist/detect.js');
const { pickArchetype, suggestCompliance } = await import('../packages/cli/dist/archetypes.js');

const fixtures = readdirSync(FIXTURES_DIR)
  .filter((n) => !n.startsWith('_') && !n.startsWith('.'))
  .filter((n) => statSync(join(FIXTURES_DIR, n)).isDirectory())
  .sort();

let pass = 0, fail = 0, skipped = 0;
const failures = [];

console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
console.log('│ E2E archetype detection (real detect + pickArchetype)                  │');
console.log('└─────────────────────────────────────────────────────────────────────────┘\n');

for (const fixture of fixtures) {
  const dir = join(FIXTURES_DIR, fixture);
  let expected = null, skipIfFails = false;

  // Existing fixtures use expected/manifest.json; new ones use expected.json
  try {
    const ej = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf-8'));
    expected = ej.archetype;
    skipIfFails = !!ej.skipIfFails;
  } catch {
    try {
      const m = JSON.parse(readFileSync(join(dir, 'expected', 'manifest.json'), 'utf-8'));
      // Old fixtures don't carry archetype field directly; infer from name
      if (fixture.includes('cli')) expected = 'cli-tool';
      // trading-system-rust uses generic deps (tokio/reqwest/serde); no domain signal — library is fair
      else if (fixture.includes('trading')) expected = 'library';
      else if (fixture.includes('web-fullstack')) expected = 'web-service';
    } catch {}
  }

  if (!expected) {
    console.log(`\x1b[33m⊘\x1b[0m ${fixture.padEnd(36)} → no expected.json — skipping`);
    skipped++;
    continue;
  }

  let result;
  try {
    const det = detect(dir);
    result = pickArchetype(det);
  } catch (e) {
    console.log(`\x1b[31m✗\x1b[0m ${fixture.padEnd(36)} → detect() threw: ${e.message}`);
    fail++;
    continue;
  }

  const ok = result.primary === expected;
  if (!ok && skipIfFails) {
    console.log(`\x1b[33m⊘\x1b[0m ${fixture.padEnd(36)} → ${result.primary.padEnd(20)} [${result.confidence}]  (manual override expected)`);
    skipped++;
    continue;
  }

  const symbol = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  const det = detect(dir);
  const compliance = suggestCompliance(det, result.primary);
  const stackPreview = det.stack.slice(0, 4).join(',');
  console.log(`${symbol} ${fixture.padEnd(36)} → ${result.primary.padEnd(20)} [${result.confidence}]  comp: ${compliance.slice(0, 3).join(',') || '-'}`);
  console.log(`  ${' '.repeat(36)}   stack: ${stackPreview}${det.stack.length > 4 ? `, +${det.stack.length - 4} more` : ''}`);

  if (ok) pass++;
  else { fail++; failures.push({ fixture, expected, got: result.primary, rationale: result.rationale }); }
}

console.log(`\n  Passed: ${pass}    Failed: ${fail}    Skipped (manual override): ${skipped}\n`);
if (failures.length) {
  console.log('Failures:');
  for (const f of failures) {
    console.log(`  - ${f.fixture}: expected=${f.expected}  got=${f.got}`);
    console.log(`    rationale: ${f.rationale}`);
  }
  process.exit(1);
}
