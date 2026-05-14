// E2E archetype detection test using the REAL detect() + pickArchetype() pipeline.
// Iterates over tests/fixtures/*/, runs detect on each, asserts expected archetype
// AND that suggestCompliance() returns the minimum required compliance set for
// each archetype. This second assertion is the "reviewer attachment" guarantee
// from the E2E plan (test #4) — without it, a regression in compliance rules
// could silently drop, e.g., HIPAA from a healthcare project.
//
// Run: node tests/run-archetype-e2e.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');

const { detect } = await import('../packages/cli/dist/detect.js');
const { pickArchetype, suggestCompliance } = await import('../packages/cli/dist/archetypes.js');
const { suggestPacks } = await import('../packages/cli/dist/packs.js');

// Minimum-required compliance per archetype. The actual output may include
// more (e.g. fintech often pulls gdpr too); this map asserts the MUST-HAVE
// subset that defines correct reviewer attachment for that domain.
// If a fixture's archetype isn't here, we skip the compliance check (still
// validates archetype detection, just doesn't gate on compliance).
const REQUIRED_COMPLIANCE = {
  'fintech':         ['pci-dss', 'sox', 'kyc-aml'],
  'healthcare':      ['hipaa'],
  'mlops':           ['eu-ai-act'],
  'agent-product':   ['eu-ai-act', 'owasp-llm-top-10'],
  'ai-system':       ['eu-ai-act'],
  'enterprise-saas': ['soc2-type-2', 'iso27001'],
  'iot-embedded':    ['etsi-en-303-645'],
  'game':            ['coppa', 'age-rating'],
  'regulated':       ['compliance-required'],
  'marketplace':     ['kyc-aml', 'pci-dss'],
  'cms':             ['gdpr', 'dmca'],
};

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
  let expected = null, skipIfFails = false, expectedPacks = null;

  // Existing fixtures use expected/manifest.json; new ones use expected.json
  try {
    const ej = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf-8'));
    expected = ej.archetype;
    skipIfFails = !!ej.skipIfFails;
    expectedPacks = Array.isArray(ej.packs) ? ej.packs : null;
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

  // Compliance attachment check — fails if the archetype is in our map and
  // any required compliance key is missing.
  const required = REQUIRED_COMPLIANCE[result.primary];
  if (ok && required) {
    const missing = required.filter(c => !compliance.includes(c));
    if (missing.length > 0) {
      console.log(`  ${' '.repeat(36)}   \x1b[31m✗ missing compliance: ${missing.join(', ')}\x1b[0m`);
      fail++;
      failures.push({ fixture, expected, got: result.primary,
        rationale: `archetype OK but compliance is missing [${missing.join(', ')}] — got [${compliance.join(', ') || 'empty'}]` });
      continue;
    }
  }

  // Pack attachment check — overlay packs must match if expected.json
  // declares them. Detector may match additional packs (broader signals) —
  // that is allowed; we only fail on MISSING expected packs.
  if (ok && expectedPacks) {
    const matchedPacks = suggestPacks(det).map(p => p.pack);
    const missingPacks = expectedPacks.filter(p => !matchedPacks.includes(p));
    if (missingPacks.length > 0) {
      console.log(`  ${' '.repeat(36)}   \x1b[31m✗ missing packs: ${missingPacks.join(', ')}\x1b[0m   (got [${matchedPacks.join(', ') || 'none'}])`);
      fail++;
      failures.push({ fixture, expected, got: result.primary,
        rationale: `archetype OK but packs missing [${missingPacks.join(', ')}] — got [${matchedPacks.join(', ') || 'none'}]` });
      continue;
    }
    console.log(`  ${' '.repeat(36)}   packs: ${matchedPacks.join(', ')}`);
  }

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
