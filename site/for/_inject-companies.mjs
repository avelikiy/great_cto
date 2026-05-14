#!/usr/bin/env node
/**
 * Injects "Companies in this space" + "Applicable packs" sections into hand-written
 * archetype HTML files that don't go through _generate.mjs (e.g. agent-product,
 * fintech, healthcare). Idempotent — safe to re-run.
 *
 * For files already generated through _generate.mjs the sections are inserted by
 * the template directly; this script is the bridge for the remaining few.
 *
 * Run: node site/for/_inject-companies.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const companiesData = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'companies.json'), 'utf-8'));
const allCompanies = companiesData.companies;

const PACK_META = {
  'voice-pack':            { name: 'Voice AI',           desc: 'Voice + telephony compliance (TCPA, STIR/SHAKEN, state recording-consent)' },
  'clinical-pack':         { name: 'Clinical AI',        desc: 'FDA GMLP + SaMD classification + EU AI Act medical' },
  'hr-ai-pack':            { name: 'HR-AI',              desc: 'NYC LL 144 AEDT bias audit, EEOC, EU AI Act employment' },
  'api-platform-pack':     { name: 'API Platform',       desc: 'OAuth 2.1, webhook signing, idempotency, RFC 8594 Sunset' },
  'lending-pack':          { name: 'Lending/Credit',     desc: 'ECOA / Reg B, FCRA, NMLS state matrix, MLA, BISG fair-lending' },
  'clinical-trials-pack':  { name: 'Clinical Trials',    desc: 'ICH-GCP E6(R3), 21 CFR Part 11, CDISC, FHIR R5, OMOP, DICOM, de-id' },
  'robotics-pack':         { name: 'Robotics Safety',    desc: 'ISO 10218 / TS 15066 (cobot) / IEC 61508 (SIL), HARA, SROS2' },
  'em-fintech-pack':       { name: 'EM Fintech',         desc: 'India DPDP, Nigeria CBN, Brazil BCB/LGPD, MAS, OJK, BSP, local rails' },
  'climate-pack':          { name: 'Climate MRV',        desc: 'GHG Protocol, Verra, SBTi, CSRD, CBAM + biosecurity' },
  'drug-discovery-pack':   { name: 'Drug Discovery',     desc: 'ChEMBL versioning, applicability domain, ALCOA+, SiLA2, IQ/OQ/PQ' },
};

const ARCHETYPE_PACK_AFFINITY = {
  'agent-product':   ['voice-pack', 'clinical-pack', 'hr-ai-pack'],
  'ai-system':       ['voice-pack', 'clinical-pack', 'hr-ai-pack', 'drug-discovery-pack'],
  'healthcare':      ['clinical-pack', 'clinical-trials-pack', 'voice-pack'],
  'fintech':         ['lending-pack', 'em-fintech-pack', 'api-platform-pack'],
  'commerce':        ['lending-pack', 'em-fintech-pack'],
  'devtools':        ['api-platform-pack', 'voice-pack'],
  'library':         ['api-platform-pack'],
  'iot-embedded':    ['robotics-pack', 'clinical-pack'],
  'regulated':       ['clinical-pack', 'climate-pack', 'drug-discovery-pack'],
  'web-service':     ['api-platform-pack'],
  'data-platform':   ['climate-pack', 'clinical-trials-pack'],
  'mlops':           ['clinical-pack', 'drug-discovery-pack'],
  'enterprise-saas': ['hr-ai-pack', 'api-platform-pack'],
  'marketplace':     ['em-fintech-pack', 'lending-pack'],
  'edtech':          ['hr-ai-pack'],
  'insurance':       ['lending-pack', 'em-fintech-pack'],
  'gov-public':      ['climate-pack'],
  'streaming':       ['api-platform-pack'],
  'cms':             ['api-platform-pack'],
  'web3':            ['api-platform-pack', 'em-fintech-pack'],
  'mobile-app':      ['voice-pack', 'lending-pack'],
};

const STAGE_RANK = { 'public': 0, 'subsidiary': 1, 'growth': 2, 'series-e': 3, 'series-f': 3, 'series-d': 4, 'series-c': 5, 'series-b': 6, 'series-a': 7, 'seed': 8, 'open-source': 9, 'acquired': 10, 'private': 11 };
function companiesForArchetype(archetype) {
  const list = Object.entries(allCompanies)
    .filter(([_id, c]) => (c.archetypes || []).includes(archetype))
    .map(([id, c]) => ({ id, ...c }));
  list.sort((a, b) => {
    const sa = STAGE_RANK[a.stage] ?? 99;
    const sb = STAGE_RANK[b.stage] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  });
  return list.slice(0, 20);
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}
function logoTag(c) {
  const d = domainOf(c.url);
  if (!d) return '';
  return `<img class="co-logo" src="https://logo.clearbit.com/${d}?size=64" alt="" loading="lazy" onerror="this.style.display='none'" />`;
}

function companiesSection(slug) {
  const cos = companiesForArchetype(slug);
  if (cos.length === 0) return '';
  const cards = cos.map(c => {
    const stage = c.stage ? `<span class="co-stage">${c.stage}</span>` : '';
    const country = c.country ? `<span class="co-country">${c.country}</span>` : '';
    return `<a class="co-card" href="${c.url}" rel="nofollow noopener" target="_blank">
        <div class="co-head">${logoTag(c)}<span class="co-name">${c.name}</span></div>
        <div class="co-tag">${c.tagline}</div>
        <div class="co-meta">${stage}${country}</div>
      </a>`;
  }).join('\n      ');
  return `
<section class="wrap" id="companies">
  <div class="eyebrow">Real-world examples</div>
  <h2 class="h2">Companies operating as <em>${slug}</em>.</h2>
  <p class="lede">${cos.length} startups in this space. Click any card.</p>
  <div class="co-grid">
      ${cards}
  </div>
  <p class="co-disclaimer">Listed companies operate in this space. Inclusion is based on publicly available product descriptions and does not imply endorsement of or by GreatCTO.</p>
</section>
`;
}

function applicablePacksSection(slug) {
  const packs = ARCHETYPE_PACK_AFFINITY[slug] || [];
  if (packs.length === 0) return '';
  const cards = packs.map(p => {
    const m = PACK_META[p];
    if (!m) return '';
    return `<a class="pack-card" href="/pack/${p}.html">
        <div class="pack-name">+ ${m.name}</div>
        <div class="pack-desc">${m.desc}</div>
      </a>`;
  }).filter(Boolean).join('\n      ');
  return `
<section class="wrap" id="packs">
  <div class="eyebrow">Domain pack overlays</div>
  <h2 class="h2">Likely to overlay on <em>${slug}</em>.</h2>
  <p class="lede">Packs auto-attach when CLI detects pack-specific signals (e.g. <code class="inline-code">twilio</code> in deps → voice-pack). Each pack adds its own reviewer agents + human gates.</p>
  <div class="pack-grid">
      ${cards}
  </div>
</section>
`;
}

const MARKER_START = '<!-- INJECTED:packs-companies -->';
const MARKER_END = '<!-- /INJECTED:packs-companies -->';

const files = readdirSync(__dirname).filter(f => f.endsWith('.html'));
let touched = 0, skipped = 0;
for (const f of files) {
  const slug = basename(f, '.html');
  const filepath = join(__dirname, f);
  let html = readFileSync(filepath, 'utf-8');
  // Skip if already has the injected block (idempotent)
  if (html.includes(MARKER_START)) {
    // Re-inject by removing existing block + re-running
    const re = new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}`);
    html = html.replace(re, '');
  }
  // Skip files that ALREADY have packs/companies sections from _generate.mjs
  // (no injection needed — generator handles them inline). Check for either
  // section id since some archetypes have packs but no companies (e.g. insurance).
  if ((html.includes('id="companies"') || html.includes('id="packs"')) && !html.includes(MARKER_START)) {
    skipped++;
    continue;
  }
  const packs = applicablePacksSection(slug);
  const companies = companiesSection(slug);
  if (!packs && !companies) {
    skipped++;
    continue;
  }
  const block = `${MARKER_START}${packs}${companies}${MARKER_END}`;
  // Insert before <section id="install"> if present, else before </body>
  let injected;
  if (html.includes('<section id="install"')) {
    injected = html.replace('<section id="install"', `${block}\n\n<section id="install"`);
  } else if (html.includes('<footer')) {
    injected = html.replace('<footer', `${block}\n\n<footer`);
  } else {
    injected = html.replace('</body>', `${block}\n</body>`);
  }
  writeFileSync(filepath, injected, 'utf-8');
  console.log(`✓ injected into ${f} (${(packs ? 1 : 0)} pack-section, ${(companies ? 1 : 0)} co-section)`);
  touched++;
}
console.log(`\nInjected into ${touched} files. Skipped ${skipped} (already inline or no data).`);
