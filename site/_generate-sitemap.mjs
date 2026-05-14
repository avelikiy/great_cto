#!/usr/bin/env node
/**
 * Auto-generate sitemap.xml from the actual files in site/.
 * Run: node site/_generate-sitemap.mjs
 *
 * Replaces the hand-maintained sitemap with one that always includes new
 * pack/aggregate pages without manual editing. Idempotent.
 */

import { writeFileSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = __dirname;
const BASE = 'https://greatcto.systems';
const TODAY = new Date().toISOString().slice(0, 10);

// Walk site/ recursively, collect .html files.
function walk(dir, acc = []) {
  for (const f of readdirSync(dir)) {
    if (f.startsWith('_') || f.startsWith('.')) continue;
    const full = join(dir, f);
    const st = statSync(full);
    if (st.isDirectory()) {
      // skip site/dist or build output (none yet)
      if (f === 'assets' || f === 'data') continue;
      walk(full, acc);
    } else if (f.endsWith('.html')) {
      acc.push(full);
    }
  }
  return acc;
}

const files = walk(SITE);

// Priority + changefreq heuristic
function metaFor(rel) {
  if (rel === 'index.html') return { priority: '1.0', changefreq: 'weekly' };
  if (rel === 'packs.html' || rel === 'companies.html' || rel === 'agents.html') {
    return { priority: '0.9', changefreq: 'weekly' };
  }
  if (rel.startsWith('pack/')) return { priority: '0.85', changefreq: 'monthly' };
  if (rel.startsWith('for/')) return { priority: '0.8', changefreq: 'monthly' };
  return { priority: '0.6', changefreq: 'monthly' };
}

const entries = files
  .map(full => {
    const rel = relative(SITE, full).replace(/\\/g, '/');
    const url = rel === 'index.html' ? BASE + '/' : `${BASE}/${rel}`;
    return { url, rel, ...metaFor(rel) };
  })
  .sort((a, b) => a.url.localeCompare(b.url));

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.map(e => `  <url>
    <loc>${e.url}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

writeFileSync(join(SITE, 'sitemap.xml'), xml, 'utf-8');
console.log(`✓ sitemap.xml — ${entries.length} URLs`);

// Also refresh robots.txt with sitemap reference (idempotent)
const robotsPath = join(SITE, 'robots.txt');
let robots = existsSync(robotsPath) ? readFileSync(robotsPath, 'utf-8') : '';
if (!robots.includes('Sitemap:')) {
  robots = (robots || 'User-agent: *\nAllow: /\n') + `\nSitemap: ${BASE}/sitemap.xml\n`;
  writeFileSync(robotsPath, robots, 'utf-8');
  console.log('✓ robots.txt updated with Sitemap line');
} else {
  console.log('✓ robots.txt already references sitemap');
}
