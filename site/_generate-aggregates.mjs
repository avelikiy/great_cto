#!/usr/bin/env node
/**
 * Aggregate page generator — packs.html + companies.html + agents.html.
 * Reads:
 *   - site/data/companies.json
 *   - site/pack/_generate.mjs (exports `packs` array)
 *   - agents/*.md frontmatter (for agents catalog)
 *
 * Outputs:
 *   - site/packs.html       — all 10 pack overlays index
 *   - site/companies.html   — full 150+ company catalog with client-side filtering
 *   - site/agents.html      — 49-agent catalog (extracted from frontmatter)
 *
 * SEO: each aggregate page has TechArticle + BreadcrumbList + ItemList schema.org.
 */

import { writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSS_VER = '2026050414';

const companiesData = JSON.parse(readFileSync(join(__dirname, 'data', 'companies.json'), 'utf-8'));
const allCompanies = companiesData.companies;
const { packs } = await import('./pack/_generate.mjs');

// ── 1. /packs.html — pack overlay index ─────────────────────────────────────
const packsCards = packs.map(p => {
  const cos = Object.values(allCompanies).filter(c => (c.packs || []).includes(p.slug));
  return `<a class="pack-card" href="/pack/${p.slug}.html">
      <div class="pack-name">${p.icon} ${p.name}</div>
      <div class="pack-desc">${p.sub.replace(/<[^>]+>/g, '').slice(0, 130)}…</div>
      <div class="pack-meta">${p.reviewers.length} reviewer${p.reviewers.length > 1 ? 's' : ''} · ${p.gates.length} gate${p.gates.length > 1 ? 's' : ''} · ${cos.length} companies</div>
    </a>`;
}).join('\n      ');

const packsItemListSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  "itemListElement": packs.map((p, i) => ({
    "@type": "ListItem",
    "position": i + 1,
    "url": `https://greatcto.systems/pack/${p.slug}.html`,
    "name": p.name,
  })),
};
const packsBreadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "GreatCTO", "item": "https://greatcto.systems/" },
    { "@type": "ListItem", "position": 2, "name": "Domain packs", "item": "https://greatcto.systems/packs.html" },
  ],
};

const packsHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Domain pack overlays — 10 specialist pipelines · GreatCTO</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#0a0e0c" />
<meta name="description" content="10 domain pack overlays ride on top of GreatCTO archetypes: voice-AI, clinical-AI + FDA, HR-AI + AEDT, API platform, lending, clinical trials, robotics, EM-fintech, climate MRV, drug discovery." />
<link rel="canonical" href="https://greatcto.systems/packs.html" />
<meta name="robots" content="index, follow, max-image-preview:large" />

<meta property="og:type" content="website" />
<meta property="og:url" content="https://greatcto.systems/packs.html" />
<meta property="og:site_name" content="GreatCTO" />
<meta property="og:title" content="10 Domain Pack Overlays — GreatCTO" />
<meta property="og:description" content="Domain-specific reviewer agents + human gates that ride on top of base archetypes. Voice-AI, clinical, HR-AI, lending, climate, drug discovery, and more." />
<meta property="og:image" content="https://greatcto.systems/assets/og-board.png" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="10 Domain Pack Overlays — GreatCTO" />
<meta name="twitter:description" content="Domain-specific reviewer agents + human gates. Voice-AI, clinical, HR-AI, lending, climate, drug discovery." />
<meta name="twitter:image" content="https://greatcto.systems/assets/og-board.png" />

<script type="application/ld+json">${JSON.stringify(packsItemListSchema)}</script>
<script type="application/ld+json">${JSON.stringify(packsBreadcrumb)}</script>

<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/styles.css?v=${CSS_VER}" />
</head>
<body>

<nav class="nav">
  <a class="nav-logo" href="/" aria-label="greatcto">
    <span class="logo-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <rect width="64" height="64" rx="14" fill="#0a0e0c"/>
        <g stroke="#00d97e" stroke-width="9" stroke-linecap="round">
          <line x1="32" y1="14" x2="32" y2="50"/>
          <line x1="16.4" y1="23" x2="47.6" y2="41"/>
          <line x1="16.4" y1="41" x2="47.6" y2="23"/>
        </g>
      </svg>
    </span>
    <span>greatcto</span>
  </a>
  <div class="nav-right">
    <a href="/#how" class="nav-link">How</a>
    <a href="/#archetypes" class="nav-link">Archetypes</a>
    <a href="/companies.html" class="nav-link">Companies</a>
    <a href="/#install" class="cta">Install</a>
  </div>
</nav>

<section class="hero">
  <div class="hero-bg"></div>
  <div class="hero-inner">
    <span class="hero-eyebrow"><span class="pulse"></span>10 domain pack overlays</span>
    <h1>Pack overlays ride <em>on top of</em> archetypes.</h1>
    <p class="sub">When GreatCTO detects pack-specific signals in your repo (e.g. <code class="inline-code">twilio</code> in deps, <code class="inline-code">SaMD</code> in README), it auto-attaches the pack — adding specialist reviewer agents, human gates, threat-model templates, and EVAL suites <strong>on top of</strong> your base archetype pipeline.</p>
  </div>
</section>

<section class="wrap">
  <div class="eyebrow">v2.8 — Pioneer Fund coverage</div>
  <h2 class="h2">10 packs · 15 specialist reviewers · 19 human gate types · 38 EVAL templates.</h2>
  <div class="pack-grid">
      ${packsCards}
  </div>
</section>

<section class="wrap">
  <div class="eyebrow">How activation works</div>
  <h2 class="h2">CLI detection → auto-attach → reviewer chain.</h2>
  <ol class="lede">
    <li><code>npx great-cto init</code> scans your repo</li>
    <li><code>packages/cli/src/packs.ts</code> matches stack signals + README terms</li>
    <li>Matched packs written to <code>.great_cto/PROJECT.md</code> as <code>packs: voice-pack, clinical-pack</code></li>
    <li>Architect agent invokes pack reviewers BEFORE senior-dev claims tasks</li>
    <li>Pack-specific human gates open in <code>/inbox</code> for your sign-off</li>
  </ol>
  <p class="lede">Override anytime by editing <code>packs:</code> in PROJECT.md or running <code>/migrate</code>.</p>
</section>

<footer class="footer">
  <div class="footer-brand">© 2026 GreatCTO · MIT License</div>
  <div class="footer-links">
    <a href="/">Home</a>
    <a href="/#archetypes">Archetypes</a>
    <a href="/companies.html">Companies</a>
    <a href="https://github.com/avelikiy/great_cto">GitHub</a>
  </div>
</footer>

</body>
</html>`;

writeFileSync(join(__dirname, 'packs.html'), packsHtml);
console.log(`✓ wrote packs.html (${packs.length} cards)`);

// ── 2. /companies.html — full company catalog ───────────────────────────────
const STAGE_RANK_AGG = { 'public': 0, 'subsidiary': 1, 'growth': 2, 'series-e': 3, 'series-f': 3, 'series-d': 4, 'series-c': 5, 'series-b': 6, 'series-a': 7, 'seed': 8, 'open-source': 9, 'acquired': 10, 'private': 11 };
const REGION_MAP = {
  'US': 'us', 'CA': 'us',
  'GB': 'europe', 'FR': 'europe', 'DE': 'europe', 'NL': 'europe', 'SE': 'europe', 'CH': 'europe', 'IT': 'europe', 'CZ': 'europe', 'GR': 'europe', 'DK': 'europe', 'IE': 'europe', 'NO': 'europe',
  'IN': 'asia', 'SG': 'asia', 'ID': 'asia', 'PH': 'asia', 'VN': 'asia', 'JP': 'asia', 'CN': 'asia', 'KR': 'asia',
  'BR': 'latam', 'MX': 'latam', 'AR': 'latam', 'CO': 'latam', 'UY': 'latam',
  'NG': 'africa', 'RW': 'africa', 'EG': 'africa', 'ZA': 'africa', 'KE': 'africa', 'SN': 'africa', 'CM': 'africa',
  'AE': 'mena', 'SA': 'mena',
  'AU': 'oceania', 'NZ': 'oceania',
};

const companiesList = Object.entries(allCompanies).map(([id, c]) => ({ id, ...c }));
companiesList.sort((a, b) => {
  const sa = STAGE_RANK_AGG[a.stage] ?? 99;
  const sb = STAGE_RANK_AGG[b.stage] ?? 99;
  if (sa !== sb) return sa - sb;
  return a.name.localeCompare(b.name);
});
const pioneerCount = companiesList.filter(c => c.pioneer).length;
const openSourceCount = companiesList.filter(c => c.open_source).length;

const filterPacks = ['all', 'voice-pack', 'clinical-pack', 'hr-ai-pack', 'api-platform-pack', 'lending-pack', 'clinical-trials-pack', 'robotics-pack', 'em-fintech-pack', 'climate-pack', 'drug-discovery-pack'];
const filterRegions = ['us', 'europe', 'asia', 'latam', 'africa', 'mena'];
const filterStages = ['public', 'growth', 'series-c+', 'seed-stage', 'open-source'];

// Count per filter for display
const countPerRegion = {};
const countPerStage = { 'public': 0, 'growth': 0, 'series-c+': 0, 'seed-stage': 0, 'open-source': 0 };
for (const c of companiesList) {
  const r = REGION_MAP[c.country] || 'other';
  countPerRegion[r] = (countPerRegion[r] || 0) + 1;
  if (c.stage === 'public') countPerStage['public']++;
  else if (c.stage === 'growth') countPerStage['growth']++;
  else if (['series-c','series-d','series-e','series-f'].includes(c.stage)) countPerStage['series-c+']++;
  else if (['seed','series-a','series-b'].includes(c.stage)) countPerStage['seed-stage']++;
  if (c.open_source) countPerStage['open-source']++;
}

const companyCardsAll = companiesList.map(c => {
  const stars = c.pioneer ? '<span class="co-star" title="Pioneer Fund portfolio">★</span>' : '';
  const oss = c.open_source ? '<span class="co-stage" title="Open source" style="color:#00d97e">OSS</span>' : '';
  const stage = c.stage ? `<span class="co-stage">${c.stage}</span>` : '';
  const country = c.country ? `<span class="co-country">${c.country}</span>` : '';
  const packs = (c.packs || []).join(' ');
  const archs = (c.archetypes || []).join(' ');
  const region = REGION_MAP[c.country] || 'other';
  // Bucket stage for filtering
  let stageBucket = 'other';
  if (c.stage === 'public') stageBucket = 'public';
  else if (c.stage === 'growth') stageBucket = 'growth';
  else if (['series-c','series-d','series-e','series-f'].includes(c.stage)) stageBucket = 'series-c+';
  else if (['seed','series-a','series-b'].includes(c.stage)) stageBucket = 'seed-stage';
  return `<a class="co-card" data-packs="${packs}" data-archs="${archs}" data-region="${region}" data-stage="${stageBucket}" data-pioneer="${c.pioneer ? 1 : 0}" data-oss="${c.open_source ? 1 : 0}" href="${c.url}" rel="nofollow noopener" target="_blank">
      <div class="co-head"><span class="co-name">${c.name}</span>${stars}</div>
      <div class="co-tag">${c.tagline}</div>
      <div class="co-meta">${oss}${stage}${country}</div>
    </a>`;
}).join('\n      ');

const companiesItemListSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  "numberOfItems": companiesList.length,
  "itemListElement": companiesList.slice(0, 50).map((c, i) => ({
    "@type": "ListItem",
    "position": i + 1,
    "url": c.url,
    "name": c.name,
  })),
};

const companiesHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${companiesList.length}+ Companies in GreatCTO archetypes — Pioneer Fund + YC + global</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#0a0e0c" />
<meta name="description" content="${companiesList.length} startups operating across 25 archetypes + 10 domain packs. ${pioneerCount} from Pioneer Fund portfolio (★). Voice AI, clinical AI, HR-AI, lending, climate MRV, drug discovery — filter by pack." />
<link rel="canonical" href="https://greatcto.systems/companies.html" />
<meta name="robots" content="index, follow, max-image-preview:large" />

<meta property="og:type" content="website" />
<meta property="og:url" content="https://greatcto.systems/companies.html" />
<meta property="og:site_name" content="GreatCTO" />
<meta property="og:title" content="${companiesList.length}+ companies across GreatCTO archetypes" />
<meta property="og:description" content="${pioneerCount} Pioneer Fund portfolio + YC + global startups. Filter by 10 domain packs." />
<meta property="og:image" content="https://greatcto.systems/assets/og-board.png" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${companiesList.length}+ companies across GreatCTO archetypes" />
<meta name="twitter:description" content="${pioneerCount} Pioneer Fund portfolio + YC + global. Filter by 10 packs." />
<meta name="twitter:image" content="https://greatcto.systems/assets/og-board.png" />

<script type="application/ld+json">${JSON.stringify(companiesItemListSchema)}</script>

<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/styles.css?v=${CSS_VER}" />
</head>
<body>

<nav class="nav">
  <a class="nav-logo" href="/" aria-label="greatcto">
    <span class="logo-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <rect width="64" height="64" rx="14" fill="#0a0e0c"/>
        <g stroke="#00d97e" stroke-width="9" stroke-linecap="round">
          <line x1="32" y1="14" x2="32" y2="50"/>
          <line x1="16.4" y1="23" x2="47.6" y2="41"/>
          <line x1="16.4" y1="41" x2="47.6" y2="23"/>
        </g>
      </svg>
    </span>
    <span>greatcto</span>
  </a>
  <div class="nav-right">
    <a href="/#how" class="nav-link">How</a>
    <a href="/#archetypes" class="nav-link">Archetypes</a>
    <a href="/packs.html" class="nav-link">Packs</a>
    <a href="/#install" class="cta">Install</a>
  </div>
</nav>

<section class="hero">
  <div class="hero-bg"></div>
  <div class="hero-inner">
    <span class="hero-eyebrow"><span class="pulse"></span>${companiesList.length}+ companies · ${pioneerCount} Pioneer Fund ★</span>
    <h1>Companies operating in <em>GreatCTO</em> archetypes.</h1>
    <p class="sub">Real-world startups across 25 archetypes + 10 domain packs. ${pioneerCount} verified from <a href="https://www.pioneerfund.vc/portfolio" rel="nofollow noopener">Pioneer Fund</a> portfolio. Filter below.</p>
  </div>
</section>

<section class="wrap">
  <div class="eyebrow">Filter — combine any three</div>
  <div class="index-filter-group">
    <div class="index-filter-label">Pack</div>
    <div class="index-filter-bar" data-group="pack">
      ${filterPacks.map(f => `<button class="index-filter-chip${f === 'all' ? ' active' : ''}" data-filter="${f}">${f === 'all' ? `All (${companiesList.length})` : f}</button>`).join('\n      ')}
    </div>
  </div>
  <div class="index-filter-group">
    <div class="index-filter-label">Region</div>
    <div class="index-filter-bar" data-group="region">
      <button class="index-filter-chip active" data-filter="all">All</button>
      ${filterRegions.map(r => `<button class="index-filter-chip" data-filter="${r}">${r.toUpperCase()} (${countPerRegion[r] || 0})</button>`).join('\n      ')}
    </div>
  </div>
  <div class="index-filter-group">
    <div class="index-filter-label">Stage / type</div>
    <div class="index-filter-bar" data-group="stage">
      <button class="index-filter-chip active" data-filter="all">All</button>
      ${filterStages.map(s => `<button class="index-filter-chip" data-filter="${s}">${s} (${countPerStage[s] || 0})</button>`).join('\n      ')}
      <button class="index-filter-chip" data-filter="pioneer">Pioneer Fund ★ (${pioneerCount})</button>
    </div>
  </div>
  <div class="co-count" id="co-count">${companiesList.length} companies shown</div>
  <div class="co-grid" id="co-grid">
      ${companyCardsAll}
  </div>
  <p class="co-disclaimer">Listed companies operate in this space. Inclusion is based on publicly available product descriptions and does not imply endorsement of or by GreatCTO. Pack/archetype matches are derived from public product info.</p>
</section>

<footer class="footer">
  <div class="footer-brand">© 2026 GreatCTO · MIT License</div>
  <div class="footer-links">
    <a href="/">Home</a>
    <a href="/#archetypes">Archetypes</a>
    <a href="/packs.html">Packs</a>
    <a href="https://github.com/avelikiy/great_cto">GitHub</a>
  </div>
</footer>

<script>
(function () {
  const bars = document.querySelectorAll('.index-filter-bar');
  const grid = document.getElementById('co-grid');
  const counter = document.getElementById('co-count');
  const cards = Array.from(grid.querySelectorAll('.co-card'));
  const active = { pack: 'all', region: 'all', stage: 'all' };

  function applyFilters() {
    let shown = 0;
    cards.forEach(c => {
      const okPack = active.pack === 'all' || (c.dataset.packs || '').split(' ').includes(active.pack);
      const okRegion = active.region === 'all' || c.dataset.region === active.region;
      let okStage = true;
      if (active.stage === 'pioneer') okStage = c.dataset.pioneer === '1';
      else if (active.stage === 'open-source') okStage = c.dataset.oss === '1';
      else if (active.stage !== 'all') okStage = c.dataset.stage === active.stage;
      const visible = okPack && okRegion && okStage;
      c.style.display = visible ? '' : 'none';
      if (visible) shown++;
    });
    counter.textContent = shown + ' compan' + (shown === 1 ? 'y' : 'ies') + ' shown';
    const hashParts = [];
    if (active.pack !== 'all') hashParts.push('pack=' + active.pack);
    if (active.region !== 'all') hashParts.push('region=' + active.region);
    if (active.stage !== 'all') hashParts.push('stage=' + active.stage);
    history.replaceState(null, '', hashParts.length ? '#' + hashParts.join('&') : location.pathname);
  }

  bars.forEach(bar => {
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('.index-filter-chip');
      if (!btn) return;
      bar.querySelectorAll('.index-filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      active[bar.dataset.group] = btn.dataset.filter;
      applyFilters();
    });
  });

  // Honor incoming hash filter (?pack=voice-pack&region=europe&stage=public)
  const hash = location.hash.replace(/^#/, '');
  hash.split('&').forEach(part => {
    const [k, v] = part.split('=');
    if (active[k] !== undefined && v) {
      active[k] = v;
      const bar = document.querySelector('.index-filter-bar[data-group="' + k + '"]');
      if (bar) {
        bar.querySelectorAll('.index-filter-chip').forEach(b => b.classList.remove('active'));
        const btn = bar.querySelector('[data-filter="' + v + '"]');
        if (btn) btn.classList.add('active');
      }
    }
  });
  if (hash) applyFilters();
})();
</script>

</body>
</html>`;

writeFileSync(join(__dirname, 'companies.html'), companiesHtml);
console.log(`✓ wrote companies.html (${companiesList.length} entries, ${pioneerCount} Pioneer ★)`);

// ── 3. /agents.html — agents catalog ────────────────────────────────────────
const AGENTS_DIR = join(ROOT, 'agents');
const agentFiles = existsSync(AGENTS_DIR)
  ? readdirSync(AGENTS_DIR).filter(f => f.endsWith('-reviewer.md') || ['architect.md', 'pm.md', 'senior-dev.md', 'qa-engineer.md', 'security-officer.md', 'devops.md', 'l3-support.md', 'ai-prompt-architect.md', 'ai-eval-engineer.md', 'ai-security-reviewer.md', 'performance-engineer.md', 'project-auditor.md', 'continuous-learner.md'].includes(f))
  : [];

const agents = agentFiles.map(f => {
  const text = readFileSync(join(AGENTS_DIR, f), 'utf-8');
  const fm = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  const fields = {};
  if (fm) {
    for (const line of fm[1].split('\n')) {
      if (/^[a-zA-Z_-]+:/.test(line)) {
        const [k, ...rest] = line.split(':');
        fields[k.trim()] = rest.join(':').trim();
      }
    }
  }
  return {
    slug: f.replace('.md', ''),
    name: fields.name || f.replace('.md', ''),
    description: (fields.description || '').replace(/^"|"$/g, '').slice(0, 280),
    model: fields.model || 'sonnet',
    appliesTo: fields.applies_to || '',
    category: f.endsWith('-reviewer.md') ? 'reviewer' : 'core',
  };
}).sort((a, b) => a.category.localeCompare(b.category) || a.slug.localeCompare(b.slug));

const agentCards = agents.map(a => `<a class="pack-card" href="#${a.slug}">
      <div class="pack-name">${a.slug}</div>
      <div class="pack-desc">${a.description || '—'}</div>
      <div class="pack-meta">${a.category} · ${a.model}${a.appliesTo ? ' · ' + a.appliesTo : ''}</div>
    </a>`).join('\n      ');

const agentsItemListSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  "numberOfItems": agents.length,
  "itemListElement": agents.slice(0, 50).map((a, i) => ({
    "@type": "ListItem",
    "position": i + 1,
    "url": `https://greatcto.systems/agents.html#${a.slug}`,
    "name": a.slug,
  })),
};

const agentsHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${agents.length} specialist AI agents — GreatCTO</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#0a0e0c" />
<meta name="description" content="${agents.length} specialist AI agents in the GreatCTO pipeline: architect, PM, senior-dev, code-reviewer, qa-engineer, security-officer, devops, l3-support + 30+ archetype/pack reviewers." />
<link rel="canonical" href="https://greatcto.systems/agents.html" />
<meta name="robots" content="index, follow, max-image-preview:large" />

<meta property="og:type" content="website" />
<meta property="og:url" content="https://greatcto.systems/agents.html" />
<meta property="og:site_name" content="GreatCTO" />
<meta property="og:title" content="${agents.length} specialist AI agents — GreatCTO" />
<meta property="og:description" content="From architect to lab-automation-reviewer — every specialist that runs in the pipeline." />
<meta property="og:image" content="https://greatcto.systems/assets/og-board.png" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${agents.length} specialist AI agents — GreatCTO" />
<meta name="twitter:description" content="From architect to lab-automation-reviewer — every specialist that runs in the pipeline." />
<meta name="twitter:image" content="https://greatcto.systems/assets/og-board.png" />

<script type="application/ld+json">${JSON.stringify(agentsItemListSchema)}</script>

<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/styles.css?v=${CSS_VER}" />
</head>
<body>

<nav class="nav">
  <a class="nav-logo" href="/" aria-label="greatcto">
    <span class="logo-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <rect width="64" height="64" rx="14" fill="#0a0e0c"/>
        <g stroke="#00d97e" stroke-width="9" stroke-linecap="round">
          <line x1="32" y1="14" x2="32" y2="50"/>
          <line x1="16.4" y1="23" x2="47.6" y2="41"/>
          <line x1="16.4" y1="41" x2="47.6" y2="23"/>
        </g>
      </svg>
    </span>
    <span>greatcto</span>
  </a>
  <div class="nav-right">
    <a href="/#how" class="nav-link">How</a>
    <a href="/#archetypes" class="nav-link">Archetypes</a>
    <a href="/packs.html" class="nav-link">Packs</a>
    <a href="/#install" class="cta">Install</a>
  </div>
</nav>

<section class="hero">
  <div class="hero-bg"></div>
  <div class="hero-inner">
    <span class="hero-eyebrow"><span class="pulse"></span>${agents.length} specialist agents</span>
    <h1>Every agent in the <em>GreatCTO</em> pipeline.</h1>
    <p class="sub">From <code class="inline-code">architect</code> to <code class="inline-code">lab-automation-reviewer</code> — ${agents.length} specialist AI agents auto-attach based on your project archetype + detected packs. Source: <a href="https://github.com/avelikiy/great_cto/tree/main/agents" rel="nofollow noopener">agents/</a> in the GreatCTO plugin.</p>
  </div>
</section>

<section class="wrap">
  <div class="eyebrow">Catalog</div>
  <h2 class="h2">${agents.length} agents · ${agents.filter(a => a.category === 'reviewer').length} reviewers + ${agents.filter(a => a.category === 'core').length} core specialists.</h2>
  <div class="pack-grid">
      ${agentCards}
  </div>
</section>

<footer class="footer">
  <div class="footer-brand">© 2026 GreatCTO · MIT License</div>
  <div class="footer-links">
    <a href="/">Home</a>
    <a href="/#archetypes">Archetypes</a>
    <a href="/packs.html">Packs</a>
    <a href="/companies.html">Companies</a>
    <a href="https://github.com/avelikiy/great_cto">GitHub</a>
  </div>
</footer>

</body>
</html>`;

writeFileSync(join(__dirname, 'agents.html'), agentsHtml);
console.log(`✓ wrote agents.html (${agents.length} agents)`);

console.log('\n✓ aggregate pages generated');
