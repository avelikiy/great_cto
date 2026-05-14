#!/usr/bin/env node
/**
 * Master build script — runs all site generators in order.
 *
 *   1. site/for/_generate.mjs           — 22 generated archetype pages
 *   2. site/for/_inject-companies.mjs   — inject companies + packs sections into
 *                                         the 3 hand-written archetype pages
 *                                         (agent-product, fintech, healthcare)
 *                                         + any archetype with affinity packs
 *   3. site/pack/_generate.mjs          — 10 pack overlay pages
 *   4. site/_generate-aggregates.mjs    — packs.html, companies.html, agents.html
 *   5. site/seo-augment.mjs             — canonical, OG, twitter, JSON-LD, hreflang
 *                                         (only inserts when missing — idempotent)
 *   6. site/_generate-sitemap.mjs       — sitemap.xml from actual files
 *
 * Run: node site/_build.mjs
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const STEPS = [
  ['for/_generate.mjs',        '22 generated archetype pages'],
  ['for/_inject-companies.mjs', 'companies + packs sections into hand-written pages'],
  ['pack/_generate.mjs',       '10 pack overlay pages'],
  ['_generate-aggregates.mjs', 'packs.html + companies.html + agents.html'],
  ['seo-augment.mjs',          'canonical + OG + JSON-LD + hreflang'],
  ['_generate-sitemap.mjs',    'sitemap.xml from actual files'],
];

function run(script) {
  return new Promise((resolve, reject) => {
    const p = spawn('node', [join(__dirname, script)], { stdio: 'inherit' });
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)));
  });
}

console.log('\n┌──────────────────────────────────────────────────────────────────┐');
console.log('│ site/ build pipeline                                            │');
console.log('└──────────────────────────────────────────────────────────────────┘\n');

for (const [script, desc] of STEPS) {
  console.log(`\n──── ${script}  ${desc}`);
  await run(script);
}

console.log('\n✓ site build complete');
