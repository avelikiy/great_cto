#!/usr/bin/env node
// Comprehensive end-to-end test for the 10 domain packs (Wave 1-3).
//
// For each fixture in tests/fixtures/ that declares `packs:` in expected.json:
//   1. Run detect() — capture stack tokens + README keywords
//   2. Run pickArchetype() — verify base archetype matches expected
//   3. Run suggestPacks() — verify expected packs attach (and only them, modulo
//      "additional packs may attach" tolerance for handoffs like clinical→biosec)
//   4. Run suggestPackReviewers() — verify each reviewer agent file exists with
//      required frontmatter fields (name, applies_to, applies_when, tools)
//   5. Run suggestPackGates() — verify each gate id is registered in
//      skills/great_cto/ARCHETYPES.md § Domain Overlays
//   6. Verify the pack's TM template exists at skills/great_cto/templates/TM-*.md
//      and contains a <!-- HANDOFF --> block
//   7. Verify the pack's overlay file exists at skills/great_cto/packs/<pack>.md
//   8. Verify each pack has ≥1 EVAL file in tests/eval/ that references it
//
// Pass = every link in the chain (detect → archetype → pack → reviewer → gate
// → TM → EVAL) is intact for every fixture.
//
// Run: node tests/run-packs-e2e.mjs

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FIXTURES = join(ROOT, 'tests', 'fixtures');
const AGENTS = join(ROOT, 'agents');
const PACKS = join(ROOT, 'skills', 'great_cto', 'packs');
const TEMPLATES = join(ROOT, 'skills', 'great_cto', 'templates');
const EVAL_DIR = join(ROOT, 'tests', 'eval');
const ARCHETYPES_MD = join(ROOT, 'skills', 'great_cto', 'ARCHETYPES.md');

const { detect } = await import(join(ROOT, 'packages/cli/dist/detect.js'));
const { pickArchetype } = await import(join(ROOT, 'packages/cli/dist/archetypes.js'));
const { suggestPacks, suggestPackReviewers, suggestPackGates, listPacks } = await import(join(ROOT, 'packages/cli/dist/packs.js'));

// ── helpers ──────────────────────────────────────────────────────────────────
const C = {
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
  bold: '\x1b[1m', reset: '\x1b[0m',
};
const ok = (s) => `${C.green}✓${C.reset} ${s}`;
const fail = (s) => `${C.red}✗${C.reset} ${s}`;
const warn = (s) => `${C.yellow}⚠${C.reset} ${s}`;
const dim = (s) => `${C.gray}${s}${C.reset}`;

// Parse YAML-ish frontmatter into a flat dict (good enough for required-field check).
function parseFrontmatter(path) {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf-8');
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split('\n')) {
    if (/^[a-zA-Z_-]+:/.test(line)) {
      const [k, ...rest] = line.split(':');
      fields[k.trim()] = rest.join(':').trim();
    }
  }
  return { fields, body: text };
}

// ── load archetypes overlay matrix ───────────────────────────────────────────
const archetypesText = existsSync(ARCHETYPES_MD) ? readFileSync(ARCHETYPES_MD, 'utf-8') : '';

// ── load fixtures ────────────────────────────────────────────────────────────
const fixtures = readdirSync(FIXTURES)
  .filter((n) => !n.startsWith('_') && !n.startsWith('.'))
  .filter((n) => statSync(join(FIXTURES, n)).isDirectory())
  .filter((n) => existsSync(join(FIXTURES, n, 'expected.json')))
  .filter((n) => {
    const ej = JSON.parse(readFileSync(join(FIXTURES, n, 'expected.json'), 'utf-8'));
    return Array.isArray(ej.packs);
  })
  .sort();

console.log(`\n${C.bold}┌────────────────────────────────────────────────────────────────────────────────┐`);
console.log(`│ PACK END-TO-END TEST  ─  ${fixtures.length} fixtures × full chain validation              │`);
console.log(`└────────────────────────────────────────────────────────────────────────────────┘${C.reset}\n`);

let totalAssertions = 0, totalFailures = 0;
const summary = [];

for (const fixture of fixtures) {
  const dir = join(FIXTURES, fixture);
  const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf-8'));
  const fixtureFailures = [];
  const assertion = (cond, msg, detail) => {
    totalAssertions++;
    if (cond) {
      console.log(`  ${ok(msg)} ${detail ? dim(detail) : ''}`);
    } else {
      totalFailures++;
      fixtureFailures.push(msg);
      console.log(`  ${fail(msg)} ${detail ? dim(detail) : ''}`);
    }
  };

  console.log(`${C.bold}${C.blue}━━ ${fixture}${C.reset}  ${dim(`→ expected archetype=${expected.archetype}, packs=[${(expected.packs ?? []).join(', ')}]`)}`);

  // 1. detect()
  let det;
  try {
    det = detect(dir);
  } catch (e) {
    console.log(`  ${fail('detect() threw')} ${dim(e.message)}`);
    totalFailures++; totalAssertions++;
    summary.push({ fixture, status: 'fail', failures: ['detect()'] });
    continue;
  }
  assertion(det.stack.length > 0 || det.readmeKeywords.length > 0,
    'detect produces stack OR readme signals',
    `stack=${det.stack.length} kw=${det.readmeKeywords.length}`);

  // 2. pickArchetype()
  const arch = pickArchetype(det);
  assertion(arch.primary === expected.archetype,
    `base archetype = ${expected.archetype}`,
    `got ${arch.primary} [${arch.confidence}]`);

  // 3. suggestPacks()
  const matched = suggestPacks(det);
  const matchedPackNames = matched.map((p) => p.pack);
  for (const ep of expected.packs) {
    assertion(matchedPackNames.includes(ep),
      `pack ${ep} auto-attached`,
      `signals: ${matched.find((p) => p.pack === ep)?.signals.join(', ') || 'none'}`);
  }

  // 4. For each matched pack: reviewers exist with required frontmatter
  for (const pm of matched) {
    for (const reviewerName of pm.reviewers) {
      const agentPath = join(AGENTS, `${reviewerName}.md`);
      const fm = parseFrontmatter(agentPath);
      assertion(fm !== null, `reviewer agent ${reviewerName} exists`, agentPath.replace(ROOT, '.'));
      if (fm) {
        for (const req of ['name', 'description', 'model', 'tools', 'maxTurns', 'timeout', 'applies_to']) {
          assertion(req in fm.fields,
            `agent ${reviewerName} has frontmatter field "${req}"`,
            fm.fields[req] ? `= ${fm.fields[req].slice(0, 40)}` : '');
        }
        // Body should contain HANDOFF section template
        assertion(/HANDOFF/.test(fm.body),
          `agent ${reviewerName} has HANDOFF section in body`);
      }
    }
  }

  // 5. Gates registered in ARCHETYPES.md
  for (const pm of matched) {
    for (const gate of pm.humanGates) {
      assertion(archetypesText.includes(gate),
        `gate ${gate} registered in ARCHETYPES.md Domain Overlays`);
    }
  }

  // 6. TM template per pack
  // Map pack → TM slug (same naming convention as in pack-overlay files)
  const PACK_TM_MAP = {
    'voice-pack': ['TM-voice'],
    'clinical-pack': ['TM-clinical', 'TM-samd'],
    'hr-ai-pack': ['TM-hrai'],
    'api-platform-pack': ['TM-api'],
    'lending-pack': ['TM-lending'],
    'clinical-trials-pack': ['TM-trial', 'TM-biodata'],
    'robotics-pack': ['TM-robot'],
    'em-fintech-pack': ['TM-emfin'],
    'climate-pack': ['TM-climate', 'TM-biosec'],
    'drug-discovery-pack': ['TM-drugml', 'TM-glp', 'TM-labauto'],
    'digital-health-pack': ['TM-digital-health'],
  };
  for (const pm of matched) {
    for (const tmSlug of (PACK_TM_MAP[pm.pack] || [])) {
      const tmPath = join(TEMPLATES, `${tmSlug}.md`);
      assertion(existsSync(tmPath), `TM template ${tmSlug}.md exists`);
      if (existsSync(tmPath)) {
        const tmText = readFileSync(tmPath, 'utf-8');
        assertion(/HANDOFF/.test(tmText),
          `${tmSlug}.md has HANDOFF block`);
        assertion(/## Findings|Findings/.test(tmText),
          `${tmSlug}.md has Findings section`);
      }
    }
  }

  // 7. Pack overlay file exists with extends/applies_to/reviewer info
  for (const pm of matched) {
    const packPath = join(PACKS, `${pm.pack}.md`);
    assertion(existsSync(packPath), `pack overlay ${pm.pack}.md exists`);
    if (existsSync(packPath)) {
      const ptext = readFileSync(packPath, 'utf-8');
      for (const rv of pm.reviewers) {
        assertion(ptext.includes(rv), `pack ${pm.pack} references reviewer ${rv}`);
      }
    }
  }

  // 8. ≥1 EVAL per pack referencing it
  const evalFiles = readdirSync(EVAL_DIR).filter((f) => f.endsWith('.md'));
  for (const pm of matched) {
    const refs = evalFiles.filter((f) => {
      try {
        return readFileSync(join(EVAL_DIR, f), 'utf-8').includes(pm.pack);
      } catch { return false; }
    });
    assertion(refs.length >= 1,
      `pack ${pm.pack} has ≥1 EVAL`,
      `${refs.length} files (${refs.slice(0, 3).join(', ')})`);
  }

  // Done
  summary.push({
    fixture, status: fixtureFailures.length === 0 ? 'pass' : 'fail',
    archetype: arch.primary, packs: matchedPackNames,
    failures: fixtureFailures,
  });
  console.log('');
}

// ── Standalone checks: pack registry completeness ────────────────────────────
console.log(`${C.bold}${C.cyan}━━ Pack registry completeness${C.reset}`);
const EXPECTED_PACK_COUNT = 14;
const allPacks = listPacks();
console.log(`  ${ok(`listPacks() returns ${allPacks.length} packs`)} ${dim(allPacks.join(', '))}`);
totalAssertions++;
if (allPacks.length !== EXPECTED_PACK_COUNT) {
  console.log(`  ${fail(`expected ${EXPECTED_PACK_COUNT} packs, got ${allPacks.length}`)}`);
  totalFailures++;
}

// Every pack must have ≥1 fixture OR be on the documented-exception allowlist.
// Allowlisted = registered in packs.ts but not yet fully wired (gate not in ARCHETYPES.md
// Domain Overlays / reviewer chain incomplete). These 3 regulated packs are pending-wiring and
// are slated for removal with the regulated-pack prune (great_cto-517); warn, don't fail.
const PACKS_WITHOUT_FIXTURES = new Set([
  "adtech-privacy-pack",
  "sec-cyber-pack",
  "us-ai-pack",
]);
const fixturePacks = new Set();
for (const f of fixtures) {
  const ej = JSON.parse(readFileSync(join(FIXTURES, f, 'expected.json'), 'utf-8'));
  for (const p of ej.packs ?? []) fixturePacks.add(p);
}
const uncoveredPacks = allPacks.filter(
  (p) => !fixturePacks.has(p) && !PACKS_WITHOUT_FIXTURES.has(p),
);
const allowlistedUncovered = allPacks.filter(
  (p) => !fixturePacks.has(p) && PACKS_WITHOUT_FIXTURES.has(p),
);
if (allowlistedUncovered.length) {
  console.log(`  ${warn(`packs without fixtures (allowlisted, pending wiring): ${allowlistedUncovered.join(', ')}`)}`);
}
if (uncoveredPacks.length) {
  console.log(`  ${fail(`packs without fixtures: ${uncoveredPacks.join(', ')}`)}`);
} else {
  console.log(`  ${ok('every pack has a fixture or documented exception')}`);
}
totalAssertions++;
if (uncoveredPacks.length > 0) {
  totalFailures++;
}

// ── Final summary ────────────────────────────────────────────────────────────
console.log(`\n${C.bold}┌────────────────────────────────────────────────────────────────────────────────┐`);
console.log(`│ SUMMARY                                                                       │`);
console.log(`├────────────────────────────────────────────────────────────────────────────────┤${C.reset}`);
for (const s of summary) {
  const color = s.status === 'pass' ? C.green : C.red;
  const icon = s.status === 'pass' ? '✓' : '✗';
  console.log(`│ ${color}${icon}${C.reset} ${s.fixture.padEnd(28)} → ${(s.archetype || '?').padEnd(18)} packs: ${(s.packs || []).join(',')}`);
}
console.log(`${C.bold}├────────────────────────────────────────────────────────────────────────────────┤`);
const passCount = summary.filter((s) => s.status === 'pass').length;
const failCount = summary.length - passCount;
console.log(`│ Fixtures: ${passCount} pass · ${failCount} fail   |   Assertions: ${totalAssertions - totalFailures}/${totalAssertions} pass   |   Failures: ${totalFailures}`);
console.log(`└────────────────────────────────────────────────────────────────────────────────┘${C.reset}\n`);

process.exit(totalFailures === 0 ? 0 : 1);
