#!/usr/bin/env node
/**
 * site/seo-augment.mjs — adds missing SEO + social tags to all site/*.html.
 *
 * What it adds (idempotent — safe to re-run):
 *   - <link rel="canonical">
 *   - <meta property="og:url"> + <meta property="og:type">
 *   - <meta property="og:description"> (mirrors meta description)
 *   - <meta name="twitter:title"> + <meta name="twitter:description">
 *   - <script type="application/ld+json"> (SoftwareApplication or Article)
 *   - <meta name="robots" content="index, follow">
 *   - <link rel="alternate" hreflang="..."> for each translated docs/<lang>/
 *     README and (when available) site/<lang>/index.html
 *
 * Also writes:
 *   - site/sitemap.xml
 *   - site/robots.txt
 *
 * Usage:
 *   node site/seo-augment.mjs            # full pass (incl. hreflang if docs/<lang>/ exist)
 *   node site/seo-augment.mjs --no-i18n  # skip hreflang generation
 *
 * Safe-by-design: only inserts when missing, never overwrites existing tags.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, basename } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = __dirname;
const ROOT = join(SITE, '..');                        // repo root
const ORIGIN = 'https://greatcto.systems';
const GITHUB_BASE = 'https://github.com/avelikiy/great_cto/blob/main/docs';
const TODAY = new Date().toISOString().slice(0, 10);

// Language map: ISO code → metadata
// Used to generate hreflang tags. Adding a new language? Add an entry here +
// a docs/<code>/README.md file. The script auto-detects which entries have
// real translations and emits hreflang only for those.
const LANGUAGES = [
  { code: 'en',    docsPath: '',        label: 'English' },
  { code: 'ru',    docsPath: 'ru',      label: 'Русский' },
  { code: 'zh-CN', docsPath: 'zh-CN',   label: '简体中文' },
  { code: 'zh-TW', docsPath: 'zh-TW',   label: '繁體中文' },
  { code: 'ja',    docsPath: 'ja',      label: '日本語' },
  { code: 'ko',    docsPath: 'ko',      label: '한국어' },
  { code: 'es',    docsPath: 'es',      label: 'Español' },
  { code: 'pt-BR', docsPath: 'pt-BR',   label: 'Português (BR)' },
];

const argv = process.argv.slice(2);
const NO_I18N = argv.includes('--no-i18n');

// --- helpers ------------------------------------------------------------------

function loadHtml(path) {
  return { path, text: readFileSync(path, 'utf8') };
}

function extractMeta(html, names) {
  for (const n of names) {
    const m = html.match(new RegExp(`<meta\\s+(?:name|property)="${n}"\\s+content="([^"]+)"`, 'i'));
    if (m) return m[1];
  }
  return null;
}

function extractTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m ? m[1].trim() : '';
}

function hasTag(html, re) {
  return re.test(html);
}

/** Insert tags right before </head> if not already present. */
function ensureTagsBeforeHead(html, tags) {
  let out = html;
  for (const { check, tag } of tags) {
    if (!check.test(out)) {
      out = out.replace(/<\/head>/i, `${tag}\n  </head>`);
    }
  }
  return out;
}

// --- per-page augmentation ----------------------------------------------------

function urlFor(filePath) {
  const rel = relative(SITE, filePath).replace(/\\/g, '/');
  if (rel === 'index.html') return `${ORIGIN}/`;
  return `${ORIGIN}/${rel}`;
}

/**
 * Build the hreflang link list for a given page.
 *
 * Strategy:
 *   - If site/<lang>/index.html exists → use that as the alternate
 *   - Else if docs/<lang>/README.md exists → fall back to the GitHub URL
 *     (better than nothing for SEO, even if it isn't a true landing page)
 *   - Always emit x-default pointing to the English landing page
 *
 * Only emitted on the landing page (index.html). Per-archetype /for/<x>.html
 * pages don't have multilingual variants yet — skip until they do.
 */
function buildHreflangTags(filePath) {
  if (NO_I18N) return [];
  if (basename(filePath) !== 'index.html') return [];

  const tags = [];
  for (const { code, docsPath } of LANGUAGES) {
    let href;
    if (code === 'en') {
      href = `${ORIGIN}/`;
    } else {
      const sitePage = join(SITE, docsPath, 'index.html');
      const docsReadme = join(ROOT, 'docs', docsPath, 'README.md');
      if (existsSync(sitePage)) {
        href = `${ORIGIN}/${docsPath}/`;
      } else if (existsSync(docsReadme)) {
        href = `${GITHUB_BASE}/${docsPath}/README.md`;
      } else {
        continue;  // no translation yet
      }
    }
    tags.push({
      check: new RegExp(`<link\\s+rel="alternate"\\s+hreflang="${code}"`, 'i'),
      tag: `  <link rel="alternate" hreflang="${code}" href="${href}" />`,
    });
  }

  // x-default — Google fallback for unsupported languages
  if (tags.length > 0) {
    tags.push({
      check: /<link\s+rel="alternate"\s+hreflang="x-default"/i,
      tag: `  <link rel="alternate" hreflang="x-default" href="${ORIGIN}/" />`,
    });
  }
  return tags;
}

function augmentPage(filePath) {
  const { text } = loadHtml(filePath);
  const url = urlFor(filePath);
  const title = extractTitle(text);
  const desc = extractMeta(text, ['description']) || '';
  const isLanding = basename(filePath) === 'index.html';
  const isArchetypePage = filePath.includes('/for/');

  const tags = [...buildHreflangTags(filePath)];

  // 1. canonical
  tags.push({
    check: /<link\s+rel="canonical"/i,
    tag: `  <link rel="canonical" href="${url}" />`,
  });

  // 2. robots
  tags.push({
    check: /<meta\s+name="robots"/i,
    tag: `  <meta name="robots" content="index, follow, max-image-preview:large" />`,
  });

  // 3. og:url
  tags.push({
    check: /<meta\s+property="og:url"/i,
    tag: `  <meta property="og:url" content="${url}" />`,
  });

  // 4. og:description (mirror description if missing)
  if (desc) {
    tags.push({
      check: /<meta\s+property="og:description"/i,
      tag: `  <meta property="og:description" content="${escapeAttr(desc)}" />`,
    });
  }

  // 5. og:site_name
  tags.push({
    check: /<meta\s+property="og:site_name"/i,
    tag: `  <meta property="og:site_name" content="GreatCTO" />`,
  });

  // 6. twitter:title + twitter:description
  if (title) {
    tags.push({
      check: /<meta\s+name="twitter:title"/i,
      tag: `  <meta name="twitter:title" content="${escapeAttr(title)}" />`,
    });
  }
  if (desc) {
    tags.push({
      check: /<meta\s+name="twitter:description"/i,
      tag: `  <meta name="twitter:description" content="${escapeAttr(desc)}" />`,
    });
  }

  // 7. JSON-LD
  if (!hasTag(text, /<script\s+type="application\/ld\+json"/i)) {
    let ldJson;
    if (isLanding) {
      ldJson = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'GreatCTO',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'macOS, Linux, Windows',
        url: ORIGIN,
        description: desc,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        author: { '@type': 'Person', name: 'Alexander Velikiy', url: 'https://hashnode.com/@Greatcto' },
        downloadUrl: 'https://www.npmjs.com/package/great-cto',
        softwareVersion: '2.1.0',
        license: 'https://opensource.org/licenses/MIT',
      };
    } else if (isArchetypePage) {
      ldJson = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: title,
        description: desc,
        author: { '@type': 'Person', name: 'Alexander Velikiy' },
        publisher: {
          '@type': 'Organization',
          name: 'GreatCTO',
          logo: { '@type': 'ImageObject', url: `${ORIGIN}/assets/logo.svg` },
        },
        datePublished: TODAY,
        dateModified: TODAY,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        url,
      };
    }
    if (ldJson) {
      tags.push({
        check: /<script\s+type="application\/ld\+json"/i,
        tag: `  <script type="application/ld+json">${JSON.stringify(ldJson, null, 2)}</script>`,
      });
    }
  }

  return ensureTagsBeforeHead(text, tags);
}

function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// --- discover all HTML --------------------------------------------------------

function* allHtml() {
  yield join(SITE, 'index.html');
  const forDir = join(SITE, 'for');
  if (existsSync(forDir)) {
    for (const f of readdirSync(forDir)) {
      if (f.endsWith('.html')) yield join(forDir, f);
    }
  }
}

// --- sitemap.xml --------------------------------------------------------------

function generateSitemap() {
  const urls = [...allHtml()].map(urlFor);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls
  .map((u) => {
    const isHome = u === `${ORIGIN}/`;
    const priority = isHome ? '1.0' : '0.8';
    const changefreq = isHome ? 'weekly' : 'monthly';
    return `  <url>
    <loc>${u}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
  })
  .join('\n')}
</urlset>
`;
  writeFileSync(join(SITE, 'sitemap.xml'), xml);
  console.log(`✓ sitemap.xml — ${urls.length} URLs`);
}

// --- robots.txt --------------------------------------------------------------

function generateRobots() {
  const txt = `# greatcto.systems — robots.txt
# Open-source AI-CTO plugin for Claude Code

User-agent: *
Allow: /
Disallow: /assets/screenshots/
Disallow: /.previews/

# Block AI training crawlers (preserve original content for indexing only)
User-agent: GPTBot
Disallow: /
User-agent: Google-Extended
Disallow: /
User-agent: anthropic-ai
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: CCBot
Disallow: /

Sitemap: ${ORIGIN}/sitemap.xml
`;
  writeFileSync(join(SITE, 'robots.txt'), txt);
  console.log(`✓ robots.txt`);
}

// --- run ----------------------------------------------------------------------

let augmented = 0;
for (const path of allHtml()) {
  if (!existsSync(path)) continue;
  const before = readFileSync(path, 'utf8');
  const after = augmentPage(path);
  if (after !== before) {
    writeFileSync(path, after);
    augmented++;
    console.log(`  + ${relative(SITE, path)}`);
  }
}
console.log(`✓ augmented ${augmented} HTML file(s)`);

generateSitemap();
generateRobots();

console.log(`\nNote: site/ is local-only, .gitignored. Deploy via your hosting (Cloudflare Pages, Vercel, etc.).`);
